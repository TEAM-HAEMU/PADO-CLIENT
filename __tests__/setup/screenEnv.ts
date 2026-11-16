/**
 * 화면 렌더 테스트 공용 준비 — 테스트 파일 맨 위에서 import한다 (화면 import보다 먼저).
 * NativeWind babel 플러그인이 JSX·createElement를 css-interop 런타임으로 바꾸는데, 그 런타임은 jest에서 깨진다 → 그냥 React로.
 * 화면 조각은 mockHost(이름)으로 바꿔 끼우면 props를 그대로 가진 호스트 요소가 되어 test renderer로 찾고 누를 수 있다.
 */
// 아래 ['createElement']는 일부러 대괄호 — 점 표기는 NativeWind 플러그인이 css-interop 호출로 바꿔 jest.mock 팩토리 검사에 걸린다
// eslint-disable-next-line dot-notation
jest.mock('react-native-css-interop', () => ({ createInteropElement: jest.requireActual('react')['createElement'] }));
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/ui/Wave', () => ({ Wave: () => null }));
jest.mock('@/services/analytics', () => ({ track: jest.fn(), detailedOnly: () => ({}), currentDropId: () => undefined }));

/** 이름 그대로의 호스트 요소 (props·children 유지). jest.mock 팩토리 안에서는 require('./setup/screenEnv').mockHost로 */
export function mockHost(name: string) {
  // eslint-disable-next-line dot-notation
  return (props: Record<string, unknown>) => jest.requireActual('react')['createElement'](name, props);
}

/** 모듈의 모든 내보내기를 이름 그대로의 호스트 요소로 (예: '@/components/ui') */
export function mockHostModule() {
  const cache: Record<string, unknown> = {};
  return new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : typeof key === 'string' ? (cache[key] ??= mockHost(key)) : undefined) });
}
