/** 1.1 로그인 (Figma B 1.4 메인 로그인) — 카카오 · Apple(iOS) · Google · 이메일 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { SocialProvider } from '@/api/types';
import { AUTH_PAGES, AuthButton, AuthDisclaimer, AuthHeader, AuthTitle } from '@/components/auth/AuthChrome';
import { IntroArt } from '@/components/auth/IntroArt';
import { AppleSymbol, GoogleSymbol, KakaoSymbol } from '@/components/ui/Brand';
import { Icon, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { env } from '@/config';
import type { RootScreen } from '@/navigation/types';
import { appleSignInAvailable, getProviderCredential, SocialCancelled } from '@/services/socialAuth';
import { track } from '@/services/analytics';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';

/** 카카오 로그인 버튼 글자·심볼 (카카오 가이드: 검정 85%) */
const KAKAO_INK = 'rgba(0,0,0,0.85)';

export default function LoginScreen({ navigation }: RootScreen<'Login'>) {
  const insets = useSafeAreaInsets();
  const signIn = useAuth(s => s.signIn);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  const social = async (provider: SocialProvider) => {
    if (busy) return; // 다른 로그인이 진행 중이면 무시
    setBusy(provider);
    const method = provider.toLowerCase();
    track('login_started', { method });
    try {
      const r = await authApi.social(provider, await getProviderCredential(provider));
      if (!r.signupRequired && r.accessToken && r.refreshToken) {
        await signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken, accessTokenExpiresIn: r.accessTokenExpiresIn ?? 0, refreshTokenExpiresIn: r.refreshTokenExpiresIn ?? 0 }, { method: provider.toLowerCase() });
      } else if (r.signupToken) {
        // 처음 온 소셜 계정 — 가입 화면(sign_up_started는 가입 화면이 기록)
        navigation.navigate('Signup', { mode: 'social', provider, signupToken: r.signupToken, profile: r.profile });
      }
    } catch (e) {
      if (e instanceof SocialCancelled) track('login_cancelled', { method });
      else { track('login_failed', { method, code: (e as { code?: string }).code ?? null }); toast(errorMessage(e), 'error'); }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Wave style={{ position: 'absolute', left: 0, right: 0, top: '40%' }} />
      {/* 소개를 거쳐 왔으면 마지막 장으로 돌아갈 수 있다 (이미 본 사람은 로그인부터라 뒤로 없음) */}
      <AuthHeader page={AUTH_PAGES - 1} onBack={navigation.canGoBack() ? navigation.goBack : undefined} style={{ marginTop: insets.top + 12 }} />
      <AuthTitle title={'바닷속에 숨겨진\n보물을 찾으러 갈까요?'} style={{ marginTop: 39 }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
        <IntroArt page={AUTH_PAGES - 1} />
      </View>

      <View style={{ paddingHorizontal: 24, gap: 10 }}>
        <AuthButton strong bg={colors.kakao} fg={KAKAO_INK} icon={<KakaoSymbol color={KAKAO_INK} />} label="카카오로 계속하기" loading={busy === 'kakao'} disabled={!!busy} onPress={() => social('kakao')} />
        {/* Apple 로그인 (가이드라인 4.8) — HIG: 검정 바탕 + 흰 Apple 로고 */}
        {appleSignInAvailable() ? (
          <AuthButton strong bg="#000000" fg="#FFFFFF" icon={<AppleSymbol color="#FFFFFF" />} label="Apple로 계속하기" loading={busy === 'apple'} disabled={!!busy} onPress={() => social('apple')} />
        ) : null}
        <AuthButton strong bg="#FFFFFF" fg="#000000" border={colors.line} icon={<GoogleSymbol />} label="Google로 계속하기" loading={busy === 'google'} disabled={!!busy} onPress={() => social('google')} />
        <AuthButton strong icon={<Icon name="mail" size={20} color={colors.onPrimary} />} label="이메일로 계속하기" disabled={!!busy} onPress={() => navigation.navigate('EmailLogin')} />
      </View>
      {env.useMock ? <T v="micro" c="warning" style={{ textAlign: 'center', marginTop: 8 }}>목 서버 모드 (USE_MOCK=true)</T> : null}
      <AuthDisclaimer style={{ paddingTop: 30, paddingBottom: insets.bottom + 16 }} />
    </View>
  );
}
