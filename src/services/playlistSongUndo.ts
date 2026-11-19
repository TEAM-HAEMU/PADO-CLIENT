/**
 * 플리에서 곡 빼기 + 토스트의 '되돌리기' (QA U-04 e).
 * 되돌리기는 다시 담기 API(POST /playlists/{id}/songs)로 한다. 서버는 담은 곡을 늘 맨 뒤에 붙이고 순서 바꾸기 API가 없어서,
 * 뺀 곡이 맨 뒤 곡이 아니었으면 원래 자리로는 돌아가지 않는다. 그때는 맨 아래로 들어갔다고 알려 준다.
 */
import type { QueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { ApiError, errorMessage } from '@/api/errors';
import type { PlaylistDetail } from '@/api/types';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';

const refresh = (qc: QueryClient, playlistId: string) => {
  qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
  qc.invalidateQueries({ queryKey: ['playlists'] });
};

/** 다시 담으면 원래 자리로 돌아가는지 — 뺀 곡이 맨 뒤였을 때만. 빼기 전 목록을 모르면 null */
export function restoresInPlace(before: string[] | undefined, songId: string): boolean | null {
  if (!before?.length || !before.includes(songId)) return null;
  return before[before.length - 1] === songId;
}

/** 곡을 빼고 '되돌리기'가 달린 토스트를 띄운다. 빼기가 실패하면 그대로 던진다 */
export async function removeSongWithUndo(qc: QueryClient, playlistId: string, songId: string) {
  const before = qc.getQueryData<PlaylistDetail>(['playlist', playlistId])?.songs.map(s => s.id);
  await playlistApi.removeSong(playlistId, songId);
  track('playlist_song_removed', { playlist_id: playlistId, song_id: songId });
  refresh(qc, playlistId);
  const inPlace = restoresInPlace(before, songId);
  toast('플레이리스트에서 뺐어요.', 'default', { label: '되돌리기', onPress: () => { undoRemove(qc, playlistId, songId, inPlace); } });
}

export async function undoRemove(qc: QueryClient, playlistId: string, songId: string, inPlace: boolean | null) {
  try {
    await playlistApi.addSongs(playlistId, [songId]);
    track('playlist_song_restored', { playlist_id: playlistId, song_id: songId, in_place: inPlace });
    toast(inPlace === false ? '다시 담았어요. 맨 아래에 들어가요.' : '다시 담았어요.');
  } catch (e) {
    // 이미 담겨 있으면(다른 기기에서 다시 담음 등) 되돌린 것과 같다
    if (e instanceof ApiError && e.code === 'P3') toast('다시 담았어요.');
    else toast(errorMessage(e), 'error');
  } finally {
    refresh(qc, playlistId);
  }
}
