/**
 * 목록 화면 리렌더 수 — 같은 조작에서 행이 몇 번 다시 그려지는지 센다 (2026-11-18 성능 검토 H1·M1·M2·M3).
 * 행 안의 부품(DiscRow·DiscArt·Art·Avatar)을 이름 그대로의 호스트로 바꿔 함수가 불린 횟수 = 행 렌더 수로 본다.
 * commit 수는 React.Profiler onRender 횟수. FlatList는 테스트 렌더러에서 화면 크기를 모르므로 처음 10행(initialNumToRender)만 그린다.
 * PADO_RENDER_REPORT=1이면 숫자를 콘솔에 찍는다 (PR 전후 비교용).
 */
import './setup/screenEnv';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
const mockData: Record<string, unknown> = {};
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Brand', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Sheet', () => ({ Sheet: require('./setup/screenEnv').mockHost('Sheet') }));
jest.mock('@/components/ui/Dialog', () => ({ dialog: { alert: jest.fn(), menu: jest.fn() } }));
jest.mock('@/components/ui/ScreenState', () => ({ ScreenState: require('./setup/screenEnv').mockHost('ScreenState'), listStatus: () => null }));
jest.mock('@/components/drop/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/drop/parts', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/parts', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/me/MeIcons', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/map/DropPin', () => ({ MarkerArt: require('./setup/screenEnv').mockHost('MarkerArt'), markerArtTiles: () => ({ urls: [] }) }));
jest.mock('@/components/map/DropMarker', () => ({ isMarkerImageReady: () => true, prefetchMarkerImage: async () => {}, useTracking: () => [false, () => {}] }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: require('./setup/screenEnv').mockHost('MapView'), Marker: require('./setup/screenEnv').mockHost('Marker'), PROVIDER_DEFAULT: undefined, PROVIDER_GOOGLE: 'google' }));
jest.mock('@/config', () => ({ env: { googleMapsKey: '' } }));
jest.mock('@/screens/map/MapHomeScreen', () => ({ dropArt: (d: { albumImageUrl?: string }) => d.albumImageUrl ?? null, dropSub: () => '', dropTitle: (d: { title?: string }) => d.title ?? '' }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav, useIsFocused: () => true }));
jest.mock('@/api/endpoints', () => ({
  dropApi: { get: jest.fn(), remove: jest.fn() },
  likeApi: { countForDrop: jest.fn() },
  playlistApi: { addSongs: jest.fn(), get: jest.fn(), remove: jest.fn() },
  commentApi: { create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));
jest.mock('@/hooks/api', () => {
  const q = (k: string) => () => ({ data: mockData[k], isLoading: false, isError: false, error: null, refetch: jest.fn() });
  return {
    qk: { drop: (id: string) => ['drop', id], likeCount: (id: string) => ['likeCount', id], myDrops: ['myDrops'], comments: (id: string) => ['comments', id] },
    invalidateAfterDropRemoved: jest.fn(),
    useMe: q('me'), useMyDrops: q('myDrops'), useMyLikes: q('myLikes'), useMyLikeCount: q('none'), useMyPlaylists: q('none'), useUnreadCount: q('none'),
    useSongSearch: q('search'), usePlaylist: q('playlist'), useDrop: q('drop'), useComments: q('comments'),
    useLikeCount: q('none'), useCommentCount: q('none'), useIsLiked: () => false, useToggleLike: () => ({ toggle: jest.fn() }),
  };
});
jest.mock('@/services/preview', () => {
  const { create } = jest.requireActual('zustand');
  return { usePreviewStore: create(() => ({ key: null, paused: true, pending: null, buffering: false, toggle: jest.fn() })), startPreview: jest.fn(async () => 'ok') };
});
jest.mock('@/services/previewSource', () => ({ findPreview: jest.fn(async () => ({})), noPreviewMessage: () => '' }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }) }));
jest.mock('@/hooks/useDropOpenedEvent', () => ({ useDropOpenedEvent: () => {} }));
jest.mock('@/hooks/useDropMenu', () => ({ useDropMenu: () => ({ open: jest.fn() }) }));
jest.mock('@/hooks/useBlockUser', () => ({ useBlockUser: () => jest.fn() }));
jest.mock('@/hooks/useDropLock', () => { const lock = () => ({ locked: false }); return { useDropLock: () => lock }; });

import { renderCounts, resetRenderCounts } from './setup/screenEnv';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { likeApi } from '@/api/endpoints';
import { usePreviewStore } from '@/services/preview';
import SongSearchScreen from '@/screens/drop/SongSearchScreen';
import AddSongsScreen from '@/screens/detail/AddSongsScreen';
import CommentsScreen from '@/screens/player/CommentsScreen';
import PlaylistDetailScreen from '@/screens/detail/PlaylistDetailScreen';
import PlaylistDropScreen from '@/screens/detail/PlaylistDropScreen';
import ProfileScreen, { LIKE_FALLBACK_LIMIT } from '@/screens/me/ProfileScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Renderer = import('react-test-renderer').ReactTestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

declare const process: { env: Record<string, string | undefined> };
const REPORT = process.env.PADO_RENDER_REPORT === '1';
/** all = 그 사이 그려진 부품(호스트로 바꾼 것) 수 합계 — commit 하나가 얼마나 넓게 다시 그리는지 */
const report = (name: string, nums: Record<string, number>) => { if (REPORT) console.log(`[render] ${name} ${JSON.stringify({ ...nums, all: Object.values(renderCounts).reduce((a, b) => a + b, 0) })}`); };

let mounted: Renderer | undefined;
let client: QueryClient;
let commits = 0;
beforeEach(() => {
  jest.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  commits = 0;
  resetRenderCounts();
  usePreviewStore.setState({ key: null, paused: true });
});
afterEach(() => { act(() => { mounted?.unmount(); }); mounted = undefined; client.clear(); jest.useRealTimers(); });

function render(Screen: unknown, props: Record<string, unknown> = {}) {
  const el = React.createElement(QueryClientProvider, { client },
    React.createElement(React.Profiler, { id: 'screen', onRender: () => { commits++; } }, React.createElement(Screen as never, props as never)));
  let r!: Renderer;
  act(() => { r = TestRenderer.create(el); });
  mounted = r;
  return r;
}
const hosts = (r: Renderer, type: string) => r.root.findAll((n: Node) => (n.type as unknown) === type);
const input = (r: Renderer, placeholder: string) => r.root.findAll((n: Node) => n.props.placeholder === placeholder)[0];
/** 지금부터 센다 */
const startCount = () => { commits = 0; resetRenderCounts(); };
const count = (name: string) => renderCounts[name] ?? 0;
/** 한 글자씩 친다 (디바운스 350ms가 지나기 전 — 검색 결과는 그대로) */
const typeChars = (r: Renderer, placeholder: string, base: string, chars: string) => {
  for (let i = 1; i <= chars.length; i++) act(() => { input(r, placeholder).props.onChangeText(base + chars.slice(0, i)); });
};

const songs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `곡 ${i}`, artist: `가수 ${i}`, duration: 180 + i, albumImagePath: `https://img/${i}`, links: { spotify: null, youtubeMusic: null } }));

test('M1 곡 검색: 결과가 뜬 뒤 다섯 글자를 쳐도 결과 행은 다시 그리지 않는다', () => {
  mockData.search = songs(20);
  const r = render(SongSearchScreen, { navigation: mockNav, route: { params: {} } });
  act(() => { input(r, '음악을 검색해보세요.').props.onChangeText('a'); });
  act(() => { jest.advanceTimersByTime(400); });
  expect(hosts(r, 'DiscArt').length).toBe(10);
  startCount();
  typeChars(r, '음악을 검색해보세요.', 'a', 'bcdef');
  report('SongSearch 5글자', { rows: count('DiscArt'), screen: count('DropTopBar'), commits });
  expect(count('DiscArt')).toBe(0);
  expect(commits).toBe(5);
});

test('M1·M3 곡 추가: 다섯 글자 입력은 행을 다시 그리지 않고, 곡을 하나 고르면 그 행만 다시 그린다', async () => {
  mockData.search = songs(20);
  mockData.myLikes = [];
  const r = render(AddSongsScreen, { navigation: mockNav, route: { params: { playlistId: 'pl1', existing: ['s1'] } } });
  act(() => { input(r, '곡을 검색하세요').props.onChangeText('a'); });
  act(() => { jest.advanceTimersByTime(400); });
  expect(hosts(r, 'DiscRow').length).toBe(10);
  startCount();
  typeChars(r, '곡을 검색하세요', 'a', 'bcdef');
  const typing = { rows: count('DiscRow'), commits };
  startCount();
  for (const i of [0, 3, 5]) act(() => { hosts(r, 'DiscRow')[i].props.onPress(); });
  report('AddSongs 5글자', typing);
  report('AddSongs 3곡 선택', { rows: count('DiscRow'), commits });
  expect(typing.rows).toBe(0);
  expect(count('DiscRow')).toBe(3);
  // 동작 그대로: 고른 줄은 강조 + 체크, 이미 담긴 곡은 흐리게 + 체크, 완료 버튼에 곡 수
  const rows = hosts(r, 'DiscRow');
  expect(rows.map(n => !!n.props.active)).toEqual([true, false, false, true, false, true, false, false, false, false]);
  expect(rows[1].props.dim).toBe(true);
  expect(rows[1].props.artist).toBe('이미 담긴 곡');
  expect(rows.map(n => (n.props.right as React.ReactElement<{ color: string }>).props.color === '#DEDEDE')).toEqual([false, false, true, false, true, false, true, true, true, true]);
  expect(hosts(r, 'PrimaryButton')[0].props.label).toBe('완료 · 3곡');
  // 다시 누르면 빠진다 (그 행만)
  startCount();
  act(() => { hosts(r, 'DiscRow')[3].props.onPress(); });
  expect(count('DiscRow')).toBe(1);
  expect(hosts(r, 'PrimaryButton')[0].props.label).toBe('완료 · 2곡');
});

test('M1 댓글: 다섯 글자를 쳐도 댓글 행은 다시 그리지 않는다', () => {
  mockData.me = { username: 'u3' };
  mockData.drop = undefined;
  mockData.comments = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, content: `댓글 ${i}`, droppingId: 'd1', username: `u${i}` }));
  const r = render(CommentsScreen, { navigation: mockNav, route: { params: { dropId: 'd1' } } });
  expect(hosts(r, 'Avatar').length).toBe(10);
  startCount();
  typeChars(r, '이 곡에 한마디', '', '안녕하세요');
  report('Comments 5글자', { rows: count('Avatar'), commits });
  expect(count('Avatar')).toBe(0);
  // 내 댓글 표시는 그대로
  expect(hosts(r, 'T').filter(n => n.props.children === '나').length).toBe(1);
});

const playlist = { id: 'pl1', name: '플리', songs: songs(30) };
test('M2 플리 상세: 다른 곡으로 바뀌면 바뀐 두 행만 다시 그린다 (헤더는 그대로)', () => {
  mockData.playlist = playlist;
  usePreviewStore.setState({ key: 's1', paused: false });
  const r = render(PlaylistDetailScreen, { navigation: mockNav, route: { params: { playlistId: 'pl1' } } });
  expect(hosts(r, 'DiscRow').filter(n => n.props.active).map(n => n.props.title)).toEqual(['곡 1']);
  startCount();
  act(() => { usePreviewStore.setState({ key: 's2' }); });
  report('PlaylistDetail 곡 변경', { rows: count('DiscRow'), hero: count('PlaylistHero'), commits });
  expect(count('DiscRow')).toBe(2);
  expect(count('PlaylistHero')).toBe(0);
  expect(hosts(r, 'DiscRow').filter(n => n.props.active).map(n => n.props.title)).toEqual(['곡 2']);
});

test('M2 플리 드랍: 다른 곡으로 바뀌면 바뀐 두 행만 다시 그린다 (헤더는 그대로)', () => {
  mockData.drop = { droppingId: 'd1', userId: 'u', playlistName: '플리 드랍', content: '', placeName: '부산', expiryDate: '2099-01-01T00:00:00Z', songs: songs(30).map(s => ({ songId: s.id, title: s.title, artist: s.artist, albumImagePath: s.albumImagePath })) };
  usePreviewStore.setState({ key: 's1', paused: false });
  const r = render(PlaylistDropScreen, { navigation: mockNav, route: { params: { dropId: 'd1' } } });
  expect(hosts(r, 'DiscRow').filter(n => n.props.active).map(n => n.props.title)).toEqual(['곡 1']);
  startCount();
  act(() => { usePreviewStore.setState({ key: 's2' }); });
  report('PlaylistDrop 곡 변경', { rows: count('DiscRow'), hero: count('PlaylistHero'), commits });
  expect(count('DiscRow')).toBe(2);
  expect(count('PlaylistHero')).toBe(0);
  expect(hosts(r, 'DiscRow').filter(n => n.props.active).map(n => n.props.title)).toEqual(['곡 2']);
});

const profileDrops = (n: number, likeCount?: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ droppingId: `d${i}`, type: 'MUSIC', title: `드랍 ${i}`, artist: 'a', albumImageUrl: `https://img/${i}`, latitude: 35 + i / 1000, longitude: 129, placeName: '부산', ...(likeCount ? { likeCount: likeCount(i) } : {}) }));
const likeBadges = (r: Renderer) => r.root.findAll((n: Node) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('좋아요 ')).map(n => n.props.accessibilityLabel);

test('H1 프로필(예전 서버 — 목록에 likeCount 없음): 드랍 50개여도 좋아요 수는 위에서부터 상한만큼만 묻고, 도착해도 행은 처음 한 번만 그린다', async () => {
  const N = 50, L = LIKE_FALLBACK_LIMIT;
  mockData.me = { username: '나' };
  (likeApi.countForDrop as jest.Mock).mockClear();
  mockData.myLikes = [];
  mockData.myDrops = profileDrops(N);
  // 응답이 20ms 간격으로 하나씩 도착 (드랍 i의 좋아요 = i + 1)
  (likeApi.countForDrop as jest.Mock).mockImplementation((id: string) => { const i = Number(id.slice(1)); return new Promise(res => setTimeout(() => res(i + 1), (i + 1) * 20)); });
  startCount();
  const r = render(ProfileScreen);
  // 응답마다 따로 반영되게 (react-query 알림 묶음 setTimeout(0)을 다음 응답 전에 비운다)
  for (let t = 0; t <= L; t++) { await act(async () => { jest.advanceTimersByTime(20); }); await act(async () => { jest.advanceTimersByTime(0); }); }
  await act(async () => { jest.runOnlyPendingTimers(); });
  report(`Profile 진입 예전 서버 (드랍 ${N}개)`, { requests: (likeApi.countForDrop as jest.Mock).mock.calls.length, rows: count('Art'), screen: count('Avatar'), commits });
  expect(likeApi.countForDrop).toHaveBeenCalledTimes(L);
  expect((likeApi.countForDrop as jest.Mock).mock.calls.map(c => c[0])).toEqual(Array.from({ length: L }, (_, i) => `d${i}`));
  // 받은 좋아요 = 물어본 드랍만의 합계 + '+' (전부 세지 못했다는 표시)
  expect(hosts(r, 'T').some(n => n.props.children === `${(L * (L + 1)) / 2}+`)).toBe(true);
  expect(likeBadges(r)).toEqual(Array.from({ length: L }, (_, i) => `좋아요 ${i + 1}개`));
  expect(count('Art')).toBe(N);
  expect(count('Avatar')).toBeLessThanOrEqual(3);
});

test('H1 프로필(예전 서버): 드랍이 상한 이하면 전부 묻고 합계에 + 가 없다', async () => {
  const N = 5;
  mockData.me = { username: '나' };
  (likeApi.countForDrop as jest.Mock).mockClear();
  mockData.myLikes = [];
  mockData.myDrops = profileDrops(N);
  (likeApi.countForDrop as jest.Mock).mockImplementation(async (id: string) => Number(id.slice(1)) + 1);
  const r = render(ProfileScreen);
  for (let t = 0; t < 3; t++) await act(async () => { jest.advanceTimersByTime(0); });
  expect(likeApi.countForDrop).toHaveBeenCalledTimes(N);
  expect(hosts(r, 'T').some(n => n.props.children === 15)).toBe(true);
});

test('H1 프로필(새 서버 — 목록에 likeCount 있음): 드랍 200개여도 좋아요 수를 따로 묻지 않고, 목록이 채운 캐시로 합계·행 숫자를 그린다', async () => {
  const N = 200;
  mockData.me = { username: '나' };
  (likeApi.countForDrop as jest.Mock).mockClear();
  // 내가 내 드랍 d0에 누른 좋아요 1개는 '받은 좋아요'에서 뺀다
  mockData.myLikes = [{ droppingId: 'd0' }];
  mockData.myDrops = profileDrops(N, i => i % 3);
  // useMyDrops가 목록을 받으며 하는 일 (seedLikeCounts) — 이 테스트는 훅을 목으로 바꿔서 직접 넣는다
  (mockData.myDrops as { droppingId: string; likeCount: number }[]).forEach(d => client.setQueryData(['likeCount', d.droppingId], d.likeCount));
  startCount();
  const r = render(ProfileScreen);
  await act(async () => { jest.runOnlyPendingTimers(); });
  report(`Profile 진입 새 서버 (드랍 ${N}개)`, { requests: (likeApi.countForDrop as jest.Mock).mock.calls.length, rows: count('Art'), screen: count('Avatar'), commits });
  expect(likeApi.countForDrop).not.toHaveBeenCalled();
  const sum = Array.from({ length: N }, (_, i) => i % 3).reduce((a, b) => a + b, 0);
  expect(hosts(r, 'T').some(n => n.props.children === sum - 1)).toBe(true);
  expect(likeBadges(r)).toEqual(Array.from({ length: N }, (_, i) => `좋아요 ${i % 3}개`));
  // 내가 좋아요를 누르면(useToggleLike의 낙관적 반영) 그 행 숫자와 합계가 바로 바뀐다
  await act(async () => { client.setQueryData(['likeCount', 'd1'], 2); jest.advanceTimersByTime(0); });
  expect(likeBadges(r)[1]).toBe('좋아요 2개');
  expect(hosts(r, 'T').some(n => n.props.children === sum)).toBe(true);
});
