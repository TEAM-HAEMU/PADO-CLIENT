/* 지도에서 직접 고른 곡이 끝나고 주변 곡 자동 재생이 다음 곡으로 넘어가면 고름이 풀린다 — 실제 미리듣기 스토어 + 자동 재생 훅 + 지도 화면과 같은 구독 (2026-11-20 TestFlight 제보) */
let mockFind: (id: string) => Promise<{ previewUrl: string | null }>;
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: () => undefined } }));
jest.mock('@/store/toast', () => ({ toast: () => {} }));
jest.mock('@/services/previewSource', () => ({ findPreview: (s: { id: string }) => mockFind(s.id), noPreviewMessage: () => '' }));
jest.mock('@/services/analytics', () => ({ track: () => {}, currentDropId: () => undefined }));
jest.mock('@/store/prefs', () => ({ usePrefs: (sel: (s: { autoplayNearby: boolean }) => unknown) => sel({ autoplayNearby: true }) }));

import type { MusicDropSummary } from '@/api/types';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { startPreview, usePreviewStore } from '@/services/preview';
import { useReleasePickOnSongChange } from '@/hooks/useReleasePickOnSongChange';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const st = () => usePreviewStore.getState();
const drop = (songId: string): MusicDropSummary => ({ songId, droppingId: `d-${songId}`, type: 'MUSIC', title: songId, artist: 'x', albumImageUrl: null } as unknown as MusicDropSummary);
const loveBlur = drop('love');
const rude = drop('rude');

/** 지도 화면처럼 고른 드랍을 들고 있는 컴포넌트 — 풀리면 고른 게 없어진다 */
function watchSelection(pick: { dropId: string; songId: string }) {
  const sel = { id: pick.dropId as string | null };
  const Picker = () => {
    const [id, setId] = React.useState<string | null>(pick.dropId);
    sel.id = id;
    useReleasePickOnSongChange(id, id ? pick.songId : null, () => setId(null));
    return null;
  };
  let r: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Picker)); });
  return { sel, unsub: () => act(() => r.unmount()) };
}

async function flush(ms: number, step = 500) {
  for (let t = 0; t < ms; t += step) {
    await act(async () => { jest.advanceTimersByTime(step); await Promise.resolve(); await Promise.resolve(); });
  }
}

let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
function mountAutoplay(drops: MusicDropSummary[]) {
  const Probe = () => { useNearbyAutoplay(drops, true); return null; };
  act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFind = jest.fn(async () => ({ previewUrl: 'https://x/p.m4a' }));
  act(() => { st().stop(); usePreviewStore.setState({ lastError: null, endedKey: null }); });
});
afterEach(() => {
  act(() => { renderer?.unmount(); renderer = undefined; });
  jest.useRealTimers();
});

test('RUDE!를 직접 골라 듣다 곡이 끝나 자동 재생이 Love Blur를 틀면 고름이 풀린다 (강조 하나·말풍선 없음)', async () => {
  // 가까운 순: Love Blur가 먼저. 고르기 전에 이미 자동 재생이 Love Blur를 틀고 있다
  mountAutoplay([loveBlur, rude]);
  await flush(1000);
  expect(st().key).toBe('love');
  // 목록에서 RUDE! 고르기 — pickDrop과 같은 순서 (고름 → 미리듣기)
  const { sel, unsub } = watchSelection({ dropId: rude.droppingId, songId: 'rude' });
  await act(async () => { await startPreview({ id: 'rude', title: 'rude', artist: 'x', dropId: rude.droppingId }); });
  expect(st().key).toBe('rude');
  expect(sel.id).toBe(rude.droppingId); // 고른 곡이 나오는 동안은 그대로
  // 일시정지했다 다시 틀어도 같은 곡 — 그대로
  act(() => { st().toggle(); st().toggle(); });
  expect(sel.id).toBe(rude.droppingId);
  // RUDE! 끝남 → 자동 재생이 다음 곡(Love Blur는 들었으니 다시 처음부터 또는 남은 곡)을 튼다
  act(() => { st()._ended(); });
  await flush(1000);
  expect(st().key).not.toBeNull();
  expect(st().key).not.toBe('rude');
  expect(sel.id).toBeNull();
  unsub();
});

test('고른 곡이 끝나도 다음 곡이 나오지 않으면(자동 재생 꺼짐 등) 고름은 남는다 — 한 번 더 누르면 자세히', async () => {
  const { sel, unsub } = watchSelection({ dropId: rude.droppingId, songId: 'rude' });
  await act(async () => { await startPreview({ id: 'rude', title: 'rude', artist: 'x', dropId: rude.droppingId }); });
  act(() => { st()._ended(); });
  await flush(1000);
  expect(st().key).toBeNull();
  expect(sel.id).toBe(rude.droppingId);
  unsub();
});

test('고른 곡이 나오는 중에 다음 곡(미니 디스크 길게 누르기)으로 넘기면 풀린다', async () => {
  let next: () => void = () => {};
  const Probe = () => { next = useNearbyAutoplay([loveBlur, rude], true).next; return null; };
  const { sel, unsub } = watchSelection({ dropId: rude.droppingId, songId: 'rude' });
  await act(async () => { await startPreview({ id: 'rude', title: 'rude', artist: 'x', dropId: rude.droppingId }); });
  act(() => { renderer = TestRenderer.create(React.createElement(Probe)); });
  await flush(500);
  expect(st().key).toBe('rude'); // 사용자가 튼 곡에는 끼어들지 않는다
  act(() => next());
  await flush(1000);
  expect(st().key).toBe('love');
  expect(sel.id).toBeNull();
  unsub();
});
