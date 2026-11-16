/* 네이티브 모듈 목 — 순수 로직(API 클라이언트·목 서버·유틸)만 테스트한다 */
jest.mock('react-native-config', () => ({ API_BASE_URL: 'https://api.test/api/v1', USE_MOCK: 'false' }));
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  const mmkv = {
    getString: k => store.get(k),
    set: (k, v) => store.set(k, v),
    getBoolean: k => store.get(k),
    getNumber: k => store.get(k),
    remove: k => store.delete(k),
    delete: k => store.delete(k),
    clearAll: () => store.clear(),
  };
  return { createMMKV: () => mmkv, MMKV: function () { return mmkv; } };
});
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
  ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly' },
}));

/* Amplitude — 네이티브 없이 호출만 기록 */
jest.mock('@amplitude/analytics-react-native', () => {
  class Identify { constructor() { this.props = {}; } set(k, v) { this.props[k] = v; return this; } }
  return {
    init: jest.fn(() => ({ promise: Promise.resolve() })),
    add: jest.fn(() => ({ promise: Promise.resolve() })),
    track: jest.fn(),
    setUserId: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    setOptOut: jest.fn(),
    remove: jest.fn(() => ({ promise: Promise.resolve() })),
    flush: jest.fn(() => ({ promise: Promise.resolve() })),
    Identify,
    Types: { LogLevel: { None: 0, Warn: 2 } },
  };
});
jest.mock('@amplitude/plugin-session-replay-react-native', () => ({ SessionReplayPlugin: function SessionReplayPlugin() {} }));

/* Sentry — 네이티브 없이 호출만 기록 (전송 조건·걸러내기는 services/monitoringRules 순수 함수로 테스트) */
jest.mock('@sentry/react-native', () => {
  const scope = { setTags: jest.fn(() => scope), setFingerprint: jest.fn(() => scope) };
  return {
    init: jest.fn(),
    close: jest.fn(() => Promise.resolve(true)),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn((e, fn) => { if (typeof fn === 'function') fn(scope); return 'event-id'; }),
    reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation', registerNavigationContainer: jest.fn() })),
    wrap: c => c,
    ErrorBoundary: ({ children }) => children,
    __scope: scope,
  };
});
