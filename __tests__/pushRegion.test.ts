/* 주변 새 드랍 — 마지막 동네 알리기 조건: 처음이거나 30분 지났거나 300m 넘게 움직였을 때만 */
import { REGION_MIN_INTERVAL_MS, REGION_MIN_MOVE_M, shouldSendRegion } from '@/utils/pushRegion';

const HOME = { latitude: 35.1889, longitude: 128.9038 };
/** 북쪽으로 m미터 */
const north = (m: number) => ({ latitude: HOME.latitude + m / 111_320, longitude: HOME.longitude });
const T0 = 1_800_000_000_000;

test('기준값은 30분 · 300m', () => {
  expect(REGION_MIN_INTERVAL_MS).toBe(30 * 60_000);
  expect(REGION_MIN_MOVE_M).toBe(300);
});

test('처음이면 보낸다', () => {
  expect(shouldSendRegion(null, HOME, T0)).toBe(true);
});

test('30분 안에 300m 안쪽이면 보내지 않는다', () => {
  const last = { ...HOME, at: T0 };
  expect(shouldSendRegion(last, HOME, T0 + 60_000)).toBe(false);
  expect(shouldSendRegion(last, north(290), T0 + 29 * 60_000)).toBe(false);
});

test('30분이 지나면 제자리여도 보낸다', () => {
  const last = { ...HOME, at: T0 };
  expect(shouldSendRegion(last, HOME, T0 + 30 * 60_000)).toBe(true);
});

test('300m 넘게 움직이면 30분 안이어도 보낸다', () => {
  const last = { ...HOME, at: T0 };
  expect(shouldSendRegion(last, north(310), T0 + 60_000)).toBe(true);
});

test('기기 시계가 뒤로 갔으면(기록이 미래) 다시 보낸다', () => {
  expect(shouldSendRegion({ ...HOME, at: T0 }, HOME, T0 - 60_000)).toBe(true);
});
