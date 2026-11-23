/*
 * 바텀시트 닫기 — 닫힘 애니메이션 뒤에 이 시트 라우트만 빼고, 닫는 동안 뷰 구조가 바뀌지 않는지
 * (Sentry REACT-NATIVE-4: 닫기 시작과 화면 제거가 한 프레임에 겹치면 Android에서 addViewAt 크래시)
 * 워클릿(쓸어내리기·닫힘 애니메이션 끝)이 시트 안에서 만든 함수를 직접 넘기지 않는지 (넘기면 UI 런타임이 붙잡아 시트 트리가 JS 힙에 남는다)
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
// 워클릿이 JS로 부른 것 (scheduleOnRN) · 시트가 만든 쓸어내리기 설정
const mockScheduled: { fn: unknown; args: unknown[] }[] = [];
const mockPan: { cfg?: { onDeactivate: (e: { translationY: number; velocityY: number }) => void } } = {};

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
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...a: unknown[]) => void, ...a: unknown[]) => { mockScheduled.push({ fn, args: a }); fn(...a); } }));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: (cfg: typeof mockPan.cfg) => { mockPan.cfg = cfg; return {}; } }));
jest.mock('@/components/ui/Dialog', () => ({ DialogHost: () => null }));
// 창 폭 (넓은 화면 최대 폭 테스트용 — 기본은 흔한 폰 폭)
let mockWinWidth = 360;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: mockWinWidth, height: 800, scale: 2, fontScale: 1 }) }));

import { Sheet } from '@/components/ui/Sheet';
import { callJsCallback, jsCallbackCount } from '@/hooks/useJsCallbackId';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

let mounted: import('react-test-renderer').ReactTestRenderer | undefined;
beforeEach(() => { jest.clearAllMocks(); mockTimings.length = 0; mockScheduled.length = 0; Object.keys(mockListeners).forEach(k => delete mockListeners[k]); });
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

test('닫힘 애니메이션이 끝나면 워클릿은 함수 대신 번호로 JS를 부른다', () => {
  render();
  beforeRemove('GO_BACK');
  act(() => { mockTimings.forEach(cb => cb(true)); });
  expect(mockScheduled).toHaveLength(1);
  expect(mockScheduled[0].fn).toBe(callJsCallback);
  expect(typeof mockScheduled[0].args[0]).toBe('number');
  expect(mockNav.dispatch).toHaveBeenCalledTimes(1);
});

test('아래로 쓸어 닫기도 번호로 부르고, 시트가 사라지면 번호표에서 지운다', () => {
  const before = jsCallbackCount();
  render();
  expect(jsCallbackCount()).toBeGreaterThan(before);
  act(() => { mockPan.cfg!.onDeactivate({ translationY: 200, velocityY: 0 }); });
  expect(mockScheduled).toHaveLength(1);
  expect(mockScheduled[0].fn).toBe(callJsCallback);
  expect(typeof mockScheduled[0].args[0]).toBe('number');
  expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  act(() => { mounted?.unmount(); });
  mounted = undefined;
  expect(jsCallbackCount()).toBe(before);
});

/* 닫기 전 확인 (QA 2026-11-20 U-02 — 곡 추가 시트에서 고른 곡이 확인 없이 버려지던 것) */
describe('confirmClose', () => {
  const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
  function renderWith(confirmClose: () => Promise<boolean>) {
    act(() => { mounted = TestRenderer.create(React.createElement(Sheet, { confirmClose, children: React.createElement('Body') })); });
    return mounted!;
  }

  test('취소하면 닫지 않고, 닫힘 애니메이션도 시작하지 않는다', async () => {
    const ask = jest.fn(async () => false);
    const r = renderWith(ask);
    const prevent = beforeRemove('GO_BACK');
    expect(prevent).toHaveBeenCalled();
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mockNav.dispatch).not.toHaveBeenCalled();
    expect(rootView(r).props.pointerEvents).toBe('auto');
    // 다시 닫으려 하면 또 묻는다
    beforeRemove('GO_BACK');
    await flush();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  test('확인하면 원래 닫기를 다시 보내고, 그때는 묻지 않고 닫힘 애니메이션으로 간다', async () => {
    const ask = jest.fn(async () => true);
    const r = renderWith(ask);
    beforeRemove('GO_BACK');
    await flush();
    expect(mockNav.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    beforeRemove('GO_BACK'); // 다시 보낸 닫기
    expect(ask).toHaveBeenCalledTimes(1);
    expect(rootView(r).props.pointerEvents).toBe('none');
  });

  test('묻는 동안 연타한 닫기는 한 번만 묻는다', async () => {
    let answer!: (v: boolean) => void;
    const ask = jest.fn(() => new Promise<boolean>(res => { answer = res; }));
    renderWith(ask);
    beforeRemove('GO_BACK');
    beforeRemove('GO_BACK');
    expect(ask).toHaveBeenCalledTimes(1);
    answer(false);
    await flush();
  });

  test('앱이 스택을 재구성(reset)할 때는 묻지 않는다', () => {
    const ask = jest.fn(async () => false);
    const r = renderWith(ask);
    beforeRemove('RESET');
    expect(ask).not.toHaveBeenCalled();
    expect(rootView(r).props.pointerEvents).toBe('none');
  });
});

/* 높이 제한 (QA 2026-11-20 Z-04 — 짧은 화면에서 시트가 상태 표시줄 밑까지 올라가던 것) */
describe('시트 최대 높이 · 넘치면 스크롤', () => {
  function renderWith(props: Record<string, unknown>) {
    act(() => { mounted = TestRenderer.create(React.createElement(Sheet, { ...props, children: React.createElement('Body') })); });
    return mounted!;
  }
  const layout = (n: Node, height: number) => act(() => { (n.props.onLayout as (e: object) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 411, height } } }); });
  /** 시트 래퍼 (maxHeight · 올라오는 애니메이션) */
  const wrapper = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAll((n: Node) => (n.type as unknown) === 'Animated.View' && typeof n.props.onLayout === 'function')[0];
  const flat = (s: unknown) => Object.assign({}, ...([s].flat(Infinity) as object[]).filter(Boolean));
  const scrollers = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAll((n: Node) => typeof n.type === 'string' && typeof n.props.onContentSizeChange === 'function');

  test('화면 높이를 알면 상단 안전영역 아래까지만 (411dp → 403)', () => {
    const r = renderWith({});
    layout(rootView(r), 411);
    expect(flat(wrapper(r).props.style).maxHeight).toBe(403);
  });

  test('화면이 준 % 최대 높이는 화면 기준 숫자로 — 안전영역보다 크면 안전영역까지', () => {
    const r = renderWith({ style: { maxHeight: '70%' } });
    layout(rootView(r), 400);
    expect(flat(wrapper(r).props.style).maxHeight).toBe(280);
    const r2 = renderWith({ style: { maxHeight: '99%' } });
    layout(rootView(r2), 400);
    expect(flat(wrapper(r2).props.style).maxHeight).toBe(392);
  });

  test('내용이 들어가면 스크롤을 꺼 두고, 넘칠 때만 켠다', () => {
    const r = renderWith({});
    const [sv] = scrollers(r);
    expect(sv.props.scrollEnabled).toBe(false);
    layout(sv, 300);
    act(() => { (sv.props.onContentSizeChange as (w: number, h: number) => void)(411, 280); });
    expect(scrollers(r)[0].props.scrollEnabled).toBe(false);
    act(() => { (sv.props.onContentSizeChange as (w: number, h: number) => void)(411, 520); });
    expect(scrollers(r)[0].props.scrollEnabled).toBe(true);
  });

  test('자기 목록이 있는 시트(scroll={false})나 높이를 정한 시트는 감싸지 않는다', () => {
    expect(scrollers(renderWith({ scroll: false }))).toHaveLength(0);
    expect(scrollers(renderWith({ style: { height: '82%' } }))).toHaveLength(0);
  });
});

/* 넓은 화면 최대 폭 (QA 2026-11-20 Z-07 — 펼친 폴드에서 시트가 화면 끝까지 늘어나던 것) */
describe('시트 폭', () => {
  afterEach(() => { mockWinWidth = 360; });
  const wrapper = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAll((n: Node) => (n.type as unknown) === 'Animated.View' && typeof n.props.onLayout === 'function')[0];
  const flat = (s: unknown) => Object.assign({}, ...([s].flat(Infinity) as object[]).filter(Boolean));
  function renderAt(width: number, props: Record<string, unknown> = {}) {
    mockWinWidth = width;
    act(() => { mounted = TestRenderer.create(React.createElement(Sheet, { ...props, children: React.createElement('Body') })); });
    return mounted!;
  }

  test('카드는 화면 폭(100%)을 쓰되 최대 600, 가운데 — 폰에선 늘이기와 같은 폭', () => {
    const st = flat(wrapper(renderAt(360)).props.style);
    expect(st).toMatchObject({ width: '100%', maxWidth: 600, alignSelf: 'center' });
  });

  test('펼친 폴드(673)에서도 최대 600, 가운데 — 핀 미리보기와 그 위 댓글 시트가 같은 폭', () => {
    const st = flat(wrapper(renderAt(673)).props.style);
    expect(st).toMatchObject({ width: '100%', maxWidth: 600, alignSelf: 'center' });
  });
});
