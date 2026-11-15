/* 드랍 보기 모드 — 응답 검사, 지도 문구, 주변 검색 거리, 다시 물을 기준 좌표 */
import { DEFAULT_RADIUS, MIN_PLAY_METERS, WIDE_SEARCH_KM, nextAnchor, permissionScope, regionFallbackMeters, sanitizeRadius, scopeLabel, searchKm, shortRegionName } from '@/utils/dropScope';
import type { DropRadius } from '@/api/types';

const at = '2026-11-13T12:00:00.000+09:00';
const region = (over: Partial<DropRadius> = {}): DropRadius => ({
  mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: null, playMeters: 500,
  region: { unit: 'SIGUNGU', code: '26350', name: '부산광역시 해운대구' }, updatedAt: at, ...over,
});

test('같은 지역 모드 응답은 단위·지역을 그대로 받고 표시 반경은 버린다', () => {
  expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: 3000, playMeters: 500, region: { unit: 'SIGUNGU', code: '26350', name: ' 부산광역시 해운대구 ' }, updatedAt: at }))
    .toEqual(region());
  // 지역을 못 찾았거나(바다) 좌표를 안 보냈으면 region null
  expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'DONG', displayMeters: null, playMeters: 500, region: null, updatedAt: null }))
    .toEqual({ mode: 'REGION', regionUnit: 'DONG', displayMeters: null, playMeters: 500, region: null, updatedAt: null });
  expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'SIGUNGU', playMeters: 500, region: { unit: 'SIGUNGU', code: 1 } })?.region).toBeNull();
  expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'CITY', playMeters: 500 })).toBeNull();
});

test('거리 모드는 표시 반경 null을 전국으로, 500km까지 받는다', () => {
  expect(sanitizeRadius({ mode: 'DISTANCE', regionUnit: null, displayMeters: null, playMeters: 5000, region: null, updatedAt: at }))
    .toEqual({ mode: 'DISTANCE', regionUnit: null, displayMeters: null, playMeters: 5000, region: null, updatedAt: at });
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 500_000, playMeters: 5000 })?.displayMeters).toBe(500_000);
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 500_001, playMeters: 500 })).toBeNull();
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 1000, playMeters: 1001 })).toBeNull();
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: null, playMeters: 5001 })).toBeNull();
  expect(sanitizeRadius({ mode: 'NEARBY', displayMeters: 1000, playMeters: 100 })).toBeNull();
  // mode 없는 예전 응답에 표시 반경이 없으면 깨진 응답
  expect(sanitizeRadius({ playMeters: 500 })).toBeNull();
});

test('재생 반경은 50m부터 — 그 아래로 저장된 값은 50m로 올리고, 0 이하는 깨진 응답', () => {
  expect(MIN_PLAY_METERS).toBe(50);
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 1000, playMeters: 50 })?.playMeters).toBe(50);
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 1000, playMeters: 49 })?.playMeters).toBe(50);
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 100, playMeters: 10 })?.playMeters).toBe(50);
  expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'DONG', playMeters: 10 })?.playMeters).toBe(50);
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 1000, playMeters: 0 })).toBeNull();
  expect(sanitizeRadius({ mode: 'DISTANCE', displayMeters: 1000, playMeters: -5 })).toBeNull();
});

test('지도 문구 — 반경 5km / 전국 / 해운대구의 드랍', () => {
  expect(scopeLabel(DEFAULT_RADIUS)).toBe('반경 5km');
  expect(scopeLabel({ ...DEFAULT_RADIUS, displayMeters: 1500 })).toBe('반경 1.5km');
  expect(scopeLabel({ ...DEFAULT_RADIUS, displayMeters: null })).toBe('전국');
  expect(scopeLabel(region())).toBe('해운대구의 드랍');
  expect(scopeLabel(region({ regionUnit: 'SIDO', region: { unit: 'SIDO', code: '36', name: '세종특별자치시' } }))).toBe('세종특별자치시의 드랍');
  expect(scopeLabel(region({ regionUnit: 'DONG', region: { unit: 'DONG', code: '2635051000', name: '부산광역시 해운대구 우1동' } }))).toBe('우1동의 드랍');
  // 지역 밖(바다 등) — 서버가 재생 반경의 10배 또는 5km 중 큰 값으로 찾는다
  expect(scopeLabel(region({ region: null }))).toBe('반경 5km');
  expect(scopeLabel(region({ region: null, playMeters: 800 }))).toBe('반경 8km');
  expect(regionFallbackMeters(region({ playMeters: 300 }))).toBe(5000);
  expect(shortRegionName('경기도 수원시 영통구')).toBe('영통구');
});

test('위치 권한 안내 범위', () => {
  expect(permissionScope(DEFAULT_RADIUS)).toBe('내 주변 5km');
  expect(permissionScope({ ...DEFAULT_RADIUS, displayMeters: null })).toBe('전국');
  expect(permissionScope(region())).toBe('내가 있는 지역');
});

test('주변 검색 거리 — 거리 모드는 표시 반경, 전국·같은 지역은 넓은 값(서버가 고름)', () => {
  expect(searchKm(DEFAULT_RADIUS)).toBe(5);
  expect(searchKm({ ...DEFAULT_RADIUS, displayMeters: null })).toBe(WIDE_SEARCH_KM);
  expect(searchKm(region())).toBe(WIDE_SEARCH_KM);
});

test('기준 좌표는 300m 넘게 움직였을 때만 바뀐다', () => {
  const home = { latitude: 35.1575, longitude: 129.0604 };
  const a = nextAnchor(null, home);
  expect(a).toEqual(home);
  expect(nextAnchor(a, null)).toBe(a);
  expect(nextAnchor(a, { latitude: home.latitude + 250 / 111_195, longitude: home.longitude })).toBe(a);
  const moved = { latitude: home.latitude + 400 / 111_195, longitude: home.longitude };
  expect(nextAnchor(a, moved)).toEqual(moved);
  expect(nextAnchor(a, moved)).not.toBe(a);
});
