/* useOpenedDropLock (실제 훅) — 상세 실패 시 로딩에 머물지 않음, 좌표 없는 음악 드랍은 지도가 쓰는 주변 목록을 다시 받아 판정 (키 모양과 무관) */
const mockNearby = jest.fn();
const mockLoc = { coords: { latitude: 37.5665, longitude: 126.978 } as { latitude: number; longitude: number } | null, stale: false, accuracy: 10, fix: 'ok' };
jest.mock('@/services/location', () => ({
  currentCoords: (s: { coords: unknown; stale: boolean }) => (s.stale ? null : s.coords),
  useLocation: Object.assign((sel: (s: typeof mockLoc) => unknown) => sel(mockLoc), { getState: () => ({ start: () => () => {} }) }),
}));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'DISTANCE', playMode: 'DISTANCE', displayMeters: 5000, playMeters: 500, regionUnit: null, region: null }) }));
jest.mock('@/utils/dropScope', () => ({ playRegionOf: () => null }));
jest.mock('@/hooks/useDropLock', () => ({ useDropLock: () => () => ({ locked: false }), lockJudged: () => false }));
jest.mock('@/hooks/api', () => {
  const rq = jest.requireActual('@tanstack/react-query');
  return {
    useMyLikes: () => ({ data: [], isPending: false }),
    useMyDrops: () => ({ data: [], isPending: false }),
    // 이 화면이 직접 받는 길 — 지도가 쓰는 목록이 없을 때만 켜져야 한다
    useNearbyDrops: (c: unknown) => rq.useQuery({ queryKey: ['nearby', 'own'], enabled: !!c, queryFn: async () => { mockNearby('own'); return []; } }),
  };
});
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useOpenedDropLock } from '@/hooks/useOpenedDropLock';
import type { OpenedLock } from '@/utils/openedDropLock';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const MUSIC = { droppingId: 'm1', songId: 's1', userId: 'u', username: '민재', content: '아침', expiryDate: '', createdAt: '', albumImageUrl: null };
const mounted: { unmount: () => void }[] = [];
const clients: QueryClient[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()); }); clients.splice(0).forEach(c => c.clear()); });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise<void>(r => setTimeout(r, 0)); }); };

function render(args: { detail?: unknown; failed?: boolean; mapKey?: unknown[] }, qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })) {
  clients.push(qc);
  const result: { current?: OpenedLock } = {};
  // 지도 화면 대역 — 키 모양은 지도 구현(격자·받은 중심)에 따라 다르다
  const Map = () => { useQuery({ queryKey: args.mapKey ?? ['nearby', 'x'], enabled: !!args.mapKey, queryFn: async () => { mockNearby('map'); return []; } }); return null; };
  const Probe = () => { result.current = useOpenedDropLock('m1', args.detail as never, 'link', !!args.failed); return null; };
  act(() => { mounted.push(TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Map)))); });
  // 지도가 먼저 떠서 목록을 받아 둔 뒤 링크로 상세를 연다
  const open = async () => {
    await flush();
    act(() => { mounted.push(TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Probe)))); });
    await flush();
    return result;
  };
  return { result, open };
}

beforeEach(() => { mockNearby.mockClear(); mockLoc.coords = { latitude: 37.5665, longitude: 126.978 }; mockLoc.fix = 'ok'; });

test('상세를 받는 중이면 pending, 요청이 실패하면 unavailable (로딩에 머물지 않음)', async () => {
  expect((await render({ detail: undefined }).open()).current).toEqual({ status: 'pending' });
  expect((await render({ detail: undefined, failed: true }).open()).current).toEqual({ status: 'unavailable' });
});

test.each([
  ['격자 키 (main)', ['nearby', 37567, 126978, 5, 'DISTANCE', null, null]],
  ['받은 중심 키 (#59)', ['nearby', 37.5612, 126.9711, 5, 'DISTANCE', null, null]],
])('좌표 없는 먼 음악 드랍 — 지도가 쓰는 목록(%s)을 다시 받아 판정하고, 따로 받지 않는다', async (_, mapKey) => {
  const r = await render({ detail: MUSIC, mapKey }).open();
  expect(mockNearby).toHaveBeenCalledWith('map');
  expect(mockNearby.mock.calls.filter(c => c[0] === 'map')).toHaveLength(2); // 지도가 처음 받은 것 + 이 화면을 연 뒤 다시 받은 것
  expect(mockNearby).not.toHaveBeenCalledWith('own');
  expect(r.current).toEqual({ status: 'locked', lock: { locked: true, remainingM: null, far: true } });
});

test('지도가 주변 목록을 아직 쓰지 않으면 이 화면이 직접 받는다', async () => {
  const r = await render({ detail: MUSIC }).open();
  expect(mockNearby).toHaveBeenCalledWith('own');
  expect(r.current?.status).toBe('locked');
});
