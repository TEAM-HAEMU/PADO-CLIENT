/** 재생 반경 잠금 판정 — 지금 위치·운영자 재생 반경·내 드랍·좋아요한 드랍(['myLikes'])을 묶어 드랍마다 잠금 여부를 돌려준다 */
import { useCallback, useMemo } from 'react';
import { useMyDrops, useMyLikes } from '@/hooks/api';
import { useDropRadius } from '@/hooks/useDropRadius';
import { useLocation } from '@/services/location';
import { dropLock, type LockTarget } from '@/utils/dropLock';

export function useDropLock() {
  const coords = useLocation(s => s.coords);
  const { playMeters } = useDropRadius();
  const likes = useMyLikes().data;
  const mine = useMyDrops().data;
  const open = useMemo(() => new Set([...(likes ?? []).map(l => l.droppingId), ...(mine ?? []).map(d => d.droppingId)]), [likes, mine]);
  return useCallback((d: LockTarget) => dropLock(d, coords, playMeters, open), [coords, playMeters, open]);
}
