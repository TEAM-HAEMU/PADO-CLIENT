/**
 * 가려진 지도 화면 (2026-11-20 QA R-05) — 다른 탭·상세 화면 뒤에 있는 동안 GPS 갱신·2분 폴링으로 지도 화면이 다시 그려지지 않고,
 * 다시 보이는 순간 최신 위치·주변 드랍으로 한 번에 맞추는지.
 */
jest.mock('@/api/endpoints', () => ({ dropApi: { nearby: jest.fn(async () => []) } }));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'DISTANCE', displayMeters: 5000, playMeters: 500, regionUnit: null, region: null, playMode: 'DISTANCE' }) }));
jest.mock('@/store/auth', () => ({ useAuth: { getState: () => ({ status: 'authed' }) } }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));
// 포커스·보임 값을 테스트가 정한다
const mockNav = { focused: false, visible: true };
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockNav.focused }));
jest.mock('@/hooks/useScreenVisible', () => ({ useScreenVisible: () => mockNav.visible }));
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dropApi } from '@/api/endpoints';
import { NEARBY_POLL_MS, nearbyDueOnReturn, useNearbyDrops } from '@/hooks/api';
import { useStoreWhile } from '@/hooks/useStoreWhile';
import { mapLive, useMapLive } from '@/hooks/useMapLive';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

type Loc = { coords: { latitude: number; longitude: number } | null; fix: string };

describe('useStoreWhile', () => {
  const store = create<Loc>(() => ({ coords: { latitude: 35.1889, longitude: 128.9038 }, fix: 'ok' }));
  let renders = 0;
  let seen: Loc['coords'] = null;
  const Probe = ({ live }: { live: boolean }) => {
    renders++;
    seen = useStoreWhile(store, s => ({ coords: s.coords, fix: s.fix }), live, shallow).coords;
    return null;
  };
  const walk = (i: number) => store.setState({ coords: { latitude: 35.1889 + i * 1e-4, longitude: 128.9038 } });

  it('보이는 동안엔 갱신마다 다시 그리고, 가려진 동안엔 지난 값 그대로 다시 그리지 않는다', () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(Probe, { live: true })); });
    renders = 0;
    act(() => walk(1));
    expect(renders).toBe(1);
    expect(seen?.latitude).toBeCloseTo(35.1890);

    act(() => r.update(React.createElement(Probe, { live: false })));
    renders = 0;
    for (let i = 2; i <= 40; i++) act(() => walk(i));
    expect(renders).toBe(0);
    expect(seen?.latitude).toBeCloseTo(35.1890); // 가려지기 전 값

    // 다시 보이는 렌더에서 곧바로 최신 위치
    act(() => r.update(React.createElement(Probe, { live: true })));
    expect(renders).toBe(1);
    expect(seen?.latitude).toBeCloseTo(35.1929);
    act(() => r.unmount());
  });

  it('값이 같으면(같은 좌표로 다시 와도) 다시 그리지 않는다', () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(Probe, { live: true })); });
    renders = 0;
    const c = store.getState().coords;
    act(() => store.setState({ coords: c, fix: 'ok' }));
    expect(renders).toBe(0);
    act(() => r.unmount());
  });
});

describe('useNearbyDrops — 가려진 동안 폴링 쉬기, 돌아오면 한 번 맞추기', () => {
  const nearby = dropApi.nearby as jest.Mock;
  const here = { latitude: 35.1889, longitude: 128.9038 };
  let client: QueryClient;
  const Probe = ({ live }: { live: boolean }) => { useNearbyDrops(here, live); return null; };
  const el = (live: boolean) => React.createElement(QueryClientProvider, { client }, React.createElement(Probe, { live }));
  const flush = async (ms = 0) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };

  beforeEach(() => {
    jest.useFakeTimers();
    nearby.mockClear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => { client.clear(); jest.useRealTimers(); });

  it('보이는 동안엔 2분마다 다시 받는다 (기존 동작)', async () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(el(true)); });
    await flush();
    expect(nearby).toHaveBeenCalledTimes(1);
    await flush(NEARBY_POLL_MS);
    expect(nearby).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
  });

  it('가려진 동안엔 받지 않고, 2분 넘게 지나 돌아오면 곧바로 한 번 받는다', async () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(el(true)); });
    await flush();
    expect(nearby).toHaveBeenCalledTimes(1);
    await act(async () => r.update(el(false)));
    await flush(NEARBY_POLL_MS * 3);
    expect(nearby).toHaveBeenCalledTimes(1);
    await act(async () => r.update(el(true)));
    await flush();
    expect(nearby).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
  });

  it('잠깐 다녀왔으면(2분 안) 돌아와도 곧바로 받지 않고, 받은 지 2분이 되는 때 받는다', async () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(el(true)); });
    await flush();
    await act(async () => r.update(el(false)));
    await flush(90_000);
    await act(async () => r.update(el(true)));
    await flush();
    expect(nearby).toHaveBeenCalledTimes(1);
    // 돌아온 지 30초(받은 지 2분) — 주기 타이머(돌아온 순간부터 2분)를 기다리지 않는다
    await flush(30_000);
    expect(nearby).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
  });

  it('nearbyDueOnReturn — 못 받았거나 2분 지났을 때만', () => {
    expect(nearbyDueOnReturn(0, 1_000)).toBe(true);
    expect(nearbyDueOnReturn(1_000, 1_000 + NEARBY_POLL_MS - 1)).toBe(false);
    expect(nearbyDueOnReturn(1_000, 1_000 + NEARBY_POLL_MS)).toBe(true);
  });
});

describe('mapLive — 지도가 보이는가', () => {
  it('포커스가 있으면 보인다', () => expect(mapLive(true, false, true)).toBe(true));
  it('투명 시트 아래(포커스 없음·비쳐 보임)는 한 번 포커스를 가진 뒤면 보인다', () => expect(mapLive(false, true, true)).toBe(true));
  it('처음부터 다른 화면 아래에 마운트됐으면(드랍 완료 화면 아래) 보이지 않는다', () => expect(mapLive(false, true, false)).toBe(false));
  it('다른 탭·불투명 화면 뒤면 보이지 않는다', () => expect(mapLive(false, false, true)).toBe(false));
});

it('useMapLive — 완료 화면 아래에 새로 마운트된 지도는 포커스를 받기 전까지 쉬고, 그 뒤 시트 아래에선 계속 보인다', () => {
  let live: boolean | undefined;
  const Probe = () => { live = useMapLive().live; return null; };
  let r!: import('react-test-renderer').ReactTestRenderer;
  mockNav.focused = false; mockNav.visible = true; // 처음부터 다른 화면 아래 (덮였다는 신호를 못 받아 visible은 true)
  act(() => { r = TestRenderer.create(React.createElement(Probe)); });
  expect(live).toBe(false);
  mockNav.focused = true; // 완료 화면을 닫고 지도로
  act(() => r.update(React.createElement(Probe)));
  expect(live).toBe(true);
  mockNav.focused = false; // 핀 미리보기 시트가 위에 (비쳐 보임)
  act(() => r.update(React.createElement(Probe)));
  expect(live).toBe(true);
  mockNav.visible = false; // 다른 탭
  act(() => r.update(React.createElement(Probe)));
  expect(live).toBe(false);
  act(() => r.unmount());
});
