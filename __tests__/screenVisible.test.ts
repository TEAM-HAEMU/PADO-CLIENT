/* 화면이 보이는가 — 탭 내비게이터가 data 없이 보내는 전환 이벤트에도 예외 없이, 스택에 덮이면 숨김·드러나면 보임 */
// @react-navigation/native는 ESM이라 jest가 못 읽는다 — 훅이 쓰는 두 문맥만 같은 객체로
jest.mock('@react-navigation/native', () => {
  const { createContext } = jest.requireActual<typeof import('react')>('react');
  return { NavigationContext: createContext(undefined), NavigationRouteContext: createContext(undefined) };
});
import { NavigationContext, NavigationRouteContext } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useScreenVisible } from '@/hooks/useScreenVisible';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

type Listener = (e: { data?: { closing?: boolean } }) => void;
/** addListener를 기록하는 가짜 내비게이션 — emit은 그 내비게이터가 이 화면에 이벤트를 보내는 것 */
interface FakeNav {
  getState: () => { type: string; index: number; routes: { key: string }[] };
  getParent: () => FakeNav | undefined;
  addListener: (ev: string, fn: Listener) => () => void;
  emit: (ev: string, data?: { closing: boolean }) => void;
}
function fakeNav(type: 'tab' | 'stack', parent?: FakeNav): FakeNav {
  const ls: Record<string, Listener[]> = {};
  return {
    getState: () => ({ type, index: 0, routes: [{ key: 'r1' }] }),
    getParent: () => parent,
    addListener: (ev: string, fn: Listener) => { (ls[ev] ??= []).push(fn); return () => { ls[ev] = ls[ev].filter(f => f !== fn); }; },
    emit: (ev: string, data?: { closing: boolean }) => (ls[ev] ?? []).forEach(fn => fn(data === undefined ? {} : { data })),
  };
}

beforeAll(() => { Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true }); });

let visible: boolean | undefined;
const Probe = () => { visible = useScreenVisible(); return null; };
function mount(nav: FakeNav) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      React.createElement(NavigationContext.Provider, { value: nav as never },
        React.createElement(NavigationRouteContext.Provider, { value: { key: 'r1', name: 'Library' } as never }, React.createElement(Probe))),
    );
  });
  return r;
}

test('탭 화면 — bottom-tabs가 탭을 바꿀 때 data 없이 보내는 transitionStart·transitionEnd에도 예외 없이 보임 유지', () => {
  const tabs = fakeNav('tab');
  const r = mount(tabs);
  expect(visible).toBe(true);
  expect(() => act(() => { tabs.emit('transitionStart'); tabs.emit('transitionEnd'); })).not.toThrow();
  expect(visible).toBe(true);
  act(() => { r.unmount(); });
});

test('탭 안의 화면이 상위 스택에 덮이면 숨기고, 다시 드러나기 시작하면 보인다', () => {
  const root = fakeNav('stack');
  const tabs = fakeNav('tab', root);
  const r = mount(tabs);
  act(() => { root.emit('transitionEnd', { closing: true }); });
  expect(visible).toBe(false);
  act(() => { tabs.emit('transitionStart'); }); // 탭 전환 이벤트(data 없음)는 상위 단계 덮임을 풀지 않는다
  expect(visible).toBe(false);
  act(() => { root.emit('transitionStart', { closing: false }); });
  expect(visible).toBe(true);
  act(() => { r.unmount(); });
});
