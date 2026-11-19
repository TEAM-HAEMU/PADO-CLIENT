/**
 * 링크·푸시·다른 화면에서 드랍 상세(음악 미리보기·투표·플리·재생)를 바로 열 때의 잠금 판정 — 지도와 같은 규칙(utils/dropLock).
 *  - 내 드랍·좋아요한 드랍은 열림. 그 목록을 아직 받는 중이면 기다린다 (좋아요한 먼 드랍이 잠깐 잠겼다 풀리지 않게)
 *  - 좌표를 알면(투표·플리 상세, 주변·내 드랍 목록에 있는 드랍) 지도와 같은 판정기로
 *  - 음악 드랍 상세엔 좌표가 없다 → 같은 지역 재생이면 지역 코드로 먼저 보고, 아니면 지금 위치의 주변 목록을 이 화면을 연 뒤 새로 받아
 *    거기에도 없으면 재생 반경 밖(far)으로 잠근다. 주변 목록은 표시 반경 안 가까운 순 500개라, 재생 반경 안 드랍이 빠질 일은 거의 없다
 *  - 위치를 아직 처음 찾는 중(또는 낡은 좌표로 새 위치를 기다리는 중)이고 지난 판정도 없으면 성급히 잠그지 않고 기다린다 (pending).
 *    지난 판정이 있으면 지도처럼 그것을 쓴다 (판정기의 awaiting 처리)
 * pending 동안 화면은 불러오는 중으로 보이고 미리듣기를 틀지 않는다.
 */
import type { RegionCodes } from '@/api/types';
import { IMPRECISE_FACTOR, sameRegion, type DropLock, type LockHere, type LockTarget, type PlayRegion } from '@/utils/dropLock';

export type LockedDropLock = Extract<DropLock, { locked: true }>;
export type OpenedLock = { status: 'pending' } | { status: 'open' } | { status: 'locked'; lock: LockedDropLock };

export interface OpenedLockInput {
  /** 내 드랍이거나 좋아요한 드랍 (상세의 isMyDropping 포함) */
  exempt: boolean;
  /** 내 드랍·좋아요 목록을 아직 받는 중 */
  exemptLoading: boolean;
  /** 좌표를 아는 드랍 — 모르면 null (음악 드랍 상세) */
  target: LockTarget | null;
  /** 좌표를 모를 때 지역 판정에 쓰는 드랍의 지역 코드 (상세 응답) */
  regionCodes?: RegionCodes | null;
  /** 지금 위치 — 모르거나 낡았으면 null */
  here: LockHere | null;
  /** 위치를 찾는 중 */
  locating: boolean;
  /** 이 드랍을 판정한 적이 있음 */
  judged: boolean;
  /** 좌표를 모를 때 — 지금 위치의 주변 목록을 이 화면을 연 뒤 새로 받았는지 (받았는데 이 드랍이 없으면 반경 밖) */
  nearby: 'loading' | 'done' | 'error';
  playMeters: number;
  region?: PlayRegion | null;
  /** 지도와 같은 판정기 (hooks/useDropLock) */
  judge: (t: LockTarget) => DropLock;
}

const PENDING: OpenedLock = { status: 'pending' };
const OPEN: OpenedLock = { status: 'open' };
const verdict = (lock: DropLock): OpenedLock => (lock.locked ? { status: 'locked', lock } : OPEN);

export function openedDropLock(i: OpenedLockInput): OpenedLock {
  if (i.exempt) return OPEN;
  if (i.exemptLoading) return PENDING;
  if (!i.here && i.locating && !i.judged) return PENDING;
  if (i.target) return verdict(i.judge(i.target));
  // 좌표를 모르는 드랍
  if (!i.here) return i.locating ? PENDING : { status: 'locked', lock: { locked: true, remainingM: null } };
  if (i.here.accuracy != null && i.here.accuracy > i.playMeters * IMPRECISE_FACTOR) return { status: 'locked', lock: { locked: true, remainingM: null, imprecise: true } };
  if (sameRegion({ droppingId: '', latitude: 0, longitude: 0, regionCodes: i.regionCodes }, i.region)) return OPEN;
  // 주변 목록을 못 받았으면(오프라인 등) 열지 않는다 — 규칙을 지키는 쪽으로
  if (i.nearby === 'loading') return PENDING;
  return { status: 'locked', lock: { locked: true, remainingM: null, far: true } };
}
