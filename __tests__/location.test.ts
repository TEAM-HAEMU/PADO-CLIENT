/* 위치 감시 — 앱 전체에 감시 하나, 감시 중엔 단발 요청 금지, 첫 위치 시간 초과 뒤에도 감시로 회복 */
type Cb = (p: { coords: { latitude: number; longitude: number } }) => void;
type ErrCb = (e: { code?: number; message?: string }) => void;
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: { getCurrentPosition: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn(), setRNConfiguration: jest.fn() },
}));
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { IOS: { LOCATION_WHEN_IN_USE: 'ios.loc' }, ANDROID: { ACCESS_FINE_LOCATION: 'a.fine', ACCESS_COARSE_LOCATION: 'a.coarse' } },
  RESULTS: { GRANTED: 'granted', LIMITED: 'limited', DENIED: 'denied', BLOCKED: 'blocked', UNAVAILABLE: 'unavailable' },
  check: jest.fn(async () => 'granted'),
  request: jest.fn(async () => 'granted'),
  requestMultiple: jest.fn(async () => ({})),
}));
jest.mock('@/services/analytics', () => ({ track: jest.fn(), setAnalyticsLocation: jest.fn() }));

import { FIX_TIMEOUT_MS, useLocation } from '@/services/location';

const mockGeo = jest.requireMock('@react-native-community/geolocation').default as {
  getCurrentPosition: jest.Mock<void, [Cb, ErrCb, object]>;
  watchPosition: jest.Mock<number, [Cb, ErrCb, object]>;
  clearWatch: jest.Mock<void, [number]>;
};

const st = () => useLocation.getState();
const pos = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } });
const flush = () => new Promise<void>(r => jest.requireActual<typeof globalThis>('timers').setImmediate(r));
let nextId = 1000;
const releases: (() => void)[] = [];
const hold = () => { const r = st().start(); releases.push(r); return r; };

beforeEach(() => {
  jest.useFakeTimers();
  mockGeo.getCurrentPosition.mockReset();
  mockGeo.watchPosition.mockReset().mockImplementation(() => nextId++);
  mockGeo.clearWatch.mockReset();
  useLocation.setState({ coords: null, fix: 'locating', reason: null });
});
afterEach(() => { releases.splice(0).forEach(r => r()); jest.useRealTimers(); });

test('빠른 첫 위치 → 정밀 감시 하나. 감시가 켜진 뒤엔 단발 요청을 부르지 않는다', () => {
  hold();
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(mockGeo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false, maximumAge: 120_000 });
  expect(mockGeo.watchPosition).not.toHaveBeenCalled();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35.1, 129.0));
  expect(st().coords).toEqual({ latitude: 35.1, longitude: 129.0 });
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  expect(mockGeo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, distanceFilter: 5 });
  // 걸어가면 감시가 따라온다
  const onWatch = mockGeo.watchPosition.mock.calls[0][0];
  onWatch(pos(35.101, 129.0));
  onWatch(pos(35.102, 129.001));
  expect(st().coords).toEqual({ latitude: 35.102, longitude: 129.001 });
  jest.advanceTimersByTime(60_000);
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
});

test('빠른 첫 위치가 답이 없어도(Android Play 위치) 감시는 시작한다', () => {
  hold();
  jest.advanceTimersByTime(5000);
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  // 뒤늦게 첫 위치가 와도 감시를 하나 더 만들지 않는다
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(1, 2));
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
});

test('여러 곳에서 붙잡아도 감시는 하나 — 모두 놓아야 멈춘다', () => {
  const a = hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(1, 2));
  const b = hold();
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  a();
  a(); // 두 번 놓아도 한 번만
  expect(mockGeo.clearWatch).not.toHaveBeenCalled();
  b();
  expect(mockGeo.clearWatch).toHaveBeenCalledWith(mockGeo.watchPosition.mock.results[0].value);
});

test('restart는 감시를 지우고 처음부터 (감시가 꺼진 상태에서만 단발 요청)', () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(1, 2));
  const first = mockGeo.watchPosition.mock.results[0].value;
  st().restart();
  expect(mockGeo.clearWatch).toHaveBeenCalledWith(first);
  // 단발 요청을 부르는 순간엔 감시가 지워져 있어야 한다
  expect(mockGeo.clearWatch.mock.invocationCallOrder[0]).toBeLessThan(mockGeo.getCurrentPosition.mock.invocationCallOrder[1]);
  // 지난 회차의 늦은 콜백은 무시
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(9, 9));
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  mockGeo.getCurrentPosition.mock.calls[1][0](pos(3, 4));
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(2);
});

test('붙잡은 곳이 없으면 restart는 아무것도 안 한다', () => {
  st().restart();
  expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
});

test('첫 위치를 시간 안에 못 받으면 unavailable(timeout) — 감시는 계속돼 나중에 받으면 ok', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][1]({ code: 3 });
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'timeout' });
  expect(mockGeo.clearWatch).not.toHaveBeenCalled();
  mockGeo.watchPosition.mock.calls[0][0](pos(35, 129));
  expect(st()).toMatchObject({ fix: 'ok', reason: null, coords: { latitude: 35, longitude: 129 } });
});

test('권한 거부는 기다리지 않고 바로 denied', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][1]({ code: 1 });
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'denied' });
});
