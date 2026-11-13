/**
 * Sentry 오류 진단 (처리방침: 앱 오류·충돌 진단과 안정성 개선, Sentry DE 리전).
 *
 *  - 켜는 조건(monitoringRules.monitoringDecision): SENTRY_DSN이 있고, 설정 › 이용 분석이 '끔'이 아니고,
 *    목 모드·개발 빌드가 아닐 때 (검증용 SENTRY_IN_MOCK·SENTRY_IN_DEV로 예외)
 *  - environment: prod / mock / dev. release·dist는 네이티브 기본값(번들ID@버전+빌드, 빌드 번호)을 그대로 쓴다
 *    — 빌드 때 올리는 소스맵·dSYM과 같은 이름이어야 스택이 풀린다
 *  - 네이티브 충돌(iOS·Android NDK), 앱 멈춤(iOS app hang · Android ANR), 앱 시작·화면 전환 성능(샘플 10%)
 *  - 개인정보: sendDefaultPii 끔, 사용자 ID 없음, 세션 리플레이·스크린샷·뷰 계층 없음,
 *    beforeSend/beforeBreadcrumb에서 토큰·이메일·좌표·주소·요청 본문을 걸러낸다
 *  - 이용 분석을 '끔'으로 바꾸면 Sentry를 닫는다 (네이티브 SDK까지). 다시 켜면 다시 시작
 */
import * as Sentry from '@sentry/react-native';
import { env } from '@/config';
import { analyticsMode, type AnalyticsMode } from './analytics';
import { monitoringDecision, requestIdOf, scrubBreadcrumb, scrubEvent, type CrumbLike, type EventLike } from './monitoringRules';

let active = false;
let navigation: ReturnType<typeof Sentry.reactNavigationIntegration> | null = null;
/** NavigationContainer ref (navigation/ref) — 다시 켤 때 다시 등록 */
let navRef: unknown = null;

export const monitoringActive = () => active;

/** 앱 시작 때 한 번 (App.tsx 모듈 로드 시점 — 첫 렌더 전). 켰으면 true */
export function initMonitoring(mode: AnalyticsMode = analyticsMode()): boolean {
  if (active) return true;
  const { enabled, environment } = monitoringDecision({
    dsn: env.sentryDsn,
    useMock: env.useMock,
    inMock: env.sentryInMock,
    isDev: __DEV__,
    inDev: env.sentryInDev,
    mode,
  });
  if (!enabled) return false;
  navigation = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true });
  Sentry.init({
    dsn: env.sentryDsn,
    environment,
    debug: __DEV__ && env.sentryInDev,
    // 개인정보
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // 세션 리플레이 없음 — replays* 옵션을 아예 주지 않아야 리플레이 통합이 붙지 않는다 (0을 줘도 붙음)
    // 네이티브 HTTP 브레드크럼은 쿼리(lat/lng)까지 남고 JS beforeBreadcrumb를 거치지 않는다 — JS 쪽 기록만 쓴다
    enableNetworkBreadcrumbs: false,
    enableCaptureFailedRequests: false,
    // 서버는 Sentry를 쓰지 않는다 — 추적 헤더 대신 X-Request-Id로 잇는다
    tracePropagationTargets: [],
    // 충돌 · 멈춤
    enableNativeCrashHandling: true,
    enableAppHangTracking: true,
    enableWatchdogTerminationTracking: true,
    // 성능: 앱 시작 · 화면 전환 (낮은 샘플링)
    tracesSampleRate: env.sentryTracesSampleRate,
    enableAppStartTracking: true,
    enableNativeFramesTracking: true,
    enableStallTracking: true,
    enableUserInteractionTracing: false,
    integrations: [navigation],
    initialScope: { tags: { app_env: environment } },
    beforeBreadcrumb: crumb => scrubBreadcrumb(crumb as CrumbLike) as typeof crumb,
    beforeSend: (event, hint) => {
      if (!active) return null;
      return scrubEvent(event as unknown as EventLike, requestIdOf(hint?.originalException)) as unknown as typeof event;
    },
    beforeSendTransaction: event => (active ? (scrubEvent(event as unknown as EventLike) as unknown as typeof event) : null),
  });
  active = true;
  if (navRef) navigation.registerNavigationContainer(navRef);
  return true;
}

/** 설정 › 이용 분석 변경 (store/prefs). '끔'이면 닫고, 다시 켜면 시작 */
export function setMonitoringMode(mode: AnalyticsMode) {
  if (mode === 'off') {
    if (!active) return;
    active = false;
    navigation = null;
    Sentry.close().catch(() => {});
    return;
  }
  initMonitoring(mode);
}

/** NavigationContainer onReady에서 — 화면 전환 추적 */
export function registerNavigation(ref: unknown) {
  navRef = ref;
  if (active && navigation) navigation.registerNavigationContainer(ref);
}

export interface ApiFailure { method: string; path: string; status: number; code: string | null; requestId: string }

/**
 * API 실패 (api/client) — 직전 동작 기록에 남기고, 서버 오류(5xx)는 이벤트로도 보낸다.
 * 어느 쪽이든 request_id가 붙어 서버 로그(MDC requestId)와 바로 이어진다.
 * 4xx(검증·권한)와 네트워크 끊김(0)은 정상 흐름이 많아 기록만 남긴다.
 */
export function reportApiFailure(f: ApiFailure, error: Error) {
  if (!active) return;
  Sentry.addBreadcrumb({
    category: 'api',
    type: 'http',
    level: f.status >= 500 || f.status === 0 ? 'warning' : 'info',
    message: `${f.method} ${f.path} ${f.status}${f.code ? ` ${f.code}` : ''}`,
    data: { method: f.method, path: f.path, status_code: f.status, code: f.code, request_id: f.requestId },
  });
  if (f.status >= 500) {
    Sentry.captureException(error, scope => {
      scope.setTags({ request_id: f.requestId, api_path: f.path, api_status: String(f.status), ...(f.code ? { api_code: f.code } : null) });
      scope.setFingerprint(['api', f.method, f.path, String(f.status)]);
      return scope;
    });
  }
}

export { Sentry };
