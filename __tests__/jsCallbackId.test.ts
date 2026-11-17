/*
 * 워클릿 → JS 호출 번호표 (hooks/useJsCallbackId).
 * 컴포넌트 안에서 만든 함수를 워클릿에 그대로 넘기면 UI 런타임이 그 함수를 붙잡아 컴포넌트 트리 전체가 JS 힙에 남는다
 * (Android 실측: 핀 미리보기 시트를 열고 닫을 때마다 Hermes 힙이 계속 늘었다). 번호만 넘기고 표에서 찾아 부르는지 확인한다.
 */
import './setup/screenEnv';
import { callJsCallback, jsCallbackCount, useJsCallbackId } from '@/hooks/useJsCallbackId';

const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string; readdirSync: (p: string, o: { recursive: true }) => string[] };
const path = require('path') as { resolve: (...p: string[]) => string };

let seen: number | undefined;
function Probe({ fn }: { fn: () => void }) {
  seen = useJsCallbackId(fn);
  return null;
}

test('같은 번호로 가장 최근 렌더의 함수를 부르고, 사라지면 표에서 지운다', () => {
  const before = jsCallbackCount();
  const first = jest.fn();
  const second = jest.fn();
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Probe, { fn: first })); });
  const id = seen!;
  act(() => { r.update(React.createElement(Probe, { fn: second })); });
  expect(seen).toBe(id);
  callJsCallback(id);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(jsCallbackCount()).toBe(before + 1);
  act(() => { r.unmount(); });
  expect(jsCallbackCount()).toBe(before);
  callJsCallback(id); // 이미 사라진 번호 — 아무 일도 없다
  expect(second).toHaveBeenCalledTimes(1);
});

test('src에서 scheduleOnRN은 callJsCallback(번호)으로만 부른다 — 컴포넌트 안 함수를 워클릿에 넘기지 않게', () => {
  const root = path.resolve('src');
  const files = fs.readdirSync(root, { recursive: true }).filter(f => /\.tsx?$/.test(f));
  const calls: string[] = [];
  for (const f of files) {
    const code = fs.readFileSync(path.resolve(root, f), 'utf8');
    for (const m of code.matchAll(/scheduleOnRN\(\s*([^,)\s]+)/g)) calls.push(`${f}: ${m[1]}`);
  }
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.filter(c => !c.endsWith(': callJsCallback'))).toEqual([]);
});
