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
