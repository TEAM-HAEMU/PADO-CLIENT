/**
 * 목 서버 — 푸시 알림 API (PUT·DELETE /push/tokens, GET·PUT /push/settings, PUT /push/region).
 * 모양·검증은 계약(handoff/push-fcm-contract.md) 그대로. 상태는 앱 실행 동안 메모리에만 있다.
 * mock/server.ts와 따로 둔 파일 — client가 목 모드에서 이쪽을 먼저 묻는다 (처리할 경로가 아니면 null)
 */
import type { PushSettings } from '../types';
import type { RawResponse } from '../client';

const DEFAULTS: PushSettings = { like: true, comment: true, nearby: false, notice: true };
const KEYS = Object.keys(DEFAULTS) as (keyof PushSettings)[];
const MAX_TOKEN = 4096;

const state = {
  settings: { ...DEFAULTS },
  tokens: new Map<string, { platform: string; appVersion: string | null }>(),
  region: null as { latitude: number; longitude: number } | null,
};

const ok = (body?: unknown, status = 200): RawResponse => ({ status, text: body === undefined ? '' : JSON.stringify(body) });
const bad = (message: string): RawResponse => ({ status: 400, text: JSON.stringify({ code: 'S1', message }) });

export function mockPush(method: string, url: string, headers: Record<string, string>, body?: string | FormData): RawResponse | null {
  const path = url.split('?')[0].replace(/^.*\/api\/v1/, '');
  if (!path.startsWith('/push/')) return null;
  const token = headers.Authorization?.replace('Bearer ', '') ?? '';
  if (!token.startsWith('mock.access.')) return { status: 401, text: JSON.stringify({ code: token ? 'U3' : 'U10', message: '인증이 필요합니다' }) };
  let b: Record<string, unknown> = {};
  try { b = typeof body === 'string' && body ? JSON.parse(body) : {}; } catch { return bad('잘못된 요청 본문'); }

  if (path === '/push/tokens' && method === 'PUT') {
    const t = typeof b.token === 'string' ? b.token : '';
    if (!t || t.length > MAX_TOKEN) return bad('token은 1~4096자');
    if (b.platform !== 'IOS' && b.platform !== 'ANDROID') return bad('platform은 IOS 또는 ANDROID');
    state.tokens.set(t, { platform: b.platform, appVersion: typeof b.appVersion === 'string' ? b.appVersion : null });
    return ok(undefined, 204);
  }
  if (path === '/push/tokens' && method === 'DELETE') {
    if (typeof b.token !== 'string' || !b.token) return bad('token은 필수');
    state.tokens.delete(b.token);
    return ok(undefined, 204);
  }
  if (path === '/push/settings' && method === 'GET') return ok(state.settings);
  if (path === '/push/settings' && method === 'PUT') {
    for (const k of KEYS) if (b[k] !== undefined && typeof b[k] !== 'boolean') return bad(`${k}는 true/false`);
    for (const k of KEYS) if (typeof b[k] === 'boolean') state.settings[k] = b[k] as boolean;
    if (!state.settings.nearby) state.region = null;
    return ok(state.settings);
  }
  if (path === '/push/region' && method === 'PUT') {
    const { latitude, longitude } = b as { latitude?: unknown; longitude?: unknown };
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return bad('좌표가 올바르지 않습니다');
    if (state.settings.nearby) state.region = { latitude, longitude };
    return ok(undefined, 204);
  }
  return null;
}

/** 테스트용 — 목 상태 보기·초기화 */
export const mockPushState = {
  get: () => ({ settings: { ...state.settings }, tokens: [...state.tokens.keys()], region: state.region }),
  reset: () => { state.settings = { ...DEFAULTS }; state.tokens.clear(); state.region = null; },
};
