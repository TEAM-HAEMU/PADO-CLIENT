/* 지도 핀 고르기 · 축소 시 묶음 · 드랍 목록 키 · 역지오코딩 간격 · 아트 프리패처 */
import {
  CLUSTER_LNG_DELTA, CLUSTER_MIN_ZOOM_DELTA, clusterCell, clusterLabel, clusterPoints, clusterSize, clusterZoomRegion, createPrefetcher,
  GEOCODE_EVERY_MS, geocodeDue, idSetKey, inRegion, MAX_PINS, pickPins, shouldCluster,
} from '@/utils/mapPins';

const here = { latitude: 35.1575, longitude: 129.0604 };
// 위도 1도 ≈ 111,195m
const north = (m: number) => ({ latitude: here.latitude + m / 111_195, longitude: here.longitude });
const region = { ...here, latitudeDelta: 0.018, longitudeDelta: 0.012 };

describe('idSetKey', () => {
  test('순서만 다른 같은 목록은 같은 키', () => {
    expect(idSetKey(['b', 'a', 'c'])).toBe(idSetKey(['c', 'b', 'a']));
  });
  test('구성이 바뀌면 다른 키', () => {
    expect(idSetKey(['a', 'b'])).not.toBe(idSetKey(['a', 'c']));
    expect(idSetKey([])).toBe('');
  });
  test('입력 배열을 바꾸지 않는다', () => {
    const ids = ['b', 'a'];
    idSetKey(ids);
    expect(ids).toEqual(['b', 'a']);
  });
});

describe('inRegion', () => {
  test('영역 안 · 넉넉히 둔 가장자리 · 밖', () => {
    expect(inRegion(here, region)).toBe(true);
    // 위도 반폭 0.009도 ≈ 1,000m, pad 0.5면 2,000m까지
    expect(inRegion(north(1500), region)).toBe(true);
    expect(inRegion(north(2100), region)).toBe(false);
    expect(inRegion(north(1500), region, 0)).toBe(false);
  });
});

describe('pickPins', () => {
  const sorted = Array.from({ length: 500 }, (_, i) => ({ id: `d${i}`, d: north(i * 10) }));

  test('영역을 모르면 가까운 순으로 상한까지만', () => {
    const out = pickPins(sorted, null);
    expect(out).toHaveLength(MAX_PINS);
    expect(out[0]).toEqual({ item: sorted[0], rank: 0 });
    expect(out[MAX_PINS - 1].rank).toBe(MAX_PINS - 1);
  });

  test('보이는 영역(넉넉히) 밖은 빼고, 순번은 원래 거리순 그대로', () => {
    // 3km 남쪽으로 옮긴 영역 → 가까운 핀은 화면 밖
    const away = { ...region, latitude: north(3000).latitude };
    const out = pickPins(sorted, away, 1000);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every(p => inRegion(p.item.d, away))).toBe(true);
    expect(out[0].rank).toBeGreaterThan(0);
    expect(out[0].item).toBe(sorted[out[0].rank]);
  });

  test('목록이 상한보다 적으면 영역 안 전부', () => {
    expect(pickPins(sorted.slice(0, 5), region).map(p => p.rank)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('shouldCluster', () => {
  test('영역을 모르거나 가까이 보면 핀, 많이 축소하면 묶음', () => {
    expect(shouldCluster(null)).toBe(false);
    expect(shouldCluster(region)).toBe(false);
    expect(shouldCluster({ ...region, longitudeDelta: CLUSTER_LNG_DELTA })).toBe(false);
    expect(shouldCluster({ ...region, longitudeDelta: CLUSTER_LNG_DELTA * 1.01 })).toBe(true);
  });
});

describe('clusterPoints', () => {
  // 경도 0.2도(약 18km) 폭으로 축소한 지도
  const wide = { ...here, latitudeDelta: 0.3, longitudeDelta: 0.2 };
  const east = (m: number, from = here) => ({ latitude: from.latitude, longitude: from.longitude + m / (111_195 * Math.cos((from.latitude * Math.PI) / 180)) });

  test('칸 크기는 화면 폭/칸 수에 가까운 2의 거듭제곱 — 조금 확대·축소해도 같다', () => {
    expect(clusterCell(0.2)).toBe(2 ** -5); // 0.04 → 0.03125
    expect(clusterCell(0.21)).toBe(clusterCell(0.19));
    expect(clusterCell(0.4)).toBe(clusterCell(0.2) * 2);
  });

  test('가까이 모인 드랍은 하나로 묶고, 수·평균 좌표·범위를 준다', () => {
    const pts = [here, north(50), east(80), north(120)];
    const out = clusterPoints(pts, wide);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(4);
    expect(out[0].latitude).toBeCloseTo(pts.reduce((a, p) => a + p.latitude, 0) / 4, 9);
    expect(out[0].longitude).toBeCloseTo(pts.reduce((a, p) => a + p.longitude, 0) / 4, 9);
    expect(out[0].minLat).toBe(here.latitude);
    expect(out[0].maxLat).toBe(north(120).latitude);
    expect(out[0].maxLng).toBe(east(80).longitude);
  });

  test('멀리 떨어진 무리는 따로 묶고, 전부 세면 영역 안 드랍 수와 같다', () => {
    const far = east(9000);
    const pts = [here, north(30), far, east(40, far), east(60, far)];
    const out = clusterPoints(pts, wide);
    expect(out).toHaveLength(2);
    expect(out.map(c => c.count).sort()).toEqual([2, 3]);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(pts.length);
  });

  test('칸 경계에 걸친 무리는 갈라지지 않고 하나로 합친다 (묶음끼리 겹치지 않게)', () => {
    const cell = clusterCell(wide.longitudeDelta);
    // 경도 칸 경계 바로 양옆에 50m 간격으로
    const edge = { latitude: here.latitude, longitude: Math.ceil(here.longitude / cell) * cell };
    const pts = [east(-30, edge), east(-10, edge), east(10, edge), east(30, edge), east(50, edge)];
    const out = clusterPoints(pts, wide);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(5);
    expect(out[0].minLng).toBe(pts[0].longitude);
    expect(out[0].maxLng).toBe(pts[4].longitude);
  });

  test('합쳐도 서로 한 칸 넘게 떨어진 묶음끼리는 가깝지 않다', () => {
    const cell = clusterCell(wide.longitudeDelta);
    const pts = Array.from({ length: 300 }, (_, i) => east((i * 7919) % 15000, north(((i * 104729) % 15000) - 7500)));
    const out = clusterPoints(pts, wide);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(300);
    const cellLat = cell * Math.round(Math.cos((here.latitude * Math.PI) / 180) * 10) / 10;
    for (const a of out) for (const b of out) {
      if (a === b) continue;
      // 합칠 때 기준은 합치기 전 중심이라 합친 뒤 중심은 조금 움직일 수 있다 — 반 칸보다는 멀다
      expect(Math.hypot((a.longitude - b.longitude) / cell, (a.latitude - b.latitude) / cellLat)).toBeGreaterThan(0.5);
    }
  });

  test('보이는 영역(넉넉히) 밖은 세지 않는다', () => {
    // 위도 반폭 0.15도, pad 0.5 → 0.3도(약 33km)까지
    const out = clusterPoints([here, north(40_000)], wide);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(1);
  });

  test('같은 줌에서 지도를 끌어도 같은 드랍은 같은 키의 묶음에 남는다', () => {
    const pts = [here, north(30), east(40)];
    const a = clusterPoints(pts, wide);
    const b = clusterPoints(pts, { ...wide, latitude: here.latitude + 0.02, longitude: here.longitude - 0.03 });
    expect(b.map(c => c.key)).toEqual(a.map(c => c.key));
    expect(b.map(c => c.count)).toEqual(a.map(c => c.count));
  });

  test('줌 단계가 바뀌면 키도 바뀐다 (다른 격자)', () => {
    const a = clusterPoints([here], wide);
    const b = clusterPoints([here], { ...wide, longitudeDelta: 0.8, latitudeDelta: 1.2 });
    expect(a[0].key).not.toBe(b[0].key);
  });

  test('500개도 칸 수만큼으로 줄어든다', () => {
    const pts = Array.from({ length: 500 }, (_, i) => east((i % 25) * 300, north(Math.floor(i / 25) * 300)));
    const out = clusterPoints(pts, wide);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(500);
    expect(out.length).toBeLessThanOrEqual(16);
  });

  test('빈 목록이면 빈 묶음', () => {
    expect(clusterPoints([], wide)).toEqual([]);
  });
});

describe('clusterZoomRegion', () => {
  const wide = { ...here, latitudeDelta: 0.3, longitudeDelta: 0.2 };
  const one = (lat: number, lng: number, span = 0) => ({ key: 'k', latitude: lat, longitude: lng, count: 3, minLat: lat - span / 2, maxLat: lat + span / 2, minLng: lng - span / 2, maxLng: lng + span / 2 });

  test('한 점에 몰린 묶음은 핀이 보이는 줌까지 확대한다 (그 이상은 안 들어감)', () => {
    const r = clusterZoomRegion(one(here.latitude, here.longitude), wide);
    expect(r.longitudeDelta).toBe(CLUSTER_MIN_ZOOM_DELTA);
    expect(shouldCluster(r)).toBe(false);
    expect(r.latitudeDelta / r.longitudeDelta).toBeCloseTo(wide.latitudeDelta / wide.longitudeDelta, 9);
  });

  test('넓게 퍼진 묶음은 다 보이게, 적어도 지금의 절반으로는 확대한다', () => {
    const spread = clusterZoomRegion(one(here.latitude, here.longitude, 0.02), wide);
    expect(spread.longitudeDelta).toBeGreaterThanOrEqual(0.02 * 1.6 - 1e-12);
    expect(spread.longitudeDelta).toBeLessThan(wide.longitudeDelta);
    const huge = clusterZoomRegion(one(here.latitude, here.longitude, 1), wide);
    expect(huge.longitudeDelta).toBe(wide.longitudeDelta / 2);
  });

  test('묶음 범위가 새 영역 안에 다 들어온다 (아래 목록 자리만큼 위로 올려도)', () => {
    const c = one(here.latitude, here.longitude, 0.02);
    const r = clusterZoomRegion(c, wide);
    expect(c.maxLat).toBeLessThanOrEqual(r.latitude + r.latitudeDelta / 2);
    expect(c.minLat).toBeGreaterThanOrEqual(r.latitude - r.latitudeDelta / 2);
    expect(r.latitude).toBeLessThan(here.latitude);
  });
});

describe('clusterLabel · clusterSize', () => {
  test('숫자 표기', () => {
    expect(clusterLabel(7)).toBe('7');
    expect(clusterLabel(500)).toBe('500');
    expect(clusterLabel(1234)).toBe('1,234');
  });
  test('지름은 수에 따라 세 단계', () => {
    expect([1, 9, 10, 49, 50, 500].map(clusterSize)).toEqual([36, 36, 42, 42, 48, 48]);
  });
});

describe('geocodeDue', () => {
  const t0 = 1_000_000;
  test('처음이면 바로', () => {
    expect(geocodeDue(null, here, t0)).toBe(true);
  });
  test('GPS 갱신(5m)마다 부르지 않는다', () => {
    const last = { at: here, time: t0 };
    expect(geocodeDue(last, north(5), t0 + 3000)).toBe(false);
    expect(geocodeDue(last, north(60), t0 + 10_000)).toBe(false);
  });
  test('100m 넘게 움직이면 바로', () => {
    expect(geocodeDue({ at: here, time: t0 }, north(101), t0 + 1000)).toBe(true);
  });
  test('30초 지나도 그 자리에 서 있으면 다시 안 부르고, 조금이라도 움직였으면 다시', () => {
    const last = { at: here, time: t0 };
    expect(geocodeDue(last, north(3), t0 + GEOCODE_EVERY_MS + 1)).toBe(false);
    expect(geocodeDue(last, north(20), t0 + GEOCODE_EVERY_MS + 1)).toBe(true);
    expect(geocodeDue(last, north(20), t0 + GEOCODE_EVERY_MS - 1)).toBe(false);
  });
});

describe('createPrefetcher', () => {
  const flush = () => new Promise<void>(r => setTimeout(r, 0));

  test('같은 주소는 한 번만 받는다', async () => {
    const load = jest.fn(() => Promise.resolve(true));
    const p = createPrefetcher(load, 2);
    const [a, b] = await Promise.all([p.prefetch('u1'), p.prefetch('u1')]);
    expect(a && b).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(p.isReady('u1')).toBe(true);
    await p.prefetch('u1');
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('동시에 concurrency개까지만', async () => {
    const pending: (() => void)[] = [];
    let running = 0, peak = 0;
    const load = jest.fn(() => new Promise<boolean>(resolve => {
      running++; peak = Math.max(peak, running);
      pending.push(() => { running--; resolve(true); });
    }));
    const p = createPrefetcher(load, 3);
    const all = Promise.all(Array.from({ length: 10 }, (_, i) => p.prefetch(`u${i}`)));
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    while (pending.length) { pending.shift()!(); await flush(); }
    await all;
    expect(load).toHaveBeenCalledTimes(10);
    expect(peak).toBe(3);
  });

  test('실패하면 잊고 다음에 다시 시도한다 (false·예외 모두)', async () => {
    const load = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('x')).mockResolvedValue(true);
    const p = createPrefetcher(load, 1);
    expect(await p.prefetch('u')).toBe(false);
    expect(p.isReady('u')).toBe(false);
    expect(await p.prefetch('u')).toBe(false);
    expect(await p.prefetch('u')).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  test('기억은 상한을 넘으면 비운다', async () => {
    const load = jest.fn(() => Promise.resolve(true));
    const p = createPrefetcher(load, 4, 2);
    await p.prefetch('a');
    await p.prefetch('b');
    await p.prefetch('c');
    expect(p.isReady('a')).toBe(false);
    await p.prefetch('a');
    expect(load).toHaveBeenCalledTimes(4);
  });
});
