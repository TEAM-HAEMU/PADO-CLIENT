/**
 * 지도 위 제목 — 화면 가운데 지점의 지역 이름을 확대 수준에 맞는 단계로 (넓게 보면 "경상남도", 중간이면 "양산시", 가까우면 "물금읍").
 * 이름은 백엔드 행정구역 판정(GET /regions/at)에서 받는다 — 같은 지역 모드의 "해운대구의 드랍"과 같은 이름. 네이티브 의존 없음 (jest에서 바로 시험)
 */
import type { RegionUnit } from '@/api/types';

export interface PlaceName { code: string; name: string }
export interface RegionsAt { sido: PlaceName | null; sigungu: PlaceName | null; dong: PlaceName | null }

/** 화면에 보이는 세로 범위(위도 차이, 도)로 고르는 단계 — 동네가 보이면 동, 도시가 보이면 시·군·구, 도가 보이면 시·도 */
export function placeLevel(latitudeDelta: number): RegionUnit {
  if (latitudeDelta > 1.2) return 'SIDO';
  if (latitudeDelta > 0.12) return 'SIGUNGU';
  return 'DONG';
}

/** 같은 이름이 나올 만큼 가까운 가운데 지점은 같은 요청으로 — 단계가 넓을수록 크게 묶는다 */
const GRID: Record<RegionUnit, number> = { SIDO: 0.2, SIGUNGU: 0.02, DONG: 0.002 };
export function placeKey(lat: number, lng: number, level: RegionUnit) {
  const g = GRID[level];
  return `${level}:${Math.round(lat / g)}:${Math.round(lng / g)}`;
}

const isPlace = (v: unknown): v is PlaceName => {
  const p = v as PlaceName | null;
  return !!p && typeof p.code === 'string' && typeof p.name === 'string' && !!p.name.trim();
};

/** 응답 검사 — 모양이 이상하면 단계마다 null */
export function sanitizeRegionsAt(v: unknown): RegionsAt {
  const r = (v ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (isPlace(r[k]) ? { code: (r[k] as PlaceName).code, name: (r[k] as PlaceName).name.trim() } : null);
  return { sido: pick('sido'), sigungu: pick('sigungu'), dong: pick('dong') };
}

/** 고른 단계의 이름, 없으면 가까운 단계로 (동 → 시·군·구 → 시·도 / 시·도 → 시·군·구 → 동) */
export function placeName(r: RegionsAt, level: RegionUnit): string | null {
  const order: (keyof RegionsAt)[] = level === 'SIDO' ? ['sido', 'sigungu', 'dong'] : level === 'SIGUNGU' ? ['sigungu', 'sido', 'dong'] : ['dong', 'sigungu', 'sido'];
  for (const k of order) { const p = r[k]; if (p) return p.name; }
  return null;
}
