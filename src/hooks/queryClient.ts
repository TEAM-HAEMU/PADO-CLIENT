import { AppState } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';

/**
 * 실패한 쿼리를 다시 시도할지 — 4xx(요청이 틀렸거나 권한 없음)는 다시 해도 같으니 안 하고, 네트워크·5xx는 한 번만.
 * 오프라인·서버 장애 때 쿼리마다 세 번씩 보내지 않게 (연결 상태 감지 라이브러리는 없어서 재시도 횟수로만 줄인다)
 */
export const shouldRetryQuery = (failureCount: number, e: unknown) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && failureCount < 1;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
    },
  },
});

/** 이만큼 넘게 백그라운드에 있다 돌아와야 '돌아왔다'로 본다 — 권한 창·공유 시트처럼 잠깐 가린 것으로는 다시 받지 않게 */
export const REFOCUS_AFTER_MS = 10_000;

type AppStateLike = { currentState?: string | null; addEventListener: (type: 'change', fn: (state: string) => void) => { remove: () => void } };

/**
 * 앱 포커스 → React Query 포커스. 백그라운드에 REFOCUS_AFTER_MS 넘게 있다 돌아올 때만 '다시 보임'(오래된 쿼리를 다시 받음).
 * - inactive는 무시한다: iOS는 제어센터·알림센터·권한 창·딥링크 확인창만 내려도 active → inactive → active가 되는데, 앱은 그대로 보이고 있다
 * - 백그라운드에 간 지 REFOCUS_AFTER_MS가 지나면 포커스를 끈다 — 그동안 주기 갱신(refetchInterval)이 멈춘다
 * - 앱이 멈춰 있어 그 타이머가 못 돌았어도, 돌아왔을 때 떠나 있던 시간으로 판단한다
 */
export function listenAppFocus(handleFocus: (focused: boolean) => void, appState: AppStateLike = AppState, now: () => number = Date.now) {
  let leftAt: number | null = appState.currentState === 'background' ? now() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  handleFocus(leftAt === null);
  const sub = appState.addEventListener('change', state => {
    if (state === 'background') {
      if (leftAt !== null) return;
      leftAt = now();
      timer = setTimeout(() => handleFocus(false), REFOCUS_AFTER_MS);
      return;
    }
    if (state !== 'active') return;
    clearTimeout(timer);
    const away = leftAt === null ? 0 : now() - leftAt;
    leftAt = null;
    if (away >= REFOCUS_AFTER_MS) handleFocus(false); // 타이머가 못 돌았어도 한 번 꺼야 아래에서 '다시 보임'이 된다
    handleFocus(true);
  });
  return () => { clearTimeout(timer); sub.remove(); };
}

focusManager.setEventListener(handleFocus => listenAppFocus(handleFocus));
