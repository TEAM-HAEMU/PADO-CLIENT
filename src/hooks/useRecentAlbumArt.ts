/**
 * 드랍 종류 화면 예시 그림용 최근 드랍 앨범 이미지 — 앱 실행 중 한 번 정도 (staleTime 1시간, 화면을 열 때마다 부르지 않음).
 * 받으면 바로 Image.prefetch로 받아 둬서 화면을 열 때 예시 그림 위에 곧장 그려진다. 실패하면 예시 그림 그대로.
 */
import { AppState, Image } from 'react-native';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { dropApi } from '@/api/endpoints';
import { albumSlots } from '@/utils/albumSlots';
import { artUrl } from '@/utils/artUrl';

const HOUR = 60 * 60 * 1000;
/** 가장 큰 자리(음악 원판) 크기 — 300px 판본이면 충분 */
const ART_SIZE = 56;

const EMPTY: (string | null)[] = albumSlots([]);

export const recentAlbumArtQuery = {
  queryKey: ['recentAlbumImages'] as const,
  queryFn: async () => {
    const slots = albumSlots(await dropApi.recentAlbumImages()).map(u => (u ? artUrl(u, ART_SIZE) ?? u : null));
    slots.forEach(u => { if (u && u.startsWith('https://')) Image.prefetch(u).catch(() => false); });
    return slots;
  },
  staleTime: HOUR,
  gcTime: Infinity,
  // 실패(아직 배포 전 404 등)했으면 화면을 열 때마다 다시 부르지 않는다 — 앱이 앞으로 돌아올 때 prefetch가 다시 시도
  retryOnMount: false,
};

let started = false;
/** App 시작 때 — 조금 뒤에 미리 받아 두고, 앞으로 돌아올 때 1시간이 지났으면 다시 */
export function startRecentAlbumArtPrefetch(qc: QueryClient) {
  if (started) return;
  started = true;
  setTimeout(() => qc.prefetchQuery(recentAlbumArtQuery), 3000);
  AppState.addEventListener('change', s => { if (s === 'active') qc.prefetchQuery(recentAlbumArtQuery); });
}

/** 9자리 (없는 자리는 null → 예시 그림) */
export function useRecentAlbumArt(): (string | null)[] {
  return useQuery(recentAlbumArtQuery).data ?? EMPTY;
}
