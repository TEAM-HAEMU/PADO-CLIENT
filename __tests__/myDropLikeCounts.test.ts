/* 내 드랍 목록의 드랍별 좋아요 수(likeCount) — 드랍별 캐시 채우기 · 예전 서버 판별 · 좋아요 토글과 함께 쓰기 (QA R-07) */
import './setup/screenEnv';

const mockToggle = jest.fn();
const mockMyDrops = jest.fn();
const mockCount = jest.fn();
jest.mock('@/api/endpoints', () => ({
  likeApi: { toggle: (id: string) => mockToggle(id), countForDrop: (id: string) => mockCount(id), countMine: jest.fn(async () => 0) },
  userApi: { myLikes: jest.fn(async () => []), myDrops: () => mockMyDrops() },
  commentApi: {}, dropApi: {}, notificationApi: {}, playlistApi: {}, safetyApi: {}, songApi: {},
}));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'distance' }) }));
jest.mock('@/store/auth', () => ({ useAuth: { getState: () => ({ status: 'authed' }) } }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { qk, seedLikeCounts, useMyDrops, useToggleLike } from '@/hooks/api';
import { hasLikeCounts } from '@/utils/dropLikeCount';
import type { DropSummary } from '@/api/types';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const drop = (id: string, likeCount?: number | null) => ({ type: 'MUSIC', droppingId: id, userId: 'me', songId: 's', title: 't', artist: 'a', content: '', latitude: 35, longitude: 129, address: '부산', albumImageUrl: null, isMyDropping: true, ...(likeCount !== undefined ? { likeCount } : {}) }) as DropSummary;
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>(res => setTimeout(res, 0)); });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(a => { resolve = a; }); return { promise, resolve }; };

let qc: QueryClient;
let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
function mount<T>(hook: () => T) {
  const result = { current: undefined as unknown as T };
  const Probe = () => { result.current = hook(); return null; };
  act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Probe))); });
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity }, mutations: { gcTime: Infinity } } });
  qc.setQueryData(qk.myLikes, []);
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = undefined; });

test('새 서버: 내 드랍 목록을 받으면 드랍별 좋아요 수 캐시가 채워진다 (상세 화면이 따로 묻기 전에 같은 숫자)', async () => {
  mockMyDrops.mockResolvedValue([drop('a', 3), drop('b', 0)]);
  mount(() => useMyDrops());
  await flush();
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(3);
  expect(qc.getQueryData(qk.likeCount('b'))).toBe(0);
  expect(mockCount).not.toHaveBeenCalled();
});

test('예전 서버: likeCount가 없으면 캐시를 건드리지 않고, 판별은 예전 서버로', async () => {
  const list = [drop('a'), drop('b')];
  mockMyDrops.mockResolvedValue(list);
  qc.setQueryData(qk.likeCount('a'), 7);
  mount(() => useMyDrops());
  await flush();
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(7);
  expect(qc.getQueryData(qk.likeCount('b'))).toBeUndefined();
  expect(hasLikeCounts(list)).toBe(false);
  expect(hasLikeCounts([drop('a', 1), drop('b', null)])).toBe(false);
  expect(hasLikeCounts([drop('a', 1), drop('b', 0)])).toBe(true);
  expect(hasLikeCounts([])).toBe(true); // 드랍이 없으면 물을 것도 없다
});

test('채운 숫자에서 좋아요를 누르면 바로 +1 되고, 끝나면 서버 값으로 다시 맞춘다', async () => {
  mockMyDrops.mockResolvedValue([drop('a', 3)]);
  mockToggle.mockResolvedValue({ liked: true });
  mockCount.mockResolvedValue(4);
  const r = mount(() => ({ drops: useMyDrops(), like: useToggleLike('a') }));
  await flush();
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(3);
  act(() => { r.current.like.toggle(); });
  await flush();
  expect(mockToggle).toHaveBeenCalledTimes(1);
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(4);
  // useToggleLike가 무효화해 둔다 → 다음에 이 키를 보는 화면이 서버 값을 다시 받는다
  expect(qc.getQueryState(qk.likeCount('a'))?.isInvalidated).toBe(true);
});

test('좋아요를 누르는 중에 받은 목록의 옛 숫자로 낙관적 반영을 덮지 않는다', async () => {
  const d = deferred<{ liked: boolean }>();
  mockToggle.mockReturnValueOnce(d.promise);
  qc.setQueryData(qk.likeCount('a'), 3);
  const r = mount(() => useToggleLike('a'));
  act(() => { r.current.toggle(); });
  await flush();
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(4);
  seedLikeCounts(qc, [drop('a', 3), drop('b', 5)]);
  expect(qc.getQueryData(qk.likeCount('a'))).toBe(4);
  expect(qc.getQueryData(qk.likeCount('b'))).toBe(5);
  await act(async () => { d.resolve({ liked: true }); });
  await flush();
});
