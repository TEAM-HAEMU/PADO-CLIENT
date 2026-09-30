/* 미리듣기 엔진 — 재생·끝남·화면 이탈 처리 (iTunes 조회는 가짜) */
let mockFind: () => Promise<{ previewUrl: string | null; unavailable?: boolean }> = async () => ({ previewUrl: 'https://x/a.m4a' });
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: () => undefined } }));
jest.mock('@/services/itunes', () => ({ findItunes: () => mockFind() }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { startPreview, stopPreviewFor, usePreview, usePreviewStore } from '@/services/preview';
// import로 쓰면 NativeWind babel 플러그인이 react를 css-interop 런타임으로 바꿔 jest에서 깨진다 → require
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

/** 훅 결과를 꺼내 쓰는 최소 도우미 (react-test-renderer) */
function renderHook<T>(hook: () => T) {
  const result = { current: undefined as unknown as T };
  const Probe = () => { result.current = hook(); return null; };
  act(() => { TestRenderer.create(React.createElement(Probe)); });
  return { result };
}

const st = () => usePreviewStore.getState();
const SONG = { id: 'song-1', title: 't', artist: 'a' };

beforeEach(() => { st().stop(); mockFind = async () => ({ previewUrl: 'https://x/a.m4a' }); });

test('재생 → 일시정지 → 끝나면 endedKey (다음 곡 자동 진행용)', () => {
  st().play('song-1', 'https://x/a.m4a');
  expect(st().key).toBe('song-1');
  st().toggle();
  expect(st().paused).toBe(true);
  st().toggle();
  st()._ended();
  expect(st().endedKey).toBe('song-1');
  expect(st().key).toBeNull();
});

test('이 곡이 아닐 때 stopPreviewFor는 재생 중인 다른 곡을 건드리지 않음', () => {
  st().play('song-2', 'https://x/b.m4a');
  stopPreviewFor('song-1');
  expect(st().key).toBe('song-2');
});

test('목록 행: 누르면 iTunes 조회 후 재생', async () => {
  const { result } = renderHook(() => usePreview(SONG, { lazy: true }));
  await act(async () => { await result.current.toggle(); });
  expect(st().key).toBe('song-1');
  expect(st().url).toBe('https://x/a.m4a');
});

test('iTunes 조회를 기다리는 사이 화면을 떠나면 → 재생하지 않음', async () => {
  let resolve!: (v: { previewUrl: string | null }) => void;
  mockFind = () => new Promise(r => { resolve = r; });
  const { result } = renderHook(() => usePreview(SONG, { lazy: true }));
  let p!: Promise<void>;
  act(() => { p = result.current.toggle(); });
  stopPreviewFor('song-1'); // 화면 cleanup
  await act(async () => { resolve({ previewUrl: 'https://x/a.m4a' }); await p; });
  expect(st().key).toBeNull();
});

test('기다리는 사이 다른 곡을 틀면 → 늦게 끝난 조회는 버림', async () => {
  let resolve!: (v: { previewUrl: string | null }) => void;
  mockFind = () => new Promise(r => { resolve = r; });
  const { result } = renderHook(() => usePreview(SONG, { lazy: true }));
  let p!: Promise<void>;
  act(() => { p = result.current.toggle(); });
  act(() => { st().play('song-2', 'https://x/b.m4a'); });
  await act(async () => { resolve({ previewUrl: 'https://x/a.m4a' }); await p; });
  expect(st().key).toBe('song-2');
});

test('곡 선택 시 바로 미리듣기 (startPreview) — 재생 / 미리듣기 없음 / 기다리는 사이 화면 이탈', async () => {
  expect(await startPreview(SONG)).toBe('ok');
  expect(st().key).toBe('song-1');
  st().stop();
  mockFind = async () => ({ previewUrl: null });
  expect(await startPreview({ ...SONG, id: 'song-x' })).toBe('none');
  let resolve!: (v: { previewUrl: string | null }) => void;
  mockFind = () => new Promise(r => { resolve = r; });
  const p = startPreview({ ...SONG, id: 'song-y' });
  stopPreviewFor('song-y');
  resolve({ previewUrl: 'https://x/y.m4a' });
  expect(await p).toBe('cancelled');
  expect(st().key).toBeNull();
});
