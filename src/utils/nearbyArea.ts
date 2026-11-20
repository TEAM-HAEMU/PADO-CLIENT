/**
 * 주변 드랍을 어디를 중심으로 받았는가 — 받은 영역 안에서 움직이면 다시 받지 않는다. 네이티브 의존 없음 (jest에서 바로 시험)
 *
 * 받은 영역: 검색 반경. 단 서버 상한(가까운 순 NEARBY_CAP개)에 닿았으면 받은 드랍 중 가장 먼 거리까지만 받은 셈이다.
 * 그 반경의 1/10(50m~1km)을 넘게 움직이면 지금 자리를 새 중심으로 다시 받는다.
 * 그 안에서 움직이는 동안에도 지금 자리에서 (받은 반경 − 움직인 거리) 안의 드랍은 모두 받아 둔 상태다 —
 * 표시 반경 5km면 500m마다(걸으면 약 6분, 차로 시속 50km면 약 36초). 새 드랍은 2분마다 같은 중심으로 다시 받아 들어온다
 */
import { distanceM, type Coords } from '@/utils/geo';

/** 서버가 한 번에 주는 최대 수 (가까운 순) */
export const NEARBY_CAP = 500;
/** 다시 받을 만큼 움직인 거리 — 받은 반경의 1/10, 이 범위 안 */
export const NEARBY_MOVE_MIN_M = 50;
export const NEARBY_MOVE_MAX_M = 1000;

/** 받은 반경(m) — 상한에 닿지 않았으면 검색 반경 전체, 닿았으면 받은 드랍 중 가장 먼 거리 */
export function coveredMeters(center: Coords, drops: readonly Coords[] | undefined, searchKm: number) {
  const full = searchKm * 1000;
  if (!drops || drops.length < NEARBY_CAP) return full;
  let far = 0;
  for (const d of drops) far = Math.max(far, distanceM(center, d));
  return Math.min(full, far);
}

/** 이만큼 움직이면 다시 받는다 */
export const refetchMoveMeters = (coveredM: number) => Math.min(NEARBY_MOVE_MAX_M, Math.max(NEARBY_MOVE_MIN_M, coveredM / 10));

/** 다음 중심 — 처음이거나 받은 영역 기준으로 많이 움직였으면 지금 자리, 아니면 그대로(같은 객체) */
export function nextNearbyCenter(prev: Coords | null, here: Coords | null, coveredM: number): Coords | null {
  if (!here) return prev;
  if (!prev || distanceM(prev, here) > refetchMoveMeters(coveredM)) return { latitude: here.latitude, longitude: here.longitude };
  return prev;
}
