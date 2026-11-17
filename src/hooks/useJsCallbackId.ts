/**
 * 워클릿(UI 스레드)에서 JS 함수를 부를 때 쓰는 번호표.
 *
 * 컴포넌트 안에서 만든 함수(예: 시트의 close)를 워클릿 클로저에 그대로 넣으면, 그 함수가 UI 런타임으로 넘어가면서
 * 네이티브가 JS 함수를 직접 붙잡는다. UI 런타임은 거의 GC를 돌지 않아 이 참조가 사실상 풀리지 않고,
 * Hermes는 같은 함수 범위의 클로저가 환경을 하나로 공유하므로 그 함수 하나가 컴포넌트의 상태 setter → 파이버 →
 * 자식 트리 전체를 JS 힙에 남긴다 (Android 실측: 핀 미리보기 시트를 열 때마다 렌더 횟수만큼 쌓여 Hermes 힙이 계속 늘었다).
 *
 * 그래서 워클릿에는 번호(숫자)와 모듈 함수 callJsCallback만 넘긴다: `scheduleOnRN(callJsCallback, id)`.
 * 실제 함수는 여기 표에 두고, 컴포넌트가 사라지면 표에서 지운다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const callbacks = new Map<number, () => void>();
let seq = 0;

/** 워클릿에서 scheduleOnRN(callJsCallback, id)로 부른다. 이미 사라진 번호면 아무것도 안 한다 */
export function callJsCallback(id: number) {
  callbacks.get(id)?.();
}

/** 지금 표에 남은 함수 수 (테스트용) */
export const jsCallbackCount = () => callbacks.size;

/** fn의 최신 버전을 부르는 고정 번호 — 렌더마다 fn이 바뀌어도 번호는 같다 */
export function useJsCallbackId(fn: () => void): number {
  const latest = useRef(fn);
  useLayoutEffect(() => { latest.current = fn; });
  const [id] = useState(() => ++seq);
  useEffect(() => {
    callbacks.set(id, () => latest.current());
    return () => { callbacks.delete(id); };
  }, [id]);
  return id;
}
