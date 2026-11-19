/* 재생 화면 잠금 배선 (B-05 리뷰 반영) — 드랍 상세를 못 받으면 로딩에 머물지 않고 곡을 보여 주고, 잠기면 잠금 안내만 */
import './setup/screenEnv';

const mockLock: { current: unknown; args: unknown[] } = { current: { status: 'open' }, args: [] };
const mockDrop: { current: { data?: unknown; isError: boolean } } = { current: { isError: false } };
const mockPreview = { loading: false, available: true, playing: false, toggle: jest.fn(), stop: jest.fn() };
const mockStore = { key: null as string | null, endedKey: null, lastError: null };
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/music/PreviewRow', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/ScreenState', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/LockedDrop', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('@/hooks/useOpenedDropLock', () => ({ useOpenedDropLock: (...a: unknown[]) => { mockLock.args = a; return mockLock.current; } }));
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/api', () => ({
  useComments: () => ({ data: [] }), useDrop: () => mockDrop.current, useDropPlace: () => undefined, useLikeCount: () => ({ data: 0 }),
  useSong: () => ({ data: { id: 'song-1', title: '곡', artist: '가수', duration: 200, albumImagePath: null }, isPlaceholderData: false }),
  useToggleLike: () => ({ toggle: jest.fn() }), useIsLiked: () => false,
}));
jest.mock('@/services/listen', () => ({ listenFull: jest.fn(), listenLabel: () => '전체 듣기' }));
jest.mock('@/services/preview', () => ({
  usePreview: (s: unknown) => (s ? mockPreview : { ...mockPreview, available: false }),
  startPreview: jest.fn(async () => 'ok'),
  usePreviewProgress: () => ({ position: 0, duration: 30 }),
  usePreviewStore: Object.assign((sel: (s: typeof mockStore) => unknown) => sel(mockStore), { getState: () => mockStore }),
}));
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/store/prefs', () => ({ usePrefs: Object.assign((sel: (s: { service: string }) => unknown) => sel({ service: 'spotify' }), { getState: () => ({ service: 'spotify' }) }) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import PlayerScreen from '@/screens/player/PlayerScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
function render(params: Record<string, unknown>) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(PlayerScreen as never, { navigation, route: { params: { songId: 'song-1', ...params } } })); });
  const has = (type: string) => r.root.findAll((n: Node) => (n.type as unknown) === type).length > 0;
  const main = () => r.root.findAll((n: Node) => (n.type as unknown) === 'Press' && ['재생', '일시정지'].includes(n.props.accessibilityLabel))[0];
  return { has, main };
}

beforeEach(() => { jest.clearAllMocks(); mockLock.current = { status: 'open' }; mockDrop.current = { isError: false }; });

test('드랍 상세 요청이 실패하면(삭제된 드랍·네트워크) 곡을 보여 주고 재생할 수 있다 — 로딩에 머물지 않음', () => {
  mockDrop.current = { data: undefined, isError: true };
  mockLock.current = { status: 'unavailable' };
  const v = render({ dropId: 'gone' });
  expect(mockLock.args[3]).toBe(true); // 실패를 훅에 넘긴다
  expect(v.has('ScreenState')).toBe(false);
  expect(v.main()).toBeTruthy();
  act(() => { v.main().props.onPress(); });
  expect(mockPreview.toggle).toHaveBeenCalled();
});

test('상세를 받는 중(판정 중)이면 불러오는 중', () => {
  mockLock.current = { status: 'pending' };
  const v = render({ dropId: 'd1' });
  expect(v.has('ScreenState')).toBe(true);
  expect(v.main()).toBeUndefined();
});

test('잠긴 드랍이면 잠금 안내만, 재생 버튼 없음', () => {
  mockDrop.current = { data: { droppingId: 'd1', userId: 'u', content: '한마디' }, isError: false };
  mockLock.current = { status: 'locked', lock: { locked: true, remainingM: 1000 } };
  const v = render({ dropId: 'd1' });
  expect(v.has('LockedDropScreen')).toBe(true);
  expect(v.main()).toBeUndefined();
});

test('드랍 없이 곡만 열면 판정과 상관없이 바로 곡', () => {
  mockLock.current = { status: 'pending' };
  const v = render({});
  expect(v.main()).toBeTruthy();
});
