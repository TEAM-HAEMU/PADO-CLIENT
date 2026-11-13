/* 재생 화면 가운데 버튼 — 미리듣기 주소를 찾는 중에는 외부 음악 앱(전체 듣기)으로 넘기지 않는다 */
import './setup/screenEnv';

const mockListen = jest.fn();
const mockPreview = { loading: true, available: false, playing: false, toggle: jest.fn(), stop: jest.fn() };
const mockStore = { key: null as string | null, endedKey: null };
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/music/PreviewRow', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/ScreenState', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/api', () => ({
  useComments: () => ({ data: [] }), useDrop: () => ({ data: undefined }), useDropAddress: () => undefined, useLikeCount: () => ({ data: 0 }),
  useSong: () => ({ data: { id: 'song-1', title: '곡', artist: '가수', duration: 200, albumImagePath: null }, isPlaceholderData: false }),
  useToggleLike: () => ({ toggle: jest.fn() }), useIsLiked: () => false,
}));
jest.mock('@/services/listen', () => ({ listenFull: (...a: unknown[]) => mockListen(...a), listenLabel: () => '전체 듣기' }));
jest.mock('@/services/preview', () => ({
  usePreview: () => mockPreview,
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
function mainButton() {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(PlayerScreen as never, { navigation, route: { params: { songId: 'song-1' } } })); });
  return r.root.findAll((n: Node) => (n.type as unknown) === 'Press' && ['재생', '일시정지'].includes(n.props.accessibilityLabel))[0];
}

beforeEach(() => { jest.clearAllMocks(); Object.assign(mockPreview, { loading: true, available: false, playing: false }); mockStore.key = null; });

test('주소를 찾는 중이면 버튼이 막히고, 눌러도 전체 듣기·미리듣기 모두 하지 않는다', () => {
  const b = mainButton();
  expect(b.props.disabled).toBe(true);
  act(() => { b.props.onPress(); });
  expect(mockListen).not.toHaveBeenCalled();
  expect(mockPreview.toggle).not.toHaveBeenCalled();
});

test('미리듣기가 있으면 미리듣기를 튼다', () => {
  Object.assign(mockPreview, { loading: false, available: true });
  const b = mainButton();
  act(() => { b.props.onPress(); });
  expect(mockPreview.toggle).toHaveBeenCalled();
  expect(mockListen).not.toHaveBeenCalled();
});

test('미리듣기가 없다고 확정되면 전체 듣기로', () => {
  Object.assign(mockPreview, { loading: false, available: false });
  const b = mainButton();
  act(() => { b.props.onPress(); });
  expect(mockListen).toHaveBeenCalled();
});

test('이미 플레이어에 올라 있는 곡이면 주소 조회 중이어도 재생·일시정지', () => {
  mockStore.key = 'song-1';
  Object.assign(mockPreview, { playing: true });
  const b = mainButton();
  expect(b.props.disabled).toBe(false);
  act(() => { b.props.onPress(); });
  expect(mockPreview.toggle).toHaveBeenCalled();
  expect(mockListen).not.toHaveBeenCalled();
});
