/**
 * 드랍 보기 범위 (계약: handoff/visibility-mode-contract.md) — 서버 응답 검사, 화면 문구, 주변 검색 거리.
 * 네이티브 의존 없음 (jest에서 바로 시험)
 */
import type { DropRadius, DropRegion, RegionUnit } from '@/api/types';
import { distanceM, formatRadius, type Coords } from '@/utils/geo';

export const DEFAULT_RADIUS: DropRadius = { mode: 'DISTANCE', regionUnit: null, displayMeters: 5000, playMeters: 500, region: null, updatedAt: null };

/** 전국·같은 지역 모드에서 주변 검색에 보내는 거리(km) — 서버가 설정대로 고른다 */
export const WIDE_SEARCH_KM = 20_000;
/** 같은 지역 모드에서 지역을 다시 물을 만큼 움직인 거리 */
export const REGION_REFETCH_M = 300;

const UNITS: RegionUnit[] = ['SIDO', 'SIGUNGU', 'DONG'];
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function sanitizeRegion(r: unknown): DropRegion | null {
  const v = r as Partial<DropRegion> | null;
  if (!v || !UNITS.includes(v.unit as RegionUnit) || typeof v.code !== 'string' || typeof v.name !== 'string' || !v.name.trim()) return null;
  return { unit: v.unit as RegionUnit, code: v.code, name: v.name.trim() };
}

/**
 * 계약의 범위(표시 100m~500km 또는 전국, 재생 10~5000m이고 표시 이하) 밖이거나 모양이 이상하면 null.
 * mode가 없으면 보기 모드 이전 백엔드 — 거리 모드로 본다
 */
export function sanitizeRadius(r: unknown): DropRadius | null {
  const v = r as Partial<DropRadius> & Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;
  const play = v.playMeters;
  if (!isInt(play) || play < 10 || play > 5000) return null;
  const updatedAt = typeof v.updatedAt === 'string' ? v.updatedAt : null;
  const mode = v.mode ?? 'DISTANCE';
  if (mode === 'REGION') {
    if (!UNITS.includes(v.regionUnit as RegionUnit)) return null;
    return { mode, regionUnit: v.regionUnit as RegionUnit, displayMeters: null, playMeters: play, region: sanitizeRegion(v.region), updatedAt };
  }
  if (mode !== 'DISTANCE') return null;
  const display = v.displayMeters;
  // 예전 백엔드는 표시 반경이 항상 숫자 — mode 없이 null이면 깨진 응답
  if (display == null && v.mode === undefined) return null;
  if (display != null && (!isInt(display) || display < 100 || display > 500_000 || play > display)) return null;
  return { mode, regionUnit: null, displayMeters: display ?? null, playMeters: play, region: null, updatedAt };
}

/** 같은 지역 모드인데 지역을 못 찾았을 때 서버가 쓰는 거리 — 재생 반경의 10배 또는 5km 중 큰 값 */
export const regionFallbackMeters = (r: DropRadius) => Math.max(r.playMeters * 10, 5000);

/** 주변 검색 distance(km) */
export function searchKm(r: DropRadius) {
  return r.mode === 'DISTANCE' && r.displayMeters !== null ? r.displayMeters / 1000 : WIDE_SEARCH_KM;
}

/** "부산광역시 해운대구" → "해운대구", "세종특별자치시" → 그대로 */
export const shortRegionName = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/** 지도 문구 — "반경 5km" / "전국" / "해운대구의 드랍" */
export function scopeLabel(r: DropRadius) {
  if (r.mode === 'REGION') return r.region ? `${shortRegionName(r.region.name)}의 드랍` : `반경 ${formatRadius(regionFallbackMeters(r))}`;
  return r.displayMeters === null ? '전국' : `반경 ${formatRadius(r.displayMeters)}`;
}

/** 위치 권한 안내 문구의 범위 — "내 주변 5km" / "전국" / "내가 있는 지역" (아직 위치를 모를 때) */
export function permissionScope(r: DropRadius) {
  if (r.mode === 'REGION') return '내가 있는 지역';
  return r.displayMeters === null ? '전국' : `내 주변 ${formatRadius(r.displayMeters)}`;
}

/**
 * 설정을 다시 물을 기준 좌표 — 300m 넘게 움직였을 때만 바꾼다 (같은 지역 모드의 지역이 바뀌었을 수 있음).
 * 같은 값을 돌려주면 구독한 화면이 다시 그려지지 않는다
 */
export function nextAnchor(prev: Coords | null, next: Coords | null): Coords | null {
  if (!next) return prev;
  if (!prev || distanceM(prev, next) > REGION_REFETCH_M) return { latitude: next.latitude, longitude: next.longitude };
  return prev;
}
