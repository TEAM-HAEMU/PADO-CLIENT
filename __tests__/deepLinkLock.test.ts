/* B-05 — 링크·푸시로 재생 반경 밖 드랍을 열면 상세 화면이 잠금 안내만 보이고, 미리듣기·투표를 하지 않는다 */
import './setup/screenEnv';

const mockLock: { current: unknown } = { current: { status: 'open' } };
const mockData: Record<string, unknown> = {};
const mockStart = jest.fn(async () => 'ok');
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Brand', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Sheet', () => ({ Sheet: require('./setup/screenEnv').mockHost('Sheet') }));
jest.mock('@/components/ui/Marquee', () => ({ Marquee: require('./setup/screenEnv').mockHost('Marquee') }));
jest.mock('@/components/ui/ScreenState', () => ({ ScreenState: require('./setup/screenEnv').mockHost('ScreenState') }));
jest.mock('@/components/music/PreviewRow', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/parts', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/LockedDrop', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('react-native-svg', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/hooks/useOpenedDropLock', () => ({ useOpenedDropLock: () => mockLock.current }));
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/useDropOpenedEvent', () => ({ useDropOpenedEvent: jest.fn() }));
jest.mock('@/api/endpoints', () => ({ dropApi: { vote: jest.fn(), unvote: jest.fn() } }));
jest.mock('@/hooks/api', () => {
  const q = (k: string) => () => ({ data: mockData[k], isError: false, error: null, refetch: jest.fn() });
  return {
    qk: { drop: (id: string) => ['drop', id] },
    useDrop: q('drop'), useSong: q('song'), useComments: q('none'), useLikeCount: q('none'), useCommentCount: q('none'),
    useDropPlace: () => undefined, useIsLiked: () => false, useToggleLike: () => ({ toggle: jest.fn() }),
  };
});
jest.mock('@/services/preview', () => ({
  startPreview: (...a: unknown[]) => (mockStart as (...x: unknown[]) => Promise<string>)(...a),
  usePreview: () => ({ loading: false, available: true, playing: false, toggle: jest.fn() }),
  usePreviewProgress: () => ({ position: 0, duration: 30 }),
  usePreviewStore: Object.assign((sel: (s: object) => unknown) => sel({ key: null }), { getState: () => ({ key: null }) }),
}));
jest.mock('@/services/listen', () => ({ listenFull: jest.fn() }));
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ ...jest.requireActual('@tanstack/react-query'), useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));

import PinPreviewScreen from '@/screens/map/PinPreviewScreen';
import VoteDropScreen from '@/screens/detail/VoteDropScreen';
import PlaylistDropScreen from '@/screens/detail/PlaylistDropScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const LOCK = { status: 'locked', lock: { locked: true, remainingM: 330_000 } };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
const MUSIC = { droppingId: 'd1', songId: 's1', userId: 'u', username: '민재', content: '아침 산책 BGM', expiryDate: '', createdAt: '', albumImageUrl: null };
const VOTE = { droppingId: 'd2', userId: 'u', topic: '주제', options: [{ songId: 's1', title: '곡', artist: '가수', albumImagePath: null, voteCount: 0 }], content: '골라줘', latitude: 35.18, longitude: 128.9, address: '부산', expiryDate: '', createdAt: '', totalVotes: 0, userVotedOption: null };
const PLAYLIST = { droppingId: 'd3', userId: 'u', playlistName: '플리', songs: [{ songId: 's1', title: '곡', artist: '가수', albumImagePath: null }], content: '', latitude: 35.18, longitude: 128.9, address: '부산', expiryDate: '', createdAt: '' };

function render(Screen: unknown, dropId: string) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Screen as never, { navigation, route: { params: { dropId, source: 'link' } } })); });
  return r;
}
const has = (r: import('react-test-renderer').ReactTestRenderer, type: string) => r.root.findAll((n: Node) => (n.type as unknown) === type).length > 0;

beforeEach(() => { jest.clearAllMocks(); mockLock.current = { status: 'open' }; Object.keys(mockData).forEach(k => delete mockData[k]); });

describe('음악 드랍 (PinPreview)', () => {
  beforeEach(() => { mockData.drop = MUSIC; mockData.song = { id: 's1', title: 'Bubble Gum', artist: 'NewJeans' }; });

  test('잠기면 잠금 안내 시트만 보이고 미리듣기를 자동으로 틀지 않는다', () => {
    mockLock.current = LOCK;
    const r = render(PinPreviewScreen, 'd1');
    expect(has(r, 'LockedDropSheet')).toBe(true);
    expect(r.root.findAll((n: Node) => (n.type as unknown) === 'LockedDropSheet')[0].props.note).toBe('아침 산책 BGM');
    expect(mockStart).not.toHaveBeenCalled();
    expect(has(r, 'PlayCircleGlyph')).toBe(false);
  });

  test('판정 중(위치를 찾는 중)이면 불러오는 중으로 두고 틀지 않는다', () => {
    mockLock.current = { status: 'pending' };
    const r = render(PinPreviewScreen, 'd1');
    expect(has(r, 'Loading')).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  test('열린 드랍은 예전처럼 바로 미리듣기', () => {
    const r = render(PinPreviewScreen, 'd1');
    expect(has(r, 'LockedDropSheet')).toBe(false);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});

describe('투표 드랍', () => {
  beforeEach(() => { mockData.drop = VOTE; });

  test('잠기면 후보·투표 없이 잠금 안내', () => {
    mockLock.current = LOCK;
    const r = render(VoteDropScreen, 'd2');
    expect(has(r, 'LockedDropScreen')).toBe(true);
    expect(has(r, 'DiscRow')).toBe(false);
  });

  test('열린 드랍은 후보가 보인다', () => {
    const r = render(VoteDropScreen, 'd2');
    expect(has(r, 'DiscRow')).toBe(true);
  });
});

describe('플리 드랍', () => {
  beforeEach(() => { mockData.drop = PLAYLIST; });

  test('잠기면 첫 곡을 자동으로 틀지 않고 잠금 안내', () => {
    mockLock.current = LOCK;
    const r = render(PlaylistDropScreen, 'd3');
    expect(has(r, 'LockedDropScreen')).toBe(true);
    expect(mockStart).not.toHaveBeenCalled();
  });

  test('열린 드랍은 첫 곡 미리듣기', () => {
    render(PlaylistDropScreen, 'd3');
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
