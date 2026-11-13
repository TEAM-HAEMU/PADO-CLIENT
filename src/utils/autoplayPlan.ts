/**
 * 주변 곡 자동 재생의 "다음에 틀 곡" 결정 — 화면·스토어와 무관한 순수 함수 (useNearbyAutoplay가 쓴다).
 *
 * 곡마다 결과를 나눠 기억한다.
 *  - heard   끝까지 들었거나 사용자가 넘긴 곡. 이번 바퀴에서 뺀다. 남은 곡이 없으면 heard를 비우고 처음부터(새 바퀴)
 *  - skipped 미리듣기가 없는 곡(none·19세). 다시 물어도 결과가 같으므로 바퀴가 바뀌어도 계속 뺀다
 *  - failed  재생 오류·조회 불가처럼 일시적인 실패. 이번 바퀴에서 빼고, 쉬었다가(대기 시간이 연속 실패마다 두 배) 다시 시도한다
 *
 * 무한 반복을 막는 규칙
 *  - 새 바퀴는 이번 바퀴에 끝까지 들은(또는 넘긴) 곡이 있을 때만 시작한다. 곡이 heard에 들어가려면 실제로 30초를 듣거나
 *    사용자가 넘겨야 하므로, 아무것도 못 트는 목록에서 바퀴가 쉬지 않고 돌지 않는다
 *  - 연속 실패가 MAX_FAIL_STREAK번이면 멈추고, 드랍 목록(곡 집합)이 바뀔 때까지 다시 시도하지 않는다
 *  - 틀 곡이 없으면(미리듣기 없는 곡뿐) 멈추고, 곡 집합이 바뀌면 다시 본다
 */

export type AutoplayOutcome = 'ok' | 'none' | 'adult' | 'unavailable' | 'error' | 'cancelled';

export interface AutoplayPlan {
  heard: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  /**
   * 연속 실패 수. 곡을 끝까지 듣거나 사용자가 넘겨야 0이 된다 — 재생 시작('ok')만으로는 초기화하지 않는다.
   * 주소는 찾았는데 플레이어가 곧바로 오류를 내는 경우(만료·오프라인)는 시작 → 오류가 반복되기 때문
   */
  failStreak: number;
  /** 이 시각(ms) 전에는 다음 곡을 시작하지 않는다 */
  resumeAt: number;
  /** 멈춘 곡 집합의 식별값 — 곡 집합이 이것과 달라지면 다시 시도한다. null이면 멈춘 상태가 아님 */
  idleFor: string | null;
}

export type AutoplayDecision<T> =
  | { type: 'play'; drop: T; plan: AutoplayPlan }
  | { type: 'wait'; ms: number; plan: AutoplayPlan }
  | { type: 'idle'; plan: AutoplayPlan };

type Song = { songId: string };

/** 미리듣기 없는 곡을 건너뛰기 전 잠깐 쉬는 시간 (미니 디스크가 깜빡이지 않게) */
export const SKIP_DELAY_MS = 800;
/** 일시적 실패 뒤 첫 대기 시간 — 연속 실패마다 두 배 */
export const FAIL_DELAY_MS: Record<'unavailable' | 'error', number> = { unavailable: 15_000, error: 3_000 };
export const MAX_FAIL_DELAY_MS = 120_000;
/** 연속 실패가 이만큼이면 곡 집합이 바뀔 때까지 쉰다 */
export const MAX_FAIL_STREAK = 4;

export const emptyPlan = (): AutoplayPlan => ({ heard: new Set(), skipped: new Set(), failed: new Set(), failStreak: 0, resumeAt: 0, idleFor: null });

/** 곡 집합의 식별값 (순서와 무관 — 걸으면서 가까운 순서만 바뀐 것은 같은 목록) */
export const songSetKey = (drops: readonly Song[]) => [...new Set(drops.map(d => d.songId))].sort().join('\n');

const add = (s: ReadonlySet<string>, id: string) => new Set(s).add(id);

export function failDelay(kind: 'unavailable' | 'error', streak: number) {
  return Math.min(FAIL_DELAY_MS[kind] * 2 ** Math.max(0, streak - 1), MAX_FAIL_DELAY_MS);
}

/**
 * 다음에 틀 곡. drops는 가까운 순. except는 지금 재생 중인 곡(이어 틀 곡을 고를 때).
 * 아무것도 재생 중이 아닐 때 부른다.
 */
export function decideAutoplay<T extends Song>(drops: readonly T[], plan: AutoplayPlan, now: number, except?: string | null): AutoplayDecision<T> {
  if (!drops.length) return { type: 'idle', plan };
  const key = songSetKey(drops);
  // 곡 집합이 바뀌었으면 멈춤을 풀고 일시적 실패를 잊는다 (새 곡이 생겼거나, 걸어서 다른 곳에 왔다)
  if (plan.idleFor !== null && plan.idleFor !== key) plan = { ...plan, idleFor: null, failed: new Set(), failStreak: 0, resumeAt: 0 };
  if (plan.idleFor === key) return { type: 'idle', plan };
  if (now < plan.resumeAt) return { type: 'wait', ms: plan.resumeAt - now, plan };
  if (plan.failStreak >= MAX_FAIL_STREAK) return { type: 'idle', plan: { ...plan, idleFor: key } };

  const open = (p: AutoplayPlan) => drops.filter(d => d.songId !== except && !p.heard.has(d.songId) && !p.skipped.has(d.songId) && !p.failed.has(d.songId));
  let left = open(plan);
  if (!left.length && (plan.heard.size || plan.failed.size)) {
    // 이번 바퀴를 다 돌았다 — 들은 곡이 있으면 처음부터, 일시적 실패만 있었으면 (대기 시간이 지났으니) 그 곡들을 다시
    plan = { ...plan, heard: plan.heard.size ? new Set() : plan.heard, failed: new Set() };
    left = open(plan);
  }
  if (!left.length) return { type: 'idle', plan: { ...plan, idleFor: key } };
  return { type: 'play', drop: left[0], plan };
}

/** startPreview 결과(또는 재생 중 오류)를 반영 */
export function recordOutcome(plan: AutoplayPlan, songId: string, outcome: AutoplayOutcome, now: number): AutoplayPlan {
  switch (outcome) {
    case 'ok':
      return { ...plan, resumeAt: 0, failed: plan.failed.has(songId) ? without(plan.failed, songId) : plan.failed };
    case 'none':
    case 'adult':
      return { ...plan, skipped: add(plan.skipped, songId), resumeAt: now + SKIP_DELAY_MS };
    case 'unavailable':
    case 'error': {
      const failStreak = plan.failStreak + 1;
      return { ...plan, failed: add(plan.failed, songId), failStreak, resumeAt: now + failDelay(outcome, failStreak) };
    }
    case 'cancelled':
      return plan;
    default: {
      const never: never = outcome;
      return never;
    }
  }
}

/** 끝까지 들었거나 사용자가 넘긴 곡 — 연속 실패도 끝난다 */
export function markHeard(plan: AutoplayPlan, songId: string): AutoplayPlan {
  // 사용자가 넘기면 쉬는 중이던 대기도 푼다
  return { ...plan, heard: add(plan.heard, songId), failStreak: 0, resumeAt: 0, idleFor: null };
}

/** 미리듣기 없음이 확인된 곡 (이어 틀 곡을 찾다가 알게 된 경우) */
export function markSkipped(plan: AutoplayPlan, songId: string): AutoplayPlan {
  return plan.skipped.has(songId) ? plan : { ...plan, skipped: add(plan.skipped, songId) };
}

/** 지금 곡(playing)이 끝나면 이어 틀 후보 — 가까운 순, 최대 limit개 */
export function upNextCandidates<T extends Song>(drops: readonly T[], plan: AutoplayPlan, playing: string, limit = 5): T[] {
  const ok = (d: T, p: AutoplayPlan) => d.songId !== playing && !p.skipped.has(d.songId) && !p.failed.has(d.songId) && !p.heard.has(d.songId);
  let list = drops.filter(d => ok(d, plan));
  // 남은 곡이 없으면 곡이 끝날 때 새 바퀴가 시작된다 (지금 곡은 들은 곡이 되므로 heard가 비게 됨)
  if (!list.length) list = drops.filter(d => d.songId !== playing && !plan.skipped.has(d.songId) && !plan.failed.has(d.songId));
  return list.slice(0, limit);
}

function without(s: ReadonlySet<string>, id: string) {
  const n = new Set(s);
  n.delete(id);
  return n;
}
