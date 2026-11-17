/**
 * 드랍 종류 화면의 예시 그림 자리 — 최근 드랍 앨범 이미지(GET /droppings/recent-album-images, 최신순 최대 9개)를 순서대로 채운다.
 * 자리 순서: 음악 원판(0) → 투표 앞 원판(1)·왼쪽(2)·오른쪽(3) → 플레이리스트 모자이크 4칸(4~7) → 플레이리스트 뒤 타일(8).
 * 받아오기 전·실패·개수가 모자라면 그 자리는 null → 화면이 지금 그라데이션 예시를 그대로 그린다 (빈칸 없음)
 */
export const ART_SLOTS = 9;
export const SLOT = { music: 0, vote: [1, 2, 3], playlistTiles: [4, 5, 6, 7], playlistBack: 8 } as const;

/** https 주소(목 모드는 data:image)만, 중복 빼고, 앞에서부터 count칸 */
export function albumSlots(urls: unknown, count = ART_SLOTS): (string | null)[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const u of Array.isArray(urls) ? urls : []) {
    if (typeof u !== 'string' || !/^(https:\/\/|data:image\/)/.test(u) || seen.has(u)) continue;
    seen.add(u);
    clean.push(u);
  }
  return Array.from({ length: count }, (_, i) => clean[i] ?? null);
}
