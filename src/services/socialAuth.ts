/**
 * 소셜 로그인 — 각 SDK에서 받은 자격 증명을 백엔드 /oauth2/{provider}에 넘긴다.
 *  - 카카오·Google: 제공자 액세스 토큰
 *  - Apple(iOS만): identity token + authorization code (+ 첫 로그인 때만 오는 이름)
 * 키(.env)가 비어 있으면 SDK를 호출하지 않고 설정 안내를 던진다.
 */
import { Platform } from 'react-native';
import { login as kakaoLogin } from '@react-native-seoul/kakao-login';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth, type AppleRequestResponseFullName } from '@invertase/react-native-apple-authentication';
import { env } from '@/config';
import type { SocialLoginBody, SocialProvider } from '@/api/types';

export class SocialCancelled extends Error {}

const need = (ok: boolean, what: string) => {
  if (!ok) throw new Error(`${what} 로그인 키가 아직 설정되지 않았어요. (.env → npm run env:sync)`);
};

let googleReady = false;

/** Apple 로그인 버튼을 보여줄지 — iOS 13 이상에서만 (Android는 웹 방식이 필요해 제공하지 않음) */
export const appleSignInAvailable = () => Platform.OS === 'ios' && (env.useMock || appleAuth.isSupported);

/** Apple이 주는 이름 → 가입 화면 닉네임 기본값. 한글 이름은 성+이름 붙여서, 그 외는 이름 성 */
export function appleDisplayName(n: AppleRequestResponseFullName | null | undefined): string | undefined {
  if (!n) return undefined;
  const family = n.familyName?.trim() ?? '';
  const given = n.givenName?.trim() ?? '';
  const name = /[가-힣]/.test(family + given) ? family + given : [given, family].filter(Boolean).join(' ');
  return name || n.nickname?.trim() || undefined;
}

export async function getProviderCredential(provider: SocialProvider): Promise<SocialLoginBody> {
  // 목 모드에선 SDK 없이 흐름(가입 화면)까지 확인할 수 있게 가짜 자격 증명
  if (env.useMock) {
    return provider === 'apple'
      ? { identityToken: 'mock-apple-token', authorizationCode: 'mock-apple-code', name: '파도타기' }
      : { accessToken: `mock-${provider}-token` };
  }
  if (provider === 'apple') return appleCredential();
  if (provider === 'kakao') return { accessToken: await kakaoToken() };
  return { accessToken: await googleToken() };
}

async function appleCredential(): Promise<SocialLoginBody> {
  try {
    const res = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      // 이름·이메일은 처음 동의할 때 한 번만 온다 (이후 로그인은 null)
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });
    if (!res.identityToken || !res.authorizationCode) throw new Error('Apple 로그인 정보를 받지 못했어요. 다시 시도해주세요.');
    const name = appleDisplayName(res.fullName);
    return { identityToken: res.identityToken, authorizationCode: res.authorizationCode, ...(name ? { name } : null) };
  } catch (e) {
    if ((e as { code?: string })?.code === appleAuth.Error.CANCELED) throw new SocialCancelled();
    throw e;
  }
}

async function kakaoToken(): Promise<string> {
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

async function googleToken(): Promise<string> {
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

/** 로그아웃 시 소셜 SDK 세션도 끊는다 — 다음 로그인에서 다른 계정을 고를 수 있게 (Apple은 앱이 끊을 세션이 없음) */
export async function signOutProviders() {
  if (env.useMock) return;
  if (googleReady) await GoogleSignin.signOut().catch(() => {});
}
