import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { create } from 'zustand';
import { setTokenBridge } from '@/api/client';
import { authApi, userApi } from '@/api/endpoints';
import { identifyUser, resetUser, track, userIdFromToken } from '@/services/analytics';
import type { TokenPair } from '@/api/types';
import { queryClient } from '@/hooks/queryClient';
import { kv } from './storage';
import { usePreviewStore } from '@/services/preview';
import { signOutProviders } from '@/services/socialAuth';
import { useDraft } from './draft';

const SERVICE = 'pado.session';

type Status = 'loading' | 'guest' | 'authed';
interface AuthState {
  status: Status;
  accessToken: string | null;
  refreshToken: string | null;
  bootstrap: () => Promise<void>;
  /** meta: 분석용 로그인 방식 (email · kakao · google), signup이면 가입 완료 */
  signIn: (pair: TokenPair, meta?: { method: string; signup?: boolean }) => Promise<void>;
  signOut: (opts?: { callServer?: boolean }) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  accessToken: null,
  refreshToken: null,
  bootstrap: async () => {
    try {
      // iOS 키체인은 앱을 지워도 남는다 — 새로 설치한 경우 이전 세션을 되살리지 않는다
      // (Android는 앱 삭제 시 키스토어도 지워지므로 iOS만)
      if (Platform.OS === 'ios' && !kv.get('installed', false)) {
        await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
        kv.set('installed', true);
      }
      const cred = await Keychain.getGenericPassword({ service: SERVICE });
      if (cred) {
        const { accessToken, refreshToken } = JSON.parse(cred.password);
        set({ accessToken, refreshToken, status: 'authed' });
        identifyCurrentUser(accessToken);
        return;
      }
    } catch {}
    set({ status: 'guest' });
  },
  signIn: async (pair, meta) => {
    set({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, status: 'authed' });
    identifyCurrentUser(pair.accessToken);
    if (meta) track(meta.signup ? 'sign_up_completed' : 'login_completed', { method: meta.method });
    // 키체인 저장 실패는 이번 실행의 로그인을 깨뜨리지 않는다 (재시작 시 다시 로그인)
    await Keychain.setGenericPassword('pado', JSON.stringify({ accessToken: pair.accessToken, refreshToken: pair.refreshToken }), {
      service: SERVICE,
      // 이 기기에서만 (백업으로 다른 기기에 옮겨지지 않게)
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => {});
  },
  signOut: async ({ callServer = true } = {}) => {
    const { refreshToken } = get();
    track('logout', { by: callServer ? 'user' : 'session_end' });
    resetUser();
    set({ accessToken: null, refreshToken: null, status: 'guest' });
    if (callServer && refreshToken) authApi.logout(refreshToken).catch(() => {});
    // 다음 사용자에게 이전 사용자의 흔적이 남지 않게
    queryClient.clear();
    usePreviewStore.getState().stop();
    useDraft.getState().reset();
    signOutProviders();
    await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
  },
}));

// API 클라이언트에 토큰 저장소 연결 (재발급 시 새 토큰 쌍 저장, 재발급 실패 시 로그아웃)
setTokenBridge({
  get: () => ({ accessToken: useAuth.getState().accessToken, refreshToken: useAuth.getState().refreshToken }),
  set: pair => useAuth.getState().signIn(pair),
  onExpired: () => { if (useAuth.getState().status === 'authed') useAuth.getState().signOut({ callServer: false }); },
});

/** 분석 사용자 식별 — 토큰의 sub(사용자 ID), 없으면 닉네임 기반 */
function identifyCurrentUser(token: string) {
  userApi.me()
    .then(me => identifyUser(userIdFromToken(token) ?? `u:${me.username}`, me))
    .catch(() => {});
}
