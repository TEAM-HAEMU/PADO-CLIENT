/* 링크·푸시로 바로 연 드랍 상세의 잠금 판정 (B-05) — 지도와 같은 규칙 */
import { lockJudge, lockMessage } from '@/utils/dropLock';
import { openedDropLock, type OpenedLockInput } from '@/utils/openedDropLock';
import { DEFAULT_RADIUS } from '@/utils/dropScope';

// 서울 시청 — 드랍은 부산 강서구(약 330km)
const SEOUL = { latitude: 37.5665, longitude: 126.978, accuracy: 10 };
const BUSAN = { droppingId: 'busan', latitude: 35.1889, longitude: 128.9038 };
const north = (m: number) => ({ droppingId: 'near', latitude: SEOUL.latitude + m / 111_195, longitude: SEOUL.longitude });

const base = (over: Partial<OpenedLockInput> = {}): OpenedLockInput => {
  const judge = lockJudge();
  return {
    exempt: false,
    exemptLoading: false,
    target: BUSAN,
    here: SEOUL,
    locating: false,
    judged: false,
    nearby: 'done',
    playMeters: 500,
    judge: t => judge(t, over.here === undefined ? SEOUL : over.here, 500),
    ...over,
  };
};

test('좌표를 아는 먼 드랍(투표·플리)은 잠기고, 지도와 같은 남은 거리 안내가 나온다', () => {
  const r = openedDropLock(base());
  expect(r.status).toBe('locked');
  if (r.status !== 'locked') return;
  expect(Math.round(r.lock.remainingM! / 1000)).toBeGreaterThan(300);
  expect(lockMessage(r.lock)).toMatch(/^\d+\.\dkm 더 가까이 가면 들을 수 있어요$/);
});

test('재생 반경 안 드랍은 열린다', () => {
  expect(openedDropLock(base({ target: north(300) })).status).toBe('open');
});

test('내 드랍·좋아요한 드랍은 어디서든 열린다 (위치를 몰라도)', () => {
  expect(openedDropLock(base({ exempt: true })).status).toBe('open');
  expect(openedDropLock(base({ exempt: true, here: null, locating: false })).status).toBe('open');
  expect(openedDropLock(base({ exempt: true, target: null, nearby: 'loading' })).status).toBe('open');
});

test('내 드랍·좋아요 목록을 받는 중이면 기다린다 (좋아요한 먼 드랍이 잠깐 잠겼다 풀리지 않게)', () => {
  expect(openedDropLock(base({ exemptLoading: true })).status).toBe('pending');
});

test('위치를 처음 찾는 중이고 지난 판정이 없으면 성급히 잠그지 않는다', () => {
  expect(openedDropLock(base({ here: null, locating: true })).status).toBe('pending');
  expect(openedDropLock(base({ here: null, locating: true, target: null })).status).toBe('pending');
});

test('위치를 기다리는 중이라도 지난 판정이 있으면 그것을 쓴다 (판정기의 awaiting)', () => {
  const judge = lockJudge();
  judge(north(300), SEOUL, 500); // 지도에서 열린 드랍
  const r = openedDropLock(base({ target: north(300), here: null, locating: true, judged: true, judge: t => judge(t, null, 500, undefined, true) }));
  expect(r.status).toBe('open');
});

test('위치를 못 받으면(권한 거부 등) 잠그고 위치 안내', () => {
  const r = openedDropLock(base({ here: null, locating: false }));
  expect(r.status).toBe('locked');
  if (r.status === 'locked') expect(lockMessage(r.lock)).toBe('내 위치를 찾으면 가까운 드랍을 들을 수 있어요');
});

describe('좌표가 없는 음악 드랍 상세', () => {
  test('지금 위치의 주변 목록을 새로 받는 중이면 기다린다', () => {
    expect(openedDropLock(base({ target: null, nearby: 'loading' })).status).toBe('pending');
  });

  test('새로 받은 주변 목록에도 없으면 반경 밖으로 잠근다', () => {
    const r = openedDropLock(base({ target: null, nearby: 'done' }));
    expect(r).toEqual({ status: 'locked', lock: { locked: true, remainingM: null, far: true } });
    if (r.status === 'locked') expect(lockMessage(r.lock, DEFAULT_RADIUS)).toBe(`드랍 ${DEFAULT_RADIUS.playMeters}m 안으로 가까이 가면 들을 수 있어요`);
  });

  test('주변 목록을 못 받으면(오프라인) 열지 않는다', () => {
    expect(openedDropLock(base({ target: null, nearby: 'error' })).status).toBe('locked');
  });

  test('위치 오차가 크면 지도처럼 오차 안내로 잠근다', () => {
    const r = openedDropLock(base({ target: null, here: { ...SEOUL, accuracy: 5000 } }));
    expect(r.status === 'locked' && r.lock.imprecise).toBe(true);
  });

  test('재생 기준이 같은 지역이면 지역 코드가 같은 드랍은 열린다', () => {
    const region = { unit: 'DONG' as const, code: '2644056000' };
    const regionCodes = { sido: '26', sigungu: '26440', dong: '2644056000' };
    expect(openedDropLock(base({ target: null, regionCodes, region })).status).toBe('open');
    expect(openedDropLock(base({ target: null, regionCodes: { ...regionCodes, dong: '1111' }, region })).status).toBe('locked');
  });
});

test('판정기는 판정한 적이 있는 드랍을 기억한다 (위치를 기다리는 동안 지난 판정을 쓸 수 있는지)', () => {
  const judge = lockJudge();
  expect(judge.judged('busan')).toBe(false);
  judge(BUSAN, SEOUL, 500);
  expect(judge.judged('busan')).toBe(true);
});
