/**
 * 넓은 화면(펼친 폴드 673dp · 태블릿)에서 내용 최대 폭 — 네이티브 의존 없음 (jest에서 바로 시험)
 * QA 2026-11-20 Z-07: 최대 폭이 없어 플리 카드가 290dp 정사각 2칸, 설정 줄이 화면 끝까지 늘어났다.
 *
 * 창 폭이 최대 폭 이하(모든 폰 · iPhone · iPad 호환 창)면 내용 폭 = 창 폭, 양옆 여백 0 → 예전과 같은 숫자 그대로.
 */

/** 내용 최대 폭 — Material 큰 화면 바텀시트 최대 폭(640)보다 조금 좁게, 폰 가장 큰 폭(440)보다 넉넉히 */
export const CONTENT_MAX_WIDTH = 600;

/** 창 폭 → 내용 폭과 양옆 여백 (가운데 정렬). 여백은 반올림하지 않는다 — alignSelf: 'center'로 놓은 열과 같은 자리에 오게 */
export function contentColumn(windowWidth: number, max = CONTENT_MAX_WIDTH): { width: number; gutter: number } {
  const w = windowWidth > 0 ? windowWidth : 0;
  const width = Math.min(w, max);
  return { width, gutter: (w - width) / 2 };
}

// ── 플레이리스트 격자 (플리 탭)
/** 좌우 여백 24씩 · 칸 사이 14 */
export const PLAYLIST_GRID_PAD = 24;
export const PLAYLIST_GRID_GAP = 14;
/** 내용 폭이 이 이상이면 3칸 — 최대 폭에 닿는 넓은 화면(펼친 폴드 · 태블릿)부터. 폰은 모두 2칸 그대로 */
export const PLAYLIST_THREE_COLUMNS_AT = CONTENT_MAX_WIDTH;

/** 플리 격자 칸 수와 한 칸 크기 (정사각 커버) */
export function playlistGrid(contentWidth: number): { columns: 2 | 3; cell: number } {
  const columns = contentWidth >= PLAYLIST_THREE_COLUMNS_AT ? 3 : 2;
  const cell = Math.floor((contentWidth - PLAYLIST_GRID_PAD * 2 - PLAYLIST_GRID_GAP * (columns - 1)) / columns);
  return { columns, cell };
}
