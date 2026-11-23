/*
 * 넓은 화면 내용 최대 폭 (QA 2026-11-20 Z-07)
 * 폭: 344dp(폴드 커버) · 360dp(흔한 갤럭시) · 375/440pt(iPhone SE/Pro Max) · 600dp(경계) · 673dp(펼친 폴드) · 1280dp(태블릿 가로)
 * 폰 폭에서는 숫자가 하나도 바뀌지 않아야 한다 — 예전 계산과 1dp 단위로 비교
 */
import './setup/screenEnv';

let mockWidth = 360;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }) }));
jest.mock('@/hooks/api', () => ({
  useMyPlaylists: () => ({ data: [1, 2, 3, 4, 5].map(i => ({ id: `p${i}`, name: `플리 ${i}`, albumImageUrl: null })), isLoading: false, isError: false }),
  usePlaylistDetails: (ids: string[]) => ids.map(() => ({ data: { songs: [] }, isError: false })),
  useMyLikes: () => ({ data: [], isLoading: false, isError: false }),
  useMyDrops: () => ({ data: [], isLoading: false, isError: false }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }), useIsFocused: () => true }));
jest.mock('@/components/music/Collage', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/detail/parts', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-linear-gradient', () => () => null);

import { CONTENT_MAX_WIDTH, contentColumn, playlistGrid } from '@/utils/contentColumn';
import PlaylistsScreen from '@/screens/me/PlaylistsScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

/** 이 수정 전 플리 탭의 칸 크기 계산 (PlaylistsScreen) */
const oldCell = (w: number) => Math.floor((w - 48 - 14) / 2);

describe('contentColumn — 창 폭 → 내용 폭 · 양옆 여백', () => {
  it('폰 폭(최대 폭 이하)은 그대로 — 여백 0', () => {
    for (const w of [320, 344, 360, 375, 393, 411, 430, 440, 599, 600]) expect(contentColumn(w)).toEqual({ width: w, gutter: 0 });
  });
  it('최대 폭은 600', () => {
    expect(CONTENT_MAX_WIDTH).toBe(600);
  });
  it('넓은 화면은 600으로 막고 남는 폭을 양옆에 반씩 (반올림 안 함 — alignSelf: center와 같은 자리)', () => {
    expect(contentColumn(601)).toEqual({ width: 600, gutter: 0.5 });
    expect(contentColumn(673)).toEqual({ width: 600, gutter: 36.5 });
    expect(contentColumn(800)).toEqual({ width: 600, gutter: 100 });
    expect(contentColumn(1280)).toEqual({ width: 600, gutter: 340 });
  });
  it('폭을 아직 모르면(0·음수) 0', () => {
    expect(contentColumn(0)).toEqual({ width: 0, gutter: 0 });
    expect(contentColumn(-5)).toEqual({ width: 0, gutter: 0 });
  });
});

describe('playlistGrid — 플리 탭 격자', () => {
  it('600dp 미만은 2칸, 칸 크기는 예전 계산과 1dp까지 같다 (폰 무변화)', () => {
    for (let w = 300; w < 600; w++) {
      const g = playlistGrid(contentColumn(w).width);
      expect(g.columns).toBe(2);
      expect(g.cell).toBe(oldCell(w));
    }
  });
  it('360dp → 149 · 440pt → 189', () => {
    expect(playlistGrid(360)).toEqual({ columns: 2, cell: 149 });
    expect(playlistGrid(440)).toEqual({ columns: 2, cell: 189 });
  });
  it('경계: 599 → 2칸, 600 → 3칸', () => {
    expect(playlistGrid(599).columns).toBe(2);
    expect(playlistGrid(600)).toEqual({ columns: 3, cell: 174 });
  });
  it('펼친 폴드 673dp · 태블릿은 내용 폭 600 → 3칸 174 (예전엔 2칸 305)', () => {
    expect(oldCell(673)).toBe(305);
    expect(playlistGrid(contentColumn(673).width)).toEqual({ columns: 3, cell: 174 });
    expect(playlistGrid(contentColumn(1280).width)).toEqual({ columns: 3, cell: 174 });
  });
  it('3칸이 한 줄에 들어간다 (칸 3 + 사이 2 ≤ 내용 폭 − 좌우 여백)', () => {
    const { cell } = playlistGrid(600);
    expect(cell * 3 + 14 * 2).toBeLessThanOrEqual(600 - 48);
  });
});

describe('PlaylistsScreen — 창 폭에 따라 칸 크기와 여백', () => {
  type Node = import('react-test-renderer').ReactTestInstance;
  const render = (w: number) => {
    mockWidth = w;
    let r!: import('react-test-renderer').ReactTestRenderer;
    act(() => { r = TestRenderer.create(React.createElement(PlaylistsScreen)); });
    const cells = r.root.findAll((n: Node) => n.props.trackAs === '플레이리스트 칸' && typeof n.type !== 'string');
    const scroll = r.root.findAll((n: Node) => n.props.contentContainerStyle != null)[0];
    const out = { cellSizes: cells.map(c => (c.props.style as { width: number }).width), pad: (scroll.props.contentContainerStyle as { paddingHorizontal: number }).paddingHorizontal };
    act(() => r.unmount());
    return out;
  };
  it('360dp: 예전과 같은 149 · 좌우 24', () => {
    const r = render(360);
    expect(r.cellSizes).toEqual([149, 149, 149, 149, 149]);
    expect(r.pad).toBe(24);
  });
  it('673dp: 174 세 칸 · 좌우 24 + 36.5 (내용은 가운데 600)', () => {
    const r = render(673);
    expect(r.cellSizes).toEqual([174, 174, 174, 174, 174]);
    expect(r.pad).toBe(60.5);
  });
});
