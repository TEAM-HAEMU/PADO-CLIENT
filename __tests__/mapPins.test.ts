/* 지도 핀 고르기 · 드랍 목록 키 · 역지오코딩 간격 · 아트 프리패처 */
import { createPrefetcher, GEOCODE_EVERY_MS, geocodeDue, idSetKey, inRegion, MAX_PINS, pickPins } from '@/utils/mapPins';

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
