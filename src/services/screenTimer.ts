/**
 * 화면 체류 시간 — 화면을 떠날 때와 앱이 백그라운드로 갈 때 '머문 시간'을 한 번씩 알린다.
 * 앱이 다시 앞으로 오면 같은 화면의 시간을 0부터 다시 잰다 (백그라운드에 있던 시간은 빼고).
 * 시계는 주입받아 테스트에서 고정할 수 있다.
 */
export interface ScreenLeft { screen: string; duration_ms: number; reason: 'navigate' | 'background' }

export function createScreenTimer(now: () => number, emit: (e: ScreenLeft) => void) {
  let current: { name: string; key: string; since: number | null } | null = null;

  const close = (reason: ScreenLeft['reason']) => {
    if (!current || current.since === null) return;
    emit({ screen: current.name, duration_ms: Math.max(0, Math.round(now() - current.since)), reason });
    current.since = null;
  };

  return {
    /** 화면이 바뀌면 true (같은 화면이면 false — 파라미터만 바뀐 경우 등) */
    enter(name: string, key: string = name): boolean {
      if (current && current.key === key) {
        if (current.since === null) current.since = now();
        return false;
      }
      close('navigate');
      current = { name, key, since: now() };
      return true;
    },
    /** 앱이 백그라운드로 — 지금 화면 시간을 닫는다 */
    background() { close('background'); },
    /** 앱이 다시 앞으로 — 지금 화면을 0부터 다시 잰다 */
    foreground() { if (current && current.since === null) current.since = now(); },
    get screen() { return current?.name; },
  };
}
