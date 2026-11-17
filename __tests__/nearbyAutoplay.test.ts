/* 주변 곡 자동 재생 훅 — 실제 미리듣기 스토어 + 가짜 미리듣기 조회로 루프가 유한한지 */
type Found = { previewUrl: string | null; adult?: boolean; unavailable?: boolean };
let mockFind: (id: string) => Promise<Found>;
const mockTrack = jest.fn();
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: () => undefined } }));
const mockToast = jest.fn();
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/services/previewSource', () => ({ findPreview: (s: { id: string }) => mockFind(s.id), noPreviewMessage: () => '' }));
jest.mock('@/services/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a), currentDropId: () => undefined }));
jest.mock('@/store/prefs', () => ({ usePrefs: (sel: (s: { autoplayNearby: boolean }) => unknown) => sel({ autoplayNearby: true }) }));

import type { MusicDropSummary } from '@/api/types';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { AppState } from 'react-native';
import { startPreview, usePreviewStore } from '@/services/preview';
import { MAX_FAIL_STREAK } from '@/utils/autoplayPlan';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const st = () => usePreviewStore.getState();
const drop = (songId: string): MusicDropSummary => ({ songId, droppingId: `d-${songId}`, type: 'MUSIC', title: songId, artist: 'x', albumImageUrl: null } as unknown as MusicDropSummary);

let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
let result: { current: ReturnType<typeof useNearbyAutoplay> };
function mount(drops: MusicDropSummary[]) {
  result = { current: undefined as unknown as ReturnType<typeof useNearbyAutoplay> };
  const Probe = ({ list }: { list: MusicDropSummary[] }) => { result.current = useNearbyAutoplay(list, true); return null; };
  act(() => { renderer = TestRenderer.create(React.createElement(Probe, { list: drops })); });
  return (next: MusicDropSummary[]) => act(() => { renderer!.update(React.createElement(Probe, { list: next })); });
}
/** 타이머·약속을 번갈아 흘려 보낸다 */
async function flush(ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) {
    await act(async () => { jest.advanceTimersByTime(step); await Promise.resolve(); await Promise.resolve(); });
  }
}
const calls = (id: string) => (mockFind as jest.Mock).mock.calls.filter(c => c[0] === id).length;
const plays = () => mockTrack.mock.calls.filter(c => c[0] === 'nearby_autoplay_play').length;

beforeEach(() => {
  jest.useFakeTimers();
  mockTrack.mockClear();
  act(() => { st().stop(); usePreviewStore.setState({ lastError: null, endedKey: null }); });
});
afterEach(() => {
  act(() => { renderer?.unmount(); renderer = undefined; });
  jest.useRealTimers();
});

test('미리듣기 없는 곡만 둘이면 한 번씩만 묻고 멈춘다 (800ms 무한 순환 없음)', async () => {
  mockFind = jest.fn(async () => ({ previewUrl: null }));
  mount([drop('a'), drop('b')]);
  await flush(60_000);
  expect(calls('a')).toBe(1);
  expect(calls('b')).toBe(1);
  expect(plays()).toBe(0); // 실제로 재생되지 않았으면 재생 이벤트도 없음
  expect(st().pending).toBeNull();
});

test('19세 곡은 건너뛰고 다음 곡을 튼다', async () => {
  mockFind = jest.fn(async (id: string) => (id === 'a' ? { previewUrl: null, adult: true } : { previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await flush(3000);
  expect(st().key).toBe('b');
  expect(plays()).toBe(1);
});

test('재생 오류가 나면 같은 곡을 곧바로 다시 틀지 않고, 쉬었다가 다음 곡', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await flush(500);
  expect(st().key).toBe('a');
  act(() => { st()._error(); });
  await flush(500);
  expect(st().key).toBeNull(); // 곧바로 재시도하지 않음
  expect(calls('a')).toBe(1);
  await flush(4000);
  expect(st().key).toBe('b');
});

test('모든 곡이 재생 오류여도 시도 횟수가 유한하다', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  let started = 0;
  for (let i = 0; i < 20; i++) {
    await flush(130_000, 1000);
    if (st().key) { started++; act(() => { st()._error(); }); }
  }
  expect(started).toBe(MAX_FAIL_STREAK);
  const previewStarted = mockTrack.mock.calls.filter(c => c[0] === 'preview_started').length;
  expect(previewStarted).toBe(MAX_FAIL_STREAK);
});

test('멈춘 뒤 새 드랍이 들어오면 그 곡을 튼다', async () => {
  mockFind = jest.fn(async (id: string) => (id === 'c' ? { previewUrl: 'https://x/c.m4a' } : { previewUrl: null }));
  const update = mount([drop('a'), drop('b')]);
  await flush(5000);
  expect(st().key).toBeNull();
  update([drop('b'), drop('a')]); // 순서만 바뀜 → 그대로 멈춤
  await flush(2000);
  expect(calls('a') + calls('b')).toBe(2);
  update([drop('c'), drop('a'), drop('b')]);
  await flush(2000);
  expect(st().key).toBe('c');
});

test('곡이 끝나면 다음 가까운 곡', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await flush(500);
  expect(st().key).toBe('a');
  // 이어 틀 곡(b)이 미리 넘겨져 있다
  expect(st().upNext?.key).toBe('b');
  act(() => { st()._ended(); });
  await flush(500);
  expect(st().key).toBe('b');
});

test('조회가 예외로 끝나도 불러오는 중이 남지 않고 다음 곡으로', async () => {
  mockFind = jest.fn(async (id: string) => { if (id === 'a') throw new Error('boom'); return { previewUrl: `https://x/${id}.m4a` }; });
  mount([drop('a'), drop('b')]);
  await flush(500);
  expect(st().pending).toBeNull();
  await flush(16_000);
  expect(st().key).toBe('b');
});

/** 실패를 MAX_FAIL_STREAK번 내서 멈추게 한다 */
async function failUntilIdle() {
  for (let i = 0; i < 20; i++) {
    await flush(130_000, 1000);
    if (st().key) act(() => { st()._error(); });
  }
  const before = mockTrack.mock.calls.filter(c => c[0] === 'preview_started').length;
  await flush(300_000, 5000);
  expect(mockTrack.mock.calls.filter(c => c[0] === 'preview_started').length).toBe(before); // 멈춤
  expect(st().key).toBeNull();
}

test('연속 실패로 멈춘 뒤 다음 곡을 누르면 다시 튼다', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await failUntilIdle();
  act(() => { result.current.next(); });
  await flush(1000);
  expect(st().key).not.toBeNull();
});

test('연속 실패로 멈춘 뒤 재생 버튼을 누르면 다시 튼다', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await failUntilIdle();
  act(() => { result.current.toggle(); });
  await flush(1000);
  expect(st().key).not.toBeNull();
});

test('연속 실패로 멈춘 뒤 앱이 앞으로 돌아오면 다시 튼다', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b')]);
  await failUntilIdle();
  const calls = (AppState.addEventListener as jest.Mock).mock.calls.filter(c => c[0] === 'change');
  act(() => { (calls[calls.length - 1][1] as (s: string) => void)('active'); });
  await flush(1000);
  expect(st().key).not.toBeNull();
});

test('쉬는 중에 다음 곡을 누르면 대기만 풀고, 안 들은 다음 곡을 건너뛰지 않는다', async () => {
  mockFind = jest.fn(async (id: string) => ({ previewUrl: `https://x/${id}.m4a` }));
  mount([drop('a'), drop('b'), drop('c')]);
  await flush(500);
  expect(st().key).toBe('a');
  act(() => { st()._error(); });
  await flush(500);
  expect(st().key).toBeNull(); // 쉬는 중
  act(() => { result.current.next(); });
  await flush(500);
  expect(st().key).toBe('b');
});

test('재생 오류 토스트 — 사용자가 튼 곡은 알리고, 자동 재생 곡은 알리지 않는다', async () => {
  const { PreviewHost } = require('@/services/preview') as typeof import('@/services/preview');
  let host: import('react-test-renderer').ReactTestRenderer | undefined;
  act(() => { host = TestRenderer.create(React.createElement(PreviewHost)); });
  const video = () => host!.root.findByType('Video' as unknown as React.ElementType);
  mockToast.mockClear();
  act(() => { st().play('u', 'https://x/u.m4a', { title: 'u', artist: 'x' }); });
  act(() => { video().props.onError(); });
  expect(mockToast).toHaveBeenCalledTimes(1);
  act(() => { st().play('v', 'https://x/v.m4a', { title: 'v', artist: 'x', autoplay: true }); });
  act(() => { video().props.onError(); });
  expect(mockToast).toHaveBeenCalledTimes(1);
  act(() => { host!.unmount(); });
});

/** ms 뒤에 결과를 주는 가짜 조회 (가짜 타이머) */
const later = (ms: number, r: Found) => new Promise<Found>(res => setTimeout(() => res(r), ms));

test('사용자가 누른 곡의 주소를 찾는 사이 자동 재생이 끼어들지 않는다 (누른 곡이 나온다)', async () => {
  // n: 미리듣기 없음(800ms 쉬었다 다음) · a: 자동 재생 다음 차례 · u: 사용자가 지도에서 누른 곡 (조회 2초)
  mockFind = jest.fn((id: string) => (id === 'n' ? Promise.resolve({ previewUrl: null }) : id === 'u' ? later(2000, { previewUrl: 'https://x/u.m4a' }) : Promise.resolve({ previewUrl: `https://x/${id}.m4a` })));
  mount([drop('n'), drop('a')]);
  await flush(100, 50); // n 조회 → 없음 → 800ms 쉬는 중
  let picked: Promise<string> | undefined;
  act(() => { picked = startPreview({ id: 'u', title: 'u', artist: 'x' }); });
  expect(st().pending?.key).toBe('u');
  await flush(3000); // 쉬는 시간이 끝나도 u를 찾는 중이면 기다린다
  await act(async () => { await picked; });
  expect(await picked).toBe('ok');
  expect(st().key).toBe('u');
  expect(calls('a')).toBe(0);
  // 사용자 곡이 끝나면 자동 재생이 이어진다
  act(() => { st()._ended(); });
  await flush(1000);
  expect(st().key).toBe('a');
});

test('누른 곡이 미리듣기가 없다고 끝나면 자동 재생이 이어서 시작한다', async () => {
  mockFind = jest.fn((id: string) => (id === 'u' ? later(1000, { previewUrl: null }) : Promise.resolve({ previewUrl: `https://x/${id}.m4a` })));
  act(() => { void startPreview({ id: 'u', title: 'u', artist: 'x' }); });
  mount([drop('a')]);
  await flush(500);
  expect(st().key).toBeNull(); // 아직 u를 찾는 중 — 기다림
  expect(calls('a')).toBe(0);
  await flush(1500);
  expect(st().pending).toBeNull();
  expect(st().key).toBe('a');
});

test('누른 곡을 불러오는 중에 다음 곡(길게 누르기)을 누르면 그 요청을 거두고 자동 재생 차례로', async () => {
  mockFind = jest.fn((id: string) => (id === 'u' ? later(5000, { previewUrl: 'https://x/u.m4a' }) : Promise.resolve({ previewUrl: `https://x/${id}.m4a` })));
  act(() => { void startPreview({ id: 'u', title: 'u', artist: 'x' }); });
  mount([drop('a')]);
  await flush(500);
  act(() => { result.current.next(); });
  await flush(500);
  expect(st().key).toBe('a');
  await flush(6000); // 늦게 끝난 u 조회가 a를 덮어쓰지 않는다
  expect(st().key).toBe('a');
});
