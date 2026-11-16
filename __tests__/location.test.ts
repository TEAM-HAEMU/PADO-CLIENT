/* 위치 감시 — 앱 전체에 감시 하나, iOS는 감시 중 단발 요청 금지(Android는 감시를 바로), 신호 약함엔 감시를 끊지 않음, 첫 위치 시간 초과 뒤에도 감시로 회복, 권한·GPS를 끄면 좌표를 버림, 백그라운드면 멈춤 */
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
jest.mock('react-native-device-info', () => ({ isLocationEnabled: jest.fn(async () => true) }));
jest.mock('@/services/analytics', () => ({ track: jest.fn(), setAnalyticsLocation: jest.fn(), clearAnalyticsLocation: jest.fn(), setAnalyticsRegion: jest.fn() }));

import { AppState, Platform, type AppStateStatus } from 'react-native';
import { currentCoords, DROP_MAX_ACCURACY_M, FIX_TIMEOUT_MS, isRecentFix, RECENT_FIX_MS, recheckAction, STALE_MS, tooImpreciseToDrop, useLocation } from '@/services/location';

const mockGeo = jest.requireMock('@react-native-community/geolocation').default as {
  getCurrentPosition: jest.Mock<void, [Cb, ErrCb, object]>;
  watchPosition: jest.Mock<number, [Cb, ErrCb, object]>;
  clearWatch: jest.Mock<void, [number]>;
};

const mockAnalytics = jest.requireMock('@/services/analytics') as { track: jest.Mock; clearAnalyticsLocation: jest.Mock; setAnalyticsRegion: jest.Mock };
const mockPerm = jest.requireMock('react-native-permissions') as { check: jest.Mock };
const mockDevice = jest.requireMock('react-native-device-info') as { isLocationEnabled: jest.Mock };
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
  mockDevice.isLocationEnabled.mockReset().mockResolvedValue(true);
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

test('iOS: 빠른 첫 위치가 답이 없어도 예비 타이머로 감시는 시작한다', () => {
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

test('다시 보기(recheck) — 신호 약함이면 감시를 끊지 않고, 위치 서비스가 꺼졌거나 다시 켜졌을 때만 바꾼다', () => {
  expect(recheckAction('timeout', true, true)).toBe('wait');
  expect(recheckAction('timeout', null, true)).toBe('wait');
  expect(recheckAction('timeout', true, false)).toBe('restart'); // 감시가 안 돌고 있으면 켠다
  expect(recheckAction('timeout', false, true)).toBe('off');
  expect(recheckAction('off', false, true)).toBe('wait');
  expect(recheckAction('off', true, true)).toBe('restart');
  expect(recheckAction('off', null, true)).toBe('restart'); // 확인 실패면 예전처럼 다시 시도
  expect(recheckAction('denied', true, false)).toBe('restart');
});

test('2분 넘은 위치는 지금 위치로 믿지 않는다 (시각을 모르면 믿음)', () => {
  const now = 1_000_000_000;
  expect(isRecentFix(now - RECENT_FIX_MS, now)).toBe(true);
  expect(isRecentFix(now - RECENT_FIX_MS - 1, now)).toBe(false);
  expect(isRecentFix(undefined, now)).toBe(true);
  expect(isRecentFix(0, now)).toBe(true);
});

test('신호 약함으로 unavailable이 돼도 다시 보기(recheck)는 감시를 끊지 않는다', async () => {
  hold();
  jest.advanceTimersByTime(5000);
  expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'timeout' });
  await st().recheck();
  expect(mockGeo.clearWatch).not.toHaveBeenCalled();
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'timeout' });
  // 사용자가 '다시 시도'를 누르면 감시는 그대로 두고 다시 '찾는 중' → 또 못 받으면 timeout (분석은 한 번만)
  await st().recheck(true);
  expect(st()).toMatchObject({ fix: 'locating', reason: null });
  expect(mockGeo.clearWatch).not.toHaveBeenCalled();
  jest.advanceTimersByTime(FIX_TIMEOUT_MS);
  await flush();
  expect(st()).toMatchObject({ fix: 'unavailable', reason: 'timeout' });
  expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_unavailable')).toHaveLength(1);
  // 계속 돌던 감시가 위치를 주면 ok
  mockGeo.watchPosition.mock.calls[0][0](pos(35, 129));
  expect(st()).toMatchObject({ fix: 'ok', coords: { latitude: 35, longitude: 129 } });
});

test('신호 약함 중 위치 서비스를 끄면 off(좌표 버림), 다시 켜면 감시를 새로 시작', async () => {
  hold();
  jest.advanceTimersByTime(5000 + FIX_TIMEOUT_MS);
  await flush();
  mockDevice.isLocationEnabled.mockResolvedValue(false);
  await st().recheck();
  expect(st()).toMatchObject({ coords: null, fix: 'unavailable', reason: 'off' });
  expect(mockGeo.clearWatch).not.toHaveBeenCalled();
  await st().recheck(); // 아직 꺼져 있으면 그대로
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
  mockDevice.isLocationEnabled.mockResolvedValue(true);
  await st().recheck();
  expect(mockGeo.clearWatch).toHaveBeenCalledTimes(1);
  expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(st().fix).toBe('locating');
});

test('위치를 받았거나 붙잡은 곳이 없으면 recheck는 아무것도 안 한다', async () => {
  await st().recheck();
  expect(mockDevice.isLocationEnabled).not.toHaveBeenCalled();
  hold();
  mockGeo.getCurrentPosition.mock.calls[0][0](pos(35, 129));
  await st().recheck(true);
  expect(mockDevice.isLocationEnabled).not.toHaveBeenCalled();
  expect(st().fix).toBe('ok');
});

test('첫 위치까지 걸린 시간을 location_first_fix로 센다 — 믿을 만한 좌표를 들고 다시 시작하면 안 셈', () => {
  hold();
  jest.advanceTimersByTime(7000);
  mockGeo.watchPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129, accuracy: 12.4 }, timestamp: Date.now() - 500 });
  const first = mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_first_fix');
  expect(first).toEqual([['location_first_fix', { wait_ms: 7000, accuracy_m: 12, age_ms: 500, source: 'watch', trigger: 'start' }]]);
  mockGeo.watchPosition.mock.calls[0][0](pos(35.001, 129));
  appState('background');
  appState('active');
  mockGeo.getCurrentPosition.mock.calls[1][0](pos(35.002, 129));
  expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_first_fix')).toHaveLength(1);
});

describe('Android', () => {
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android'); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('감시를 바로 켜고(2분 안 캐시만) 기기의 마지막 위치를 함께 요청한다 — 예비 타이머를 기다리지 않음', () => {
    hold();
    expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
    expect(mockGeo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, distanceFilter: 5, maximumAge: RECENT_FIX_MS });
    expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mockGeo.getCurrentPosition.mock.calls[0][2]).not.toHaveProperty('timeout');
    // 단발 요청이 답을 안 줘도 감시는 하나 그대로
    jest.advanceTimersByTime(10_000);
    expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);
    mockGeo.watchPosition.mock.calls[0][0](pos(35, 129));
    expect(st()).toMatchObject({ fix: 'ok', stale: false });
    expect(mockAnalytics.track.mock.calls.find(c => c[0] === 'location_first_fix')?.[1]).toMatchObject({ wait_ms: 10_000, source: 'watch' });
  });

  test('기기의 마지막 위치가 2분 안이면 지금 위치로', () => {
    hold();
    mockGeo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129, accuracy: 30 }, timestamp: Date.now() - 60_000 });
    expect(st()).toMatchObject({ fix: 'ok', stale: false, coords: { latitude: 35, longitude: 129 } });
    expect(currentCoords(st())).toEqual({ latitude: 35, longitude: 129 });
    expect(mockAnalytics.track.mock.calls.find(c => c[0] === 'location_first_fix')?.[1]).toMatchObject({ source: 'quick', age_ms: 60_000 });
  });

  test('오래된 마지막 위치는 지도 카메라·동네 이름에만 (stale) — 드랍·잠금엔 안 쓰고, 새 위치가 오면 바로 믿는다', async () => {
    hold();
    mockGeo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129, accuracy: 900 }, timestamp: Date.now() - 3_600_000 });
    expect(st()).toMatchObject({ coords: { latitude: 35, longitude: 129 }, stale: true, fix: 'locating' });
    expect(currentCoords(st())).toBeNull();
    expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_first_fix')).toHaveLength(0);
    // 시간 초과여도 좌표는 카메라용으로 남는다
    jest.advanceTimersByTime(FIX_TIMEOUT_MS);
    await flush();
    expect(st()).toMatchObject({ coords: { latitude: 35, longitude: 129 }, stale: true, fix: 'unavailable', reason: 'timeout' });
    mockGeo.watchPosition.mock.calls[0][0](pos(35.01, 129));
    expect(st()).toMatchObject({ coords: { latitude: 35.01, longitude: 129 }, stale: false, fix: 'ok' });
    expect(mockAnalytics.track.mock.calls.filter(c => c[0] === 'location_first_fix')).toHaveLength(1);
  });

  test('감시가 먼저 위치를 줬으면 늦게 온 마지막 위치는 버린다', () => {
    hold();
    mockGeo.watchPosition.mock.calls[0][0](pos(35.2, 129.2));
    mockGeo.getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 35, longitude: 129 }, timestamp: Date.now() - 3_600_000 });
    expect(st()).toMatchObject({ coords: { latitude: 35.2, longitude: 129.2 }, stale: false });
  });

  test('restart(권한을 켠 뒤 등)는 감시를 지우고 새 감시를 바로', () => {
    hold();
    st().restart();
    expect(mockGeo.clearWatch).toHaveBeenCalledWith(mockGeo.watchPosition.mock.results[0].value);
    expect(mockGeo.watchPosition).toHaveBeenCalledTimes(2);
    expect(mockGeo.clearWatch.mock.invocationCallOrder[0]).toBeLessThan(mockGeo.watchPosition.mock.invocationCallOrder[1]);
  });
});
