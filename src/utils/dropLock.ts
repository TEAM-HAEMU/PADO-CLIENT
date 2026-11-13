/**
 * 재생 반경 잠금 — 지금 위치에서 재생 반경(playMeters)보다 먼 드랍은 잠근다 (지도엔 흐리게, 곡·커버 없이 / 눌러도 열리지 않음).
 * 서버는 막지 않고 앱에서만 적용한다. 내 드랍·내가 좋아요한 드랍은 어디서든 열린다. 위치를 모르면 예외 말고는 모두 잠금.
 * 위치 오차(accuracy)가 재생 반경보다 크면 위치를 모르는 것과 같게 잠근다 — Android '대략적인 위치'·iOS '정확한 위치' 끔은
 * 오차가 수 km라 그 좌표로는 반경 안인지 알 수 없다. 오차를 모르면(null) 좌표를 그대로 믿는다.
 */
import { distanceM, type Coords } from '@/utils/geo';

export interface LockTarget { droppingId: string; latitude: number; longitude: number; isMyDropping?: boolean }
/** 지금 위치 + 오차 반경(m, 모르면 null) */
export interface LockHere extends Coords { accuracy?: number | null }
/** remainingM: 몇 m 더 가까이 가야 열리는지 (위치를 모르거나 오차가 커서 판정할 수 없으면 null, imprecise: 오차가 커서) */
export type DropLock = { locked: false } | { locked: true; remainingM: number | null; imprecise?: true };

const OPEN: DropLock = { locked: false };

/** 한 번 열린 드랍은 재생 반경보다 이만큼 더 멀어져야 다시 잠근다 — 경계에서 GPS가 흔들려 잠금·해제가 번갈아 바뀌지 않게 */
export const LOCK_GRACE_M = 30;

/** wasOpen: 바로 전에 열려 있던 드랍인지 (그러면 재생 반경 + LOCK_GRACE_M까지 열어 둔다) */
export function dropLock(d: LockTarget, here: LockHere | null, playMeters: number, alwaysOpen?: ReadonlySet<string>, wasOpen = false): DropLock {
  if (d.isMyDropping || alwaysOpen?.has(d.droppingId)) return OPEN;
  if (!here) return { locked: true, remainingM: null };
  const limit = wasOpen ? playMeters + LOCK_GRACE_M : playMeters;
  if (here.accuracy != null && here.accuracy > limit) return { locked: true, remainingM: null, imprecise: true };
  const m = distanceM(here, d);
  return m <= limit ? OPEN : { locked: true, remainingM: m - playMeters };
}

/** 잠긴 드랍을 눌렀을 때 안내 — 남은 거리는 올림 (0m·'바로 여기'처럼 말하지 않게) */
export function lockMessage(lock: DropLock) {
  if (!lock.locked) return '';
  if (lock.imprecise) return '위치 오차가 커서 열 수 없어요. 정확한 위치 사용을 허용했는지 확인해주세요';
  const r = lock.remainingM;
  if (r == null) return '내 위치를 찾으면 가까운 드랍을 들을 수 있어요';
  if (r < 10) return '조금만 더 가까이 가면 들을 수 있어요';
  const up = Math.ceil(r / 10) * 10;
  const d = up < 1000 ? `${up}m` : `${(Math.ceil(r / 100) / 10).toFixed(1)}km`;
  return `${d} 더 가까이 가면 들을 수 있어요`;
}
