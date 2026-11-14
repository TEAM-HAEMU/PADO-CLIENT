/** React Query 훅 — 화면은 이 훅들만 쓴다 */
import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { commentApi, dropApi, likeApi, notificationApi, playlistApi, safetyApi, songApi, userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { CreateDropBody, LikedDrop, UUID } from '@/api/types';
import { useDropRadius } from '@/hooks/useDropRadius';
import { searchKm } from '@/utils/dropScope';
import { useAuth } from '@/store/auth';
import type { Coords } from '@/services/location';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';

const authed = () => useAuth.getState().status === 'authed';

export const qk = {
  // 약 100m 격자 — 걸을 때마다(15m) 키가 바뀌어 핀이 전부 다시 그려지지 않게
  nearby: (c: Coords | null) => ['nearby', c && Math.round(c.latitude * 1e3), c && Math.round(c.longitude * 1e3)] as const,
  drop: (id: UUID) => ['drop', id] as const,
  song: (id: UUID) => ['song', id] as const,
  likeCount: (id: UUID) => ['likeCount', id] as const,
  comments: (id: UUID) => ['comments', id] as const,
  /** 이 기기에서 누른 좋아요 결과 (서버 목록 myLikes보다 먼저 본다) */
  liked: (id: UUID) => ['liked', id] as const,
  myLikes: ['myLikes'] as const,
  myLikeCount: ['myLikeCount'] as const,
  myDrops: ['myDrops'] as const,
  me: ['me'] as const,
};

/**
 * 주변 드랍 — 범위는 서버가 운영자 보기 설정으로 고른다(가까운 순, 최대 500개).
 * 거리 모드는 표시 반경(km), 전국·같은 지역 모드는 넓은 값을 보낸다. 같은 지역 모드는 지역이 바뀌면 다시 받는다
 */
export function useNearbyDrops(coords: Coords | null) {
  const radius = useDropRadius();
  const km = searchKm(radius);
  return useQuery({ queryKey: [...qk.nearby(coords), km, radius.mode, radius.regionUnit, radius.region?.code ?? null], enabled: !!coords, queryFn: () => dropApi.nearby(coords!.latitude, coords!.longitude, km), refetchInterval: 120_000, placeholderData: keepPreviousData });
}

export const useDrop = (id: UUID | undefined) => useQuery({ queryKey: qk.drop(id ?? ''), enabled: !!id, queryFn: () => dropApi.get(id!) });
export const useSong = (id: UUID | undefined | null, opts: { keepPrevious?: boolean } = {}) => useQuery({ queryKey: qk.song(id ?? ''), enabled: !!id, queryFn: () => songApi.get(id!), staleTime: Infinity, placeholderData: opts.keepPrevious ? keepPreviousData : undefined });
// 명세: query 최대 100자
export const useSongSearch = (q: string) => useQuery({ queryKey: ['search', q.trim().slice(0, 100)], enabled: q.trim().length > 0, queryFn: () => songApi.search(q.trim().slice(0, 100)), staleTime: 5 * 60_000 });

export const useLikeCount = (id: UUID | undefined) => useQuery({ queryKey: qk.likeCount(id ?? ''), enabled: !!id && authed(), queryFn: () => likeApi.countForDrop(id!) });
/** 내가 누른 좋아요 수 (GET /likes/count/user) */
export const useMyLikeCount = () => useQuery({ queryKey: qk.myLikeCount, enabled: authed(), queryFn: likeApi.countMine });
export const useCommentCount = (id: UUID | undefined) => useQuery({ queryKey: ['commentCount', id], enabled: !!id && authed(), queryFn: () => commentApi.count(id!) });
export const useComments = (id: UUID | undefined) => useQuery({ queryKey: qk.comments(id ?? ''), enabled: !!id && authed(), queryFn: () => commentApi.list(id!) });

export const useMe = () => useQuery({ queryKey: qk.me, enabled: authed(), queryFn: userApi.me });
export const useMyDrops = () => useQuery({ queryKey: qk.myDrops, enabled: authed(), queryFn: userApi.myDrops });
export const useMyLikes = () => useQuery({ queryKey: qk.myLikes, enabled: authed(), queryFn: userApi.myLikes });
export const useAgreements = () => useQuery({ queryKey: ['agreements'], enabled: authed(), queryFn: userApi.agreements });
export const useBlocks = () => useQuery({ queryKey: ['blocks'], enabled: authed(), queryFn: safetyApi.blocks });

export const useNotifications = () => useQuery({ queryKey: ['notifications', 'list'], enabled: authed(), queryFn: () => notificationApi.list(50) });
export const useUnreadCount = () => useQuery({ queryKey: ['notifications', 'unread'], enabled: authed(), queryFn: notificationApi.unreadCount, refetchInterval: 120_000 });

export const useMyPlaylists = () => useQuery({ queryKey: ['playlists'], enabled: authed(), queryFn: playlistApi.mine });
export const usePlaylist = (id: UUID | undefined) => useQuery({ queryKey: ['playlist', id], enabled: !!id && authed(), queryFn: () => playlistApi.get(id!) });

/** 내가 이 드랍에 좋아요를 눌렀는지 — 방금 누른 결과(qk.liked)가 있으면 그것, 없으면 내 좋아요 목록. 둘 다 구독한다 */
export function useIsLiked(dropId: UUID | undefined) {
  const own = useQuery<boolean>({ queryKey: qk.liked(dropId ?? ''), queryFn: skipToken }).data;
  const myLikes = useMyLikes().data;
  if (!dropId) return false;
  return own ?? !!myLikes?.some(x => x.droppingId === dropId);
}
const likedNow = (qc: QueryClient, dropId: UUID) =>
  qc.getQueryData<boolean>(qk.liked(dropId)) ?? !!qc.getQueryData<LikedDrop[]>(qk.myLikes)?.some(x => x.droppingId === dropId);

// ── mutations
/**
 * 좋아요 토글 (POST /likes는 토글이라 두 번 나가면 원래대로 돌아간다)
 * - 누르는 즉시 하트·개수를 바꾸고(낙관적 반영), 실패하면 되돌린다
 * - 응답을 기다리는 동안 다시 누르면 무시한다 (toggle) — 연타로 좋아요가 취소되지 않게
 * - 오류 토스트·무효화가 훅 안에 있어 화면이 닫혀도 실행된다
 */
export function useToggleLike(dropId: UUID) {
  const qc = useQueryClient();
  const mutationKey = ['toggleLike', dropId];
  const m = useMutation({
    mutationKey,
    mutationFn: () => likeApi.toggle(dropId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.likeCount(dropId) });
      const was = likedNow(qc, dropId);
      const count = qc.getQueryData<number>(qk.likeCount(dropId));
      qc.setQueryData(qk.liked(dropId), !was);
      if (count !== undefined) qc.setQueryData(qk.likeCount(dropId), Math.max(0, count + (was ? -1 : 1)));
      return { was, count };
    },
    onError: (e, _v, ctx) => {
      if (ctx) {
        qc.setQueryData(qk.liked(dropId), ctx.was);
        if (ctx.count !== undefined) qc.setQueryData(qk.likeCount(dropId), ctx.count);
      }
      toast(errorMessage(e), 'error');
    },
    onSuccess: ({ liked }) => {
      track(liked ? 'drop_liked' : 'drop_unliked', { drop_id: dropId });
      qc.setQueryData(qk.liked(dropId), liked);
    },
    // 서버 값으로 다시 맞춘다
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.likeCount(dropId) });
      qc.invalidateQueries({ queryKey: qk.myLikes });
      qc.invalidateQueries({ queryKey: qk.myLikeCount });
    },
  });
  /** 누를 때 부른다 — 진행 중이면 무시 (렌더를 기다리지 않고 캐시의 진행 상태를 바로 본다) */
  const toggle = () => {
    if (!dropId || qc.isMutating({ mutationKey }) > 0) return;
    m.mutate();
  };
  return { ...m, toggle };
}

/** 드랍을 지운 뒤 낡는 목록 — 주변·내 드랍·좋아요(내가 좋아요한 내 드랍)·상세 */
export function invalidateAfterDropRemoved(qc: QueryClient, dropId: UUID) {
  for (const queryKey of [['nearby'], qk.myDrops, qk.myLikes, qk.myLikeCount]) qc.invalidateQueries({ queryKey });
  qc.removeQueries({ queryKey: qk.drop(dropId) });
}

/** 사용자를 차단한 뒤 낡는 목록 — 그 사람의 드랍·댓글이 바로 사라지게 (어느 드랍이 그 사람 것인지 몰라 상세는 전부) */
export function invalidateAfterBlock(qc: QueryClient) {
  for (const queryKey of [['nearby'], ['comments'], ['commentCount'], ['blocks'], ['drop'], qk.myLikes, qk.myLikeCount]) qc.invalidateQueries({ queryKey });
}

/** 드랍 만들기 요청 — 화면과 무관하게 진행 중인지 보려고 (qc.isMutating·useIsMutating) */
export const CREATE_DROP_KEY = ['createDrop'];
export function useCreateDrop() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CREATE_DROP_KEY,
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
