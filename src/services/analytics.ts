/**
 * Amplitude 분석 — 화면 · 모든 탭(Press) · 핵심 행동 이벤트 + 정밀 위치 + 세션 리플레이.
 *  - 실서버 빌드에서만 전송 (목 모드 · 키 없음 · 사용자가 설정에서 끄면 전송 안 함)
 *  - 사용자 식별: 로그인 토큰의 sub(사용자 ID), 없으면 닉네임 기반 ID. 이메일·실명은 보내지 않음
 *  - 모든 이벤트에 마지막 위치(lat/lng)와 현재 화면 이름을 붙임
 *  - 세션 리플레이: 입력칸은 가림(maskLevel medium), 샘플링 비율은 AMPLITUDE_REPLAY_SAMPLE_RATE(기본 0.3 — 무료 월 1만 회)
 *  - AMPLITUDE_IN_MOCK=true면 목 모드에서도 전송 (시연용, app_env=mock)
 */
import * as amplitude from '@amplitude/analytics-react-native';
import type { Types } from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { env } from '@/config';


/** 위치·화면 등 모든 이벤트에 붙일 공통 속성 (위치 서비스·내비게이션이 갱신) */
const context: { lat?: number; lng?: number; screen?: string } = {};
let started = false;
let optedOut = false;

export const analyticsEnabled = () => !!env.amplitudeApiKey && (!env.useMock || env.amplitudeInMock);
/** 실서버 / 목(시연) 구분 — 모든 이벤트·사용자에 붙여 걸러볼 수 있게 */
const appEnv = () => (env.useMock ? 'mock' : 'prod');

/** 공통 속성을 모든 이벤트에 붙이는 플러그인 */
const enrich: Types.EnrichmentPlugin = {
  name: 'pado-context',
  type: 'enrichment',
  setup: async () => undefined,
  execute: async event => {
    event.event_properties = {
      app_env: appEnv(),
      ...(context.screen ? { screen: context.screen } : null),
      ...(context.lat !== undefined ? { lat: context.lat, lng: context.lng } : null),
      ...event.event_properties,
    };
    if (context.lat !== undefined) { event.location_lat = context.lat; event.location_lng = context.lng; }
    return event;
  },
};

export async function initAnalytics(opts: { optOut: boolean }) {
  optedOut = opts.optOut;
  if (started || !analyticsEnabled()) return;
  started = true;
  await amplitude.init(env.amplitudeApiKey, undefined, {
    optOut: opts.optOut,
    trackingSessionEvents: true, // session_start / session_end
    logLevel: __DEV__ ? amplitude.Types.LogLevel.Warn : amplitude.Types.LogLevel.None,
  }).promise;
  amplitude.add(enrich);
  const envIdent = new amplitude.Identify();
  envIdent.set('app_env', appEnv());
  amplitude.identify(envIdent);
  try {
    await amplitude.add(new SessionReplayPlugin({ sampleRate: env.replaySampleRate, privacyConfig: { maskLevel: 'medium' } })).promise;
  } catch (e) {
    if (__DEV__) console.warn('[analytics] session replay unavailable', e);
  }
}

/** 설정 › 이용 데이터 분석 */
export function setAnalyticsOptOut(v: boolean) {
  optedOut = v;
  if (started) amplitude.setOptOut(v);
}

export function track(name: string, props?: Record<string, unknown>) {
  if (!started || optedOut) return;
  amplitude.track(name, props);
}

// ── 공통 속성
export function setAnalyticsLocation(lat: number, lng: number) {
  context.lat = Math.round(lat * 1e6) / 1e6;
  context.lng = Math.round(lng * 1e6) / 1e6;
}

let lastScreen: string | undefined;
export function trackScreen(name: string | undefined, params?: object) {
  if (!name || name === lastScreen) return;
  lastScreen = name;
  context.screen = name;
  track('screen_viewed', { screen: name, ...pickIds(params) });
}

/** 모든 버튼 탭 (components/ui Press) — 라벨이 없으면 버튼 안 텍스트 대신 'unlabeled' */
export function trackTap(label: string | undefined, extra?: Record<string, unknown>) {
  track('tap', { label: label || 'unlabeled', ...extra });
}

// ── 사용자
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
  if (!started) return;
  // Amplitude는 user_id 5자 이상만 받는다
  amplitude.setUserId(id.length >= 5 ? id : `pado-${id}`);
  const ident = new amplitude.Identify();
  if (props.username) ident.set('username', props.username);
  if (props.gender != null) ident.set('gender', props.gender ? 'male' : 'female');
  if (props.birth) ident.set('birth_year', Number(props.birth.slice(0, 4)));
  amplitude.identify(ident);
}

export function setUserProps(props: Record<string, string | number | boolean>) {
  if (!started) return;
  const ident = new amplitude.Identify();
  for (const [k, v] of Object.entries(props)) ident.set(k, v);
  amplitude.identify(ident);
}

export function resetUser() {
  if (!started) return;
  amplitude.reset();
}

/** 화면 파라미터 중 식별자만 (곡·드랍·플리 id) */
function pickIds(params?: object) {
  if (!params) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (/Id$/.test(k) && typeof v === 'string') out[k] = v;
  return out;
}
