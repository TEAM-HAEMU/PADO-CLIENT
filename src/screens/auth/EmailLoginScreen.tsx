/** 1.2 이메일 로그인 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { PadoSymbol } from '@/components/ui/Brand';
import { Field } from '@/components/ui/Field';
import { IconButton, Press, PrimaryButton, T } from '@/components/ui';
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
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" size={40} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <PadoSymbol size={48} />
        <View style={{ gap: 6 }}>
          <T v="titleLarge">다시 만나서 반가워요</T>
          <T v="body" c="ink2">이메일로 로그인하고 음악을 이어가요.</T>
        </View>
        <View style={{ height: 8 }} />
        <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" textContentType="emailAddress" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secure placeholder="8~20자" textContentType="password" onSubmitEditing={submit} error={error} />
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 14, alignItems: 'center' }}>
        <PrimaryButton label="로그인" onPress={submit} loading={busy} style={{ alignSelf: 'stretch' }} />
        <Press onPress={() => navigation.navigate('Signup', { mode: 'email' })} style={{ flexDirection: 'row', gap: 6 }}>
          <T v="caption" c="ink3">처음이신가요?</T>
          <T v="captionStrong" c="primary">계정 만들기</T>
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}
