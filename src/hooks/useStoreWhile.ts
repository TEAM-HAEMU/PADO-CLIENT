/**
 * 스토어 값을 구독하되, live가 false인 동안엔 마지막으로 돌려준 값을 그대로 돌려준다 — 가려진 화면(다른 탭·위를 덮은 상세 화면)이
 * 스토어가 바뀔 때마다(GPS 갱신 등) 다시 그려지지 않게. 스토어 자체(위치 감시 등)는 그대로 돈다.
 * live가 다시 true가 되는 렌더에서 곧바로 최신 값을 읽는다 — 돌아온 순간 한 번에 맞춘다.
 * equal: 셀렉터가 매번 새 객체를 만들면 shallow를 넘긴다 (같으면 지난 값을 돌려줘 다시 그리지 않는다)
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';

interface Store<S> { getState: () => S; subscribe: (listener: () => void) => () => void }

export function useStoreWhile<S, T>(store: Store<S>, selector: (s: S) => T, live: boolean, equal: (a: T, b: T) => boolean = Object.is): T {
  const held = useRef<{ v: T } | null>(null);
  const subscribe = useCallback((l: () => void) => store.subscribe(l), [store]);
  const getSnapshot = () => {
    if (!live && held.current) return held.current.v;
    const next = selector(store.getState());
    if (held.current && equal(held.current.v, next)) return held.current.v;
    held.current = { v: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot);
}
