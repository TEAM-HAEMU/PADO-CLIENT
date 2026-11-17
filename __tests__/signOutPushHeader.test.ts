/* 로그아웃 → 푸시 토큰 삭제 요청 (실제 auth·push·API 클라이언트) — 로그인 토큰을 바로 비워도 삭제 요청엔 이전 토큰이 붙는다 */
jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}), getToken: jest.fn(async () => 'fcm-1'), deleteToken: jest.fn(async () => undefined),
  getInitialNotification: jest.fn(), onMessage: jest.fn(), onNotificationOpenedApp: jest.fn(), onTokenRefresh: jest.fn(),
}));
jest.mock('react-native-permissions', () => ({ checkNotifications: jest.fn(async () => ({ status: 'granted' })), requestNotifications: jest.fn(), RESULTS: { GRANTED: 'granted', LIMITED: 'limited', DENIED: 'denied' } }));
jest.mock('react-native-device-info', () => ({ getVersion: () => '1.0.0' }));
jest.mock('@/services/analytics', () => ({
  analyticsMode: () => 'basic', identifyUser: jest.fn(), resetUser: jest.fn(), track: jest.fn(), userIdFromToken: () => null,
  migrateAnalyticsMode: () => 'basic', setAnalyticsMode: jest.fn(async () => undefined), setUserProps: jest.fn(),
}));
jest.mock('@/services/monitoring', () => ({ setMonitoringMode: jest.fn(), reportError: jest.fn(), reportApiFailure: jest.fn() }));
jest.mock('@/services/preview', () => ({ usePreviewStore: { getState: () => ({ stop: jest.fn() }) } }));
jest.mock('@/services/socialAuth', () => ({ signOutProviders: jest.fn() }));
jest.mock('@/services/pushSettings', () => ({ loadPushSettings: jest.fn(async () => undefined) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { useAuth } from '@/store/auth';
import '@/services/push';
import { kv } from '@/store/storage';

type Call = { url: string; method?: string; auth?: string; tokenAtSend: string | null };
const calls: Call[] = [];
const flush = () => new Promise<void>(r => setImmediate(r));

test('삭제 요청은 로그아웃 순간의 로그인 토큰으로, 서버 로그아웃은 그 뒤에', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization, tokenAtSend: useAuth.getState().accessToken });
    return { status: 204, text: async () => '', headers: { get: () => null } };
  }) as never;
  await useAuth.getState().signIn({ accessToken: 'old-access', refreshToken: 'old-refresh', accessTokenExpiresIn: 0, refreshTokenExpiresIn: 0 });
  kv.set('push:token', 'fcm-old');
  await useAuth.getState().signOut();
  expect(useAuth.getState().accessToken).toBeNull();
  await flush(); await flush();
  const del = calls.find(c => c.url.endsWith('/push/tokens') && c.method === 'DELETE');
  expect(del?.auth).toBe('Bearer old-access');
  const logout = calls.findIndex(c => c.url.endsWith('/auth/logout'));
  expect(logout).toBeGreaterThan(calls.indexOf(del!));
});
