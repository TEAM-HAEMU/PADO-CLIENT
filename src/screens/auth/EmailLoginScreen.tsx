/** 1.2 이메일 로그인 (Figma B 1.4 이메일 로그인) */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { AUTH_PAGES, AuthButton, AuthDisclaimer, AuthHeader, AuthTitle } from '@/components/auth/AuthChrome';
import { Field } from '@/components/ui/Field';
import { Press, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { env } from '@/config';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme/tokens';

// 목 모드에서만 테스트 계정을 미리 채운다
const MOCK_ACCOUNT: { email: string; password: string } = env.useMock ? require('@/api/mock/server').MOCK_ACCOUNT : { email: '', password: '' };

export default function EmailLoginScreen({ navigation, route }: RootScreen<'EmailLogin'>) {
  const insets = useSafeAreaInsets();
  const signIn = useAuth(s => s.signIn);
  const [email, setEmail] = useState(route.params?.email ?? (env.useMock ? MOCK_ACCOUNT.email : ''));
  const [password, setPassword] = useState(env.useMock && !route.params?.email ? MOCK_ACCOUNT.password : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 가입 화면에서 돌아올 때 이메일을 채워준다 (이미 떠 있던 화면이면 초기값이 안 바뀌므로)
  useEffect(() => { if (route.params?.email) { setEmail(route.params.email); setPassword(''); } }, [route.params?.email]);
  // 비밀번호 재설정에서 돌아오면 안내 (자동 로그인하지 않음)
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (route.params?.reset) { setNotice('비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요.'); setError(null); } }, [route.params?.reset]);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('이메일과 비밀번호를 입력해주세요.');
    setBusy(true); setError(null);
    try { await signIn(await authApi.login(email.trim(), password), { method: 'email' }); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page }}>
      <Wave style={{ position: 'absolute', left: 0, right: 0, top: '40%' }} />
      <AuthHeader page={AUTH_PAGES - 1} onBack={navigation.goBack} style={{ marginTop: insets.top + 12 }} />
      <ScrollView contentContainerStyle={{ paddingTop: 39, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <AuthTitle title="다시 만나서 반가워요." desc="이메일로 로그인하고 내 주변의 바다를 탐색해요." />
        <View style={{ paddingHorizontal: 24, paddingTop: 34, gap: 16 }}>
          {notice && <T v="captionStrong" c="positive" accessibilityLiveRegion="polite">{notice}</T>}
          <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" textContentType="emailAddress" />
          <Field label="비밀번호" value={password} onChangeText={setPassword} secure placeholder="비밀번호를 입력하세요" textContentType="password" onSubmitEditing={submit} error={error} />
          <Press onPress={() => navigation.navigate('PasswordReset', { email: email.trim() || undefined })} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-end' }}>
            <T v="caption" c="ink2">비밀번호를 잊으셨나요?</T>
          </Press>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, gap: 10, alignItems: 'center' }}>
        <AuthButton label="로그인" onPress={submit} loading={busy} style={{ alignSelf: 'stretch' }} />
        <Press onPress={() => navigation.navigate('Signup', { mode: 'email' })} hitSlop={8} style={{ flexDirection: 'row', gap: 6 }}>
          <T v="caption" c="ink2">처음이신가요?</T>
          <T v="caption" c="primaryDeep">계정 만들기</T>
        </Press>
      </View>
      <AuthDisclaimer style={{ paddingTop: 40, paddingBottom: insets.bottom + 16 }} />
    </KeyboardAvoidingView>
  );
}
