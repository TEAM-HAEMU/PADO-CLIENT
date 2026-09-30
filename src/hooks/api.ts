/** React Query 훅 — 화면은 이 훅들만 쓴다 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commentApi, dropApi, likeApi, notificationApi, playlistApi, safetyApi, songApi, userApi } from '@/api/endpoints';
import type { CreateDropBody, UUID } from '@/api/types';
import { NEARBY_RADIUS_KM } from '@/config';
import { useAuth } from '@/store/auth';
import type { Coords } from '@/services/location';

const authed = () => useAuth.getState().status === 'authed';

export const qk = {
  // 약 100m 격자 — 걸을 때마다(15m) 키가 바뀌어 핀이 전부 다시 그려지지 않게
  nearby: (c: Coords | null) => ['nearby', c && Math.round(c.latitude * 1e3), c && Math.round(c.longitude * 1e3)] as const,
  drop: (id: UUID) => ['drop', id] as const,
  song: (id: UUID) => ['song', id] as const,
  likeCount: (id: UUID) => ['likeCount', id] as const,
  comments: (id: UUID) => ['comments', id] as const,
  me: ['me'] as const,
};

export const useNearbyDrops = (coords: Coords | null) =>
  useQuery({ queryKey: qk.nearby(coords), enabled: !!coords, queryFn: () => dropApi.nearby(coords!.latitude, coords!.longitude, NEARBY_RADIUS_KM), refetchInterval: 120_000, placeholderData: keepPreviousData });

export const useDrop = (id: UUID | undefined) => useQuery({ queryKey: qk.drop(id ?? ''), enabled: !!id, queryFn: () => dropApi.get(id!) });
export const useSong = (id: UUID | undefined | null, opts: { keepPrevious?: boolean } = {}) => useQuery({ queryKey: qk.song(id ?? ''), enabled: !!id, queryFn: () => songApi.get(id!), staleTime: Infinity, placeholderData: opts.keepPrevious ? keepPreviousData : undefined });
// 명세: query 최대 100자
export const useSongSearch = (q: string) => useQuery({ queryKey: ['search', q.trim().slice(0, 100)], enabled: q.trim().length > 0, queryFn: () => songApi.search(q.trim().slice(0, 100)), staleTime: 5 * 60_000 });

export const useLikeCount = (id: UUID | undefined) => useQuery({ queryKey: qk.likeCount(id ?? ''), enabled: !!id && authed(), queryFn: () => likeApi.countForDrop(id!) });
/** 내가 누른 좋아요 수 (GET /likes/count/user) */
export const useMyLikeCount = () => useQuery({ queryKey: ['myLikeCount'], enabled: authed(), queryFn: likeApi.countMine });
export const useCommentCount = (id: UUID | undefined) => useQuery({ queryKey: ['commentCount', id], enabled: !!id && authed(), queryFn: () => commentApi.count(id!) });
export const useComments = (id: UUID | undefined) => useQuery({ queryKey: qk.comments(id ?? ''), enabled: !!id && authed(), queryFn: () => commentApi.list(id!) });

export const useMe = () => useQuery({ queryKey: qk.me, enabled: authed(), queryFn: userApi.me });
export const useMyDrops = () => useQuery({ queryKey: ['myDrops'], enabled: authed(), queryFn: userApi.myDrops });
export const useMyLikes = () => useQuery({ queryKey: ['myLikes'], enabled: authed(), queryFn: userApi.myLikes });
export const useAgreements = () => useQuery({ queryKey: ['agreements'], enabled: authed(), queryFn: userApi.agreements });
export const useBlocks = () => useQuery({ queryKey: ['blocks'], enabled: authed(), queryFn: safetyApi.blocks });

export const useNotifications = () => useQuery({ queryKey: ['notifications', 'list'], enabled: authed(), queryFn: () => notificationApi.list(50) });
export const useUnreadCount = () => useQuery({ queryKey: ['notifications', 'unread'], enabled: authed(), queryFn: notificationApi.unreadCount, refetchInterval: 120_000 });

export const useMyPlaylists = () => useQuery({ queryKey: ['playlists'], enabled: authed(), queryFn: playlistApi.mine });
export const usePlaylist = (id: UUID | undefined) => useQuery({ queryKey: ['playlist', id], enabled: !!id && authed(), queryFn: () => playlistApi.get(id!) });

// ── mutations
export function useToggleLike(dropId: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => likeApi.toggle(dropId),
    onSuccess: ({ liked }) => {
      // 이미 받아둔 수가 있을 때만 즉시 반영하고, 서버 값으로 다시 맞춘다
      qc.setQueryData<number>(qk.likeCount(dropId), n => (n === undefined ? n : Math.max(0, n + (liked ? 1 : -1))));
      qc.invalidateQueries({ queryKey: qk.likeCount(dropId) });
      qc.setQueryData(['liked', dropId], liked);
      qc.invalidateQueries({ queryKey: ['myLikes'] });
      qc.invalidateQueries({ queryKey: ['myLikeCount'] });
    },
  });
}

export function useCreateDrop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDropBody) => dropApi.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nearby'] }); qc.invalidateQueries({ queryKey: ['myDrops'] }); },
  });
}

/** 내 드랍인지 — 상세 응답엔 isMyDropping이 없어서 주변 목록 + 내 드랍 목록(/users/my-drop)으로 판단 */
export function useIsMyDrop(dropId: UUID | undefined) {
  const qc = useQueryClient();
  const mine = useMyDrops().data;
  if (!dropId) return false;
  const nearby = qc.getQueriesData<{ droppingId: string; isMyDropping: boolean }[]>({ queryKey: ['nearby'] }).flatMap(([, v]) => v ?? []);
  return !!nearby.find(x => x.droppingId === dropId)?.isMyDropping || !!mine?.some(d => d.droppingId === dropId);
}

/** 드랍 주소 — MUSIC 상세 응답엔 address가 없어서, 캐시된 목록(주변·내 드랍·좋아요)에서 찾는다 */
export function useDropAddress(dropId: UUID | undefined, fromDetail?: string | null) {
  const qc = useQueryClient();
  useMyDrops();
  if (fromDetail) return fromDetail;
  if (!dropId) return undefined;
  for (const key of [['nearby'], ['myDrops'], ['myLikes']]) {
    const hit = qc.getQueriesData<{ droppingId: string; address?: string }[]>({ queryKey: key }).flatMap(([, v]) => (Array.isArray(v) ? v : [])).find(x => x.droppingId === dropId && x.address);
    if (hit?.address) return hit.address;
  }
  return undefined;
}
