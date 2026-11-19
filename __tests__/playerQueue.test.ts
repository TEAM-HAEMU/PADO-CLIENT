/*
 * 전체 재생 대기열 (services/playQueue) — 재생 화면 밖에서 진행한다.
 * 미리듣기 조회 불가·재생 오류인 곡에서 멈추지 않고 다음 곡으로, 연속 실패가 쌓이면 멈춤,
 * 플레이어를 닫아도 끝나면 다음 곡으로 (QA 2026-11-20 B-04), 다음 곡은 upNext로 미리 넣어 끊김 없이
 */
type Outcome = 'ok' | 'none' | 'adult' | 'unavailable' | 'cancelled';
let mockOutcome: Outcome | ((id: string) => Outcome) = 'ok';
const mockStart = jest.fn();
const mockToast = jest.fn();
const mockFind = jest.fn(async (s: { id: string }) => ({ previewUrl: `https://p/${s.id}.m4a` }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/api/endpoints', () => ({ songApi: { get: jest.fn(async (id: string) => ({ id, title: id, artist: '가수', albumImagePath: null })) } }));
jest.mock('@/services/previewSource', () => ({ findPreview: (s: { id: string }) => mockFind(s) }));
jest.mock('@/services/preview', () => {
  // 진짜 zustand 스토어 — 대기열 서비스가 key·endedKey·lastError 변화를 구독한다
  const { create } = jest.requireActual('zustand');
  const store = create((set: (p: object) => void) => ({
    key: null as string | null, endedKey: null as string | null, lastError: null as { key: string; seq: number } | null,
    upNext: null as { key: string; url: string } | null,
    setUpNext: (upNext: unknown) => set({ upNext }),
  }));
  return {
    usePreviewStore: store,
    startPreview: async (song: { id: string }) => {
      mockStart(song);
      const r = typeof mockOutcome === 'function' ? mockOutcome(song.id) : mockOutcome;
      if (r === 'ok') store.setState({ key: song.id, endedKey: null });
      return r;
    },
  };
});

import { queryClient } from '@/hooks/queryClient';
import { usePreviewStore } from '@/services/preview';
import { _resetQueueForTest, clearQueue, jumpTo, playQueue, QUEUE_SKIP_MS, resetQueueFails, usePlayQueue } from '@/services/playQueue';

const Q = ['s1', 's2', 's3', 's4', 's5'];
const started = () => mockStart.mock.calls.map(c => (c[0] as { id: string }).id);
const flush = async (ms = 0) => { for (let i = 0; i < 30; i++) await Promise.resolve(); if (ms) { jest.advanceTimersByTime(ms); for (let i = 0; i < 30; i++) await Promise.resolve(); } };
/** 미리듣기가 끝까지 나옴. upNext가 있으면 플레이어가 그 곡으로 바꿔 끼운 것처럼 */
const end = () => {
  const st = usePreviewStore.getState() as unknown as { key: string; upNext: { key: string } | null };
  usePreviewStore.setState(st.upNext ? { key: st.upNext.key, endedKey: st.key, upNext: null } : { key: null, endedKey: st.key } as never);
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOutcome = 'ok';
  _resetQueueForTest();
  queryClient.clear();
  usePreviewStore.setState({ key: null, endedKey: null, lastError: null, upNext: null } as never);
});
afterEach(() => { _resetQueueForTest(); queryClient.clear(); jest.useRealTimers(); });

test('시작하면 첫 곡을 틀고, 잘 나오면 다음 곡을 upNext로 미리 넣는다', async () => {
  playQueue(Q, 's1');
  await flush();
  expect(started()).toEqual(['s1']);
  expect(usePlayQueue.getState().current).toBe('s1');
  expect((usePreviewStore.getState() as unknown as { upNext: { key: string; url: string } }).upNext).toMatchObject({ key: 's2', url: 'https://p/s2.m4a' });
});

test('B-04: 재생 화면이 없어도 곡이 끝나면 다음 곡으로 계속 (upNext로 이어진 곡을 따라가고 그다음을 또 채운다)', async () => {
  playQueue(Q, 's1');
  await flush();
  end();
  await flush();
  expect(usePlayQueue.getState().current).toBe('s2');
  expect((usePreviewStore.getState() as unknown as { upNext: { key: string } }).upNext?.key).toBe('s3');
  end();
  await flush();
  expect(usePlayQueue.getState().current).toBe('s3');
});

test('upNext를 못 채웠으면 끝난 뒤 다음 곡을 직접 튼다', async () => {
  mockFind.mockResolvedValueOnce({ previewUrl: null } as never); // s2 주소를 미리 못 찾음
  playQueue(Q, 's1');
  await flush();
  expect((usePreviewStore.getState() as unknown as { upNext: unknown }).upNext).toBeNull();
  end();
  await flush();
  expect(started()).toEqual(['s1', 's2']);
  expect(usePlayQueue.getState().current).toBe('s2');
});

test('마지막 곡이 끝나면 대기열이 멈춘다', async () => {
  playQueue(['s1', 's2'], 's2');
  await flush();
  end();
  await flush();
  expect(usePlayQueue.getState().current).toBeNull();
  expect(started()).toEqual(['s2']);
});

test('미리듣기 조회 불가면 알리고 잠시 뒤 다음 곡으로', async () => {
  mockOutcome = id => (id === 's1' ? 'unavailable' : 'ok');
  playQueue(Q, 's1');
  await flush();
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('불러올 수 없어요'), 'error');
  expect(started()).toEqual(['s1']); // 잠깐 보여 준 뒤
  await flush(QUEUE_SKIP_MS);
  expect(started()).toEqual(['s1', 's2']);
});

test('재생 중 오류가 나면 다음 곡으로 (토스트는 플레이어가 띄운다)', async () => {
  playQueue(Q, 's1');
  await flush();
  usePreviewStore.setState({ key: null, lastError: { key: 's1', seq: 1 } } as never);
  await flush(QUEUE_SKIP_MS);
  expect(started()).toEqual(['s1', 's2']);
  expect(mockToast).not.toHaveBeenCalled();
});

test('대기열 전에 난 오류·다른 곡의 오류는 무시한다', async () => {
  usePreviewStore.setState({ lastError: { key: 's1', seq: 1 } } as never);
  playQueue(Q, 's1');
  await flush();
  usePreviewStore.setState({ lastError: { key: 'other', seq: 2 } } as never);
  await flush(2000);
  expect(started()).toEqual(['s1']);
});

test('미리듣기가 없는 곡은 알리지 않고 건너뛴다', async () => {
  mockOutcome = id => (id === 's1' ? 'none' : 'ok');
  playQueue(Q, 's1');
  await flush(QUEUE_SKIP_MS);
  expect(started()).toEqual(['s1', 's2']);
  expect(mockToast).not.toHaveBeenCalled();
});

test('기다리는 사이 사용자가 다른 곡으로 넘기면 늦게 온 실패로 또 넘기지 않는다', async () => {
  mockOutcome = id => (id === 's1' ? 'unavailable' : 'ok');
  playQueue(Q, 's1');
  await flush();
  jumpTo('s3');
  await flush(QUEUE_SKIP_MS * 2);
  expect(started()).toEqual(['s1', 's3']);
  expect(usePlayQueue.getState().current).toBe('s3');
});

test('연속 3곡을 못 틀면 멈추고, 사용자가 직접 누르면 다시 이어진다', async () => {
  mockOutcome = 'unavailable';
  playQueue(Q, 's1');
  await flush(QUEUE_SKIP_MS);
  await flush(QUEUE_SKIP_MS);
  await flush(QUEUE_SKIP_MS);
  await flush(5000);
  expect(started()).toEqual(['s1', 's2', 's3']);
  resetQueueFails();
  mockOutcome = 'ok';
  jumpTo('s4');
  await flush();
  expect(started()).toEqual(['s1', 's2', 's3', 's4']);
});

test('곡이 끝까지 나오면 연속 실패가 풀린다', async () => {
  mockOutcome = id => (id === 's3' ? 'ok' : 'unavailable');
  mockFind.mockResolvedValue({ previewUrl: null } as never); // upNext 없이 직접 넘기는 경로로
  playQueue(Q, 's1');
  await flush(QUEUE_SKIP_MS); // s1 실패 → s2
  await flush(QUEUE_SKIP_MS); // s2 실패 → s3 (ok)
  end(); // s3 끝까지 → 실패 횟수 초기화 → s4
  await flush(QUEUE_SKIP_MS); // s4 실패 → s5
  expect(started()).toEqual(['s1', 's2', 's3', 's4', 's5']);
  mockFind.mockImplementation(async (s: { id: string }) => ({ previewUrl: `https://p/${s.id}.m4a` }));
});

test('대기열 밖의 곡을 틀면 대기열을 놓고, 미리 넣어 둔 upNext도 거둔다', async () => {
  playQueue(Q, 's1');
  await flush();
  usePreviewStore.setState({ key: 'nearby-song' } as never);
  await flush();
  expect(usePlayQueue.getState()).toMatchObject({ ids: [], current: null });
  end();
  await flush(QUEUE_SKIP_MS);
  expect(started()).toEqual(['s1']);
});

test('같은 대기열·같은 곡으로 다시 열면(재생 화면 재진입) 처음부터 다시 틀지 않는다', async () => {
  playQueue(Q, 's1');
  await flush();
  playQueue([...Q], 's1');
  await flush();
  expect(started()).toEqual(['s1']);
  clearQueue();
  expect(usePlayQueue.getState().current).toBeNull();
});
