/** React Query 훅 — 화면은 이 훅들만 쓴다 */
import { useRef } from 'react';
import { keepPreviousData, skipToken, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { commentApi, dropApi, likeApi, notificationApi, playlistApi, safetyApi, songApi, userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { CreateDropBody, DropSummary, LikedDrop, UUID } from '@/api/types';
import { useDropRadius } from '@/hooks/useDropRadius';
import { searchKm } from '@/utils/dropScope';
import { coveredMeters, nextNearbyCenter } from '@/utils/nearbyArea';
import { dropPlace, type DropPlaceFields } from '@/utils/address';
import { useAuth } from '@/store/auth';
import type { Coords } from '@/services/location';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';
import { clampText } from '@/utils/text';

const authed = () => useAuth.getState().status === 'authed';

export const qk = {
  /** 받은 자리(중심) — 위치마다가 아니라 받은 영역을 벗어날 때만 바뀐다 (useNearbyDrops·utils/nearbyArea) */
  nearby: (c: Coords | null) => ['nearby', c?.latitude ?? null, c?.longitude ?? null] as const,
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
/** 좋아요 토글 진행 중인지 보는 키 (useToggleLike) */
const toggleLikeKey = (dropId: UUID) => ['toggleLike', dropId];

/**
 * 주변 드랍 — 범위는 서버가 운영자 보기 설정으로 고른다(가까운 순, 최대 500개).
 * 거리 모드는 표시 반경(km), 전국·같은 지역 모드는 넓은 값을 보낸다. 같은 지역 모드는 지역이 바뀌면 다시 받는다.
 * 받은 영역 안에서 움직이는 동안은 같은 중심 그대로 — 반경의 1/10(5km면 500m)을 넘게 움직이면 지금 자리로 다시 받는다 (utils/nearbyArea).
 * 새로 생긴 남의 드랍은 2분마다 같은 중심으로 다시 받을 때 들어온다 (서 있을 때와 같은 신선도)
 */
export function useNearbyDrops(coords: Coords | null) {
  const qc = useQueryClient();
  const radius = useDropRadius();
  const km = searchKm(radius);
  const scope = [km, radius.mode, radius.regionUnit, radius.region?.code ?? null] as const;
  // 같은 입력이면 같은 결과라 렌더 중에 바꿔도 된다 (버려진 렌더가 있어도 다음 렌더가 같은 중심을 고른다)
  const center = useRef<Coords | null>(null);
  const prev = center.current;
  const covered = prev ? coveredMeters(prev, qc.getQueryData<DropSummary[]>([...qk.nearby(prev), ...scope]), km) : km * 1000;
  const at = (center.current = nextNearbyCenter(prev, coords, covered));
  return useQuery({ queryKey: [...qk.nearby(at), ...scope], enabled: !!at, queryFn: () => dropApi.nearby(at!.latitude, at!.longitude, km), refetchInterval: 120_000, placeholderData: keepPreviousData });
}

export const useDrop = (id: UUID | undefined) => useQuery({ queryKey: qk.drop(id ?? ''), enabled: !!id, queryFn: () => dropApi.get(id!) });
export const useSong = (id: UUID | undefined | null, opts: { keepPrevious?: boolean } = {}) => useQuery({ queryKey: qk.song(id ?? ''), enabled: !!id, queryFn: () => songApi.get(id!), staleTime: Infinity, placeholderData: opts.keepPrevious ? keepPreviousData : undefined });
// 명세: query 최대 100자
export const useSongSearch = (q: string) => useQuery({ queryKey: ['search', clampText(q.trim(), 100)], enabled: q.trim().length > 0, queryFn: () => songApi.search(clampText(q.trim(), 100)), staleTime: 5 * 60_000 });

export const useLikeCount = (id: UUID | undefined) => useQuery({ queryKey: qk.likeCount(id ?? ''), enabled: !!id && authed(), queryFn: () => likeApi.countForDrop(id!) });
/** 내가 누른 좋아요 수 (GET /likes/count/user) */
export const useMyLikeCount = () => useQuery({ queryKey: qk.myLikeCount, enabled: authed(), queryFn: likeApi.countMine, staleTime: USER_DATA_STALE });
export const useCommentCount = (id: UUID | undefined) => useQuery({ queryKey: ['commentCount', id], enabled: !!id && authed(), queryFn: () => commentApi.count(id!) });
export const useComments = (id: UUID | undefined) => useQuery({ queryKey: qk.comments(id ?? ''), enabled: !!id && authed(), queryFn: () => commentApi.list(id!) });

/**
 * 내 정보 — 내가 바꿀 때만 바뀌고(바꾸는 곳마다 무효화가 있다) 남이 바꾸지 않는 것들. 10분 동안은 새로 마운트돼도 다시 받지 않는다.
 * (미리보기 시트·재생 화면처럼 이 훅을 새로 마운트하는 화면을 열 때마다 목록을 다시 받던 것.) 오래 백그라운드에 있다 돌아오면 다시 받는다
 */
export const USER_DATA_STALE = 10 * 60_000;
export const useMe = () => useQuery({ queryKey: qk.me, enabled: authed(), queryFn: userApi.me, staleTime: USER_DATA_STALE });
/**
 * 내 드랍 목록에 온 좋아요 수를 드랍별 좋아요 수 캐시(qk.likeCount)에 넣는다 — 프로필 숫자와 상세 화면이 따로 묻지 않고 같은 숫자를 바로 보게.
 * 좋아요를 누르는 중인 드랍은 건너뛴다 (낙관적으로 바꾼 숫자를 응답 전에 받은 옛 값으로 덮지 않게 — 끝나면 useToggleLike가 다시 맞춘다)
 */
export function seedLikeCounts(qc: QueryClient, drops: readonly DropSummary[]) {
  for (const d of drops) {
    if (typeof d.likeCount !== 'number' || qc.isMutating({ mutationKey: toggleLikeKey(d.droppingId) }) > 0) continue;
    qc.setQueryData(qk.likeCount(d.droppingId), d.likeCount);
  }
}
export function useMyDrops() {
  const qc = useQueryClient();
  return useQuery({ queryKey: qk.myDrops, enabled: authed(), queryFn: async () => { const drops = await userApi.myDrops(); seedLikeCounts(qc, drops); return drops; }, staleTime: USER_DATA_STALE });
}
export const useMyLikes = () => useQuery({ queryKey: qk.myLikes, enabled: authed(), queryFn: userApi.myLikes, staleTime: USER_DATA_STALE });
export const useAgreements = () => useQuery({ queryKey: ['agreements'], enabled: authed(), queryFn: userApi.agreements, staleTime: USER_DATA_STALE });
export const useBlocks = () => useQuery({ queryKey: ['blocks'], enabled: authed(), queryFn: safetyApi.blocks, staleTime: USER_DATA_STALE });

export const useNotifications = () => useQuery({ queryKey: ['notifications', 'list'], enabled: authed(), queryFn: () => notificationApi.list(50) });
export const useUnreadCount = () => useQuery({ queryKey: ['notifications', 'unread'], enabled: authed(), queryFn: notificationApi.unreadCount, refetchInterval: 120_000 });

export const useMyPlaylists = () => useQuery({ queryKey: ['playlists'], enabled: authed(), queryFn: playlistApi.mine });
export const usePlaylist = (id: UUID | undefined) => useQuery({ queryKey: ['playlist', id], enabled: !!id && authed(), queryFn: () => playlistApi.get(id!) });
/**
 * 플리 카드용 상세 여러 개 (플리 탭·플리 드랍 만들기) — 목록 응답(/playlists/my)에 곡 수·커버 4장이 없어 플리마다 상세를 받는다.
 * 곡 담기·빼기·이름 변경은 모두 ['playlist', id]를 무효화하므로 신선도를 길게 잡아, 탭을 오가거나 앱에 돌아올 때마다 전부 다시 받지 않는다.
 * enabled는 화면이 보일 때만 — 늘 마운트된 탭이 다른 화면에 있는 동안 받지 않게. 꺼져 있어도 캐시된 값은 그대로 보인다
 */
export const PLAYLIST_CARD_STALE = 10 * 60_000;
export const usePlaylistDetails = (ids: UUID[], enabled: boolean) =>
  useQueries({ queries: ids.map(id => ({ queryKey: ['playlist', id], enabled: enabled && authed(), queryFn: () => playlistApi.get(id), staleTime: PLAYLIST_CARD_STALE })) });

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
  const mutationKey = toggleLikeKey(dropId);
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

/**
 * 드랍 자리 표시 — 장소 이름(placeName)이 있으면 그것, 없으면 주소 (utils/address dropPlace).
 * MUSIC 상세 응답엔 address가 없어서 캐시된 목록(주변·내 드랍·좋아요)에서도 찾는다 — 상세가 먼저, 장소 이름이 주소보다 먼저
 */
export function useDropPlace(dropId: UUID | undefined, detail?: DropPlaceFields | null) {
  const qc = useQueryClient();
  useMyDrops();
  const cached = dropId
    ? [['nearby'], ['myDrops'], ['myLikes']].flatMap(key =>
        qc.getQueriesData<(DropPlaceFields & { droppingId: string })[]>({ queryKey: key }).flatMap(([, v]) => (Array.isArray(v) ? v : [])).filter(x => x?.droppingId === dropId))
    : [];
  return dropPlace(detail, ...cached) || undefined;
}
