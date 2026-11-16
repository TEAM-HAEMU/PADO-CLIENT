/* 재생 기준: 거리 / 같은 지역 (handoff/play-region-contract.md) — 응답 검사, 잠금 판정, 안내 문구, 좌표와 함께 다시 묻는 조건 */
import { dropLock, lockJudge, lockMessage, sameRegion } from '@/utils/dropLock';
import { DEFAULT_RADIUS, needsCoords, playRegionOf, sanitizeRadius } from '@/utils/dropScope';
import type { DropRadius, DropRegion, RegionCodes } from '@/api/types';

const here = { latitude: 35.1631, longitude: 129.1636 };
const north = (m: number) => ({ latitude: here.latitude + m / 111_195, longitude: here.longitude });
const codes: RegionCodes = { sido: '26', sigungu: '26350', dong: '2635010500' };
const drop = (m: number, regionCodes?: Partial<RegionCodes> | null, extra: Partial<{ droppingId: string; isMyDropping: boolean }> = {}) =>
  ({ droppingId: 'd1', isMyDropping: false, ...north(m), regionCodes: regionCodes === undefined ? undefined : regionCodes && { ...codes, ...regionCodes }, ...extra });

const dong: DropRegion = { unit: 'DONG', code: '2635010500', name: '부산광역시 해운대구 우1동' };
const base = { mode: 'DISTANCE', displayMeters: 5000, playMeters: 500, updatedAt: null } as const;
const playRadius = (over: Partial<DropRadius> = {}): DropRadius => ({ ...DEFAULT_RADIUS, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: dong, ...over });

describe('설정 응답 검사', () => {
  test('playMode REGION + 단위 + 같은 단위의 지역이면 그대로 받는다', () => {
    const r = sanitizeRadius({ ...base, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: { ...dong, name: ' 부산광역시 해운대구 우1동 ' } });
    expect(r).toMatchObject({ playMode: 'REGION', playRegionUnit: 'DONG', playRegion: dong });
    expect(playRegionOf(r!)).toEqual(dong);
  });

  test('새 필드가 없거나(예전 서버) 이상하면 거리', () => {
    const distance = { playMode: 'DISTANCE', playRegionUnit: null, playRegion: null };
    expect(sanitizeRadius(base)).toMatchObject(distance);
    expect(sanitizeRadius({ ...base, playMode: 'NEAR', playRegionUnit: 'DONG', playRegion: dong })).toMatchObject(distance);
    // REGION인데 단위가 없거나 모르는 값
    expect(sanitizeRadius({ ...base, playMode: 'REGION', playRegion: dong })).toMatchObject(distance);
    expect(sanitizeRadius({ ...base, playMode: 'REGION', playRegionUnit: 'CITY', playRegion: dong })).toMatchObject(distance);
    // DISTANCE면 단위·지역은 버린다
    expect(sanitizeRadius({ ...base, playMode: 'DISTANCE', playRegionUnit: 'DONG', playRegion: dong })).toMatchObject(distance);
    // 보기 모드가 같은 지역이어도 재생은 따로
    expect(sanitizeRadius({ mode: 'REGION', regionUnit: 'SIGUNGU', playMeters: 500, region: { unit: 'SIGUNGU', code: '26350', name: '부산광역시 해운대구' } })).toMatchObject(distance);
  });

  test('지역이 없거나 단위가 다르면 REGION은 유지하되 지역은 null — 판정은 거리로', () => {
    const noRegion = sanitizeRadius({ ...base, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: null })!;
    expect(noRegion).toMatchObject({ playMode: 'REGION', playRegionUnit: 'DONG', playRegion: null });
    expect(playRegionOf(noRegion)).toBeNull();
    expect(sanitizeRadius({ ...base, playMode: 'REGION', playRegionUnit: 'SIGUNGU', playRegion: dong })?.playRegion).toBeNull();
    expect(sanitizeRadius({ ...base, playMode: 'REGION', playRegionUnit: 'DONG', playRegion: { unit: 'DONG', code: 2635010500, name: '우1동' } })?.playRegion).toBeNull();
  });

  test('보기나 재생 중 하나라도 같은 지역이면 좌표와 함께 다시 묻는다', () => {
    expect(needsCoords(null)).toBe(false);
    expect(needsCoords(DEFAULT_RADIUS)).toBe(false);
    expect(needsCoords({ ...DEFAULT_RADIUS, mode: 'REGION', regionUnit: 'SIGUNGU', displayMeters: null })).toBe(true);
    expect(needsCoords(playRadius({ playRegion: null }))).toBe(true);
  });
});

describe('잠금 판정', () => {
  test('같은 지역 드랍은 재생 반경 밖이어도 열린다 (단위 코드로 비교)', () => {
    expect(dropLock(drop(3000, {}), here, 500, undefined, false, dong)).toEqual({ locked: false });
    expect(dropLock(drop(3000, { dong: '2635010600' }), here, 500, undefined, false, dong).locked).toBe(true);
    // 시·군·구 단위면 같은 구의 다른 동도 열림
    const gu = { unit: 'SIGUNGU', code: '26350' } as const;
    expect(dropLock(drop(3000, { dong: '2635010600' }), here, 500, undefined, false, gu).locked).toBe(false);
    expect(dropLock(drop(3000, { sigungu: '26440' }), here, 500, undefined, false, gu).locked).toBe(true);
    expect(dropLock(drop(9000, { sigungu: '26440' }), here, 500, undefined, false, { unit: 'SIDO', code: '26' }).locked).toBe(false);
  });

  test('다른 지역이어도 재생 반경 안이면 열린다 (경계 바로 옆), 남은 거리는 반경 기준', () => {
    expect(dropLock(drop(300, { dong: '2635010600' }), here, 500, undefined, false, dong).locked).toBe(false);
    const far = dropLock(drop(620, { dong: '2635010600' }), here, 500, undefined, false, dong);
    expect(far.locked && Math.round(far.remainingM!)).toBe(120);
  });

  test('지역 코드가 없는 드랍(예전 서버·백필 전)·내 지역을 모를 때는 거리로만', () => {
    expect(dropLock(drop(3000), here, 500, undefined, false, dong).locked).toBe(true);
    expect(dropLock(drop(3000, null), here, 500, undefined, false, dong).locked).toBe(true);
    expect(dropLock(drop(3000, { dong: null }), here, 500, undefined, false, dong).locked).toBe(true);
    expect(dropLock(drop(3000, {}), here, 500, undefined, false, null).locked).toBe(true);
    expect(dropLock(drop(3000, {}), here, 500).locked).toBe(true);
    // 빈 코드끼리 같다고 열지 않는다
    expect(dropLock(drop(3000, { dong: '' }), here, 500, undefined, false, { unit: 'DONG', code: '' }).locked).toBe(true);
  });

  test('위치를 모르거나 오차가 크면 같은 지역이어도 잠금, 내 드랍·좋아요는 그대로 열림', () => {
    expect(dropLock(drop(3000, {}), null, 500, undefined, false, dong)).toEqual({ locked: true, remainingM: null });
    expect(dropLock(drop(3000, {}), { ...here, accuracy: 2000 }, 500, undefined, false, dong)).toEqual({ locked: true, remainingM: null, imprecise: true });
    expect(dropLock(drop(3000, { dong: 'x' }, { isMyDropping: true }), here, 500, undefined, false, dong).locked).toBe(false);
    expect(dropLock(drop(3000, { dong: 'x' }), here, 500, new Set(['d1']), false, dong).locked).toBe(false);
  });

  test('판정기 — 지역으로 열린 드랍도 지역을 벗어나면 반경 + 30m 밖에서 잠긴다', () => {
    const judge = lockJudge();
    expect(judge(drop(3000, {}), here, 500, undefined, false, dong).locked).toBe(false);
    // 다른 동으로 옮겨 감 (내 지역 바뀜)
    const next = { unit: 'DONG', code: '2635010600' } as const;
    expect(judge(drop(3000, {}), here, 500, undefined, false, next).locked).toBe(true);
    expect(judge(drop(520, {}, { droppingId: 'd2' }), here, 500, undefined, false, next).locked).toBe(true);
  });

  test('sameRegion — 단위 키 sido/sigungu/dong', () => {
    expect(sameRegion(drop(0, {}), { unit: 'SIDO', code: '26' })).toBe(true);
    expect(sameRegion(drop(0, {}), { unit: 'SIGUNGU', code: '26350' })).toBe(true);
    expect(sameRegion(drop(0, {}), { unit: 'DONG', code: '26350' })).toBe(false);
  });
});

describe('잠긴 드랍 안내', () => {
  test('같은 지역 재생이면 지역 이름과 재생 반경으로 안내', () => {
    expect(lockMessage({ locked: true, remainingM: 2500 }, playRadius())).toBe('우1동 안이나 500m 안에서 들을 수 있어요');
    expect(lockMessage({ locked: true, remainingM: 2500 }, playRadius({ playMeters: 1500, playRegion: { unit: 'SIGUNGU', code: '26350', name: '부산광역시 해운대구' } }))).toBe('해운대구 안이나 1.5km 안에서 들을 수 있어요');
  });

  test('거리 재생·내 지역을 모를 때·위치 문제는 지금 문구 그대로', () => {
    expect(lockMessage({ locked: true, remainingM: 113 }, DEFAULT_RADIUS)).toBe('120m 더 가까이 가면 들을 수 있어요');
    expect(lockMessage({ locked: true, remainingM: 113 }, playRadius({ playRegion: null }))).toBe('120m 더 가까이 가면 들을 수 있어요');
    expect(lockMessage({ locked: true, remainingM: null }, playRadius())).toBe('내 위치를 찾으면 가까운 드랍을 들을 수 있어요');
    expect(lockMessage({ locked: true, remainingM: null, imprecise: true }, playRadius())).toBe('위치 오차가 커서 열 수 없어요. 정확한 위치 사용을 허용했는지 확인해주세요');
    expect(lockMessage({ locked: false }, playRadius())).toBe('');
  });
});
