/* 쿼리 정책 — 언제 다시 받는가 (앱 포커스·신선도·재시도·주변 드랍 중심). 사용자가 직접 바꾼 뒤의 무효화는 그대로 */
import './setup/screenEnv';

const mockNearby = jest.fn();
const mockMyDrops = jest.fn();
const mockMyLikes = jest.fn();
const mockMe = jest.fn();
const mockAgreements = jest.fn();
jest.mock('@/api/endpoints', () => ({
  likeApi: { toggle: jest.fn(async () => ({ liked: true })), countForDrop: jest.fn(async () => 0), countMine: jest.fn(async () => 0) },
  userApi: { myLikes: () => mockMyLikes(), myDrops: () => mockMyDrops(), me: () => mockMe(), agreements: () => mockAgreements() },
  dropApi: { nearby: (...a: unknown[]) => mockNearby(...a), create: jest.fn(async () => undefined) },
  commentApi: {}, notificationApi: {}, playlistApi: {}, safetyApi: { blocks: jest.fn(async () => []) }, songApi: {},
}));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'DISTANCE', regionUnit: null, displayMeters: 5000, playMeters: 500, region: null }) }));
jest.mock('@/store/auth', () => ({ useAuth: { getState: () => ({ status: 'authed' }) } }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { listenAppFocus, REFOCUS_AFTER_MS, shouldRetryQuery } from '@/hooks/queryClient';
import { invalidateAfterDropRemoved, qk, useCreateDrop, useDropPlace, useIsMyDrop, useMe, useMyDrops, useMyLikes, useAgreements, useNearbyDrops, useToggleLike, USER_DATA_STALE } from '@/hooks/api';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const HOME = { latitude: 35.1889, longitude: 128.9038 };
const north = (m: number) => ({ latitude: HOME.latitude + m / 111_320, longitude: HOME.longitude });

/** AppState 대역 — change 이벤트를 직접 보낸다 */
function fakeAppState(initial = 'active') {
  const subs = new Set<(s: string) => void>();
  return {
    currentState: initial,
    addEventListener: (_t: 'change', fn: (s: string) => void) => { subs.add(fn); return { remove: () => subs.delete(fn) }; },
    emit(s: string) { this.currentState = s; subs.forEach(f => f(s)); },
  };
}

let qc: QueryClient;
let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
function mount(useHooks: () => unknown) {
  const Probe = () => { useHooks(); return null; };
  act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Probe))); });
}
const unmount = () => { act(() => { renderer?.unmount(); }); renderer = undefined; };
/** 시계를 흘린다 (그 사이 생긴 렌더도 act 안에서) */
const tick = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-20T10:00:00Z'));
  [mockNearby, mockMyDrops, mockMyLikes, mockMe, mockAgreements].forEach(m => { m.mockReset(); m.mockResolvedValue([]); });
  mockMe.mockResolvedValue({ username: '정현' });
  qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
});
afterEach(() => { unmount(); qc.clear(); jest.useRealTimers(); });

describe('앱 포커스', () => {
  let app: ReturnType<typeof fakeAppState>;
  beforeEach(() => { app = fakeAppState(); focusManager.setEventListener(h => listenAppFocus(h, app)); });
  afterEach(() => { focusManager.setFocused(undefined); });

  const setup = async () => {
    mount(() => { useMyLikes(); useMe(); });
    await flush();
    tick(USER_DATA_STALE + 1000); // 다 오래된 상태로
    mockMyLikes.mockClear(); mockMe.mockClear();
  };

  test('제어센터·알림센터·권한 창·딥링크 확인창(inactive → active)으로는 다시 받지 않는다', async () => {
    await setup();
    for (let i = 0; i < 3; i++) { act(() => app.emit('inactive')); tick(3000); act(() => app.emit('active')); }
    await flush();
    expect(mockMyLikes).not.toHaveBeenCalled();
    expect(mockMe).not.toHaveBeenCalled();
  });

  test('백그라운드에 잠깐(10초 안) 다녀온 것도 다시 받지 않는다', async () => {
    await setup();
    act(() => app.emit('inactive')); act(() => app.emit('background'));
    tick(REFOCUS_AFTER_MS - 1000);
    act(() => app.emit('active'));
    await flush();
    expect(mockMyLikes).not.toHaveBeenCalled();
  });

  test('백그라운드에 오래 있다 돌아오면 오래된 쿼리를 다시 받는다 (타이머가 멈춰 있었어도)', async () => {
    await setup();
    act(() => app.emit('background'));
    tick(2 * 60_000);
    act(() => app.emit('active'));
    await flush();
    expect(mockMyLikes).toHaveBeenCalledTimes(1);
    expect(mockMe).toHaveBeenCalledTimes(1);
    // 앱이 멈춰 타이머가 못 돈 경우 — 시계만 흐른다
    mockMyLikes.mockClear();
    tick(USER_DATA_STALE + 1000);
    act(() => app.emit('background'));
    jest.setSystemTime(Date.now() + 5 * 60_000);
    act(() => app.emit('active'));
    await flush();
    expect(mockMyLikes).toHaveBeenCalledTimes(1);
  });

  test('백그라운드에 있는 동안엔 포커스가 꺼져 주기 갱신이 멈춘다', () => {
    act(() => app.emit('background'));
    tick(REFOCUS_AFTER_MS);
    expect(focusManager.isFocused()).toBe(false);
    act(() => app.emit('active'));
    expect(focusManager.isFocused()).toBe(true);
  });
});

describe('잘 안 바뀌는 내 정보 — 길게 신선', () => {
  test('내 드랍·좋아요·프로필·약관 동의는 10분 동안 새로 마운트돼도 다시 받지 않는다 (미리보기 시트를 열 때마다 받던 것)', async () => {
    // 지도 화면(늘 떠 있음)이 내 드랍·좋아요를 구독하고 있다
    mount(() => { useMyDrops(); useMyLikes(); useMe(); useAgreements(); });
    await flush();
    // 시트를 열고 닫기를 9분 동안 여러 번 — useIsMyDrop·useDropPlace는 useMyDrops를 새로 마운트한다
    const Sheet = () => { useIsMyDrop('d1'); useDropPlace('d1'); useMyLikes(); useMe(); useAgreements(); return null; };
    for (let i = 0; i < 9; i++) {
      tick(60_000);
      let sheet: import('react-test-renderer').ReactTestRenderer | undefined;
      act(() => { sheet = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Sheet))); });
      await flush();
      act(() => { sheet!.unmount(); });
    }
    expect(mockMyDrops).toHaveBeenCalledTimes(1);
    expect(mockMyLikes).toHaveBeenCalledTimes(1);
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(mockAgreements).toHaveBeenCalledTimes(1);
  });

  test('직접 바꾼 뒤(드랍 만들기·삭제·좋아요)엔 신선 시간과 상관없이 곧바로 다시 받는다', async () => {
    mount(() => { useMyDrops(); useMyLikes(); useNearbyDrops(HOME); });
    await flush();
    expect(mockMyDrops).toHaveBeenCalledTimes(1);
    expect(mockNearby).toHaveBeenCalledTimes(1);
    unmount();

    let create: ReturnType<typeof useCreateDrop> | undefined;
    let like: ReturnType<typeof useToggleLike> | undefined;
    mount(() => { useMyDrops(); useMyLikes(); useNearbyDrops(HOME); create = useCreateDrop(); like = useToggleLike('d1'); });
    await flush();
    expect(mockMyDrops).toHaveBeenCalledTimes(1); // 새로 마운트만으로는 안 받음

    await act(async () => { await create!.mutateAsync({} as never); });
    await flush();
    expect(mockMyDrops).toHaveBeenCalledTimes(2);
    expect(mockNearby).toHaveBeenCalledTimes(2);

    act(() => { like!.toggle(); });
    await flush();
    expect(mockMyLikes).toHaveBeenCalledTimes(2);

    act(() => { invalidateAfterDropRemoved(qc, 'd1'); });
    await flush();
    expect(mockMyDrops).toHaveBeenCalledTimes(3);
    expect(mockMyLikes).toHaveBeenCalledTimes(3);
    expect(mockNearby).toHaveBeenCalledTimes(3);
  });
});

describe('주변 드랍 — 받은 영역 안에서 움직이면 다시 받지 않는다', () => {
  let here = HOME;
  const Walker = () => { useNearbyDrops(here); return null; };
  const step = async (m: number) => { here = north(m); act(() => { renderer!.update(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Walker))); }); await flush(); };

  test('걷기 200m는 다시 받지 않고, 표시 반경(5km)의 1/10(500m)을 넘으면 지금 자리로 다시 받는다', async () => {
    here = HOME;
    act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Walker))); });
    await flush();
    expect(mockNearby).toHaveBeenCalledTimes(1);
    for (let m = 5; m <= 200; m += 5) await step(m);
    expect(mockNearby).toHaveBeenCalledTimes(1);
    await step(520);
    expect(mockNearby).toHaveBeenCalledTimes(2);
    expect(mockNearby).toHaveBeenLastCalledWith(north(520).latitude, north(520).longitude, 5);
  });

  test('새 드랍은 2분마다 같은 중심으로 다시 받아 들어온다 (신선도는 서 있을 때와 같음)', async () => {
    here = HOME;
    act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Walker))); });
    await flush();
    await step(150);
    tick(120_000);
    await flush();
    expect(mockNearby).toHaveBeenCalledTimes(2);
    expect(mockNearby).toHaveBeenLastCalledWith(HOME.latitude, HOME.longitude, 5);
  });

  test('캐시에는 중심 하나만 — 걸을 때마다 500개짜리 목록이 쌓이지 않는다', async () => {
    here = HOME;
    act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Walker))); });
    await flush();
    for (let m = 20; m <= 400; m += 20) await step(m);
    expect(qc.getQueriesData({ queryKey: qk.nearby(null).slice(0, 1) })).toHaveLength(1);
  });
});

describe('재시도', () => {
  test('4xx는 다시 하지 않고, 네트워크·5xx는 한 번만', () => {
    expect(shouldRetryQuery(0, new ApiError(404, null))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(0, null))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(0, null))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(503, null))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(503, null))).toBe(false);
  });
});
