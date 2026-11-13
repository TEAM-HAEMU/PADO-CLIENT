/**
 * 곡의 미리듣기 주소 찾기.
 * 백엔드가 ISRC로 Apple Music에서 정확히 맞춘 previewUrl을 먼저 쓰고, 없을 때만 iTunes 검색(제목·가수 + 곡 길이 확인)으로 찾는다.
 */
import { songApi } from '@/api/endpoints';
import type { Song } from '@/api/types';
import { queryClient } from '@/hooks/queryClient';
import { findItunes, type ItunesMatch } from './itunes';

export type PreviewSource = {
  /** 백엔드 곡 ID — 주소가 안 실린 곡(투표 선택지 등)은 곡 상세를 한 번 받아 본다 */
  id?: string;
  title: string;
  artist: string;
  /** undefined = 응답에 필드 자체가 없음(상세를 받아 봄) · null = 백엔드에도 없음 */
  previewUrl?: string | null;
  duration?: number;
  /** 19세 이상 곡 */
  explicit?: boolean | null;
  links?: { appleMusic?: string | null } | null;
};

/** 미리듣기가 없을 때 안내 — 19세 이상 곡은 따로 알려 준다 */
export const noPreviewMessage = (r: Pick<ItunesMatch, 'adult'>) => (r.adult ? '19세 이상 곡은 미리듣기를 제공하지 않아요.' : '이 곡은 미리듣기를 제공하지 않아요.');

const isSongId = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);

export async function findPreview(song: PreviewSource, opts: { priority?: boolean } = {}): Promise<ItunesMatch> {
  if (song.explicit) return { previewUrl: null, appleMusicUrl: song.links?.appleMusic ?? null, adult: true };
  if (song.previewUrl) return { previewUrl: song.previewUrl, appleMusicUrl: song.links?.appleMusic ?? null };
  let s = song;
  if (song.previewUrl === undefined && isSongId(song.id)) {
    // react-query 곡 캐시와 같은 키 — 화면에서 이미 받은 곡이면 요청하지 않는다
    const full = await queryClient.fetchQuery<Song>({ queryKey: ['song', song.id], queryFn: () => songApi.get(song.id!), staleTime: Infinity }).catch(() => null);
    if (full?.explicit) return { previewUrl: null, appleMusicUrl: full.links?.appleMusic ?? null, adult: true };
    if (full?.previewUrl) return { previewUrl: full.previewUrl, appleMusicUrl: full.links?.appleMusic ?? null };
    if (full) s = { ...song, duration: full.duration, links: full.links };
  }
  const r = await findItunes(s.title, s.artist, { ...opts, duration: s.duration });
  return { ...r, appleMusicUrl: s.links?.appleMusic ?? r.appleMusicUrl };
}
