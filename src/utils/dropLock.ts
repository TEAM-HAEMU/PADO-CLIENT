/**
 * 재생 반경 잠금 — 지금 위치에서 재생 반경(playMeters)보다 먼 드랍은 잠근다 (지도엔 흐리게, 곡·커버 없이 / 눌러도 열리지 않음).
 * 서버는 막지 않고 앱에서만 적용한다. 내 드랍·내가 좋아요한 드랍은 어디서든 열린다. 위치를 모르면 예외 말고는 모두 잠금.
 * 위치 오차(accuracy)가 재생 반경의 2배보다 크면 위치를 모르는 것과 같게 잠근다 — Android '대략적인 위치'·iOS '정확한 위치' 끔은
 * 오차가 수 km라 그 좌표로는 반경 안인지 알 수 없다. 그보다 작은 오차는 좌표를 그대로 믿는다 (느슨하게). 오차를 모르면(null)도 그대로 믿는다.
 * 재생 기준이 같은 지역(playRegion이 있음)이면 내 지역과 지역 코드가 같은 드랍도 열린다 (handoff/play-region-contract.md).
 * 지역은 거리를 대신하지 않고 더하는 것 — 경계 바로 옆 드랍이 잠기지 않게 재생 반경 안이면 지역이 달라도 열림.
 */
import type { DropRadius, DropRegion, RegionCodes, RegionUnit } from '@/api/types';
import { distanceM, formatRadius, type Coords } from '@/utils/geo';
import { playRegionOf, shortRegionName } from '@/utils/dropScope';

export interface LockTarget { droppingId: string; latitude: number; longitude: number; isMyDropping?: boolean; regionCodes?: RegionCodes | null }
/** 같은 지역 재생 판정에 쓰는 내 지역 (설정 응답의 playRegion) */
export type PlayRegion = Pick<DropRegion, 'unit' | 'code'>;
/** 지금 위치 + 오차 반경(m, 모르면 null) */
export interface LockHere extends Coords { accuracy?: number | null }
/**
 * remainingM: 몇 m 더 가까이 가야 열리는지 (위치를 모르거나 오차가 커서 판정할 수 없으면 null, imprecise: 오차가 커서).
 * far: 드랍 좌표는 모르지만 지금 위치의 주변 목록에 없어 재생 반경 밖으로 본 드랍 (링크로 연 음악 드랍 — 상세 응답에 좌표가 없다)
 */
export type DropLock = { locked: false } | { locked: true; remainingM: number | null; imprecise?: true; far?: true };

const OPEN: DropLock = { locked: false };

/** 한 번 열린 드랍은 재생 반경보다 이만큼 더 멀어져야 다시 잠근다 — 경계에서 GPS가 흔들려 잠금·해제가 번갈아 바뀌지 않게 */
export const LOCK_GRACE_M = 30;
/** 위치 오차가 재생 반경의 이 배수(+ 열려 있던 드랍은 LOCK_GRACE_M)를 넘어야 '오차가 커서' 잠근다 */
export const IMPRECISE_FACTOR = 2;

const exempt = (d: LockTarget, alwaysOpen?: ReadonlySet<string>) => !!d.isMyDropping || !!alwaysOpen?.has(d.droppingId);

const UNIT_KEY: Record<RegionUnit, keyof RegionCodes> = { SIDO: 'sido', SIGUNGU: 'sigungu', DONG: 'dong' };

/** 드랍이 내 지역(같은 단위 코드) 안인지 — 지역을 모르거나 드랍 코드가 없으면(백필 전) false */
export function sameRegion(d: LockTarget, region: PlayRegion | null | undefined) {
  if (!region?.code) return false;
  const key = UNIT_KEY[region.unit];
  return !!key && d.regionCodes?.[key] === region.code;
}

/**
 * wasOpen: 바로 전에 열려 있던 드랍인지 (그러면 재생 반경 + LOCK_GRACE_M까지 열어 둔다)
 * region: 재생 기준이 같은 지역일 때 내 지역 — 위치를 알고 오차가 크지 않을 때만 쓴다 (내 지역도 그 좌표로 판정한 것이라)
 */
export function dropLock(d: LockTarget, here: LockHere | null, playMeters: number, alwaysOpen?: ReadonlySet<string>, wasOpen = false, region?: PlayRegion | null): DropLock {
  if (exempt(d, alwaysOpen)) return OPEN;
  if (!here) return { locked: true, remainingM: null };
  const grace = wasOpen ? LOCK_GRACE_M : 0;
  if (here.accuracy != null && here.accuracy > playMeters * IMPRECISE_FACTOR + grace) return { locked: true, remainingM: null, imprecise: true };
  if (sameRegion(d, region)) return OPEN;
  const m = distanceM(here, d);
  return m <= playMeters + grace ? OPEN : { locked: true, remainingM: m - playMeters };
}

/**
 * 드랍마다 지난 판정을 기억하는 판정기 (앱 전체에 하나 — useDropLock).
 *  - 열렸던 드랍은 거리로 판정해 반경 + LOCK_GRACE_M 밖일 때만 '열림' 기록을 지운다. 위치를 모르거나·낡았거나·오차가 커서
 *    판정을 못 한 동안(remainingM null)은 지우지 않는다 — 다시 판정할 수 있게 되면 경계 여유가 그대로 이어지게
 *  - awaiting(낡은 좌표를 들고 새 위치를 기다리는 중)이면 지난 판정을 그대로 돌려준다 — 몇 초 사이 핀이 전부 잠겼다 풀리며
 *    지도 마커가 다시 그려지고 재생 목록이 비지 않게. 지난 판정이 없으면 위치를 모르는 것으로
 */
export function lockJudge() {
  const opened = new Set<string>();
  const last = new Map<string, DropLock>();
  const judge = (d: LockTarget, here: LockHere | null, playMeters: number, alwaysOpen?: ReadonlySet<string>, awaiting = false, region?: PlayRegion | null): DropLock => {
    if (exempt(d, alwaysOpen)) return OPEN;
    const prev = last.get(d.droppingId);
    if (awaiting && prev) return prev;
    const lock = dropLock(d, here, playMeters, alwaysOpen, opened.has(d.droppingId), region);
    if (!lock.locked) opened.add(d.droppingId);
    else if (lock.remainingM !== null) opened.delete(d.droppingId);
    last.set(d.droppingId, lock);
    return lock;
  };
  /** 이 드랍을 판정한 적이 있는지 — 위치를 기다리는 동안 지난 판정을 쓸 수 있는지 (링크로 연 화면이 성급히 잠그지 않게) */
  return Object.assign(judge, { judged: (id: string) => last.has(id) });
}

/**
 * 잠긴 드랍을 눌렀을 때 안내 — 남은 거리는 올림 (0m·'바로 여기'처럼 말하지 않게).
 * 재생 기준이 같은 지역이고 내 지역을 알면 남은 거리 대신 "우1동 안이나 500m 안에서 들을 수 있어요"
 */
export function lockMessage(lock: DropLock, radius?: DropRadius) {
  if (!lock.locked) return '';
  if (lock.imprecise) return '위치 오차가 커서 열 수 없어요. 정확한 위치 사용을 허용했는지 확인해주세요';
  const r = lock.remainingM;
  const region = radius && playRegionOf(radius);
  if (lock.far) return region ? `${shortRegionName(region.name)} 안이나 ${formatRadius(radius.playMeters)} 안에서 들을 수 있어요` : radius ? `드랍 ${formatRadius(radius.playMeters)} 안으로 가까이 가면 들을 수 있어요` : '드랍 가까이 가면 들을 수 있어요';
  if (r == null) return '내 위치를 찾으면 가까운 드랍을 들을 수 있어요';
  if (region) return `${shortRegionName(region.name)} 안이나 ${formatRadius(radius.playMeters)} 안에서 들을 수 있어요`;
  if (r < 10) return '조금만 더 가까이 가면 들을 수 있어요';
  const up = Math.ceil(r / 10) * 10;
  const d = up < 1000 ? `${up}m` : `${(Math.ceil(r / 100) / 10).toFixed(1)}km`;
  return `${d} 더 가까이 가면 들을 수 있어요`;
}
