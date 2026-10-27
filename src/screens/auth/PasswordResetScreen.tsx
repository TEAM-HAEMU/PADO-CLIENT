/** 1.3 비밀번호 재설정 — 이메일 → 6자리 인증번호 → 새 비밀번호 (한 화면 안에서 단계 전환) */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { ApiError, passwordResetErrorMessage } from '@/api/errors';
import { PadoSymbol } from '@/components/ui/Brand';
import { Field } from '@/components/ui/Field';
import { IconButton, Press, PrimaryButton, T } from '@/components/ui';
import { env } from '@/config';
import type { RootScreen } from '@/navigation/types';
import { track } from '@/services/analytics';
import { colors } from '@/theme/tokens';

type Step = 'email' | 'code' | 'password';

const RESEND_SECONDS = 60; // 서버: 같은 계정은 60초에 한 번
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// 목 모드에선 메일이 없으므로 인증번호를 화면에 알려준다
const MOCK_CODE: string | null = env.useMock ? require('@/api/mock/server').MOCK_RESET_CODE : null;

const COPY: Record<Step, { title: string; body: (email: string) => string }> = {
  email: { title: '비밀번호를 잊으셨나요?', body: () => '가입한 이메일로 6자리 인증번호를 보내드려요.' },
  code: { title: '인증번호를 입력해주세요', body: email => `${email}로 보낸 6자리 숫자를 입력해주세요. 10분 동안 쓸 수 있어요.` },
  password: { title: '새 비밀번호를 정해주세요', body: () => '바꾸고 나면 모든 기기에서 로그아웃돼요.' },
};

export default function PasswordResetScreen({ navigation, route }: RootScreen<'PasswordReset'>) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (next: Step) => { setStep(next); setError(null); };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) {
      // 토큰이 만료되면 처음부터, 인증번호가 폐기되면 다시 받기로
      if (e instanceof ApiError && e.code === 'U24') { go('email'); setCode(''); setResetToken(null); }
      if (e instanceof ApiError && e.code === 'U21') setCooldown(RESEND_SECONDS);
      setError(passwordResetErrorMessage(e));
    }
    finally { setBusy(false); }
  };

  const sendCode = () => run(async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) throw new Error('이메일 형식을 확인해주세요.');
    await authApi.passwordReset.requestCode(value);
    setEmail(value); setCode(''); setCooldown(RESEND_SECONDS);
    go('code');
  });

  const verify = () => run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error('6자리 숫자를 입력해주세요.');
    const { resetToken: token } = await authApi.passwordReset.verify(email, code);
    setResetToken(token);
    go('password');
  });

  const save = () => run(async () => {
    if (password.length < 8 || password.length > 20) throw new Error('비밀번호는 8~20자예요.');
    if (password !== confirm) throw new Error('두 비밀번호가 달라요.');
    await authApi.passwordReset.reset(resetToken!, password);
    track('password_reset_completed');
    // 자동 로그인하지 않는다 — 로그인 화면에 이메일을 채워 돌려보낸다
    navigation.navigate('EmailLogin', { email, reset: true });
  });

  const back = () => {
    if (step === 'email') navigation.goBack();
    // 한 단계씩 뒤로. 비밀번호 단계에서 돌아가면 재설정 토큰은 버린다 (1회용이라 다시 확인받아야 함)
    else { setResetToken(null); go(step === 'password' ? 'code' : 'email'); }
  };

  const { title, body } = COPY[step];
  const submit = step === 'email' ? sendCode : step === 'code' ? verify : save;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" onPress={back} accessibilityLabel="뒤로" size={40} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <PadoSymbol size={48} />
        <View style={{ gap: 6 }}>
          <T v="titleLarge">{title}</T>
          <T v="body" c="ink2">{body(email)}</T>
        </View>
        <View style={{ height: 8 }} />

        {step === 'email' && (
          <Field
            label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com"
            textContentType="emailAddress" autoFocus onSubmitEditing={sendCode} error={error}
            help="소셜 로그인으로 가입했다면 메일이 가지 않아요. 가입한 소셜 계정으로 로그인해주세요."
          />
        )}

        {step === 'code' && (
          <>
            <Field
              label="인증번호" value={code} onChangeText={t => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" placeholder="6자리 숫자"
              maxLength={6} autoFocus onSubmitEditing={verify} error={error}
              help={MOCK_CODE ? `목 모드 인증번호: ${MOCK_CODE}` : '메일이 안 보이면 스팸함도 확인해주세요.'}
            />
            <Press onPress={sendCode} disabled={cooldown > 0 || busy} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
              <T v="captionStrong" c={cooldown > 0 ? 'ink3' : 'primary'}>
                {cooldown > 0 ? `인증번호 다시 받기 (${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')})` : '인증번호 다시 받기'}
              </T>
            </Press>
          </>
        )}

        {step === 'password' && (
          <>
            <Field label="새 비밀번호" value={password} onChangeText={setPassword} secure placeholder="8~20자" textContentType="newPassword" autoFocus />
            <Field label="새 비밀번호 확인" value={confirm} onChangeText={setConfirm} secure placeholder="한 번 더 입력" textContentType="newPassword" onSubmitEditing={save} error={error} />
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16 }}>
        <PrimaryButton
          label={step === 'email' ? '인증번호 받기' : step === 'code' ? '확인' : '비밀번호 바꾸기'}
          onPress={submit} loading={busy} disabled={step === 'code' && code.length < 6}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
