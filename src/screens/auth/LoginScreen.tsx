/** 1.1 로그인 — 카카오 · 네이버 · Google · 이메일 */
import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { SocialProvider } from '@/api/types';
import { ParticleWave } from '@/components/anim';
import { GoogleSymbol, KakaoSymbol, PadoSymbol } from '@/components/ui/Brand';
import { Icon, Press, T } from '@/components/ui';
import { env } from '@/config';
import type { RootScreen } from '@/navigation/types';
import { getProviderToken, SocialCancelled } from '@/services/socialAuth';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';

export default function LoginScreen({ navigation }: RootScreen<'Login'>) {
  const insets = useSafeAreaInsets();
  const signIn = useAuth(s => s.signIn);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  const social = async (provider: SocialProvider) => {
    if (busy) return; // 다른 로그인이 진행 중이면 무시
    setBusy(provider);
    try {
      const token = await getProviderToken(provider);
      const r = await authApi.social(provider, token);
      if (!r.signupRequired && r.accessToken && r.refreshToken) {
        await signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken, accessTokenExpiresIn: r.accessTokenExpiresIn ?? 0, refreshTokenExpiresIn: r.refreshTokenExpiresIn ?? 0 });
      } else if (r.signupToken) {
        navigation.navigate('Signup', { mode: 'social', provider, signupToken: r.signupToken, profile: r.profile });
      }
    } catch (e) {
      if (!(e instanceof SocialCancelled)) toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Svg width="100%" height={560} style={{ position: 'absolute', top: 220 }}>
        <Defs>
          <RadialGradient id="lg" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#0E3A7A" stopOpacity={0.8} />
            <Stop offset="1" stopColor="#050916" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="260" rx="280" ry="210" fill="url(#lg)" />
      </Svg>
      <ParticleWave style={{ position: 'absolute', top: insets.top + 215 }} />

      <View style={{ paddingTop: insets.top + 84, paddingHorizontal: 28, gap: 18 }}>
        <PadoSymbol size={64} />
        <T v="wordmark" style={{ fontSize: 44, lineHeight: 48, letterSpacing: 7 }}>PADO</T>
        <T v="title" c="ink2">{'거리에 음악을 흘려두고,\n누군가의 하루에 닿게.'}</T>
      </View>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20, gap: 10 }}>
        <LoginButton bg={colors.kakao} fg="rgba(0,0,0,0.85)" icon={<KakaoSymbol />} label="카카오로 계속하기" busy={busy === 'kakao'} disabled={!!busy} onPress={() => social('kakao')} />
        <LoginButton bg="#fff" fg="#1F1F1F" icon={<GoogleSymbol />} label="Google로 계속하기" busy={busy === 'google'} disabled={!!busy} onPress={() => social('google')} />
        <LoginButton bg={colors.card} fg={colors.ink} border icon={<Icon name="mail" size={20} color={colors.ink} />} label="이메일로 계속하기" disabled={!!busy} onPress={() => navigation.navigate('EmailLogin')} />
        <T v="micro" c="ink3" style={{ textAlign: 'center', marginTop: 6 }}>
          가입하면 <T v="micro" c="ink2" style={{ textDecorationLine: 'underline' }} onPress={() => navigation.navigate('TermsView', { type: 'SERVICE' })} accessibilityRole="link">이용약관</T> 및 <T v="micro" c="ink2" style={{ textDecorationLine: 'underline' }} onPress={() => navigation.navigate('TermsView', { type: 'PRIVACY' })} accessibilityRole="link">개인정보 처리방침</T>에 동의하게 돼요
        </T>
        {env.useMock ? <T v="micro" c="warning" style={{ textAlign: 'center' }}>목 서버 모드 (USE_MOCK=true)</T> : null}
      </View>
    </View>
  );
}

function LoginButton({ bg, fg, icon, label, onPress, busy, disabled, border }: { bg: string; fg: string; icon: React.ReactNode; label: string; onPress: () => void; busy?: boolean; disabled?: boolean; border?: boolean }) {
  return (
    <Press onPress={onPress} disabled={busy || disabled} style={{ opacity: disabled && !busy ? 0.6 : 1, height: 54, borderRadius: 16, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: border ? 1 : 0, borderColor: colors.line }}>
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <T v="bodyStrong" style={{ color: fg, fontFamily: fonts.medium }}>{label}</T>
    </Press>
  );
}
