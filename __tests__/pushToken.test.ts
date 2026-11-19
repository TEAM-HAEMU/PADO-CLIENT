/* 푸시 토큰 등록·삭제 — 등록이 실패하면 앱으로 돌아올 때 다시, 삭제는 부르는 즉시 요청, 삭제가 끝나기 전엔 새로 등록하지 않음 */
jest.mock('@react-native-firebase/app', () => ({ getApp: () => ({}) }));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}), getToken: jest.fn(async () => 'fcm-1'), deleteToken: jest.fn(async () => undefined),
  getInitialNotification: jest.fn(), onMessage: jest.fn(), onNotificationOpenedApp: jest.fn(), onTokenRefresh: jest.fn(),
}));
jest.mock('react-native-permissions', () => ({
  checkNotifications: jest.fn(async () => ({ status: 'granted' })), requestNotifications: jest.fn(), RESULTS: { GRANTED: 'granted', LIMITED: 'limited', DENIED: 'denied' },
}));
jest.mock('react-native-device-info', () => ({ getVersion: () => '1.0.0' }));
jest.mock('@/api/endpoints', () => ({ pushApi: { registerToken: jest.fn(async () => undefined), deleteToken: jest.fn(async () => undefined) } }));
jest.mock('@/store/auth', () => ({ useAuth: jest.requireActual('zustand').create(() => ({ status: 'authed', accessToken: 'a1' })), setBeforeSignOut: jest.fn() }));
jest.mock('@/hooks/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/services/pushSettings', () => ({ loadPushSettings: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/monitoring', () => ({ reportError: jest.fn() }));

import { openUrlFor, retryPushTokenIfNeeded, syncPushToken, unregisterPushToken } from '@/services/push';
import { kv } from '@/store/storage';

const { pushApi } = jest.requireMock('@/api/endpoints') as { pushApi: { registerToken: jest.Mock; deleteToken: jest.Mock } };
const fcm = jest.requireMock('@react-native-firebase/messaging') as { getToken: jest.Mock; deleteToken: jest.Mock };
const { useAuth } = jest.requireMock('@/store/auth');
const { track } = jest.requireMock('@/services/analytics') as { track: jest.Mock };
const flush = () => new Promise<void>(r => setImmediate(r));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(async () => {
  jest.clearAllMocks();
  useAuth.setState({ status: 'authed', accessToken: 'a1' });
  await unregisterPushToken(false); // 다시 시도 표시·저장 토큰 초기화
  await flush();
  jest.clearAllMocks();
});

test('등록이 실패하면 앱으로 돌아올 때 다시 등록한다 (30초 간격) — 성공하면 그만', async () => {
  pushApi.registerToken.mockRejectedValueOnce(new Error('network'));
  await syncPushToken();
  expect(pushApi.registerToken).toHaveBeenCalledTimes(1);
  retryPushTokenIfNeeded(Date.now() + 5_000);
  await flush();
  expect(pushApi.registerToken).toHaveBeenCalledTimes(1);
  retryPushTokenIfNeeded(Date.now() + 31_000);
  await flush();
  expect(pushApi.registerToken).toHaveBeenCalledTimes(2);
  expect(kv.get('push:token', null)).toBe('fcm-1');
  retryPushTokenIfNeeded(Date.now() + 120_000);
  await flush();
  expect(pushApi.registerToken).toHaveBeenCalledTimes(2);
});

test('Firebase 토큰 발급이 실패해도 다시 시도한다', async () => {
  fcm.getToken.mockRejectedValueOnce(new Error('apns'));
  await syncPushToken();
  retryPushTokenIfNeeded(Date.now() + 31_000);
  await flush();
  expect(pushApi.registerToken).toHaveBeenCalledWith('fcm-1', expect.any(String), '1.0.0');
});

test('로그아웃 상태거나 로그아웃으로 토큰을 지웠으면 다시 시도하지 않는다', async () => {
  pushApi.registerToken.mockRejectedValueOnce(new Error('network'));
  await syncPushToken();
  useAuth.setState({ status: 'guest' });
  retryPushTokenIfNeeded(Date.now() + 31_000);
  await flush();
  useAuth.setState({ status: 'authed', accessToken: 'a1' });
  await unregisterPushToken(false);
  retryPushTokenIfNeeded(Date.now() + 31_000);
  await flush();
  expect(pushApi.registerToken).toHaveBeenCalledTimes(1);
});

test('삭제 요청엔 부른 순간의 로그인 토큰을 명시해 붙인다 (그 뒤 로그인 토큰이 비워져도)', async () => {
  kv.set('push:token', 'fcm-old');
  const p = unregisterPushToken();
  useAuth.setState({ status: 'guest', accessToken: null });
  await p;
  expect(pushApi.deleteToken).toHaveBeenCalledWith('fcm-old', 'a1');
  expect(kv.get('push:token', null)).toBeNull();
  kv.set('push:token', 'fcm-2');
  await unregisterPushToken(true, 'a-given');
  expect(pushApi.deleteToken).toHaveBeenLastCalledWith('fcm-2', 'a-given');
});

test('삭제(기기 토큰 폐기까지)가 끝나기 전에 등록하면 끝난 뒤에 새 토큰을 받는다', async () => {
  kv.set('push:token', 'fcm-old');
  const d = deferred();
  fcm.deleteToken.mockReturnValueOnce(d.promise);
  unregisterPushToken();
  const sync = syncPushToken();
  await flush();
  expect(fcm.deleteToken).toHaveBeenCalledTimes(1);
  expect(fcm.getToken).not.toHaveBeenCalled();
  d.resolve();
  await sync;
  expect(fcm.getToken).toHaveBeenCalledTimes(1);
  expect(pushApi.registerToken).toHaveBeenCalledTimes(1);
});

describe('알림 누름 → 화면 + push_opened', () => {
  const NOTICE = '0199a5e0-2222-7abc-8def-000000000456';
  test('운영자 발송: target에 따른 화면, 분석에 kind·target, 서버 집계용 notice_id', () => {
    expect(openUrlFor({ type: 'notice', noticeId: NOTICE, kind: 'AD', target: 'MY_PLAYLISTS' })).toBe('pado://playlists');
    expect(track).toHaveBeenCalledWith('push_opened', { type: 'notice', has_drop: false, kind: 'AD', target: 'MY_PLAYLISTS', notice_id: NOTICE });
  });
  test('다른 종류는 지금처럼 type·has_drop만', () => {
    const drop = '0199a5e0-1111-7abc-8def-000000000123';
    expect(openUrlFor({ type: 'like', droppingId: drop })).toBe(`pado://drop/${drop}?source=notification`);
    expect(track).toHaveBeenCalledWith('push_opened', { type: 'like', has_drop: true });
  });
  test('우리 알림이 아니면 아무것도 안 한다', () => {
    expect(openUrlFor({})).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
