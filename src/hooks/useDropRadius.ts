/**
 * 드랍 보기 설정 (운영자가 어드민에서 관리) — 보기 모드(거리 / 같은 지역)·표시 반경·재생 반경·내가 있는 지역.
 * 받은 값은 kv에 저장. 서버에 아직 없거나 못 받으면 지난번 값, 그것도 없으면 기본값(거리 5km / 500m)으로 — 절대 막히지 않게.
 * 다시 묻는 때: 10분마다(모드가 바뀌었을 수 있음), 같은 지역 모드에서는 1km 넘게 움직였을 때도(지역이 바뀌었을 수 있음).
 * 위치는 주소가 아니라 좌표로 보낸다(서버가 행정구역을 판정).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/api/endpoints';
import type { DropRadius } from '@/api/types';
import { useLocation } from '@/services/location';
import { kv } from '@/store/storage';
import { DEFAULT_RADIUS, nextAnchor, sanitizeRadius } from '@/utils/dropScope';
import type { Coords } from '@/utils/geo';

export { DEFAULT_RADIUS, sanitizeRadius } from '@/utils/dropScope';

const KEY = 'settings:dropRadius';

export const cachedRadius = () => sanitizeRadius(kv.get<unknown>(KEY, null));

async function fetchRadius(at: Coords | null) {
  const r = sanitizeRadius(await settingsApi.dropRadius(at));
  if (!r) throw new Error('bad drop radius');
  kv.set(KEY, r);
  return r;
}

/** 앱 전체가 같이 쓰는 기준 좌표 — 위치가 1km 넘게 바뀔 때만 새 객체 */
let anchor: Coords | null = null;
const anchorOf = (c: Coords | null) => (anchor = nextAnchor(anchor, c));

export function useDropRadius(): DropRadius {
  const at = useLocation(s => anchorOf(s.coords));
  const known = cachedRadius();
  // 거리 모드면 좌표가 결과를 바꾸지 않으니 위치가 바뀌어도 다시 묻지 않는다 (좌표는 있으면 같이 보낸다)
  const regionMode = known?.mode === 'REGION';
  const q = useQuery({
    queryKey: ['dropRadius', regionMode && at ? `${at.latitude.toFixed(3)},${at.longitude.toFixed(3)}` : 'any'],
    queryFn: () => fetchRadius(at),
    // 저장해 둔 값으로 바로 시작하되 (initialDataUpdatedAt 0 → 곧바로 새로 받음) 받기 실패해도 그 값을 그대로 쓴다
    initialData: () => cachedRadius() ?? undefined,
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    gcTime: Infinity,
    retry: 1,
  });
  return q.data ?? DEFAULT_RADIUS;
}
