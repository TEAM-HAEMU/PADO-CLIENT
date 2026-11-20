/**
 * 미니 디스크 진행률 테두리 (2026-11-20 QA R-04) — 재생 중 250ms마다 오는 위치 갱신이 React 커밋을 만들지 않고
 * UI 스레드 값(Reanimated)만 바꾸는지.
 */
import './setup/screenEnv';

// import가 jest.mock 위로 끌어올려지므로 모듈 바깥 배열 대신 전역에 모은다
const mutables = () => ((globalThis as { mockMutables?: { value: number }[] }).mockMutables ??= []);
jest.mock('react-native-reanimated', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const id = (x: unknown) => x;
  const View = (p: Record<string, unknown>) => R.createElement('Animated.View', p);
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: () => (p: Record<string, unknown>) => R.createElement('AnimatedCircle', p) },
    Easing: { linear: id, cubic: id, inOut: id },
    makeMutable: (v: number) => { const m = { value: v }; ((globalThis as { mockMutables?: { value: number }[] }).mockMutables ??= []).push(m); return m; },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    withTiming: (to: number) => to,
    withRepeat: (x: unknown) => x,
    cancelAnimation: () => {},
  };
});
jest.mock('react-native-svg', () => require('./setup/screenEnv').mockHostModule());
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native/Libraries/Settings/Settings', () => ({ __esModule: true, default: { get: () => undefined } }));
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/anim/LoopView', () => ({ LoopView: require('./setup/screenEnv').mockHost('LoopView'), nativeLoops: true }));
jest.mock('@/components/player/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/hooks/useScreenVisible', () => ({ useScreenVisible: () => true }));
jest.mock('@/navigation/ref', () => ({ navigationRef: { isReady: () => true, getCurrentRoute: () => ({ name: 'Map' }), addListener: () => () => {} } }));
jest.mock('@/services/previewSource', () => ({ findPreview: jest.fn(), noPreviewMessage: () => '' }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { MiniDisc, progressOf } from '@/components/music/MiniDisc';
import { usePreviewStore } from '@/services/preview';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

it('progressOf — 0~1로 자르고, 길이를 모르면 0', () => {
  expect(progressOf(15, 30)).toBe(0.5);
  expect(progressOf(40, 30)).toBe(1);
  expect(progressOf(-1, 30)).toBe(0);
  expect(progressOf(5, 0)).toBe(0);
});

it('재생 중 위치가 갱신돼도 다시 그리지 않고 테두리 값만 바뀐다', () => {
  act(() => usePreviewStore.setState({ key: 's1', url: 'https://x/p.m4a', meta: { title: 't', artist: 'a' }, paused: false, buffering: false, pending: null, position: 0, duration: 30 }));
  let commits = 0;
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(React.Profiler, { id: 'disc', onRender: () => { commits++; } }, React.createElement(MiniDisc))); });
  expect(r.root.findAll(n => (n.type as unknown) === 'AnimatedCircle')).toHaveLength(1);
  const ring = mutables()[mutables().length - 1];
  commits = 0;
  // 30초 동안 250ms마다 (120번)
  for (let i = 1; i <= 120; i++) act(() => usePreviewStore.getState()._progress(i * 0.25, 30));
  expect(commits).toBe(0);
  expect(ring.value).toBeCloseTo(1);
  act(() => usePreviewStore.getState()._progress(7.5, 30));
  expect(ring.value).toBeCloseTo(0.25);
  // 새 곡이면 0부터
  act(() => usePreviewStore.getState().play('s2', 'https://x/q.m4a', { title: 't2', artist: 'a' }));
  expect(ring.value).toBe(0);
  act(() => r.unmount());
});
