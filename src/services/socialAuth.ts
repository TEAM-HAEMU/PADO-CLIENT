/**
 * 소셜 로그인 — 각 SDK에서 제공자 액세스 토큰을 받아 백엔드 /oauth2/{provider}에 넘긴다.
 * 키(.env)가 비어 있으면 SDK를 호출하지 않고 설정 안내를 던진다.
 */
import { login as kakaoLogin } from '@react-native-seoul/kakao-login';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { env } from '@/config';
import type { SocialProvider } from '@/api/types';

export class SocialCancelled extends Error {}

const need = (ok: boolean, what: string) => {
  if (!ok) throw new Error(`${what} 로그인 키가 아직 설정되지 않았어요. (.env → npm run env:sync)`);
};

let googleReady = false;

export async function getProviderToken(provider: SocialProvider): Promise<string> {
  // 목 모드에선 SDK 없이 흐름(가입 화면)까지 확인할 수 있게 가짜 토큰
  if (env.useMock) return `mock-${provider}-token`;

  if (provider === 'kakao') {
    need(!!env.kakaoAppKey, '카카오');
    try {
      const t = await kakaoLogin();
      return t.accessToken;
    } catch (e) {
      // 사용자가 카카오 로그인 창을 닫은 경우 — 오류 토스트 대신 조용히 취소
      const msg = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`;
      if (/cancel/i.test(msg)) throw new SocialCancelled();
      throw e;
    }
  }
  need(!!env.google.webClientId || !!env.google.iosClientId, 'Google');
  if (!googleReady) {
    GoogleSignin.configure({ webClientId: env.google.webClientId || undefined, iosClientId: env.google.iosClientId || undefined });
    googleReady = true;
  }
  try {
    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();
    if (res.type === 'cancelled') throw new SocialCancelled();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (e instanceof SocialCancelled || code === 'SIGN_IN_CANCELLED' || code === 'IN_PROGRESS' || code === '-5') throw new SocialCancelled();
    throw e;
  }
}

/** 로그아웃 시 소셜 SDK 세션도 끊는다 — 다음 로그인에서 다른 계정을 고를 수 있게 */
export async function signOutProviders() {
  if (env.useMock) return;
  if (googleReady) await GoogleSignin.signOut().catch(() => {});
}
