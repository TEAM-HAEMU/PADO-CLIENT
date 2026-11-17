/** 주변 새 드랍 알림 — 마지막으로 앱을 쓴 곳을 서버에 알릴지 (네이티브 의존 없음) */
import { distanceM, type Coords } from './geo';

/** 지난번 보낸 뒤 이만큼 지났으면 다시 보낸다 */
export const REGION_MIN_INTERVAL_MS = 30 * 60_000;
/** 지난번 보낸 곳에서 이만큼 움직였으면 다시 보낸다 */
export const REGION_MIN_MOVE_M = 300;

export interface SentRegion { latitude: number; longitude: number; at: number }

/** 처음이거나, 30분이 지났거나, 300m 넘게 움직였으면 보낸다 */
export function shouldSendRegion(last: SentRegion | null, coords: Coords, now: number): boolean {
  if (!last) return true;
  if (now - last.at >= REGION_MIN_INTERVAL_MS || now < last.at) return true;
  return distanceM(last, coords) >= REGION_MIN_MOVE_M;
}
