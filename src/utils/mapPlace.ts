/**
 * 지도 위 제목 — 화면 가운데 지점의 지역 이름을 확대 수준에 맞는 단계로 (넓게 보면 "경상남도", 중간이면 "양산시", 가까우면 "물금읍",
 * 아주 가까우면 그 자리의 아는 장소 "부산소프트웨어마이스터고등학교" — 없으면 동 이름).
 * 이름은 백엔드 판정(GET /regions/at, 장소는 place=true일 때 카카오 로컬)에서 받는다 — 같은 지역 모드의 "해운대구의 드랍"과 같은 이름. 네이티브 의존 없음 (jest에서 바로 시험)
 */
import type { RegionUnit } from '@/api/types';

export interface PlaceName { code: string; name: string }
/** 지도 제목용 아는 장소 (학교·지하철역·관광명소·문화시설·공공기관) — category는 카카오 분류 코드(SC4 등), 화면엔 이름만 쓴다 */
export interface KnownPlace { name: string; category: string | null }
export interface RegionsAt { sido: PlaceName | null; sigungu: PlaceName | null; dong: PlaceName | null; place: KnownPlace | null }

/** 제목 단계 — 행정구역 세 단계 + 동보다 더 가까이 본 '장소' */
export type TitleLevel = RegionUnit | 'PLACE';

/**
 * 장소 단계 경계 (보이는 세로 범위, 도). 지도 처음 화면(0.018 ≈ 세로 2km, 구글 줌 약 15.7)보다 두 배 넘게 당겨
 * 세로 약 0.9km(줌 약 17 — 지도에 골목·건물이 보이기 시작하는 수준)보다 좁게 볼 때만. 서버는 가운데에서 150m 안 장소를 찾으니
 * 이때는 그 장소가 화면의 큰 몫이라 제목으로 맞고, 더 넓게 보면 동 이름이 맞다
 */
export const PLACE_DELTA = 0.008;

/** 화면에 보이는 세로 범위(위도 차이, 도)로 고르는 단계 — 건물이 보이면 장소, 동네가 보이면 동, 도시가 보이면 시·군·구, 도가 보이면 시·도 */
export function placeLevel(latitudeDelta: number): TitleLevel {
  if (latitudeDelta > 1.2) return 'SIDO';
  if (latitudeDelta > 0.12) return 'SIGUNGU';
  if (latitudeDelta >= PLACE_DELTA) return 'DONG';
  return 'PLACE';
}

/** 장소 단계면 장소도 묻는다 (place=true — 서버가 카카오를 부르는 건 이때만) */
export const wantsPlace = (level: TitleLevel) => level === 'PLACE';

/**
 * 같은 이름이 나올 만큼 가까운 가운데 지점은 같은 요청으로 — 단계가 넓을수록 크게 묶는다.
 * 장소는 서버 캐시 칸(약 50m)에 맞춰 0.0005°(위도 약 55m)
 */
const GRID: Record<TitleLevel, number> = { SIDO: 0.2, SIGUNGU: 0.02, DONG: 0.002, PLACE: 0.0005 };
export function placeKey(lat: number, lng: number, level: TitleLevel) {
  const g = GRID[level];
  return `${level}:${Math.round(lat / g)}:${Math.round(lng / g)}`;
}

const isPlace = (v: unknown): v is PlaceName => {
  const p = v as PlaceName | null;
  return !!p && typeof p.code === 'string' && typeof p.name === 'string' && !!p.name.trim();
};

const knownPlace = (v: unknown): KnownPlace | null => {
  const p = v as { name?: unknown; category?: unknown } | null;
  if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return null;
  return { name: p.name.trim(), category: typeof p.category === 'string' ? p.category : null };
};

/** 응답 검사 — 모양이 이상하면 단계마다 null. place는 예전 서버·place 없이 물은 응답엔 없다 → null */
export function sanitizeRegionsAt(v: unknown): RegionsAt {
  const r = (v ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (isPlace(r[k]) ? { code: (r[k] as PlaceName).code, name: (r[k] as PlaceName).name.trim() } : null);
  return { sido: pick('sido'), sigungu: pick('sigungu'), dong: pick('dong'), place: knownPlace(r.place) };
}

/** 고른 단계의 이름, 없으면 가까운 단계로 (장소 → 동 → 시·군·구 → 시·도 / 시·도 → 시·군·구 → 동). 장소는 장소 단계에서만 쓴다 */
export function placeName(r: RegionsAt, level: TitleLevel): string | null {
  if (level === 'PLACE' && r.place) return r.place.name;
  const order: (keyof Omit<RegionsAt, 'place'>)[] = level === 'SIDO' ? ['sido', 'sigungu', 'dong'] : level === 'SIGUNGU' ? ['sigungu', 'sido', 'dong'] : ['dong', 'sigungu', 'sido'];
  for (const k of order) { const p = r[k]; if (p) return p.name; }
  return null;
}
