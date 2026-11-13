/* 주변 곡 자동 재생 — 다음 곡 결정 규칙 (순수 함수) */
import {
  decideAutoplay, emptyPlan, failDelay, markHeard, markSkipped, recordOutcome, songSetKey, upNextCandidates,
  FAIL_DELAY_MS, MAX_FAIL_DELAY_MS, MAX_FAIL_STREAK, SKIP_DELAY_MS, type AutoplayOutcome, type AutoplayPlan,
} from '@/utils/autoplayPlan';

const d = (songId: string) => ({ songId });
const A = d('a'), B = d('b'), C = d('c');
const T0 = 1_000_000;

const pickId = (drops: { songId: string }[], plan: AutoplayPlan, now = T0) => {
  const r = decideAutoplay(drops, plan, now);
  return r.type === 'play' ? r.drop.songId : r.type;
};

/**
 * 자동 재생 루프를 시뮬레이션: 아무것도 재생 중이 아닐 때 결정 → 결과 기록 → 대기면 시간을 넘김.
 * outcome(songId, 시도 번호)로 결과를 정한다. 'ok'면 곧바로 끝까지 들은 것으로 친다.
 * 반환: 시작을 시도한 곡 순서 (idle에서 멈추거나 limit에 닿으면 끝)
 */
function simulate(drops: { songId: string }[], outcome: (id: string, n: number) => AutoplayOutcome, limit = 200) {
  let plan = emptyPlan();
  let now = T0;
  const tried: string[] = [];
  for (let i = 0; i < limit; i++) {
    const r = decideAutoplay(drops, plan, now);
    plan = r.plan;
    if (r.type === 'idle') return { tried, plan, now, stopped: true };
    if (r.type === 'wait') { now += r.ms; continue; }
    const id = r.drop.songId;
    const o = outcome(id, tried.length);
    tried.push(id);
    plan = recordOutcome(plan, id, o, now);
    if (o === 'ok') { now += 30_000; plan = markHeard(plan, id); } // 끝까지 들음
  }
  return { tried, plan, now, stopped: false };
}

describe('decideAutoplay — 기본 순서', () => {
  test('가까운 순으로 안 들은 곡부터', () => {
    let plan = emptyPlan();
    expect(pickId([A, B, C], plan)).toBe('a');
    plan = markHeard(plan, 'a');
    expect(pickId([A, B, C], plan)).toBe('b');
    plan = markHeard(plan, 'b');
    expect(pickId([C, A, B], plan)).toBe('c');
  });

  test('다 들었으면 처음부터 다시 (새 바퀴)', () => {
    let plan = emptyPlan();
    for (const id of ['a', 'b']) plan = markHeard(plan, id);
    const r = decideAutoplay([A, B], plan, T0);
    expect(r.type).toBe('play');
    if (r.type === 'play') {
      expect(r.drop.songId).toBe('a');
      expect(r.plan.heard.size).toBe(0);
    }
  });

  test('드랍이 하나뿐이면 끝난 뒤 같은 곡을 다시', () => {
    const plan = markHeard(emptyPlan(), 'a');
    expect(pickId([A], plan)).toBe('a');
  });

  test('드랍이 없으면 idle', () => {
    expect(decideAutoplay([], emptyPlan(), T0).type).toBe('idle');
  });

  test('except(지금 재생 중인 곡)는 고르지 않는다', () => {
    const r = decideAutoplay([A, B], emptyPlan(), T0, 'a');
    expect(r.type === 'play' && r.drop.songId).toBe('b');
  });

  test('같은 곡의 드랍이 둘이어도 집합 식별값은 하나, 순서와 무관', () => {
    expect(songSetKey([A, B, A])).toBe(songSetKey([B, A]));
    expect(songSetKey([A, B])).not.toBe(songSetKey([A, C]));
  });
});

describe('미리듣기 없는 곡 (none·adult) — 1-5 무한 순환, 1-6 19세 곡에서 멈춤', () => {
  test.each(['none', 'adult'] as const)('%s → 잠깐 쉬고 다음 곡', o => {
    let plan = recordOutcome(emptyPlan(), 'a', o, T0);
    expect(plan.skipped.has('a')).toBe(true);
    const w = decideAutoplay([A, B], plan, T0 + 10);
    expect(w).toMatchObject({ type: 'wait', ms: SKIP_DELAY_MS - 10 });
    plan = w.plan;
    expect(pickId([A, B], plan, T0 + SKIP_DELAY_MS)).toBe('b');
  });

  test('미리듣기 없는 곡만 있으면 한 번씩만 시도하고 멈춘다', () => {
    const r = simulate([A, B, C], () => 'none');
    expect(r.stopped).toBe(true);
    expect(r.tried).toEqual(['a', 'b', 'c']);
  });

  test('19세 곡만 있어도 멈춘다 (그 곡에서 영영 기다리지 않음)', () => {
    const r = simulate([A, B], () => 'adult');
    expect(r.stopped).toBe(true);
    expect(r.tried).toEqual(['a', 'b']);
  });

  test('멈춘 뒤 같은 곡 집합이면(순서만 바뀐 GPS 갱신) 계속 멈춤', () => {
    const { plan } = simulate([A, B], () => 'none');
    expect(decideAutoplay([B, A], plan, T0 + 10 * 60_000).type).toBe('idle');
  });

  test('멈춘 뒤 새 곡이 생기면 그 곡만 시도 (미리듣기 없는 곡은 다시 묻지 않음)', () => {
    const { plan } = simulate([A, B], () => 'none');
    expect(pickId([C, A, B], plan, T0 + 60_000)).toBe('c');
  });

  test('미리듣기 없는 곡은 바퀴가 바뀌어도 건너뛴다', () => {
    const r = simulate([A, B, C], (id, n) => (id === 'b' ? 'none' : n < 6 ? 'ok' : 'none'), 50);
    // a, b(없음), c, 새 바퀴: a, c, ... — b는 처음 한 번만
    expect(r.tried.filter(x => x === 'b')).toHaveLength(1);
    expect(r.tried.slice(0, 5)).toEqual(['a', 'b', 'c', 'a', 'c']);
  });

  test('재생할 수 있는 곡과 섞여 있으면 그 곡들로 계속 돈다', () => {
    const r = simulate([A, B], id => (id === 'a' ? 'none' : 'ok'), 10);
    expect(r.tried[0]).toBe('a');
    expect(r.tried.slice(1).every(x => x === 'b')).toBe(true);
  });
});

describe('재생 오류·조회 불가 — 1-4 같은 곡 무한 재시도', () => {
  test('오류 난 곡을 곧바로 다시 고르지 않는다 — 대기 후 다음 곡', () => {
    const plan = recordOutcome(emptyPlan(), 'a', 'error', T0);
    expect(decideAutoplay([A, B], plan, T0)).toMatchObject({ type: 'wait', ms: FAIL_DELAY_MS.error });
    expect(pickId([A, B], plan, T0 + FAIL_DELAY_MS.error)).toBe('b');
  });

  test('연속 실패마다 대기가 두 배, 상한이 있다', () => {
    expect(failDelay('error', 1)).toBe(FAIL_DELAY_MS.error);
    expect(failDelay('error', 2)).toBe(FAIL_DELAY_MS.error * 2);
    expect(failDelay('error', 3)).toBe(FAIL_DELAY_MS.error * 4);
    expect(failDelay('unavailable', 1)).toBe(FAIL_DELAY_MS.unavailable);
    expect(failDelay('unavailable', 20)).toBe(MAX_FAIL_DELAY_MS);
  });

  test('곡 하나가 계속 오류면 시도 횟수가 유한하다', () => {
    const r = simulate([A], () => 'error');
    expect(r.stopped).toBe(true);
    expect(r.tried).toHaveLength(MAX_FAIL_STREAK);
  });

  test('모든 곡이 오류여도(오프라인) 유한 — 연속 실패 상한에서 멈춤', () => {
    const r = simulate([A, B, C], () => 'error');
    expect(r.stopped).toBe(true);
    expect(r.tried).toEqual(['a', 'b', 'c', 'a']);
    // 시도 사이 대기 합: 3s + 6s + 12s (+ 마지막 24s 뒤 멈춤)
    expect(r.now - T0).toBeGreaterThanOrEqual(FAIL_DELAY_MS.error * (1 + 2 + 4));
  });

  test('조회 불가(unavailable)는 15초부터 쉬며 다음 곡', () => {
    const plan = recordOutcome(emptyPlan(), 'a', 'unavailable', T0);
    expect(decideAutoplay([A, B], plan, T0 + 1000)).toMatchObject({ type: 'wait', ms: FAIL_DELAY_MS.unavailable - 1000 });
    expect(pickId([A, B], plan, T0 + FAIL_DELAY_MS.unavailable)).toBe('b');
  });

  test('일시적 실패만 있던 바퀴는 대기 뒤 그 곡들을 다시 시도 (네트워크가 돌아오면 재생)', () => {
    const r = simulate([A, B], (_id, n) => (n < 2 ? 'error' : 'ok'), 6);
    expect(r.tried.slice(0, 3)).toEqual(['a', 'b', 'a']);
  });

  test('곡을 끝까지 들어야 연속 실패가 초기화된다 (재생 시작만으로는 아님)', () => {
    let plan = recordOutcome(emptyPlan(), 'a', 'error', T0);
    plan = recordOutcome(plan, 'b', 'error', T0);
    expect(plan.failStreak).toBe(2);
    plan = recordOutcome(plan, 'c', 'ok', T0);
    expect(plan.failStreak).toBe(2);
    expect(plan.resumeAt).toBe(0);
    plan = markHeard(plan, 'c');
    expect(plan.failStreak).toBe(0);
  });

  test('주소는 찾지만 시작하자마자 오류가 나는 곡도 시도 횟수가 유한하다', () => {
    let plan = emptyPlan();
    let now = T0;
    let starts = 0;
    for (let i = 0; i < 100; i++) {
      const r = decideAutoplay([A, B], plan, now);
      plan = r.plan;
      if (r.type === 'idle') break;
      if (r.type === 'wait') { now += r.ms; continue; }
      starts++;
      plan = recordOutcome(plan, r.drop.songId, 'ok', now); // 주소 찾음 → 재생 시작
      plan = recordOutcome(plan, r.drop.songId, 'error', now + 100); // 곧바로 플레이어 오류
    }
    expect(starts).toBe(MAX_FAIL_STREAK);
  });

  test('연속 실패 상한으로 멈춘 뒤 곡 집합이 바뀌면 다시 시도', () => {
    const { plan, now } = simulate([A, B], () => 'error');
    expect(decideAutoplay([A, B], plan, now + 3_600_000).type).toBe('idle');
    const r = decideAutoplay([A, B, C], plan, now + 1);
    expect(r.type).toBe('play');
    expect(r.plan.failStreak).toBe(0);
    expect(r.plan.failed.size).toBe(0);
  });

  test('오류 뒤 성공한 곡은 실패 목록에서 빠진다', () => {
    let plan = recordOutcome(emptyPlan(), 'a', 'error', T0);
    plan = recordOutcome(plan, 'a', 'ok', T0 + 5000);
    expect(plan.failed.has('a')).toBe(false);
  });

  test('cancelled는 아무것도 바꾸지 않는다', () => {
    const plan = emptyPlan();
    expect(recordOutcome(plan, 'a', 'cancelled', T0)).toBe(plan);
  });
});

describe('사용자 넘기기·이어 틀 곡 후보', () => {
  test('markHeard는 대기와 멈춤을 푼다', () => {
    let plan = recordOutcome(emptyPlan(), 'a', 'error', T0);
    plan = markHeard({ ...plan, idleFor: 'x' }, 'b');
    expect(plan.resumeAt).toBe(0);
    expect(plan.idleFor).toBeNull();
    expect(plan.heard.has('b')).toBe(true);
  });

  test('markSkipped는 이미 있으면 같은 plan', () => {
    const plan = markSkipped(emptyPlan(), 'a');
    expect(markSkipped(plan, 'a')).toBe(plan);
  });

  test('후보: 재생 중·들은 곡·없는 곡·실패한 곡 제외, 가까운 순 최대 5개', () => {
    let plan = markHeard(emptyPlan(), 'b');
    plan = markSkipped(plan, 'c');
    plan = recordOutcome(plan, 'd', 'error', T0);
    const drops = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(d);
    expect(upNextCandidates(drops, plan, 'a').map(x => x.songId)).toEqual(['e', 'f', 'g', 'h', 'i']);
  });

  test('후보가 없으면 새 바퀴 기준 (들은 곡 포함, 없는 곡은 제외)', () => {
    let plan = markHeard(emptyPlan(), 'b');
    plan = markSkipped(plan, 'c');
    expect(upNextCandidates([A, B, C], plan, 'a').map(x => x.songId)).toEqual(['b']);
  });

  test('드랍이 지금 곡 하나뿐이면 후보 없음', () => {
    expect(upNextCandidates([A], emptyPlan(), 'a')).toEqual([]);
  });
});

describe('바뀌지 않는 성질', () => {
  test('어떤 결과 조합이어도 아무것도 못 트는 목록에서는 시도 횟수가 곡 수 × 상한 안에서 멈춘다', () => {
    const outcomes: AutoplayOutcome[] = ['none', 'adult', 'unavailable', 'error'];
    for (let seed = 0; seed < 50; seed++) {
      const drops = Array.from({ length: 1 + (seed % 6) }, (_, i) => d(`s${i}`));
      const r = simulate(drops, (id, n) => outcomes[(id.charCodeAt(1) + n + seed) % outcomes.length], 500);
      expect(r.stopped).toBe(true);
      expect(r.tried.length).toBeLessThanOrEqual(drops.length * MAX_FAIL_STREAK);
    }
  });

  test('입력 plan을 바꾸지 않는다', () => {
    const plan = emptyPlan();
    recordOutcome(plan, 'a', 'none', T0);
    recordOutcome(plan, 'a', 'error', T0);
    markHeard(plan, 'a');
    decideAutoplay([A], markHeard(plan, 'a'), T0);
    expect(plan.heard.size + plan.skipped.size + plan.failed.size).toBe(0);
  });
});
