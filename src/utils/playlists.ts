/** 플레이리스트 목록·만들기·좋아요한 곡 찾기 — 화면과 떼어 낸 순수 로직 (테스트용) */
import type { PlaylistDetail, PlaylistSummary, UUID } from '@/api/types';

/**
 * 플리 카드 커버 이미지 — 목록 응답(/playlists/my)엔 첫 곡 아트 하나뿐이라 상세의 첫 4곡으로 콜라주를 만든다.
 * 상세를 받는 중이면 null(빈 칸) — 첫 곡 아트를 먼저 그렸다가 4칸으로 바뀌며 튀지 않게. 상세를 못 받았으면 첫 곡 아트로.
 */
export function playlistCover(summary: Pick<PlaylistSummary, 'albumImageUrl'>, detail: Pick<PlaylistDetail, 'songs'> | undefined, failed: boolean): (string | null)[] | null {
  if (detail) return detail.songs.map(s => s.albumImagePath);
  return failed ? [summary.albumImageUrl] : null;
}

/**
 * 새 플리 만들기 — 명세상 생성 응답 본문이 없어, 생성 전 목록에 없던 플리를 새 플리로 본다 (같은 이름이 있어도 정확).
 * 생성이 실패하면 throw(아무것도 안 생김). 생성 뒤의 목록 조회 실패는 throw하지 않고 list·created를 null로 돌려준다 —
 * 오류로 보고 시트를 남기면 다시 눌러 같은 플리가 하나 더 생긴다.
 */
export async function createPlaylistAndFind(
  name: string,
  api: { mine: () => Promise<PlaylistSummary[]>; create: (name: string) => Promise<unknown> },
): Promise<{ list: PlaylistSummary[] | null; created: PlaylistSummary | null }> {
  const prior = await api.mine().catch(() => null);
  const before = prior ? new Set(prior.map(p => p.id)) : null;
  await api.create(name);
  // 생성은 이미 됐다 — 목록은 한 번 더 시도하고, 그래도 안 되면 없는 채로
  const list = await api.mine().catch(() => api.mine()).catch(() => null);
  if (!list) return { list: null, created: null };
  const created = (before && list.find(p => !before.has(p.id))) || list.find(p => p.name === name) || null;
  return { list, created };
}

/**
 * 좋아요한 음악 드랍 → 곡 ID. 좋아요 목록 응답엔 곡 ID가 없어(백엔드 MusicLikeDroppingResponse) 드랍 상세로 찾는다.
 *  · 응답에 songId가 오거나(백엔드가 넣으면) 캐시(주변·내 드랍·드랍 상세)에 있으면 요청하지 않는다
 *  · 나머지는 앞에서부터 `limit`개까지만, 동시에 `concurrency`개씩 — 좋아요가 수백 개여도 한꺼번에 쏟아지지 않게
 * 결과: 찾은 곡 ID(드랍 ID → 곡 ID), 상세를 못 받은 드랍 수, 상한에 걸려 아직 안 본 드랍 수
 */
export async function resolveLikedSongIds(
  dropIds: UUID[],
  known: (dropId: UUID) => UUID | null | undefined,
  fetchSongId: (dropId: UUID) => Promise<UUID | null>,
  { limit, concurrency }: { limit: number; concurrency: number },
): Promise<{ songIds: Map<UUID, UUID>; failed: number; remaining: number }> {
  const songIds = new Map<UUID, UUID>();
  const todo: UUID[] = [];
  for (const id of dropIds) {
    const s = known(id);
    if (s) songIds.set(id, s);
    else todo.push(id);
  }
  const batch = todo.slice(0, Math.max(0, limit));
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const id = batch[next++];
      try {
        const s = await fetchSongId(id);
        if (s) songIds.set(id, s);
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), batch.length) }, worker));
  return { songIds, failed, remaining: todo.length - batch.length };
}
