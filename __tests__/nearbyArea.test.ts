/* 주변 드랍을 다시 받는 기준 — 받은 영역 안에서 움직이면 그대로, 많이 움직이면 지금 자리로 */
import { NEARBY_CAP, coveredMeters, nextNearbyCenter, refetchMoveMeters } from '@/utils/nearbyArea';

const HOME = { latitude: 35.1889, longitude: 128.9038 };
/** 북쪽으로 m미터 */
const north = (m: number, from = HOME) => ({ latitude: from.latitude + m / 111_320, longitude: from.longitude });

test('상한에 닿지 않았으면 검색 반경 전체를 받은 것으로 본다', () => {
  expect(coveredMeters(HOME, [north(100), north(900)], 5)).toBe(5000);
  expect(coveredMeters(HOME, undefined, 5)).toBe(5000);
});

test('상한(가까운 순 500개)에 닿았으면 받은 드랍 중 가장 먼 거리까지만 받은 셈이다', () => {
  const drops = Array.from({ length: NEARBY_CAP }, (_, i) => north((i + 1) * 2)); // 2m ~ 1000m
  expect(coveredMeters(HOME, drops, 5)).toBeCloseTo(1000, -1);
  // 반경보다 멀리 있을 수는 없다
  expect(coveredMeters(HOME, drops, 0.5)).toBe(500);
});

test('다시 받는 거리 — 받은 반경의 1/10, 50m ~ 1km', () => {
  expect(refetchMoveMeters(5000)).toBe(500);
  expect(refetchMoveMeters(100)).toBe(50);
  expect(refetchMoveMeters(20_000_000)).toBe(1000);
});

test('처음엔 지금 자리, 받은 영역 안에서 움직이면 같은 중심(같은 객체)', () => {
  const c = nextNearbyCenter(null, HOME, 5000)!;
  expect(c).toEqual(HOME);
  expect(nextNearbyCenter(c, north(120), 5000)).toBe(c); // 걷기 120m — 예전 100m 격자였으면 다시 받았다
  expect(nextNearbyCenter(c, north(480), 5000)).toBe(c);
  expect(nextNearbyCenter(c, null, 5000)).toBe(c); // 위치를 잃어도 중심은 그대로
  expect(nextNearbyCenter(null, null, 5000)).toBeNull();
});

test('반경의 1/10을 넘게 움직이면 그 자리가 새 중심 — 그 전까지는 지금 자리에서 (반경 − 이동) 안의 드랍을 다 갖고 있다', () => {
  const c = nextNearbyCenter(null, HOME, 5000)!;
  const moved = north(520);
  const next = nextNearbyCenter(c, moved, 5000);
  expect(next).not.toBe(c);
  expect(next).toEqual(moved);
  // 드랍이 촘촘해 300m까지만 받았으면 50m만 움직여도 다시 받는다 (재생 반경 안의 드랍을 놓치지 않게)
  expect(nextNearbyCenter(c, north(60), 300)).toEqual(north(60));
});

test('걷기 200m·차 1.5km 동안 다시 받는 횟수 (표시 반경 5km) — 예전 100m 격자와 비교', () => {
  const count = (path: number[], next: (prev: unknown, here: { latitude: number; longitude: number }) => unknown) => {
    let prev: unknown = null; let n = 0;
    for (const m of path) { const c = next(prev, north(m)); if (c !== prev) n++; prev = c; }
    return n - 1; // 처음 받는 것 빼고
  };
  const walk = Array.from({ length: 41 }, (_, i) => i * 5); // 5m마다 (위치 감시 distanceFilter)
  const drive = Array.from({ length: 301 }, (_, i) => 200 + i * 5);
  const grid = (_p: unknown, h: { latitude: number; longitude: number }) => `${Math.round(h.latitude * 1e3)},${Math.round(h.longitude * 1e3)}`;
  const gridCount = (path: number[]) => { let prev = ''; let n = 0; for (const m of path) { const k = grid(null, north(m)); if (k !== prev) n++; prev = k; } return n - 1; };
  const area = (p: unknown, h: { latitude: number; longitude: number }) => nextNearbyCenter(p as never, h, 5000);
  expect(gridCount(walk)).toBeGreaterThanOrEqual(1);
  expect(count(walk, area)).toBe(0);
  expect(gridCount(drive)).toBeGreaterThanOrEqual(13);
  expect(count(drive, area)).toBe(2);
});
