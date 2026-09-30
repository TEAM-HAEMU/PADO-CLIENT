/**
 * 외부 음악 앱으로 넘기기 (앱은 오디오를 직접 스트리밍하지 않는다 — 30초 미리듣기 제외).
 * 네이티브 스킴(앱 설치 시) → https 유니버설 링크 → 검색 페이지 순으로 시도.
 */
import { Linking } from 'react-native';
import type { Song } from '@/api/types';
import type { ServiceId } from '@/store/prefs';
import { findItunes } from './itunes';

export const SERVICES: Record<ServiceId, { label: string }> = {
  spotify: { label: 'Spotify' },
  youtubeMusic: { label: 'YouTube Music' },
  appleMusic: { label: 'Apple Music' },
};

type SongLike = Pick<Song, 'title' | 'artist'> & { links?: Song['links'] | null };

const spotifyId = (url?: string | null) => url?.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/)?.[1];
const youtubeId = (url?: string | null) => url?.match(/[?&]v=([\w-]{6,})/)?.[1];

/** 순수 함수 — 서비스별 시도할 URL 후보 (테스트 대상) */
export function candidateUrls(service: ServiceId, song: SongLike, appleMusicUrl?: string | null): string[] {
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  if (service === 'spotify') {
    const id = spotifyId(song.links?.spotify);
    return id ? [`spotify:track:${id}`, `https://open.spotify.com/track/${id}`] : [`spotify:search:${q}`, `https://open.spotify.com/search/${q}`];
  }
  if (service === 'youtubeMusic') {
    const id = youtubeId(song.links?.youtubeMusic);
    // 모바일 웹의 music.youtube.com은 재생 대신 Premium 가입 페이지로 보내므로 https 폴백은 youtube.com
    return id ? [`youtubemusic://watch?v=${id}`, `https://www.youtube.com/watch?v=${id}`] : [`https://music.youtube.com/search?q=${q}`];
  }
  if (appleMusicUrl) return [appleMusicUrl.replace(/^https:/, 'music:'), appleMusicUrl];
  return [`https://music.apple.com/search?term=${q}`];
}

export async function openInService(service: ServiceId, song: SongLike): Promise<boolean> {
  const apple = service === 'appleMusic' ? (await findItunes(song.title, song.artist)).appleMusicUrl : null;
  for (const url of candidateUrls(service, song, apple)) {
    try {
      // 스킴은 canOpenURL이 거짓 음성을 내는 경우가 있어 바로 열어보고 실패 시 다음 후보
      await Linking.openURL(url);
      return true;
    } catch {}
  }
  return false;
}
