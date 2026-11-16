/**
 * Sentry 전송 조건과 개인정보 걸러내기 — Sentry SDK 없이 테스트할 수 있게 순수 함수만 둔다 (services/monitoring이 사용).
 *
 * 처리방침에 적은 범위만 보낸다: 오류 내용 · 발생 화면 · 직전 앱 내 동작 기록 · 기기 정보 · 요청 식별값.
 * 이메일 · 비밀번호 · 로그인 토큰 · 정확한 위치(위도·경도, 도로명·지번 주소)와 요청 본문은 보내지 않는다.
 */
import type { AnalyticsMode } from './analytics';

export type MonitoringEnvironment = 'prod' | 'mock' | 'dev';

export interface MonitoringConfig {
  dsn: string;
  useMock: boolean;
  inMock: boolean;
  isDev: boolean;
  inDev: boolean;
  mode: AnalyticsMode;
}

/**
 * 켤지 정한다.
 *  - DSN이 없으면 끔
 *  - 설정 › 이용 분석을 완전히 끈 사람(off)은 끔. 오류 진단은 처리방침에서 '안정성 개선'으로 따로 고지하므로
 *    기본 익명 분석(basic)·상세 분석(detailed) 어느 쪽이든 켠다 (상세 여부와 무관하게 보내는 항목은 같다)
 *  - 목 모드는 SENTRY_IN_MOCK=true일 때만 (environment=mock), 개발 빌드는 SENTRY_IN_DEV=true일 때만 (environment=dev)
 */
export function monitoringDecision(c: MonitoringConfig): { enabled: boolean; environment: MonitoringEnvironment } {
  const environment: MonitoringEnvironment = c.useMock ? 'mock' : c.isDev ? 'dev' : 'prod';
  const enabled = !!c.dsn && c.mode !== 'off' && (!c.useMock || c.inMock) && (!c.isDev || c.inDev);
  return { enabled, environment };
}

export const FILTERED = '[filtered]';

/** 키 이름에 이 말이 들어가면 값을 통째로 가린다 */
const SENSITIVE_PART = /(authorization|cookie|token|password|passwd|secret|email|e-mail|address|credential|session_?key|api_?key)/i;
/** 이 이름 그대로면 가린다 (위치·요청 본문) */
const SENSITIVE_EXACT = /^(lat|lng|lon|long|latitude|longitude|coords?|coordinates?|location|position|region_?detail|body|request_?body|response_?body|data_?body|query|query_?string|http\.query|phone|birth|gender|username|nickname)$/i;

export const isSensitiveKey = (key: string) => key !== 'request_id' && (SENSITIVE_PART.test(key) || SENSITIVE_EXACT.test(key));

const PATTERNS: [RegExp, string][] = [
  // Bearer 토큰 · JWT
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [token]'],
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[token]'],
  // key=value / "key": "value" 꼴의 토큰·비밀번호
  [/((?:access|refresh|id|identity|auth|session)?_?token|password|passwd|secret|authorization_?code)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, `$1$2${FILTERED}`],
  // 이메일
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // lat=35.1, lng=129.0 / "latitude": 35.1
  [/\b(lat|lng|lon|latitude|longitude)(["']?\s*[:=]\s*["']?)-?\d{1,3}(?:\.\d+)?/gi, `$1$2${FILTERED}`],
  // 35.15812, 129.05923 처럼 소수점 아래가 긴 두 수 (좌표 쌍)
  [/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[coords]'],
  // 지번 주소 — 시·군·구 다음의 …동/읍/면/리 + 번지 (부산광역시 해운대구 우동 1408)
  [/(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+)+[가-힣0-9]+(?:동|읍|면|리)\s+(?:산\s*)?\d+(?:-\d+)?(?:번지)?/g, '[address]'],
];

/** 도로명 주소 (해운대로 264, 구남로24번길 8, 부산광역시 해운대구 해운대로 264) — '…으로 3'(조사) 같은 말은 남긴다 */
const ROAD = /(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+)*([가-힣0-9]+(?:로|길))(?:\s*\d+번길)?\s*\d+(?:-\d+)?/g;
const ROAD_REGION = /(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s/;

/** 문자열 안의 토큰·이메일·좌표·주소를 가린다 */
export function scrubString(s: string): string {
  let out = s;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.replace(ROAD, (m, road: string) => {
    // 시·군·구가 앞에 있으면 주소. 없으면 길 이름처럼 생긴 것만 (조사 '으로'·한 글자+로 제외)
    if (ROAD_REGION.test(m)) return '[address]';
    if (road.endsWith('으로') || road.length < 3 || /^[0-9]/.test(road)) return m;
    return '[address]';
  });
}

/** URL에서 쿼리·해시를 뺀다 (주변 드랍 조회의 lat/lng, 검색어 등) */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const base = cut === -1 ? url : `${url.slice(0, cut)}?${FILTERED}`;
  return scrubString(base);
}

/** URL을 담는 키 — 쿼리를 뺀다 (url, http.url, url.full, request_url·redirectUrl처럼 url로 끝나는 키, href) */
const isUrlKey = (key: string) => /(url|href)$/i.test(key) || key.toLowerCase() === 'url.full';

/** 객체를 따라가며 민감한 키는 가리고, 문자열은 scrubString (URL 키는 쿼리를 뺀다) */
export function scrubData<T>(value: T, depth = 0): T {
  if (depth > 8) return FILTERED as unknown as T;
  if (typeof value === 'string') return scrubString(value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => scrubData(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isUrlKey(k) && typeof v === 'string') out[k] = scrubUrl(v);
      else out[k] = isSensitiveKey(k) ? FILTERED : scrubData(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Sentry 이벤트·브레드크럼의 모양 중 여기서 다루는 부분만 (SDK 타입에 묶이지 않게) */
export interface CrumbLike {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

const HTTP_CATEGORIES = new Set(['xhr', 'fetch', 'http']);

/** 직전 동작 기록 하나 — 네트워크는 메서드·주소(쿼리 뺌)·상태만, 콘솔은 메시지만(인자 버림) */
export function scrubBreadcrumb<T extends CrumbLike>(crumb: T): T {
  const out: CrumbLike = { ...crumb };
  if (typeof out.message === 'string') out.message = scrubString(out.message);
  if (out.category && HTTP_CATEGORIES.has(out.category) && out.data) {
    const { method, status_code, url, request_id } = out.data as Record<string, unknown>;
    out.data = {
      ...(method !== undefined ? { method } : null),
      ...(status_code !== undefined ? { status_code } : null),
      ...(typeof url === 'string' ? { url: scrubUrl(url) } : null),
      ...(request_id !== undefined ? { request_id } : null),
    };
  } else if (out.category === 'console' && out.data) {
    const { logger } = out.data as Record<string, unknown>;
    out.data = logger !== undefined ? { logger } : undefined;
  } else if (out.data) {
    out.data = scrubData(out.data);
  }
  return out as T;
}

export interface EventLike {
  message?: string;
  user?: unknown;
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown; [k: string]: unknown };
  exception?: { values?: { value?: string; [k: string]: unknown }[] };
  breadcrumbs?: CrumbLike[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  spans?: { description?: string; data?: Record<string, unknown>; [k: string]: unknown }[];
  transaction?: string;
  [k: string]: unknown;
}

/** 문맥 중 SDK가 채우는 기기·앱 정보는 그대로 두고(처리방침의 기기 정보), 나머지만 걸러낸다. trace는 data만 따로 거른다 */
const DEVICE_CONTEXTS = new Set(['device', 'os', 'app', 'culture', 'react_native_context', 'runtime']);

/**
 * 화면 전환 추적이 span에 붙일 수 있는 route params·URL·경로 (route.params.*, route.url, route.path, route.href, previous_route.*).
 * sendDefaultPii가 꺼져 있으면 SDK가 붙이지 않지만, 옵션이나 SDK 동작이 바뀌어도
 * 가입 화면(Signup)의 signupToken·소셜 프로필 같은 params가 나가지 않게 키째 뺀다. 화면 이름(route.name)·key는 남긴다
 */
const ROUTE_DETAIL_KEY = /^(previous_)?route\.(params|url|path|href)(\.|$)/;
export function dropRouteDetails<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!ROUTE_DETAIL_KEY.test(k)) out[k] = v;
  return out as T;
}
const scrubSpanData = (data: Record<string, unknown>) => scrubData(dropRouteDetails(data));

/**
 * 이벤트 전체를 걸러낸다.
 *  - user 지움 (IP·기기 단위 식별값을 보내지 않는다 — 처리방침의 Sentry 항목에 없음)
 *  - request: 본문·쿠키·쿼리·Authorization 헤더 제거, URL은 쿼리 뺌
 *  - 메시지·예외 문구·브레드크럼·extra·tags·문맥(기기 정보 제외)·span 설명/데이터를 scrub
 *  - span·trace 문맥의 route params·URL·경로는 키째 뺀다 (dropRouteDetails)
 *  - requestId가 있으면 tag request_id
 */
export function scrubEvent<T extends EventLike>(event: T, requestId?: string): T {
  const e: EventLike = { ...event };
  delete e.user;
  if (e.request) {
    const { url, headers } = e.request;
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers ?? {})) if (!isSensitiveKey(k)) safeHeaders[k] = scrubString(String(v));
    e.request = { ...(url ? { url: scrubUrl(url) } : null), ...(headers ? { headers: safeHeaders } : null) };
  }
  if (typeof e.message === 'string') e.message = scrubString(e.message);
  if (e.exception?.values) e.exception = { ...e.exception, values: e.exception.values.map(v => ({ ...v, ...(typeof v.value === 'string' ? { value: scrubString(v.value) } : null) })) };
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
  if (e.extra) e.extra = scrubData(e.extra);
  if (e.tags) e.tags = scrubData(e.tags);
  if (e.contexts) {
    const contexts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.contexts)) {
      if (k === 'trace' && v && typeof v === 'object') {
        // 거래(화면 전환)의 루트 span — trace_id·op 등은 그대로, data(route 속성)만 거른다
        const trace = v as { data?: Record<string, unknown> };
        contexts[k] = trace.data ? { ...trace, data: scrubSpanData(trace.data) } : trace;
      } else contexts[k] = DEVICE_CONTEXTS.has(k) ? v : scrubData(v);
    }
    e.contexts = contexts;
  }
  if (e.spans) e.spans = e.spans.map(sp => ({ ...sp, ...(typeof sp.description === 'string' ? { description: scrubString(stripQuery(sp.description)) } : null), ...(sp.data ? { data: scrubSpanData(sp.data) } : null) }));
  if (typeof e.transaction === 'string') e.transaction = scrubString(stripQuery(e.transaction));
  if (requestId) e.tags = { ...e.tags, request_id: requestId };
  return e as T;
}

/** "GET https://api…/drops?lat=…" 같은 span 설명에서 쿼리만 뺀다 */
const stripQuery = (s: string) => s.replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, `$1?${FILTERED}`);

/** 오류 객체에 붙은 요청 ID (ApiError.requestId) */
export function requestIdOf(err: unknown): string | undefined {
  const id = (err as { requestId?: unknown } | null | undefined)?.requestId;
  return typeof id === 'string' && id ? id : undefined;
}
