/* 재생 반경 잠금 규칙 · 반경 설정 검증 */
import { dropLock, lockMessage } from '@/utils/dropLock';
import { formatRadius } from '@/utils/geo';
import { DEFAULT_RADIUS, sanitizeRadius } from '@/hooks/useDropRadius';

const here = { latitude: 35.1575, longitude: 129.0604 };
// 위도 1도 ≈ 111,195m
const north = (m: number) => ({ latitude: here.latitude + m / 111_195, longitude: here.longitude });
const drop = (m: number, extra: Partial<{ droppingId: string; isMyDropping: boolean }> = {}) => ({ droppingId: 'd1', isMyDropping: false, ...north(m), ...extra });

test('재생 반경 안이면 열리고, 밖이면 남은 거리와 함께 잠긴다', () => {
  expect(dropLock(drop(300), here, 500)).toEqual({ locked: false });
  expect(dropLock(drop(500), here, 500).locked).toBe(false);
  const far = dropLock(drop(620), here, 500);
  expect(far.locked).toBe(true);
  expect(far.locked && Math.round(far.remainingM!)).toBe(120);
});

test('내 드랍·좋아요한 드랍은 어디서든 열린다 (위치를 몰라도)', () => {
  expect(dropLock(drop(9000, { isMyDropping: true }), here, 500).locked).toBe(false);
  expect(dropLock(drop(9000), here, 500, new Set(['d1'])).locked).toBe(false);
  expect(dropLock(drop(9000), null, 500, new Set(['d1'])).locked).toBe(false);
  expect(dropLock(drop(9000), here, 500, new Set(['other'])).locked).toBe(true);
});

test('위치를 모르면 예외 말고는 잠금', () => {
  expect(dropLock(drop(0), null, 500)).toEqual({ locked: true, remainingM: null });
});

test('안내 문구 — 남은 거리는 올림', () => {
  expect(lockMessage({ locked: true, remainingM: 113 })).toBe('120m 더 가까이 가면 들을 수 있어요');
  expect(lockMessage({ locked: true, remainingM: 120 })).toBe('120m 더 가까이 가면 들을 수 있어요');
  expect(lockMessage({ locked: true, remainingM: 4 })).toBe('조금만 더 가까이 가면 들을 수 있어요');
  expect(lockMessage({ locked: true, remainingM: 995 })).toBe('1.0km 더 가까이 가면 들을 수 있어요');
  expect(lockMessage({ locked: true, remainingM: 2340 })).toBe('2.4km 더 가까이 가면 들을 수 있어요');
  expect(lockMessage({ locked: true, remainingM: null })).toBe('내 위치를 찾으면 가까운 드랍을 들을 수 있어요');
  expect(lockMessage({ locked: false })).toBe('');
});

test('반경 표시', () => {
  expect(formatRadius(5000)).toBe('5km');
  expect(formatRadius(1500)).toBe('1.5km');
  expect(formatRadius(500)).toBe('500m');
});

test('반경 설정 — 계약 범위 밖·이상한 모양은 버린다', () => {
  expect(sanitizeRadius({ displayMeters: 3000, playMeters: 200, updatedAt: '2026-11-13T12:00:00.000+09:00' })).toEqual({ displayMeters: 3000, playMeters: 200, updatedAt: '2026-11-13T12:00:00.000+09:00' });
  expect(sanitizeRadius({ displayMeters: 5000, playMeters: 500, updatedAt: null })).toEqual(DEFAULT_RADIUS);
  expect(sanitizeRadius({ displayMeters: 50, playMeters: 10 })).toBeNull();
  expect(sanitizeRadius({ displayMeters: 1000, playMeters: 2000 })).toBeNull();
  expect(sanitizeRadius({ displayMeters: 60_000, playMeters: 500 })).toBeNull();
  expect(sanitizeRadius(null)).toBeNull();
  expect(sanitizeRadius('<html>')).toBeNull();
});
