/* 좋아요 토글 — 연타 가드·낙관적 반영과 되돌리기 / 삭제·차단 뒤 무효화 목록 */
import './setup/screenEnv';

const mockToggle = jest.fn();
const mockToast = jest.fn();
jest.mock('@/api/endpoints', () => ({
  likeApi: { toggle: (id: string) => mockToggle(id), countForDrop: jest.fn(async () => 0), countMine: jest.fn(async () => 0) },
  userApi: { myLikes: jest.fn(async () => []), myDrops: jest.fn(async () => []) },
  commentApi: {}, dropApi: {}, notificationApi: {}, playlistApi: {}, safetyApi: {}, songApi: {},
}));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'distance' }) }));
jest.mock('@/store/auth', () => ({ useAuth: { getState: () => ({ status: 'authed' }) } }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invalidateAfterBlock, invalidateAfterDropRemoved, qk, useIsLiked, useToggleLike } from '@/hooks/api';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const DROP = 'drop-1';
let qc: QueryClient;
let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
function mount() {
  const result = { current: undefined as unknown as { like: ReturnType<typeof useToggleLike>; liked: boolean } };
  const Probe = () => { result.current = { like: useToggleLike(DROP), liked: useIsLiked(DROP) }; return null; };
  act(() => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Probe))); });
  return result;
}
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>(res => setTimeout(res, 0)); });
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity }, mutations: { gcTime: Infinity } } });
  qc.setQueryData(qk.likeCount(DROP), 3);
  qc.setQueryData(qk.myLikes, []);
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = undefined; });

test('누르는 즉시 하트·개수가 바뀌고, 응답 전 연타는 무시된다 (토글이 두 번 나가지 않음)', async () => {
  const d = deferred<{ liked: boolean }>();
  mockToggle.mockReturnValueOnce(d.promise);
  const r = mount();
  expect(r.current.liked).toBe(false);
  act(() => { r.current.like.toggle(); r.current.like.toggle(); });
  await flush();
  act(() => { r.current.like.toggle(); });
  await flush();
  expect(mockToggle).toHaveBeenCalledTimes(1);
  expect(r.current.liked).toBe(true);
  expect(qc.getQueryData(qk.likeCount(DROP))).toBe(4);
  await act(async () => { d.resolve({ liked: true }); });
  await flush();
  expect(r.current.liked).toBe(true);
});

test('실패하면 되돌리고 오류를 알린다', async () => {
  mockToggle.mockRejectedValueOnce(new Error('네트워크'));
  const r = mount();
  act(() => { r.current.like.toggle(); });
  await flush();
  expect(r.current.liked).toBe(false);
  expect(qc.getQueryData(qk.likeCount(DROP))).toBe(3);
  expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
});

test('이미 좋아요한 드랍(내 좋아요 목록)이면 누를 때 취소로 반영되고, 서버 값으로 맞춘다', async () => {
  qc.setQueryData(qk.myLikes, [{ droppingId: DROP }]);
  mockToggle.mockResolvedValueOnce({ liked: false });
  const r = mount();
  expect(r.current.liked).toBe(true);
  act(() => { r.current.like.toggle(); });
  await flush();
  expect(r.current.liked).toBe(false);
  expect(qc.getQueryData(qk.liked(DROP))).toBe(false);
});

test('응답이 끝나면 다시 누를 수 있다', async () => {
  mockToggle.mockResolvedValueOnce({ liked: true }).mockResolvedValueOnce({ liked: false });
  const r = mount();
  act(() => { r.current.like.toggle(); });
  await flush();
  act(() => { r.current.like.toggle(); });
  await flush();
  expect(mockToggle).toHaveBeenCalledTimes(2);
  expect(r.current.liked).toBe(false);
});

test('끝나면 개수·내 좋아요 목록·내 좋아요 수를 다시 받는다', async () => {
  mockToggle.mockResolvedValueOnce({ liked: true });
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const r = mount();
  act(() => { r.current.like.toggle(); });
  await flush();
  const keys = spy.mock.calls.map(c => c[0]?.queryKey);
  expect(keys).toEqual(expect.arrayContaining([qk.likeCount(DROP), qk.myLikes, qk.myLikeCount]));
});

describe('무효화 목록', () => {
  const keysOf = (fn: (c: QueryClient) => void) => {
    const c = new QueryClient();
    const spy = jest.spyOn(c, 'invalidateQueries');
    fn(c);
    return spy.mock.calls.map(x => x[0]?.queryKey);
  };

  test('드랍 삭제 → 주변·내 드랍·내 좋아요 목록·내 좋아요 수, 상세는 지움', () => {
    const c = new QueryClient();
    c.setQueryData(qk.drop('d1'), { id: 'd1' });
    invalidateAfterDropRemoved(c, 'd1');
    expect(c.getQueryData(qk.drop('d1'))).toBeUndefined();
    expect(keysOf(x => invalidateAfterDropRemoved(x, 'd1'))).toEqual(expect.arrayContaining([['nearby'], ['myDrops'], ['myLikes'], ['myLikeCount']]));
  });

  test('차단 → 주변·댓글·댓글 수·차단 목록에 더해 드랍 상세 전부와 내 좋아요 목록', () => {
    expect(keysOf(invalidateAfterBlock)).toEqual(expect.arrayContaining([['nearby'], ['comments'], ['commentCount'], ['blocks'], ['drop'], ['myLikes'], ['myLikeCount']]));
  });
});
