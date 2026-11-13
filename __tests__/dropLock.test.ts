/* 재생 반경 잠금 규칙 · 반경 설정 검증 */
import { dropLock, lockMessage } from '@/utils/dropLock';
import { formatRadius } from '@/utils/geo';
import { DEFAULT_RADIUS, sanitizeRadius } from '@/utils/dropScope';

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

test('한 번 열린 드랍은 재생 반경 + 30m까지 열어 둔다 (경계 흔들림 방지)', () => {
  expect(dropLock(drop(520), here, 500).locked).toBe(true);
  expect(dropLock(drop(520), here, 500, undefined, true).locked).toBe(false);
  expect(dropLock(drop(529), here, 500, undefined, true).locked).toBe(false);
  const gone = dropLock(drop(540), here, 500, undefined, true);
  expect(gone.locked).toBe(true);
  if (gone.locked) expect(Math.round(gone.remainingM!)).toBe(40);
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

test('위치 오차가 재생 반경보다 크면(대략적인 위치) 위치를 모르는 것처럼 잠근다', () => {
  // Android '대략적인 위치' — 오차 수 km
  expect(dropLock(drop(100), { ...here, accuracy: 2000 }, 500)).toEqual({ locked: true, remainingM: null, imprecise: true });
  expect(dropLock(drop(100), { ...here, accuracy: 500 }, 500).locked).toBe(false);
  expect(dropLock(drop(100), { ...here, accuracy: null }, 500).locked).toBe(false);
  // 열려 있던 드랍은 경계 여유(30m)까지
  expect(dropLock(drop(100), { ...here, accuracy: 520 }, 500, undefined, true).locked).toBe(false);
  expect(dropLock(drop(100), { ...here, accuracy: 540 }, 500, undefined, true).locked).toBe(true);
  // 예외(내 드랍·좋아요)는 그대로 열림
  expect(dropLock(drop(100, { isMyDropping: true }), { ...here, accuracy: 5000 }, 500).locked).toBe(false);
  expect(lockMessage({ locked: true, remainingM: null, imprecise: true })).toBe('위치 오차가 커서 열 수 없어요. 정확한 위치 사용을 허용했는지 확인해주세요');
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
  // 보기 모드 이전 백엔드(mode 없음)는 거리 모드로 본다
  expect(sanitizeRadius({ displayMeters: 3000, playMeters: 200, updatedAt: '2026-11-13T12:00:00.000+09:00' })).toEqual({ mode: 'DISTANCE', regionUnit: null, displayMeters: 3000, playMeters: 200, region: null, updatedAt: '2026-11-13T12:00:00.000+09:00' });
  expect(sanitizeRadius({ displayMeters: 5000, playMeters: 500, updatedAt: null })).toEqual(DEFAULT_RADIUS);
  expect(sanitizeRadius({ displayMeters: 50, playMeters: 10 })).toBeNull();
  expect(sanitizeRadius({ displayMeters: 1000, playMeters: 2000 })).toBeNull();
  expect(sanitizeRadius({ displayMeters: 600_000, playMeters: 500 })).toBeNull();
  expect(sanitizeRadius(null)).toBeNull();
  expect(sanitizeRadius('<html>')).toBeNull();
});
