import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * 늘 같은 함수(정체성 고정)를 주되, 부르면 가장 최근 렌더의 fn을 실행한다.
 * memo 행에 넘기는 콜백용 — state를 읽는 콜백도 deps 없이 넘겨 행이 다시 그려지지 않게. 렌더 중에 부르지 말 것(이벤트 처리용)
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
