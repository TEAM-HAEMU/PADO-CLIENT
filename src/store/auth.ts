import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { create } from 'zustand';
import { setTokenBridge } from '@/api/client';
import { authApi, userApi } from '@/api/endpoints';
import { analyticsMode, identifyUser, resetUser, track, userIdFromToken } from '@/services/analytics';
import type { TokenPair } from '@/api/types';
import { queryClient } from '@/hooks/queryClient';
import { kv } from './storage';
import { usePreviewStore } from '@/services/preview';
import { clearQueue } from '@/services/playQueue';
import { signOutProviders } from '@/services/socialAuth';
import { SESSION_EXPIRED_MESSAGE } from '@/api/errors';
import { useDraft } from './draft';
import { NOTIFY_DEFAULTS, setOnDetailedAnalyticsEnabled, usePrefs } from './prefs';
import { toast } from './toast';

const SERVICE = 'pado.session';

type Status = 'loading' | 'guest' | 'authed';
interface AuthState {
  status: Status;
  accessToken: string | null;
  refreshToken: string | null;
  bootstrap: () => Promise<void>;
  /** meta: 분석용 로그인 방식 (email · kakao · google), signup이면 가입 완료. refreshed: 토큰 재발급(같은 사용자 — 다시 식별하지 않음) */
  signIn: (pair: TokenPair, meta?: { method: string; signup?: boolean }, opts?: { refreshed?: boolean }) => Promise<void>;
  signOut: (opts?: { callServer?: boolean }) => Promise<void>;
}

/**
 * 로그아웃 직전에 할 일 — 아직 로그인 토큰이 있을 때 (services/push가 등록: 이 기기 푸시 토큰 지우기).
 * 로그아웃은 끝나길 기다리지 않고 바로 토큰을 비우므로, 서버 요청엔 넘겨받은 accessToken(로그아웃 순간의 토큰)을 쓴다.
 * callServer: 사용자가 직접 로그아웃(세션이 살아 있음). 세션 만료·탈퇴 뒤엔 false
 */
type BeforeSignOut = (opts: { callServer: boolean; accessToken: string | null }) => Promise<void>;
let beforeSignOut: BeforeSignOut | undefined;
export const setBeforeSignOut = (fn: BeforeSignOut) => { beforeSignOut = fn; };

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
  signIn: async (pair, meta, opts) => {
    // 막 가입했으면 지도에 들어가기 전에 알림 권한 안내 한 장 (로그인 상태가 되기 전에 정해야 첫 화면으로 뜬다)
    if (meta?.signup) usePrefs.getState().setPushPromptPending(true);
    set({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, status: 'authed' });
    // 재발급은 같은 사용자 — 매번 GET /users로 다시 식별하지 않는다
    if (!opts?.refreshed) identifyCurrentUser(pair.accessToken);
    if (meta) track(meta.signup ? 'sign_up_completed' : 'login_completed', { method: meta.method });
    // 키체인 저장 실패는 이번 실행의 로그인을 깨뜨리지 않는다 (재시작 시 다시 로그인)
    await Keychain.setGenericPassword('pado', JSON.stringify({ accessToken: pair.accessToken, refreshToken: pair.refreshToken }), {
      service: SERVICE,
      // 이 기기에서만 (백업으로 다른 기기에 옮겨지지 않게)
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => {});
  },
  signOut: async ({ callServer = true } = {}) => {
    const { accessToken, refreshToken } = get();
    // 푸시 토큰 삭제는 로그인 토큰이 필요하다 — 지금 토큰을 넘겨 두고, 끝나길(최대 몇 초) 기다리지 않고 화면부터 바꾼다
    const pushCleanup = (async () => { await beforeSignOut?.({ callServer, accessToken }); })().catch(() => {});
    track('logout', { by: callServer ? 'user' : 'session_end' });
    resetUser();
    set({ accessToken: null, refreshToken: null, status: 'guest' });
    // 서버 로그아웃은 푸시 토큰 삭제 뒤에 (먼저 세션을 끊으면 삭제 요청이 거절될 수 있다)
    if (callServer && refreshToken) pushCleanup.then(() => authApi.logout(refreshToken)).catch(() => {});
    // 다음 사용자에게 이전 사용자의 흔적이 남지 않게 (알림 설정도 — 다음 사용자의 설정을 못 받으면 기본값으로 보이게)
    usePrefs.getState().applyNotify(NOTIFY_DEFAULTS);
    queryClient.clear();
    // 전체 재생 대기열도 — 건너뛰기 대기·곡 조회 중이면 stop만으로는 대기열이 모르고, 로그아웃한 뒤에 다음 곡이 나왔다
    clearQueue();
    usePreviewStore.getState().stop();
    useDraft.getState().reset();
    signOutProviders();
    await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
  },
}));

// API 클라이언트에 토큰 저장소 연결 (재발급 시 새 토큰 쌍 저장, 재발급 실패 시 로그아웃)
setTokenBridge({
  get: () => ({ accessToken: useAuth.getState().accessToken, refreshToken: useAuth.getState().refreshToken }),
  set: pair => useAuth.getState().signIn(pair, undefined, { refreshed: true }),
  onExpired: () => {
    if (useAuth.getState().status !== 'authed') return;
    useAuth.getState().signOut({ callServer: false });
    // 아무 말 없이 로그인 화면으로 바뀌지 않게
    toast(SESSION_EXPIRED_MESSAGE);
  },
});

/** 분석 사용자 식별 (상세 분석일 때만 실제로 보냄) — 토큰의 sub(사용자 ID), 없으면 닉네임 기반 */
function identifyCurrentUser(token: string) {
  if (analyticsMode() !== 'detailed') return;
  userApi.me()
    .then(me => identifyUser(userIdFromToken(token) ?? `u:${me.username}`, me))
    .catch(() => {});
}

// 로그인한 뒤에 상세 분석을 켜면 그때 사용자 식별
setOnDetailedAnalyticsEnabled(() => { const t = useAuth.getState().accessToken; if (t) identifyCurrentUser(t); });
