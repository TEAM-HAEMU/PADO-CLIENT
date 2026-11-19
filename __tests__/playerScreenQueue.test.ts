/* 재생 화면과 대기열 — 화면은 대기열을 시작하고 따라 보여 줄 뿐, 화면을 닫아도 다음 곡으로 계속 (QA 2026-11-20 B-04) */
import './setup/screenEnv';

const mockStart = jest.fn();
const mockPreview = { loading: false, available: true, playing: false, toggle: jest.fn(), stop: jest.fn() };
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/music/PreviewRow', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/ScreenState', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/api', () => ({
  useComments: () => ({ data: [] }), useDrop: () => ({ data: undefined }), useDropPlace: () => undefined, useLikeCount: () => ({ data: 0 }),
  useSong: (id: string) => ({ data: { id, title: id, artist: '가수', duration: 200, albumImagePath: null }, isPlaceholderData: false }),
  useToggleLike: () => ({ toggle: jest.fn() }), useIsLiked: () => false,
}));
jest.mock('@/api/endpoints', () => ({ songApi: { get: jest.fn(async (id: string) => ({ id, title: id, artist: '가수', albumImagePath: null })) } }));
jest.mock('@/services/previewSource', () => ({ findPreview: jest.fn(async () => ({ previewUrl: null })) }));
jest.mock('@/services/listen', () => ({ listenFull: jest.fn(), listenLabel: () => '전체 듣기' }));
jest.mock('@/services/preview', () => {
  const { create } = jest.requireActual('zustand');
  const store = create((set: (p: object) => void) => ({ key: null, endedKey: null, lastError: null, upNext: null, setUpNext: (upNext: unknown) => set({ upNext }) }));
  return {
    usePreview: () => mockPreview,
    usePreviewProgress: () => ({ position: 0, duration: 30 }),
    usePreviewStore: store,
    startPreview: async (song: { id: string }) => { mockStart(song.id); store.setState({ key: song.id, endedKey: null }); return 'ok'; },
  };
});
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/store/prefs', () => ({ usePrefs: Object.assign((sel: (s: { service: string }) => unknown) => sel({ service: 'spotify' }), { getState: () => ({ service: 'spotify' }) }) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import PlayerScreen from '@/screens/player/PlayerScreen';
import { usePreviewStore } from '@/services/preview';
import { _resetQueueForTest, usePlayQueue } from '@/services/playQueue';
import { queryClient } from '@/hooks/queryClient';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const QUEUE = ['s1', 's2', 's3'];
const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const flush = () => act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
const end = () => act(() => { const k = (usePreviewStore.getState() as unknown as { key: string }).key; usePreviewStore.setState({ key: null, endedKey: k } as never); });

beforeEach(() => { jest.clearAllMocks(); _resetQueueForTest(); usePreviewStore.setState({ key: null, endedKey: null, lastError: null, upNext: null } as never); });
afterEach(() => { _resetQueueForTest(); queryClient.clear(); });

test('열면 대기열을 시작하고, 대기열이 다음 곡으로 넘어가면 화면도 따라간다', async () => {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(PlayerScreen as never, { navigation, route: { params: { songId: 's1', queue: QUEUE, autoplay: true } } })); });
  await flush();
  expect(mockStart.mock.calls.map(c => c[0])).toEqual(['s1']);
  await end();
  await flush();
  expect(navigation.setParams).toHaveBeenCalledWith({ songId: 's2' });
  act(() => r.unmount());
});

test('B-04: 플레이어를 닫은 뒤 곡이 끝나도 다음 곡으로 넘어간다 (예전엔 화면의 mounted 조건으로 멈췄다)', async () => {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(PlayerScreen as never, { navigation, route: { params: { songId: 's1', queue: QUEUE, autoplay: true } } })); });
  await flush();
  act(() => r.unmount()); // 플레이어를 닫음 (미리듣기는 계속)
  await end();
  await flush();
  expect(mockStart.mock.calls.map(c => c[0])).toEqual(['s1', 's2']);
  expect(usePlayQueue.getState().current).toBe('s2');
  await end();
  await flush();
  expect(mockStart.mock.calls.map(c => c[0])).toEqual(['s1', 's2', 's3']);
});

test('QA 리뷰 #52 1-3: 3번까지 들은 뒤 같은 순서의 전체 재생을 다시 누르면 화면도 1번 — 지난번 곡(3번)으로 넘기지 않는다', async () => {
  let r!: import('react-test-renderer').ReactTestRenderer;
  const open = () => act(() => { r = TestRenderer.create(React.createElement(PlayerScreen as never, { navigation, route: { params: { songId: 's1', queue: QUEUE, autoplay: true } } })); });
  open();
  await flush();
  await end();
  await flush();
  await end();
  await flush();
  expect(usePlayQueue.getState().current).toBe('s3');
  act(() => r.unmount());
  navigation.setParams.mockClear();
  open(); // 다시 전체 재생 (같은 순서)
  await flush();
  expect(usePlayQueue.getState().current).toBe('s1');
  expect(navigation.setParams).not.toHaveBeenCalledWith({ songId: 's3' });
  expect(mockStart.mock.calls.map(c => c[0]).slice(-1)).toEqual(['s1']);
  act(() => r.unmount());
});
