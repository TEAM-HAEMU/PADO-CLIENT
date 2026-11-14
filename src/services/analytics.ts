/**
 * Amplitude 분석 — 두 단계 (설정 › 안전 · 개인정보). 동의창은 띄우지 않는다 (iOS 5.1.2(i)).
 *
 *  - basic (기본 이용 분석, 기본 켜짐): 기기 단위 익명. 사용자 ID·닉네임·성별·출생연도를 보내지 않고,
 *    정밀 위치(lat/lng)와 세션 리플레이도 없음. IP·광고 ID·IDFV·통신사 수집 끔.
 *    공통 속성은 화면 이름과 대략적 지역(region, 시·군·구)뿐
 *  - detailed (상세 분석, 직접 켠 사람만): 위에 더해 사용자 ID·회원 속성·정밀 위치·세션 리플레이
 *  - off: 아무것도 보내지 않음 (서버 집계 POST /events도 보내지 않음)
 *
 *  - 실서버 빌드에서만 전송 (목 모드·키 없음이면 안 보냄). AMPLITUDE_IN_MOCK=true면 목 모드에서도 (app_env=mock)
 *  - 화면 체류: 화면을 떠날 때·앱이 백그라운드로 갈 때 screen_left { screen, duration_ms }
 *  - 서버 집계 대상 이벤트(services/usageEvents)는 track 할 때 함께 모아 서버로 보낸다
 */
import { AppState, type AppStateStatus } from 'react-native';
import * as amplitude from '@amplitude/analytics-react-native';
import type { Types } from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { env } from '@/config';
import { kv } from '@/store/storage';
import { createScreenTimer } from './screenTimer';
import { isServerEvent, usageQueue } from './usageEvents';

export type AnalyticsMode = 'off' | 'basic' | 'detailed';

const REPLAY_PLUGIN = '@amplitude/plugin-session-replay-react-native';
/** 이만큼 백그라운드에 있다 돌아오면 앱을 새로 연 것으로 센다 (Amplitude 세션 기준과 같음) */
const REOPEN_AFTER_MS = 5 * 60 * 1000;

/** 공통 속성 (위치 서비스·내비게이션이 갱신). lat/lng는 상세 분석일 때만 이벤트에 붙는다 */
const context: { lat?: number; lng?: number; screen?: string; region?: string; dropId?: string } = {};
let started = false;
let replayOn = false;

const MODES: AnalyticsMode[] = ['off', 'basic', 'detailed'];
/** 예전 저장값(analytics·analyticsAsked)까지 담을 수 있는 설정 모양 (store/prefs의 'prefs' 키) */
export interface SavedAnalyticsPrefs { analyticsMode?: AnalyticsMode; analytics?: boolean; analyticsAsked?: boolean }
/**
 * 저장된 분석 설정 → 모드.
 *  - 새 저장값(analyticsMode)이 있으면 그대로
 *  - 예전 버전에서 직접 고른 사람(analyticsAsked): 켰으면 상세(그때 켠 의미가 지금의 상세 분석), 껐으면 끔 유지
 *  - 한 번도 고른 적 없으면(예전 기본 켜짐 시절 포함) 기본 익명 분석
 */
export function migrateAnalyticsMode(p: SavedAnalyticsPrefs): AnalyticsMode {
  if (p.analyticsMode && MODES.includes(p.analyticsMode)) return p.analyticsMode;
  if (p.analyticsAsked) return p.analytics ? 'detailed' : 'off';
  return 'basic';
}

/** 앱 시작 직후(설정 적용 전)의 첫 화면 이벤트도 놓치지 않게 저장값으로 바로 정한다 */
let mode: AnalyticsMode = migrateAnalyticsMode(kv.get<SavedAnalyticsPrefs>('prefs', {}));
/** SDK 시작 전에 생긴 이벤트 — 시작하면 순서대로 보낸다 */
const early: [string, Record<string, unknown> | undefined][] = [];

export const analyticsEnabled = () => !!env.amplitudeApiKey && (!env.useMock || env.amplitudeInMock);
export const analyticsMode = () => mode;
const detailed = () => mode === 'detailed';
/** 실서버 / 목(시연) 구분 — 모든 이벤트·사용자에 붙여 걸러볼 수 있게 */
const appEnv = () => (env.useMock ? 'mock' : 'prod');

/** 공통 속성을 모든 이벤트에 붙이는 플러그인 */
const enrich: Types.EnrichmentPlugin = {
  name: 'pado-context',
  type: 'enrichment',
  setup: async () => undefined,
  execute: async event => {
    const precise = detailed() && context.lat !== undefined;
    event.event_properties = {
      app_env: appEnv(),
      analytics_mode: mode,
      ...(context.screen ? { screen: context.screen } : null),
      ...(context.region ? { region: context.region } : null),
      ...(precise ? { lat: context.lat, lng: context.lng } : null),
      ...event.event_properties,
    };
    // 정밀 위치는 상세 + 위치를 받았을 때만, 사용자 ID는 상세면 위치와 상관없이 (위치 권한이 없는 상세 사용자도 익명이 되지 않게)
    if (precise) { event.location_lat = context.lat; event.location_lng = context.lng; }
    else { delete event.location_lat; delete event.location_lng; }
    if (!detailed()) delete event.user_id;
    return event;
  },
};

async function start() {
  started = true;
  try {
    await amplitude.init(env.amplitudeApiKey, undefined, {
      optOut: false,
      trackingSessionEvents: true, // session_start / session_end
      // 기기 단위 익명 — IP·광고 ID·앱 세트 ID·IDFV·통신사는 모으지 않는다 (기종·OS·앱 버전·언어만)
      trackingOptions: { ipAddress: false, adid: false, appSetId: false, idfv: false, carrier: false },
      logLevel: __DEV__ ? amplitude.Types.LogLevel.Warn : amplitude.Types.LogLevel.None,
    }).promise;
  } catch (e) {
    // 시작 못 했으면 시작 전으로 되돌린다 — 이벤트는 early에 계속 모으고, 다음 모드 적용 때 다시 시작
    started = false;
    throw e;
  }
  amplitude.add(enrich);
  const envIdent = new amplitude.Identify();
  envIdent.set('app_env', appEnv());
  amplitude.identify(envIdent);
  for (const [name, props] of early.splice(0)) if (mode !== 'off') amplitude.track(name, props);
}

async function setReplay(on: boolean) {
  if (on === replayOn) return;
  replayOn = on;
  try {
    if (on) await amplitude.add(new SessionReplayPlugin({ sampleRate: env.replaySampleRate, privacyConfig: { maskLevel: 'medium' } })).promise;
    else await amplitude.remove(REPLAY_PLUGIN).promise;
  } catch (e) {
    if (__DEV__) console.warn('[analytics] session replay unavailable', e);
  }
}

/**
 * 모드 적용 (앱 시작·설정 변경). 상세 → 기본으로 내리면 기기 ID를 새로 만들어 이전 사용자 기록과 끊는다.
 * 상세로 올린 직후의 사용자 식별은 호출 측(auth)이 identifyUser로 한다.
 * 모드(mode)는 바로 바뀐다. SDK 시작이 실패하면 거부된 Promise — 호출 측이 받아 처리한다 (store/prefs)
 */
export async function setAnalyticsMode(next: AnalyticsMode) {
  const prev = mode;
  mode = next;
  if (next === 'off') { usageQueue.clear(); early.length = 0; }
  if (!analyticsEnabled()) return;
  if (next === 'off') {
    if (started) { await setReplay(false); amplitude.setOptOut(true); }
    return;
  }
  if (!started) await start();
  else amplitude.setOptOut(false);
  if (prev === 'detailed' && next === 'basic') amplitude.reset();
  await setReplay(next === 'detailed');
}

export function track(name: string, props?: Record<string, unknown>) {
  if (mode === 'off') return;
  if (isServerEvent(name)) {
    const id = props?.drop_id;
    usageQueue.enqueue(name, typeof id === 'string' ? id : undefined);
  }
  if (!started) {
    if (analyticsEnabled() && early.length < 50) early.push([name, props]);
    return;
  }
  amplitude.track(name, props);
}

// ── 공통 속성
export function setAnalyticsLocation(lat: number, lng: number) {
  context.lat = Math.round(lat * 1e6) / 1e6;
  context.lng = Math.round(lng * 1e6) / 1e6;
}
/** 위치 권한·위치 서비스를 끄면 — 마지막 좌표를 계속 붙이지 않게 */
export function clearAnalyticsLocation() {
  context.lat = undefined;
  context.lng = undefined;
}

/** 대략적 지역 (시·군·구) — 역지오코딩 주소에서 (utils/address regionOf) */
export function setAnalyticsRegion(region: string | null | undefined) {
  context.region = region || undefined;
}

/** 상세 분석일 때만 붙일 속성 (정밀 위치·주소 등). 기본 모드면 빈 객체 */
export const detailedOnly = <T extends object>(props: T): Partial<T> => (detailed() ? props : {});

/** 지금 보고 있는 드랍 (미리듣기 이벤트에 드랍 ID를 붙이는 데 쓴다) */
export const currentDropId = () => context.dropId;

// ── 화면 · 체류 시간
const timer = createScreenTimer(() => Date.now(), e => track('screen_left', { screen: e.screen, duration_ms: e.duration_ms, reason: e.reason }));

/** key: 내비게이션 route key — 같은 화면을 새로 열면(다른 드랍의 재생 화면 등) 새 화면으로 센다 */
export function trackScreen(name: string | undefined, params?: object, key?: string) {
  if (!name) return;
  const ids = pickIds(params);
  context.dropId = typeof ids?.dropId === 'string' ? ids.dropId : undefined;
  if (!timer.enter(name, key ?? name)) return;
  context.screen = name;
  track('screen_viewed', { screen: name, ...ids });
}

/** 앱 실행 — 설치 후 처음이면 first_open도 (기기 기준) */
export function trackAppOpened() {
  if (!kv.get('analytics:firstOpenAt', null)) {
    kv.set('analytics:firstOpenAt', new Date().toISOString());
    track('first_open');
  }
  track('app_opened', { cold: true });
}

let backgroundAt: number | null = null;
/** 앱 상태 변화 — 백그라운드: 화면 시간 닫기·전송 / 앞으로: 시간 다시 재기, 오래 쉬었으면 app_opened */
export function onAppStateChange(state: AppStateStatus, now = Date.now()) {
  if (state === 'background') {
    timer.background();
    backgroundAt = now;
    if (started && mode !== 'off') amplitude.flush();
    usageQueue.flush();
  } else if (state === 'active') {
    timer.foreground();
    if (backgroundAt !== null && now - backgroundAt >= REOPEN_AFTER_MS) track('app_opened', { cold: false });
    backgroundAt = null;
  }
}

let appStateSub: { remove: () => void } | null = null;
/** 앱 시작 때 한 번 (App.tsx) */
export function startAppStateTracking() {
  appStateSub?.remove();
  appStateSub = AppState.addEventListener('change', s => onAppStateChange(s));
}

/** 모든 버튼 탭 (components/ui Press). 숫자(개수·거리)는 #으로 바꿔 라벨을 고정한다 */
export function trackTap(label: string | undefined, extra?: Record<string, unknown>) {
  track('tap', { label: stableLabel(label), ...extra });
}

export function stableLabel(label: string | undefined) {
  const l = (label ?? '').replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 60);
  return l || 'unlabeled';
}

// ── 사용자 (상세 분석일 때만)
/** 로그인 토큰(JWT)의 sub — 형식이 다르면 null */
export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse((globalThis as unknown as { atob: (v: string) => string }).atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    const id = json.sub ?? json.userId ?? json.id;
    return id != null ? String(id) : null;
  } catch {
    return null;
  }
}

export function identifyUser(id: string, props: { username?: string; gender?: boolean | null; birth?: string | null }) {
  if (!started || !detailed()) return;
  // Amplitude는 user_id 5자 이상만 받는다
  amplitude.setUserId(id.length >= 5 ? id : `pado-${id}`);
  const ident = new amplitude.Identify();
  if (props.username) ident.set('username', props.username);
  if (props.gender != null) ident.set('gender', props.gender ? 'male' : 'female');
  if (props.birth) ident.set('birth_year', Number(props.birth.slice(0, 4)));
  amplitude.identify(ident);
}

/** 기기 속성 (설정값 등 개인을 알 수 없는 값만 — 기본 모드에서도 보냄) */
export function setUserProps(props: Record<string, string | number | boolean>) {
  if (!started || mode === 'off') return;
  const ident = new amplitude.Identify();
  for (const [k, v] of Object.entries(props)) ident.set(k, v);
  amplitude.identify(ident);
}

/** 로그아웃 — 상세 분석이면 사용자 ID를 끊는다 (기본 모드는 처음부터 사용자 ID가 없음) */
export function resetUser() {
  if (!started || !detailed()) return;
  amplitude.reset();
}

/** 화면 파라미터 중 식별자만 (곡·드랍·플리 id) */
function pickIds(params?: object) {
  if (!params) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (/Id$/.test(k) && typeof v === 'string') out[k] = v;
  return out;
}
