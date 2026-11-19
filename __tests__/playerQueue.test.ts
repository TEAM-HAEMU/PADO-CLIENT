/* 재생 화면 전체 재생 대기열 — 미리듣기 조회 불가·재생 오류인 곡에서 멈추지 않고 다음 곡으로 (연속 실패가 쌓이면 멈춤) */
import './setup/screenEnv';

type Outcome = 'ok' | 'none' | 'adult' | 'unavailable' | 'cancelled';
let mockOutcome: Outcome = 'ok';
const mockStart = jest.fn(async () => mockOutcome);
const mockToast = jest.fn();
const mockPreview = { loading: false, available: true, playing: false, toggle: jest.fn(), stop: jest.fn() };
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/music/PreviewRow', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/ScreenState', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('@/hooks/useOpenedDropLock', () => ({ useOpenedDropLock: () => ({ status: 'open' }) }));
jest.mock('@/components/detail/LockedDrop', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/api', () => ({
  useComments: () => ({ data: [] }), useDrop: () => ({ data: undefined }), useDropPlace: () => undefined, useLikeCount: () => ({ data: 0 }),
  useSong: (id: string) => ({ data: { id, title: id, artist: '가수', duration: 200, albumImagePath: null }, isPlaceholderData: false }),
  useToggleLike: () => ({ toggle: jest.fn() }), useIsLiked: () => false,
}));
jest.mock('@/services/listen', () => ({ listenFull: jest.fn(), listenLabel: () => '전체 듣기' }));
jest.mock('@/services/preview', () => {
  // 진짜 zustand 스토어 — lastError·endedKey가 바뀌면 화면이 다시 그려진다
  const { create } = jest.requireActual('zustand');
  const store = create(() => ({ key: null as string | null, endedKey: null as string | null, lastError: null as { key: string; seq: number } | null }));
  return {
    usePreview: () => mockPreview,
    usePreviewProgress: () => ({ position: 0, duration: 30 }),
    usePreviewStore: store,
    startPreview: (...a: unknown[]) => (mockStart as (...x: unknown[]) => Promise<Outcome>)(...a),
  };
});
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/store/prefs', () => ({ usePrefs: Object.assign((sel: (s: { service: string }) => unknown) => sel({ service: 'spotify' }), { getState: () => ({ service: 'spotify' }) }) }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

import PlayerScreen from '@/screens/player/PlayerScreen';
import { usePreviewStore } from '@/services/preview';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const QUEUE = ['s1', 's2', 's3', 's4', 's5'];
const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
let renderer: import('react-test-renderer').ReactTestRenderer | undefined;
const el = (songId: string) => React.createElement(PlayerScreen as never, { navigation, route: { params: { songId, queue: QUEUE, autoplay: true } } });
function open(songId: string) {
  act(() => { renderer = TestRenderer.create(el(songId)); });
}
/** 화면이 다음 곡으로 넘어간 것처럼 params를 바꿔 다시 그린다 */
function goTo(songId: string) {
  act(() => { renderer!.update(el(songId)); });
}
async function settle(ms = 0) {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); jest.advanceTimersByTime(ms); });
}
const movedTo = () => navigation.setParams.mock.calls.map(c => (c[0] as { songId: string }).songId);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOutcome = 'ok';
  Object.assign(mockPreview, { loading: false, available: true, playing: false });
  act(() => { usePreviewStore.setState({ key: null, endedKey: null, lastError: null }); });
});
afterEach(() => {
  act(() => { renderer?.unmount(); renderer = undefined; });
  jest.useRealTimers();
});

test('열리면 대기열 곡의 미리듣기를 시작하고, 잘 나오면 넘기지 않는다', async () => {
  open('s1');
  await settle(3000);
  expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  expect(movedTo()).toEqual([]);
});

test('미리듣기 조회 불가면 알리고 다음 곡으로', async () => {
  mockOutcome = 'unavailable';
  open('s1');
  await settle();
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('불러올 수 없어요'), 'error');
  expect(movedTo()).toEqual([]); // 잠깐 보여 준 뒤
  await settle(1200);
  expect(movedTo()).toEqual(['s2']);
});

test('재생 중 오류가 나면 다음 곡으로 (토스트는 플레이어가 띄운다)', async () => {
  open('s1');
  await settle();
  act(() => { usePreviewStore.setState({ key: null, lastError: { key: 's1', seq: 1 } }); });
  await settle(1200);
  expect(movedTo()).toEqual(['s2']);
});

test('화면에 오기 전에 난 오류·다른 곡의 오류는 무시한다', async () => {
  act(() => { usePreviewStore.setState({ lastError: { key: 's1', seq: 1 } }); });
  open('s1');
  await settle();
  act(() => { usePreviewStore.setState({ lastError: { key: 'other', seq: 2 } }); });
  await settle(2000);
  expect(movedTo()).toEqual([]);
});

test('미리듣기가 없는 곡은 예전처럼 건너뛴다', async () => {
  mockOutcome = 'none';
  open('s1');
  await settle(1200);
  expect(movedTo()).toEqual(['s2']);
  expect(mockToast).not.toHaveBeenCalled();
});

test('기다리는 사이 사용자가 다른 곡으로 넘기면 늦게 온 실패로 또 넘기지 않는다', async () => {
  mockOutcome = 'unavailable';
  open('s1');
  await settle();
  goTo('s3'); // 사용자가 직접 넘김 (s3도 실패 → s4로)
  await settle(1200);
  await settle(1200);
  expect(movedTo()).toEqual(['s4']);
});

test('연속 3곡을 못 틀면 멈춘다 (망이 끊겼을 때 대기열 끝까지 토스트를 뿌리며 넘기지 않게)', async () => {
  mockOutcome = 'unavailable';
  open('s1');
  await settle(1200);
  goTo('s2');
  await settle(1200);
  goTo('s3');
  await settle(1200);
  await settle(5000);
  expect(movedTo()).toEqual(['s2', 's3']);
});

test('곡이 끝까지 나오면 연속 실패가 풀린다', async () => {
  mockOutcome = 'unavailable';
  open('s1');
  await settle(1200);
  goTo('s2');
  await settle(1200);
  mockOutcome = 'ok';
  goTo('s3');
  await settle();
  act(() => { usePreviewStore.setState({ key: null, endedKey: 's3' }); });
  await settle();
  mockOutcome = 'unavailable';
  goTo('s4');
  await settle(1200);
  expect(movedTo()).toEqual(['s2', 's3', 's4', 's5']);
});
