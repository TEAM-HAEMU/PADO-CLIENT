/**
 * 드랍 상세 화면(음악 미리보기·투표·플리·재생)의 재생 반경 잠금 — 링크·푸시로 바로 열어도 지도와 같은 규칙 (utils/openedDropLock).
 * 잠기면 화면은 잠금 안내만 보여 주고 미리듣기·투표를 막는다. 잠금 판정을 한 번 세면(drop_locked_tap) 같은 화면에선 다시 세지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { DropDetail, DropSummary, RegionCodes } from '@/api/types';
import { useMyDrops, useMyLikes, useNearbyDrops } from '@/hooks/api';
import { useDropRadius } from '@/hooks/useDropRadius';
import { lockJudged, useDropLock } from '@/hooks/useDropLock';
import type { DropOpenSource } from '@/navigation/types';
import { track } from '@/services/analytics';
import { currentCoords, useLocation } from '@/services/location';
import { useAuth } from '@/store/auth';
import type { LockTarget } from '@/utils/dropLock';
import { playRegionOf } from '@/utils/dropScope';
import { beforeDetail, nearbyFreshness, openedDropLock, type OpenedLock } from '@/utils/openedDropLock';

/** 상세 응답에 있지만 타입엔 없는 필드 (작성자 묶음의 isMyDropping, 지역 코드) */
type DetailExtra = { isMyDropping?: boolean; regionCodes?: RegionCodes | null; latitude?: number; longitude?: number };

/**
 * detailFailed: 드랍 상세 요청이 실패함(없는 드랍·네트워크) — 그러면 기다리지 않고 unavailable을 돌려준다.
 * 상세가 있어야 내용을 그리는 화면(미리보기·투표·플리)은 그대로 오류와 다시 시도를, 재생 화면은 드랍 없이 곡만 보여 준다
 */
export function useOpenedDropLock(dropId: string | undefined, detail: DropDetail | null | undefined, source?: DropOpenSource, detailFailed = false): OpenedLock {
  const qc = useQueryClient();
  const lockOf = useDropLock();
  const radius = useDropRadius();
  const authed = useAuth(s => s.status === 'authed');
  const likes = useMyLikes();
  const mine = useMyDrops();
  // 링크로 바로 열면 지도 위치 감시가 아직 안 붙었을 수 있다 — 이 화면도 붙잡는다 (감시는 앱 전체에 하나)
  useEffect(() => (dropId ? useLocation.getState().start() : undefined), [dropId]);
  const coords = useLocation(currentCoords);
  const accuracy = useLocation(s => s.accuracy);
  const locating = useLocation(s => s.fix === 'locating');

  const x = (detail ?? undefined) as (DropDetail & DetailExtra) | undefined;
  const cached = dropId
    ? [['nearby'], ['myDrops']].flatMap(key => qc.getQueriesData<DropSummary[]>({ queryKey: key }).flatMap(([, v]) => (Array.isArray(v) ? v : []))).find(d => d.droppingId === dropId)
    : undefined;
  const target: LockTarget | null = dropId && x && typeof x.latitude === 'number' && typeof x.longitude === 'number'
    ? { droppingId: dropId, latitude: x.latitude, longitude: x.longitude, isMyDropping: x.isMyDropping, regionCodes: x.regionCodes ?? cached?.regionCodes }
    : cached ?? null;

  // 좌표를 모르는 드랍만 — 지금 위치의 주변 목록을 이 화면을 연 뒤 새로 받아 본다 (방금 생긴 드랍이 2분 묵은 목록에 없어 잠기지 않게).
  // 주변 목록을 따로 받지 않고 지도가 쓰는 목록(지금 쓰이는 ['nearby'] 쿼리)을 다시 받게 한다 — 키를 어떻게 만들든(격자·받은 중심) 지도와 같은 캐시.
  // 지도가 아직 목록을 쓰지 않을 때만(위치를 늦게 받음 등) 이 화면이 직접 받는다
  const openedAt = useRef(Date.now());
  const needNearby = !!detail && !target && !!coords;
  const asked = useRef(false);
  const [ownFetch, setOwnFetch] = useState(false);
  useEffect(() => {
    if (!needNearby || asked.current) return;
    asked.current = true;
    if (qc.getQueryCache().findAll({ queryKey: ['nearby'], type: 'active' }).length) qc.refetchQueries({ queryKey: ['nearby'], type: 'active' });
    else setOwnFetch(true);
  }, [needNearby, qc]);
  const ownQ = useNearbyDrops(needNearby && ownFetch ? coords : null);
  const ownSettled = ownQ.isSuccess && !ownQ.isPlaceholderData && !ownQ.isFetching;
  const ownRefetch = ownQ.refetch;
  useEffect(() => {
    // 30초 안에 받아 둔 같은 목록이면 자동으로 다시 받지 않으므로 한 번 새로 받는다
    if (ownFetch && ownSettled && ownQ.dataUpdatedAt < openedAt.current) ownRefetch();
  }, [ownFetch, ownSettled, ownQ.dataUpdatedAt, ownRefetch]);
  useIsFetching({ queryKey: ['nearby'] }); // 받는 중 → 끝남이 바뀔 때 다시 그려 결과를 본다
  const nearby = nearbyFreshness(qc.getQueryCache().findAll({ queryKey: ['nearby'] }).map(q => q.state), asked.current, openedAt.current);

  const exempt = !!x?.isMyDropping || !!cached?.isMyDropping
    || !!dropId && (!!likes.data?.some(l => l.droppingId === dropId) || !!mine.data?.some(d => d.droppingId === dropId));
  const state: OpenedLock = !dropId || !detail
    ? beforeDetail(dropId, detail, detailFailed)
    : openedDropLock({
        exempt,
        exemptLoading: authed && (likes.isPending || mine.isPending),
        target,
        regionCodes: x?.regionCodes,
        here: coords ? { ...coords, accuracy } : null,
        locating,
        judged: lockJudged(dropId),
        nearby,
        playMeters: radius.playMeters,
        region: playRegionOf(radius),
        judge: lockOf,
      });

  const counted = useRef<string | null>(null);
  const locked = state.status === 'locked' ? state.lock : null;
  useEffect(() => {
    if (!locked || !dropId || counted.current === dropId) return;
    counted.current = dropId;
    track('drop_locked_tap', { drop_id: dropId, type: cached?.type, source: source ?? 'link', remaining_m: locked.remainingM == null ? null : Math.round(locked.remainingM) });
  }, [locked, dropId, source, cached?.type]);
  return state;
}
