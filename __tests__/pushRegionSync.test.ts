/* 주변 새 드랍 — 위치가 들어올 때 조건(켜짐·로그인·앞·30분/300m)이 맞으면 PUT /push/region */
import { AppState } from 'react-native';

jest.mock('@/api/endpoints', () => ({ pushApi: { region: jest.fn(async () => undefined) } }));
jest.mock('@/services/location', () => {
  const { create: make } = jest.requireActual('zustand');
  return {
    useLocation: make(() => ({ coords: null, stale: false })),
    currentCoords: (s: { coords: unknown; stale: boolean }) => (s.stale ? null : s.coords),
  };
});
jest.mock('@/store/auth', () => ({ useAuth: jest.requireActual('zustand').create(() => ({ status: 'authed' })) }));
jest.mock('@/store/prefs', () => ({ usePrefs: jest.requireActual('zustand').create(() => ({ notify: { nearby: true } })) }));
jest.mock('@/services/pushSettings', () => ({ setOnNearbyChanged: jest.fn() }));

import { forgetPushRegion, maybeSendPushRegion } from '@/services/pushRegion';

Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
const { pushApi } = jest.requireMock('@/api/endpoints') as { pushApi: { region: jest.Mock } };
const { useLocation } = jest.requireMock('@/services/location');
const { useAuth } = jest.requireMock('@/store/auth');
const { usePrefs } = jest.requireMock('@/store/prefs');
const HOME = { latitude: 35.1889, longitude: 128.9038 };
const T0 = 1_800_000_000_000;
const flush = () => new Promise<void>(r => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  forgetPushRegion();
  useLocation.setState({ coords: HOME, stale: false });
  useAuth.setState({ status: 'authed' });
  usePrefs.setState({ notify: { nearby: true } });
});

test('켜져 있고 지금 위치가 있으면 보내고, 30분 안 같은 자리면 다시 안 보낸다', async () => {
  maybeSendPushRegion(T0);
  await flush();
  expect(pushApi.region).toHaveBeenCalledWith(HOME.latitude, HOME.longitude);
  maybeSendPushRegion(T0 + 10 * 60_000);
  await flush();
  expect(pushApi.region).toHaveBeenCalledTimes(1);
  maybeSendPushRegion(T0 + 31 * 60_000);
  await flush();
  expect(pushApi.region).toHaveBeenCalledTimes(2);
});

test('꺼져 있거나 로그아웃이거나 낡은 좌표면 보내지 않는다', async () => {
  usePrefs.setState({ notify: { nearby: false } });
  maybeSendPushRegion(T0);
  usePrefs.setState({ notify: { nearby: true } });
  useAuth.setState({ status: 'guest' });
  maybeSendPushRegion(T0);
  useAuth.setState({ status: 'authed' });
  useLocation.setState({ coords: HOME, stale: true });
  maybeSendPushRegion(T0);
  await flush();
  expect(pushApi.region).not.toHaveBeenCalled();
});

test('실패하면 5분 동안 다시 시도하지 않는다', async () => {
  pushApi.region.mockRejectedValueOnce(new Error('500'));
  maybeSendPushRegion(T0);
  await flush();
  maybeSendPushRegion(T0 + 60_000);
  await flush();
  expect(pushApi.region).toHaveBeenCalledTimes(1);
  maybeSendPushRegion(T0 + 6 * 60_000);
  await flush();
  expect(pushApi.region).toHaveBeenCalledTimes(2);
});

test('기록을 지우면(주변 새 드랍을 다시 켬) 바로 다시 보낸다', async () => {
  maybeSendPushRegion(T0);
  await flush();
  forgetPushRegion();
  maybeSendPushRegion(T0 + 60_000);
  await flush();
  expect(pushApi.region).toHaveBeenCalledTimes(2);
});
