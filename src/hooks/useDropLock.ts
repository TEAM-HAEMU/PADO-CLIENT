/** 재생 반경 잠금 판정 — 지금 위치(낡은 좌표는 빼고, 오차 포함)·운영자 재생 반경·재생 기준이 같은 지역이면 내 지역·내 드랍·좋아요한 드랍(['myLikes'])을 묶어 드랍마다 잠금 여부를 돌려준다 */
import { useCallback, useMemo } from 'react';
import { useMyDrops, useMyLikes } from '@/hooks/api';
import { useDropRadius } from '@/hooks/useDropRadius';
import { currentCoords, useLocation } from '@/services/location';
import { lockJudge, type LockTarget } from '@/utils/dropLock';
import { playRegionOf } from '@/utils/dropScope';

/** 드랍마다 지난 판정(열려 있던 드랍·마지막 잠금 여부) — 앱 전체에서 같이 쓴다 (앱을 켜 둔 동안만 기억) */
const judge = lockJudge();

export function useDropLock() {
  const coords = useLocation(currentCoords);
  const accuracy = useLocation(s => s.accuracy);
  // 값이 같으면 같은 객체 — 같은 좌표·오차로 위치가 다시 와도(새 객체) 판정 함수가 새로 생겨 지도 화면의 거리순 목록·핀을 다시 계산하지 않게
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  const here = useMemo(() => (lat != null && lng != null ? { latitude: lat, longitude: lng, accuracy } : null), [lat, lng, accuracy]);
  // 낡은 좌표를 들고 새 위치를 기다리는 중(백그라운드에서 오래 있다 돌아옴) — 그동안은 지난 판정을 유지
  const awaiting = useLocation(s => s.stale && s.fix === 'locating');
  const radius = useDropRadius();
  const { playMeters } = radius;
  const region = playRegionOf(radius);
  const likes = useMyLikes().data;
  const mine = useMyDrops().data;
  const open = useMemo(() => new Set([...(likes ?? []).map(l => l.droppingId), ...(mine ?? []).map(d => d.droppingId)]), [likes, mine]);
  return useCallback((d: LockTarget) => judge(d, here, playMeters, open, awaiting, region), [here, playMeters, open, awaiting, region]);
}
