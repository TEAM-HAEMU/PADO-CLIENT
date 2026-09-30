import { createMMKV } from 'react-native-mmkv';

/** 앱 설정용 빠른 저장소 (민감 정보 X — 토큰은 Keychain) */
export const storage = createMMKV({ id: 'pado' });

export const kv = {
  get: <T>(key: string, fallback: T): T => {
    const raw = storage.getString(key);
    if (raw === undefined) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
  set: (key: string, value: unknown) => storage.set(key, JSON.stringify(value)),
  remove: (key: string) => storage.remove(key),
};
