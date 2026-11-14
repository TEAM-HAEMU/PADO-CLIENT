/* 재생 반경 잠금 규칙 · 반경 설정 검증 */
import { dropLock, lockJudge, lockMessage } from '@/utils/dropLock';
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

test('위치 오차가 재생 반경의 2배보다 크면(대략적인 위치) 위치를 모르는 것처럼 잠근다', () => {
  // Android '대략적인 위치' — 오차 수 km
  expect(dropLock(drop(100), { ...here, accuracy: 2000 }, 500)).toEqual({ locked: true, remainingM: null, imprecise: true });
  expect(dropLock(drop(100), { ...here, accuracy: 1010 }, 500)).toEqual({ locked: true, remainingM: null, imprecise: true });
  // 2배까지는 좌표를 그대로 믿는다 (느슨하게)
  expect(dropLock(drop(100), { ...here, accuracy: 1000 }, 500).locked).toBe(false);
  expect(dropLock(drop(100), { ...here, accuracy: 700 }, 500).locked).toBe(false);
  expect(dropLock(drop(100), { ...here, accuracy: null }, 500).locked).toBe(false);
  // 오차가 커도 2배 안이면 거리로 판정
  expect(dropLock(drop(620), { ...here, accuracy: 900 }, 500).locked).toBe(true);
  // 열려 있던 드랍은 경계 여유(30m)까지
  expect(dropLock(drop(100), { ...here, accuracy: 1020 }, 500, undefined, true).locked).toBe(false);
  expect(dropLock(drop(100), { ...here, accuracy: 1040 }, 500, undefined, true).locked).toBe(true);
  // 예외(내 드랍·좋아요)는 그대로 열림
  expect(dropLock(drop(100, { isMyDropping: true }), { ...here, accuracy: 5000 }, 500).locked).toBe(false);
  expect(lockMessage({ locked: true, remainingM: null, imprecise: true })).toBe('위치 오차가 커서 열 수 없어요. 정확한 위치 사용을 허용했는지 확인해주세요');
});

test('판정기 — 위치를 모르거나 오차가 커서 판정 못 한 동안에도 경계 여유(열림 기록)를 지우지 않는다', () => {
  const judge = lockJudge();
  expect(judge(drop(490), here, 500).locked).toBe(false); // 열림
  expect(judge(drop(520), null, 500)).toEqual({ locked: true, remainingM: null }); // 위치 모름
  expect(judge(drop(520), { ...here, accuracy: 5000 }, 500)).toMatchObject({ locked: true, imprecise: true }); // 오차 큼
  // 다시 판정할 수 있게 되면 반경 + 30m까지 그대로 열림
  expect(judge(drop(520), here, 500).locked).toBe(false);
  // 거리로 판정해 밖이면 그때 기록을 지운다
  expect(judge(drop(540), here, 500).locked).toBe(true);
  expect(judge(drop(520), here, 500).locked).toBe(true);
});

test('판정기 — 새 위치를 기다리는 동안(awaiting)은 지난 판정을 유지, 판정한 적 없으면 위치 모름', () => {
  const judge = lockJudge();
  expect(judge(drop(300), here, 500).locked).toBe(false);
  expect(judge(drop(300), null, 500, undefined, true)).toEqual({ locked: false });
  expect(judge(drop(900, { droppingId: 'd2' }), here, 500).locked).toBe(true);
  expect(judge(drop(900, { droppingId: 'd2' }), null, 500, undefined, true)).toMatchObject({ locked: true });
  expect(judge(drop(0, { droppingId: 'new' }), null, 500, undefined, true)).toEqual({ locked: true, remainingM: null });
  // 기다림이 끝나 위치를 모르면 잠금, 그래도 열림 기록은 남아 있다
  expect(judge(drop(300), null, 500).locked).toBe(true);
  expect(judge(drop(520), here, 500).locked).toBe(false);
  // 예외는 기다리는 중에도 열림
  expect(judge(drop(900, { droppingId: 'd2' }), null, 500, new Set(['d2']), true).locked).toBe(false);
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
