/* QA U-04 — 공유 파일 이름 · 토스트 동작 버튼 · 플리 곡 빼기 되돌리기 · 빈 플리 재생 버튼 · 알림 토글 흐림 */
import './setup/screenEnv';

const mockRemoveSong = jest.fn();
const mockAddSongs = jest.fn();
jest.mock('@/api/endpoints', () => ({
  playlistApi: { removeSong: (...a: unknown[]) => mockRemoveSong(...a), addSongs: (...a: unknown[]) => mockAddSongs(...a) },
}));
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/music/Collage', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/drop/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Brand', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/services/preview', () => ({ usePreview: jest.fn(), usePreviewStore: Object.assign(() => false, { getState: () => ({}) }) }));
jest.mock('@/store/prefs', () => ({ usePrefs: (sel: (s: { service: string }) => unknown) => sel({ service: 'spotify' }) }));

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { removeSongWithUndo, restoresInPlace, undoRemove } from '@/services/playlistSongUndo';
import { runToastAction, toast, toastDuration, useToast } from '@/store/toast';
import { shareFileName } from '@/utils/shareFileName';
import { Toggle } from '@/components/ui';
import { PlaylistHero } from '@/components/detail/parts';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>(res => setTimeout(res, 0)); });

describe('공유 카드 파일 이름 (a)', () => {
  it('pado-<곡 제목>.png', () => {
    expect(shareFileName('밤양갱')).toBe('pado-밤양갱.png');
    expect(shareFileName('Love wins all')).toBe('pado-Love wins all.png');
  });
  it('파일 이름에 못 쓰는 문자는 -로 바꾸고 앞뒤 점·공백을 뗀다', () => {
    expect(shareFileName('AC/DC: Back in Black?')).toBe('pado-AC-DC- Back in Black.png');
    expect(shareFileName('  ..숨김  ')).toBe('pado-숨김.png');
    expect(shareFileName('a\nb\tc')).toBe('pado-a b c.png');
    expect(shareFileName('<"|*>')).toBe('pado-drop.png');
  });
  it('제목이 없으면 pado-drop.png', () => {
    expect(shareFileName('')).toBe('pado-drop.png');
    expect(shareFileName(undefined)).toBe('pado-drop.png');
  });
  it('40자에서 자르되 이모지를 반으로 자르지 않는다', () => {
    const name = shareFileName(`${'가'.repeat(39)}😀😀`);
    expect(name).toBe(`pado-${'가'.repeat(39)}😀.png`);
    expect(name).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/); // 짝 없는 앞 서로게이트 없음
  });
});

describe('토스트 동작 버튼', () => {
  beforeEach(() => { jest.useFakeTimers(); useToast.getState().hide(); });
  afterEach(() => { jest.useRealTimers(); });

  it('동작이 있으면 5초, 없으면 예전 그대로 (2.6초·오류 3.6초)', () => {
    expect(toastDuration('default')).toBe(2600);
    expect(toastDuration('error')).toBe(3600);
    expect(toastDuration('default', { label: '되돌리기', onPress: () => {} })).toBe(5000);
    const onPress = jest.fn();
    toast('뺐어요.', 'default', { label: '되돌리기', onPress });
    jest.advanceTimersByTime(4900);
    expect(useToast.getState().current?.action?.label).toBe('되돌리기');
    jest.advanceTimersByTime(200);
    expect(useToast.getState().current).toBeNull();
  });

  it('누르면 토스트를 닫고 한 번만 실행한다 (연타·지난 토스트의 늦은 탭은 무시)', () => {
    const onPress = jest.fn();
    toast('뺐어요.', 'default', { label: '되돌리기', onPress });
    const id = useToast.getState().current!.id;
    runToastAction(id);
    runToastAction(id);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(useToast.getState().current).toBeNull();

    const late = jest.fn();
    toast('뺐어요.', 'default', { label: '되돌리기', onPress: late });
    const old = useToast.getState().current!.id;
    toast('다른 안내');
    runToastAction(old);
    expect(late).not.toHaveBeenCalled();
    expect(useToast.getState().current?.text).toBe('다른 안내');
  });
});

describe('플리 곡 빼기 되돌리기 (e)', () => {
  let qc: QueryClient;
  const PL = 'pl-1';
  const songs = (ids: string[]) => ({ id: PL, name: '산책', songs: ids.map(id => ({ id, title: id, artist: 'a', duration: 1, links: {} })) });
  beforeEach(() => {
    jest.clearAllMocks();
    useToast.getState().hide();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    mockRemoveSong.mockResolvedValue(undefined);
    mockAddSongs.mockResolvedValue(undefined);
  });

  it('맨 뒤 곡만 다시 담으면 원래 자리 (서버는 다시 담은 곡을 맨 뒤에 붙인다)', () => {
    expect(restoresInPlace(['a', 'b', 'c'], 'c')).toBe(true);
    expect(restoresInPlace(['a', 'b', 'c'], 'a')).toBe(false);
    expect(restoresInPlace(undefined, 'a')).toBeNull();
    expect(restoresInPlace(['a'], 'z')).toBeNull();
  });

  it('빼면 되돌리기 토스트가 뜨고, 누르면 다시 담기 API로 같은 곡을 담는다', async () => {
    qc.setQueryData(['playlist', PL], songs(['a', 'b', 'c']));
    const inv = jest.spyOn(qc, 'invalidateQueries');
    await removeSongWithUndo(qc, PL, 'b');
    expect(mockRemoveSong).toHaveBeenCalledWith(PL, 'b');
    expect(inv).toHaveBeenCalledWith({ queryKey: ['playlist', PL] });
    const t = useToast.getState().current!;
    expect(t.text).toBe('플레이리스트에서 뺐어요.');
    expect(t.action?.label).toBe('되돌리기');

    runToastAction(t.id);
    await flush();
    expect(mockAddSongs).toHaveBeenCalledWith(PL, ['b']);
    expect(useToast.getState().current?.text).toBe('다시 담았어요. 맨 아래에 들어가요.');
    expect(jest.requireMock<{ track: jest.Mock }>('@/services/analytics').track).toHaveBeenCalledWith('playlist_song_restored', { playlist_id: PL, song_id: 'b', in_place: false });
  });

  it('맨 뒤 곡이었으면 그냥 "다시 담았어요."', async () => {
    qc.setQueryData(['playlist', PL], songs(['a', 'b', 'c']));
    await removeSongWithUndo(qc, PL, 'c');
    runToastAction(useToast.getState().current!.id);
    await flush();
    expect(useToast.getState().current?.text).toBe('다시 담았어요.');
  });

  it('빼기가 실패하면 토스트 없이 던진다 (곡 메뉴가 오류를 띄운다)', async () => {
    mockRemoveSong.mockRejectedValue(new ApiError(500, null));
    await expect(removeSongWithUndo(qc, PL, 'a')).rejects.toBeInstanceOf(ApiError);
    expect(useToast.getState().current).toBeNull();
  });

  it('다시 담기가 이미 담김(P3)이면 되돌린 것으로, 다른 실패는 오류 토스트', async () => {
    mockAddSongs.mockRejectedValueOnce(new ApiError(409, { code: 'P3', message: '이미 포함된 노래' }));
    await undoRemove(qc, PL, 'a', false);
    expect(useToast.getState().current?.text).toBe('다시 담았어요.');
    mockAddSongs.mockRejectedValueOnce(new ApiError(0, null));
    await undoRemove(qc, PL, 'a', false);
    expect(useToast.getState().current?.tone).toBe('error');
  });
});

describe('비활성 표현 (g·d)', () => {
  const find = (r: import('react-test-renderer').ReactTestRenderer, label: string) =>
    r.root.findAll(n => typeof n.type !== 'string' && n.props.accessibilityLabel === label && n.props.accessibilityState)[0];
  const opacityOf = (style: unknown) => Object.assign({}, ...[style].flat(3).filter(Boolean)).opacity;

  it('빈 플리면 셔플·전체 재생·재생 앱 버튼이 흐리고 누름을 막는다 (disabled)', () => {
    const onPlay = jest.fn(), onShuffle = jest.fn(), onService = jest.fn();
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(PlaylistHero, { images: [], title: '빈 플리', meta: '0곡', onPlay, onShuffle, onService, empty: true })); });
    const buttons = r.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityRole === 'button');
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      expect(b.props.accessibilityState).toMatchObject({ disabled: true });
      expect(opacityOf(b.props.style)).toBe(0.4);
    }
    act(() => { r.unmount(); });
  });

  it('곡이 있으면 예전 그대로', () => {
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(PlaylistHero, { images: [], title: '플리', meta: '3곡', onPlay: jest.fn(), onShuffle: jest.fn() })); });
    const buttons = r.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityRole === 'button');
    for (const b of buttons) expect(opacityOf(b.props.style)).toBe(1);
    act(() => { r.unmount(); });
  });

  it('토글 disabled: 값은 그대로(켜짐) 보이고 흐리며 바뀌지 않는다', () => {
    const onChange = jest.fn();
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(Toggle, { value: true, onChange, label: '좋아요 알림', disabled: true })); });
    const sw = find(r, '좋아요 알림');
    expect(sw.props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    expect(sw.props.disabled).toBe(true);
    const host = r.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityRole === 'switch')[0];
    expect(opacityOf(host.props.style)).toBe(0.4);
    act(() => { r.unmount(); });
  });
});

describe('탭 화면 아래 여백 (b)', () => {
  it('맨 아래까지 내리면 콘텐츠 끝이 미니 플레이어 원(뜨는 높이 + 테두리 포함 높이)보다 위에 온다', () => {
    const { MINI_DISC_CLEARANCE, MINI_DISC_RING, MINI_DISC_TAB_BOTTOM } = require('@/components/music/miniDiscLayout');
    expect(MINI_DISC_CLEARANCE).toBeGreaterThanOrEqual(MINI_DISC_TAB_BOTTOM + MINI_DISC_RING);
  });
});
