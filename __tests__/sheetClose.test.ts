/*
 * 바텀시트 닫기 — 닫힘 애니메이션 뒤에 이 시트 라우트만 빼고, 닫는 동안 뷰 구조가 바뀌지 않는지
 * (Sentry REACT-NATIVE-4: 닫기 시작과 화면 제거가 한 프레임에 겹치면 Android에서 addViewAt 크래시)
 */
import './setup/screenEnv';

type Listener = (e: { preventDefault: () => void; data: { action: { type: string } } }) => void;
const mockListeners: Record<string, Listener[]> = {};
const mockNav = {
  addListener: jest.fn((ev: string, fn: Listener) => { (mockListeners[ev] ??= []).push(fn); return () => { mockListeners[ev] = mockListeners[ev].filter(f => f !== fn); }; }),
  dispatch: jest.fn(),
  goBack: jest.fn(),
};
// 닫힘 애니메이션 완료 콜백 — 테스트가 직접 불러 '애니메이션이 끝났다'를 흉내 낸다
const mockTimings: ((done: boolean) => void)[] = [];

// @react-navigation/native는 ESM이라 jest가 못 읽는다 — 시트가 쓰는 것만
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ key: 'sheet-1', name: 'PinPreview' }),
  CommonActions: { reset: (payload: unknown) => ({ type: 'RESET', payload }) },
}));
jest.mock('react-native-reanimated', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const id = (x: unknown) => x;
  return {
    __esModule: true,
    default: { View: (p: Record<string, unknown>) => R.createElement('Animated.View', p) },
    Easing: { in: id, out: id, cubic: id },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedKeyboard: () => ({ height: { value: 0 } }),
    withTiming: (to: number, _cfg: unknown, cb?: (done: boolean) => void) => { if (cb) mockTimings.push(cb); return to; },
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...a: unknown[]) => void, ...a: unknown[]) => fn(...a) }));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) }));
jest.mock('@/components/ui/Dialog', () => ({ DialogHost: () => null }));

import { Sheet } from '@/components/ui/Sheet';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

let mounted: import('react-test-renderer').ReactTestRenderer | undefined;
beforeEach(() => { jest.clearAllMocks(); mockTimings.length = 0; Object.keys(mockListeners).forEach(k => delete mockListeners[k]); });
afterEach(() => { act(() => { mounted?.unmount(); }); mounted = undefined; });

function render() {
  act(() => { mounted = TestRenderer.create(React.createElement(Sheet, null, React.createElement('Body'))); });
  return mounted!;
}
/** 시트 맨 바깥 View (배경·시트 카드를 담는 것) */
const rootView = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAll((n: Node) => (n.type as unknown) === 'View')[0];
/** 내비게이션이 이 시트 라우트를 빼려 할 때 (goBack·배경 탭·뒤로가기) */
function beforeRemove(type = 'GO_BACK') {
  const preventDefault = jest.fn();
  act(() => { mockListeners.beforeRemove.forEach(fn => fn({ preventDefault, data: { action: { type } } })); });
  return preventDefault;
}

test('닫는 동안 맨 바깥 View는 늘 실제 View — 터치만 막고 뷰 구조는 그대로 (Fabric이 배경을 새 부모로 옮기지 않게)', () => {
  const r = render();
  expect(rootView(r).props.collapsable).toBe(false);
  expect(rootView(r).props.pointerEvents).toBe('auto');
  beforeRemove();
  expect(rootView(r).props.pointerEvents).toBe('none');
  expect(rootView(r).props.collapsable).toBe(false);
});

test('닫힘 애니메이션이 끝난 뒤에야 이 시트 라우트만 뺀다 — 그사이 위에 새로 연 화면은 남는다', () => {
  render();
  const prevent = beforeRemove('GO_BACK');
  expect(prevent).toHaveBeenCalled();
  expect(mockNav.dispatch).not.toHaveBeenCalled(); // 아직 내려가는 중
  act(() => { mockTimings.forEach(cb => cb(true)); });
  expect(mockNav.dispatch).toHaveBeenCalledTimes(1);
  const thunk = mockNav.dispatch.mock.calls[0][0] as (s: object) => { type: string; payload: { routes: { key: string }[]; index: number } };
  // 닫히는 사이 시트 위에 댓글 시트가 열렸다
  const state = { key: 'stack', index: 2, routes: [{ key: 'tabs', name: 'Tabs' }, { key: 'sheet-1', name: 'PinPreview' }, { key: 'comments-1', name: 'Comments' }] };
  const action = thunk(state);
  expect(action.type).toBe('RESET');
  expect(action.payload.routes.map(x => x.key)).toEqual(['tabs', 'comments-1']);
  expect(action.payload.index).toBe(1);
});

test('닫히는 중 두 번째 닫기(배경 연타·뒤로가기)는 막기만 하고 다시 애니메이션하지 않는다', () => {
  render();
  beforeRemove();
  const second = beforeRemove('GO_BACK');
  expect(second).toHaveBeenCalled();
  expect(mockTimings).toHaveLength(1);
});
