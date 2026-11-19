/* 목 서버 — 푸시 API 모양·검증 (계약 handoff/push-fcm-contract.md '앱용 API') */
import { mockPush, mockPushState } from '@/api/mock/push';

const URL = 'https://api.test/api/v1';
const AUTH = { Authorization: 'Bearer mock.access.1' };
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = AUTH) =>
  mockPush(method, `${URL}${path}`, headers, body === undefined ? undefined : JSON.stringify(body));
const json = (r: ReturnType<typeof call>) => (r?.text ? JSON.parse(r.text) : undefined);

beforeEach(() => mockPushState.reset());

test('푸시 경로가 아니면 기존 목 서버로 넘긴다', () => {
  expect(call('GET', '/users')).toBeNull();
});

test('로그인이 필요하다', () => {
  expect(call('GET', '/push/settings', undefined, {})?.status).toBe(401);
});

test('설정: 기본값 → 일부만 바꿔도 전체 값을 돌려준다, 잘못된 값은 400 S1', () => {
  expect(json(call('GET', '/push/settings'))).toEqual({ like: true, comment: true, nearby: false, notice: true, marketing: false, marketingUpdatedAt: null });
  expect(json(call('PUT', '/push/settings', { notice: false }))).toEqual({ like: true, comment: true, nearby: false, notice: false, marketing: false, marketingUpdatedAt: null });
  const bad = call('PUT', '/push/settings', { like: 'yes' });
  expect(bad?.status).toBe(400);
  expect(json(bad).code).toBe('S1');
});

test('혜택·소식: 값이 실제로 바뀔 때만 marketingUpdatedAt을 바꾼다', () => {
  const on = json(call('PUT', '/push/settings', { marketing: true }));
  expect(on.marketing).toBe(true);
  expect(typeof on.marketingUpdatedAt).toBe('string');
  const again = json(call('PUT', '/push/settings', { marketing: true, like: false }));
  expect(again.marketingUpdatedAt).toBe(on.marketingUpdatedAt);
  expect(call('PUT', '/push/settings', { marketing: 'y' })?.status).toBe(400);
  expect(json(call('PUT', '/push/settings', { marketing: false })).marketing).toBe(false);
});

test('토큰 등록·삭제 (없어도 204), 검증', () => {
  expect(call('PUT', '/push/tokens', { token: 'abc', platform: 'IOS', appVersion: '1.0.26' })?.status).toBe(204);
  expect(mockPushState.get().tokens).toEqual(['abc']);
  expect(call('PUT', '/push/tokens', { token: 'abc', platform: 'WEB' })?.status).toBe(400);
  expect(call('PUT', '/push/tokens', { token: 'x'.repeat(4097), platform: 'ANDROID' })?.status).toBe(400);
  expect(call('DELETE', '/push/tokens', { token: 'abc' })?.status).toBe(204);
  expect(call('DELETE', '/push/tokens', { token: 'abc' })?.status).toBe(204);
  expect(mockPushState.get().tokens).toEqual([]);
});

test('위치: 주변 새 드랍이 꺼져 있으면 저장하지 않고 204, 끄면 지운다', () => {
  expect(call('PUT', '/push/region', { latitude: 35.16, longitude: 129.16 })?.status).toBe(204);
  expect(mockPushState.get().region).toBeNull();
  call('PUT', '/push/settings', { nearby: true });
  call('PUT', '/push/region', { latitude: 35.16, longitude: 129.16 });
  expect(mockPushState.get().region).toEqual({ latitude: 35.16, longitude: 129.16 });
  call('PUT', '/push/settings', { nearby: false });
  expect(mockPushState.get().region).toBeNull();
  expect(call('PUT', '/push/region', { latitude: 'a' })?.status).toBe(400);
});
