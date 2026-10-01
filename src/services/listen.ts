/**
 * '전체 듣기' — 미리듣기가 마음에 들면 고른 음악 앱(Spotify·Apple Music·YouTube Music)으로 딥링크.
 * 기본 재생 앱이 없으면 재생 앱 선택 시트를 띄운다.
 */
import { navigationRef } from '@/navigation/ref';
import type { ServiceId } from '@/store/prefs';
import { toast } from '@/store/toast';
import { openInService, SERVICES } from './musicLinks';
import { track } from '@/services/analytics';

type SongForListen = { id: string; title: string; artist: string; links?: { spotify: string | null; youtubeMusic: string | null } | null };

export async function listenFull(service: ServiceId | null, song: SongForListen): Promise<void> {
  track('full_listen_clicked', { service: service ?? 'ask', song_id: song.id, title: song.title, artist: song.artist });
  if (!service) {
    if (navigationRef.isReady()) navigationRef.navigate('ServicePicker', { song: song as never });
    return;
  }
  if (!(await openInService(service, song))) toast(`${SERVICES[service].label}을(를) 열 수 없어요.`, 'error');
}

/** 버튼 문구 */
export const listenLabel = (service: ServiceId | null) => (service ? `${SERVICES[service].label}에서 전체 듣기` : '전체 듣기');
