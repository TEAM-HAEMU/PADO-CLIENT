/* 위치 감시 — 앱 전체에 감시 하나, 감시 중엔 단발 요청 금지, 첫 위치 시간 초과 뒤에도 감시로 회복, 권한·GPS를 끄면 좌표를 버림, 백그라운드면 멈춤 */
type Cb = (p: { coords: { latitude: number; longitude: number; accuracy?: number }; timestamp?: number }) => void;
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
jest.mock('@/services/analytics', () => ({ track: jest.fn(), setAnalyticsLocation: jest.fn(), clearAnalyticsLocation: jest.fn(), setAnalyticsRegion: jest.fn() }));

import { AppState, type AppStateStatus } from 'react-native';
import { currentCoords, DROP_MAX_ACCURACY_M, FIX_TIMEOUT_MS, STALE_MS, tooImpreciseToDrop, useLocation } from '@/services/location';

const mockGeo = jest.requireMock('@react-native-community/geolocation').default as {
  getCurrentPosition: jest.Mock<void, [Cb, ErrCb, object]>;
  watchPosition: jest.Mock<number, [Cb, ErrCb, object]>;
  clearWatch: jest.Mock<void, [number]>;
};

const mockAnalytics = jest.requireMock('@/services/analytics') as { track: jest.Mock; clearAnalyticsLocation: jest.Mock; setAnalyticsRegion: jest.Mock };
const mockPerm = jest.requireMock('react-native-permissions') as { check: jest.Mock };
/** location.ts가 처음 start() 때 단 AppState 리스너 */
const appState = (s: AppStateStatus) => {
  const call = (AppState.addEventListener as jest.Mock).mock.calls.find(c => c[0] === 'change');
  (call![1] as (st: AppStateStatus) => void)(s);
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
  mockAnalytics.track.mockClear();
  mockAnalytics.clearAnalyticsLocation.mockClear();
  mockAnalytics.setAnalyticsRegion.mockClear();
  useLocation.setState({ coords: null, accuracy: null, fixedAt: null, stale: false, fix: 'locating', reason: null });
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

test('위치와 함께 오차·잡은 시각을 저장한다', () => {
  hold();
  const t = Date.now() - 1000;
  mockGeo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129, accuracy: 35 }, timestamp: t });
  expect(st()).toMatchObject({ coords: { latitude: 35, longitude: 129 }, accuracy: 35, fixedAt: t, stale: false, fix: 'ok' });
  // 오차를 모르면 null, 미래 시각은 지금으로
  mockGeo.watchPosition.mock.calls[0][0]({ coords: { latitude: 35.1, longitude: 129 }, timestamp: Date.now() + 60_000 });
  expect(st()).toMatchObject({ accuracy: null, fixedAt: Date.now() });
});

test('위치를 받은 뒤 권한을 끄면 좌표를 버리고 denied (낡은 좌표로 드랍·잠금 해제 안 함)', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  expect(currentCoords(st())).toEqual({ latitude: 35, longitude: 129 });
  const onErr = mockGeo.watchPosition.mock.calls[0][1];
  onErr({ code: 1 });
  await flush();
  expect(st()).toMatchObject({ coords: null, accuracy: null, fixedAt: null, fix: 'unavailable', reason: 'denied' });
  expect(currentCoords(st())).toBeNull();
  expect(mockAnalytics.clearAnalyticsLocation).toHaveBeenCalled();
  expect(mockAnalytics.setAnalyticsRegion).toHaveBeenCalledWith(null);
  // 감시가 같은 오류를 거듭 내도 한 번만 센다
  onErr({ code: 1 });
  await flush();
  expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_unavailable')).toHaveLength(1);
});

test('위치를 받은 뒤 위치 서비스를 끄면(iOS는 코드 1 + UNAVAILABLE) off — 다시 켜서 위치가 오면 ok', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  mockPerm.check.mockResolvedValueOnce('unavailable');
  mockGeo.watchPosition.mock.calls[0][1]({ code: 1 });
  await flush();
  expect(st()).toMatchObject({ coords: null, fix: 'unavailable', reason: 'off' });
  mockGeo.watchPosition.mock.calls[0][0](pos(35.2, 129));
  expect(st()).toMatchObject({ coords: { latitude: 35.2, longitude: 129 }, fix: 'ok', reason: null });
});

test('신호 약함(확정 오류 아님)은 받아 둔 좌표를 지우지 않는다', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  mockGeo.watchPosition.mock.calls[0][1]({ code: 3 });
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st()).toMatchObject({ coords: { latitude: 35, longitude: 129 }, fix: 'ok', stale: false });
});

test('감시가 위치를 준 뒤 늦게 온 빠른 첫 위치(캐시)는 버린다', () => {
  hold();
  jest.advanceTimersByTime(5000);
  mockGeo.watchPosition.mock.calls[0][0](pos(35.2, 129.2));
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35.0, 129.0));
  expect(st().coords).toEqual({ latitude: 35.2, longitude: 129.2 });
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
});

test('백그라운드로 가면 감시를 멈추고, 잠깐이면 돌아와서 좌표를 그대로 믿고 다시 감시', () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  const first = mockGeo.watchPosition.mock.results[0].value;
  appState('background');
  expect(mockGeo.clearWatch).toHaveBeenCalledWith(first);
  // 백그라운드에선 시간 초과 판정도 돌지 않는다
  jest.advanceTimersByTime(30_000);
  expect(st().fix).toBe('ok');
  appState('inactive'); // iOS 전환 중간 상태는 무시
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  appState('active');
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(st()).toMatchObject({ stale: false, fix: 'ok' });
  expect(currentCoords(st())).toEqual({ latitude: 35, longitude: 129 });
});

test('가만히 있어 감시가 새 값을 안 줘도 감시가 도는 동안은 낡은 게 아니다', () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  mockGeo.watchPosition.mock.calls[0][0](pos(35, 129)); // 감시는 켜질 때 한 번 위치를 주고, 그 뒤로는 움직여야(distanceFilter) 준다
  jest.advanceTimersByTime(STALE_MS * 5);
  appState('background');
  appState('active');
  expect(st().stale).toBe(false);
});

test('백그라운드에 오래 있다 돌아오면 좌표는 낡음 — 새 위치가 올 때까지 드랍 생성·잠금 판정에 안 쓴다', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  appState('background');
  jest.advanceTimersByTime(STALE_MS + 1000);
  appState('active');
  expect(st()).toMatchObject({ coords: { latitude: 35, longitude: 129 }, stale: true, fix: 'locating' });
  expect(currentCoords(st())).toBeNull();
  // 새 위치를 못 받으면 시간 초과 — 좌표는 지도 카메라용으로만 남는다
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st()).toMatchObject({ stale: true, fix: 'unavailable', reason: 'timeout' });
  // 받으면 다시 믿는다
  mockGeo.watchPosition.mock.calls[1][0](pos(35.3, 129));
  expect(st()).toMatchObject({ stale: false, fix: 'ok', reason: null });
  expect(currentCoords(st())).toEqual({ latitude: 35.3, longitude: 129 });
});

test('돌아온 뒤 새 위치가 계속 안 오면 믿음이 끝나는 때(STALE_MS) 낡음으로 바꾼다', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  appState('background');
  jest.advanceTimersByTime(60_000);
  appState('active');
  expect(st().stale).toBe(false);
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st().stale).toBe(false);
  jest.advanceTimersByTime(STALE_MS - 60_000);
  await flush();
  expect(st()).toMatchObject({ stale: true, fix: 'unavailable', reason: 'timeout' });
});

test('붙잡은 곳이 없으면 앞으로 와도 감시를 켜지 않고, 백그라운드에서 붙잡으면 앞으로 올 때 켠다', () => {
  const r = hold();
  r();
  appState('background');
  appState('active');
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  appState('background');
  hold();
  st().restart();
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  appState('active');
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(2);
});

test('낡음 기준은 10분 — 5분 백그라운드에 있다 와도 좌표를 그대로 믿는다', () => {
  expect(STALE_MS).toBe(600_000);
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  appState('background');
  jest.advanceTimersByTime(5 * 60_000);
  appState('active');
  expect(st().stale).toBe(false);
  expect(currentCoords(st())).toEqual({ latitude: 35, longitude: 129 });
});

test('빠른 첫 위치(캐시)만 받고 감시를 멈추면 믿음은 그 위치를 잡은 시각부터 센다', () => {
  hold();
  const t = Date.now();
  mockGeo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129 }, timestamp: t - 90_000 });
  jest.advanceTimersByTime(60_000); // 감시는 켜졌지만 감시가 준 위치는 없음
  appState('background');
  jest.advanceTimersByTime(STALE_MS - 150_000 + 1000);
  appState('active');
  expect(st().stale).toBe(true);
});

test('감시가 위치를 줬으면 멈추는 순간까지 지금 위치로 친다', () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  mockGeo.watchPosition.mock.calls[0][0](pos(35.01, 129));
  jest.advanceTimersByTime(STALE_MS);
  appState('background');
  jest.advanceTimersByTime(STALE_MS - 1000);
  appState('active');
  expect(st().stale).toBe(false);
});

test('포그라운드로 오면 권한을 다시 읽고, 같은 이유로 또 못 받아도 location_unavailable은 한 번만', async () => {
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][1]({ code: 1 });
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'denied' });
  mockPerm.check.mockClear();
  appState('background');
  appState('active');
  expect(mockPerm.check).toHaveBeenCalled(); // 화면 리스너 순서와 상관없이 권한을 다시 읽는다
  await flush();
  expect(st().fix).toBe('locating');
  mockGeo.getCurrentPosition.mock.calls[1][1]({ code: 1 });
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'denied' });
  expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_unavailable')).toHaveLength(1);
});

test('드랍 생성은 위치 오차 100m까지 (모르면 허용)', () => {
  expect(DROP_MAX_ACCURACY_M).toBe(100);
  expect(tooImpreciseToDrop({ accuracy: 100 })).toBe(false);
  expect(tooImpreciseToDrop({ accuracy: 101 })).toBe(true);
  expect(tooImpreciseToDrop({ accuracy: 3000 })).toBe(true);
  expect(tooImpreciseToDrop({ accuracy: null })).toBe(false);
});
