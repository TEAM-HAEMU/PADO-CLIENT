/**
 * 1.3 계정 만들기 — 이메일 가입(/auth/register) · 소셜 가입 완료(/oauth2/signup) 공용.
 * 약관 목록은 GET /terms 응답으로 구성 (SERVICE·PRIVACY·LOCATION 필수, MARKETING 선택).
 */
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { AgreementType, Agreements, Term } from '@/api/types';
import { Field, formatBirth, GenderSelect, validBirth } from '@/components/ui/Field';
import { Icon, IconButton, Press, PrimaryButton, T } from '@/components/ui';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { getProviderToken } from '@/services/socialAuth';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';

const FALLBACK_TERMS: Term[] = [
  { type: 'SERVICE', title: '서비스 이용약관', version: '', required: true },
  { type: 'PRIVACY', title: '개인정보 수집·이용 동의', version: '', required: true },
  { type: 'LOCATION', title: '위치기반서비스 이용약관', version: '', required: true },
  { type: 'MARKETING', title: '마케팅 정보 수신 동의', version: '', required: false },
];

export default function SignupScreen({ navigation, route }: RootScreen<'Signup'>) {
  const insets = useSafeAreaInsets();
  const signIn = useAuth(s => s.signIn);
  const p = route.params;
  const social = p.mode === 'social' ? p : null;
  const providerEmail = social?.profile?.email ?? null;

  const terms = useQuery({ queryKey: ['terms'], queryFn: authApi.terms }).data ?? FALLBACK_TERMS;
  const [email, setEmail] = useState(providerEmail ?? '');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState((social?.profile?.username ?? '').slice(0, 15));
  const [birth, setBirth] = useState(social?.profile?.birthDate ?? '');
  const [gender, setGender] = useState<boolean | null>(social?.profile?.gender ?? null);
  const [agreed, setAgreed] = useState<Partial<Record<AgreementType, boolean>>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const allOn = terms.every(t => agreed[t.type]);
  const requiredOk = terms.filter(t => t.required).every(t => agreed[t.type]);

  const validate = () => {
    const e: Record<string, string | null> = {};
    if (!social || !providerEmail) e.email = /^\S+@\S+\.\S+$/.test(email.trim()) ? null : '이메일 형식을 확인해주세요.';
    if (!social) e.password = password.length >= 8 && password.length <= 20 ? null : '비밀번호는 8~20자예요.';
    e.username = username.trim().length >= 1 && username.trim().length <= 15 ? null : '닉네임은 1~15자예요.';
    e.birth = validBirth(birth);
    e.gender = gender === null ? '성별을 선택해주세요.' : null;
    setErrors(e);
    return Object.values(e).every(v => !v);
  };

  const submit = async () => {
    if (!validate()) return;
    if (!requiredOk) return toast('필수 약관에 동의해주세요.', 'error');
    const agreements = Object.fromEntries(terms.map(t => [t.type, !!agreed[t.type]])) as Agreements;
    setBusy(true);
    try {
      if (social) {
        const pair = await authApi.socialSignup({ signupToken: social.signupToken, username: username.trim(), ...(providerEmail ? {} : { email: email.trim() }), birthDate: birth, gender: gender!, agreements });
        await signIn(pair, { method: social.provider.toLowerCase(), signup: true });
      } else {
        await authApi.register({ username: username.trim(), password, email: email.trim(), birthDate: birth, gender: gender!, agreements });
        try {
          await signIn(await authApi.login(email.trim(), password), { method: 'email', signup: true });
        } catch {
          // 가입은 됐는데 자동 로그인만 실패 — 폼에 남겨두면 재시도 시 U4가 나므로 로그인 화면으로
          toast('가입이 완료됐어요. 로그인해주세요.', 'success');
          navigation.popTo('EmailLogin', { email: email.trim() }); // 이미 있는 로그인 화면이면 그리로 돌아간다(없으면 새로)
        }
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'U15' && social) {
        // 이미 가입된 계정 — 명세대로 소셜 로그인을 다시 호출하면 기존 회원으로 로그인된다
        try {
          const r = await authApi.social(social.provider, await getProviderToken(social.provider));
          if (!r.signupRequired && r.accessToken && r.refreshToken) {
            await signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken, accessTokenExpiresIn: r.accessTokenExpiresIn ?? 0, refreshTokenExpiresIn: r.refreshTokenExpiresIn ?? 0 }, { method: social.provider.toLowerCase() });
            return;
          }
        } catch {}
      }
      toast(errorMessage(e), 'error');
      if (code === 'U13' || code === 'U15') navigation.popToTop();
      if (code === 'U14') setErrors(x => ({ ...x, email: '이메일을 입력해주세요.' }));
    } finally {
      setBusy(false);
    }
  };

  const title = useMemo(() => (social ? '거의 다 됐어요' : '계정 만들기'), [social]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" size={40} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <T v="display">{title}</T>
          <T v="body" c="ink2">{social ? '몇 가지만 확인하면 바로 시작할 수 있어요.' : '몇 가지만 알려주면 바로 시작할 수 있어요.'}</T>
        </View>
        <View style={{ height: 4 }} />
        <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" disabled={!!providerEmail} help={providerEmail ? '소셜 계정의 이메일로 가입돼요' : undefined} error={errors.email} />
        {!social && <Field label="비밀번호" value={password} onChangeText={setPassword} secure placeholder="8~20자" error={errors.password} />}
        <Field label="닉네임" value={username} onChangeText={t => setUsername(t.slice(0, 15))} placeholder="지도에 표시될 이름" help="지도에 표시될 이름이에요 (최대 15자)" error={errors.username} right={<T v="number" c="ink3">{username.length}/15</T>} />
        <Field label="생년월일" value={birth} onChangeText={t => setBirth(formatBirth(t))} keyboardType="number-pad" placeholder="YYYY-MM-DD" error={errors.birth} />
        <GenderSelect value={gender} onChange={setGender} />
        {errors.gender ? <T v="micro" c="caution">{errors.gender}</T> : null}

        <View style={{ marginTop: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' }}>
          <Press onPress={() => setAgreed(allOn ? {} : Object.fromEntries(terms.map(t => [t.type, true])))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Check on={allOn} />
            <T v="bodyStrong">전체 동의</T>
          </Press>
          {terms.map(t => (
            <Press key={t.type} onPress={() => setAgreed(a => ({ ...a, [t.type]: !a[t.type] }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Check on={!!agreed[t.type]} small />
              <T v="caption" c="ink2" style={{ flex: 1 }}>
                <T v="captionStrong" c={t.required ? 'primary' : 'ink3'}>{t.required ? '[필수] ' : '[선택] '}</T>{t.title}
              </T>
              <Press onPress={() => navigation.navigate('TermsView', { type: t.type })} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${t.title} 보기`}>
                <T v="caption" c="ink3" style={{ textDecorationLine: 'underline' }}>보기</T>
              </Press>
            </Press>
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, paddingTop: 8 }}>
        <PrimaryButton label="가입하고 시작하기" onPress={submit} loading={busy} disabled={!requiredOk} />
        {social ? null : (
          <Press onPress={() => navigation.popTo('EmailLogin', {})} hitSlop={8} style={{ alignSelf: 'center', marginTop: 12 }} accessibilityRole="link">
            <T v="caption" c="ink3">이미 계정이 있나요? <T v="captionStrong" c="primary">로그인</T></T>
          </Press>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Check({ on, small }: { on: boolean; small?: boolean }) {
  const s = small ? 20 : 24;
  return (
    <View style={{ width: s, height: s, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: colors.line }}>
      {on ? <Icon name="check" size={s - 6} color={colors.onPrimary} strokeWidth={2.4} /> : null}
    </View>
  );
}
