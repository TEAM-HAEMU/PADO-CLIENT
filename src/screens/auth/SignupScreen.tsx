/**
 * 1.3 계정 만들기 (Figma B 1.4 계정 만들기) — 이메일 가입(/auth/register) · 소셜 가입 완료(/oauth2/signup) 공용.
 * 약관 목록은 GET /terms 응답으로 구성 (SERVICE·PRIVACY·LOCATION 필수, MARKETING 선택).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { AgreementType, Agreements, Term } from '@/api/types';
import { Field, formatBirth, GenderSelect, ListenAppSelect } from '@/components/ui/Field';
import { AUTH_PAGES, AuthButton, AuthHeader, AuthTitle, CheckBox } from '@/components/auth/AuthChrome';
import { Icon, Press, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useContentColumn } from '@/components/ui/ContentColumn';
import { useFocusedInputScroll } from '@/hooks/useFocusedInputScroll';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { type ServiceId, usePrefs } from '@/store/prefs';
import { getProviderCredential } from '@/services/socialAuth';
import { changeMarketingConsent } from '@/services/pushSettings';
import { MARKETING_TITLE, termTitle } from '@/content/terms';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { firstSignupError, type SignupErrors, type SignupField, validateSignup, validEmail } from '@/utils/signupForm';
import { clampText, textLength } from '@/utils/text';

const FALLBACK_TERMS: Term[] = [
  { type: 'SERVICE', title: '서비스 이용약관', version: '', required: true },
  { type: 'PRIVACY', title: '개인정보 수집·이용 동의', version: '', required: true },
  { type: 'LOCATION', title: '위치기반서비스 이용약관', version: '', required: true },
  { type: 'MARKETING', title: MARKETING_TITLE, version: '', required: false },
];

export default function SignupScreen({ navigation, route }: RootScreen<'Signup'>) {
  const insets = useSafeAreaInsets();
  const { gutter } = useContentColumn(); // 넓은 화면에선 폼을 가운데 600까지 — 스크롤은 화면 전체 (Z-07)
  const signIn = useAuth(s => s.signIn);
  const p = route.params;
  const social = p.mode === 'social' ? p : null;
  const providerEmail = social?.profile?.email ?? null;
  const method = social ? social.provider.toLowerCase() : 'email';
  useEffect(() => { track('sign_up_started', { method }); }, [method]);

  const terms = useQuery({ queryKey: ['terms'], queryFn: authApi.terms }).data ?? FALLBACK_TERMS;
  const [email, setEmail] = useState(providerEmail ?? '');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(clampText(social?.profile?.username ?? '', 15));
  const [birth, setBirth] = useState(social?.profile?.birthDate ?? '');
  const [gender, setGender] = useState<boolean | null>(social?.profile?.gender ?? null);
  // 전체 듣기 앱 — 기기에 이미 고른 앱이 있으면 그대로 보여줌. 가입 성공 후 저장
  const [listenApp, setListenApp] = useState<ServiceId | null>(() => usePrefs.getState().service);
  const [agreed, setAgreed] = useState<Partial<Record<AgreementType, boolean>>>({});
  const [errors, setErrors] = useState<SignupErrors>({});
  const [busy, setBusy] = useState(false);

  const allOn = terms.every(t => agreed[t.type]);
  const requiredOk = terms.filter(t => t.required).every(t => agreed[t.type]);

  // 버튼은 바닥 고정 대신 내용 끝에 — 키보드 위로 따라 올라와 입력칸을 가리지 않게. 키보드가 뜨면 입력 중인 칸에 맞춰 스크롤
  const scroll = useFocusedInputScroll();
  // 입력칸 위치 (폼 묶음 안 y + 폼 묶음의 y) — 검사에 걸리면 버튼에서 멀리 위에 있는 그 칸으로 올려 보여 준다
  const formY = useRef(0);
  const fieldY = useRef<Partial<Record<SignupField, number>>>({});
  const at = (field: SignupField) => (ev: { nativeEvent: { layout: { y: number } } }) => { fieldY.current[field] = ev.nativeEvent.layout.y; };

  const validate = () => {
    const e = validateSignup({ email, password, username, birth, social: !!social, providerEmail });
    setErrors(e);
    const first = firstSignupError(e);
    if (!first) return true;
    // 오류 문구는 입력칸 아래에 붙는데, 버튼은 맨 아래라 안 보인다 — 그 칸까지 올리고 토스트로도 알린다
    scroll.ref.current?.scrollTo({ y: Math.max(0, formY.current + (fieldY.current[first.field] ?? 0) - 24), animated: true });
    toast(first.message, 'error');
    return false;
  };

  /** 가입이 끝나면 고른 듣는 앱을 기본 재생 앱으로 (안 고르면 처음 전체 듣기 때 묻는 기존 흐름 그대로) */
  const saveListenApp = () => {
    if (listenApp && listenApp !== usePrefs.getState().service) usePrefs.getState().setService(listenApp);
  };

  // 혜택·소식 알림(선택)에 동의하고 가입했으면 푸시 설정 marketing도 켠다 — 동의 기록은 가입 요청이 이미 남겼다. 처리 결과는 토스트로
  const saveMarketing = (a: Agreements) => { if (a.MARKETING) changeMarketingConsent(true, { agreement: false }); };

  const submit = async () => {
    if (!validate()) return;
    if (!requiredOk) return toast('필수 약관에 동의해주세요.', 'error');
    const agreements = Object.fromEntries(terms.map(t => [t.type, !!agreed[t.type]])) as Agreements;
    // 성별은 선택 — 고르지 않으면 보내지 않는다
    const genderField = gender === null ? {} : { gender };
    setBusy(true);
    try {
      if (social) {
        const pair = await authApi.socialSignup({ signupToken: social.signupToken, username: username.trim(), ...(providerEmail ? {} : { email: email.trim() }), birthDate: birth, ...genderField, agreements });
        saveListenApp();
        await signIn(pair, { method: social.provider.toLowerCase(), signup: true });
        saveMarketing(agreements);
      } else {
        await authApi.register({ username: username.trim(), password, email: email.trim(), birthDate: birth, ...genderField, agreements });
        saveListenApp();
        try {
          await signIn(await authApi.login(email.trim(), password), { method: 'email', signup: true });
          saveMarketing(agreements);
        } catch {
          // 가입은 됐는데 자동 로그인만 실패 — 폼에 남겨두면 재시도 시 U4가 나므로 로그인 화면으로
          toast('가입이 완료됐어요. 로그인해주세요.', 'success');
          navigation.popTo('EmailLogin', { email: email.trim() }); // 이미 있는 로그인 화면이면 그리로 돌아간다(없으면 새로)
        }
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      track('sign_up_failed', { method, code: code ?? null });
      if (code === 'U15' && social) {
        // 이미 가입된 계정 — 명세대로 소셜 로그인을 다시 호출하면 기존 회원으로 로그인된다
        try {
          const r = await authApi.social(social.provider, await getProviderCredential(social.provider));
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

  // 이메일 가입은 디자인 문구('환영합니다!'), 소셜 가입은 마무리 단계라 '거의 다 됐어요'
  const title = useMemo(() => (social ? '거의 다 됐어요' : '환영합니다!'), [social]);
  const emailOk = validEmail(email);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <AuthHeader page={AUTH_PAGES - 1} onBack={navigation.goBack} style={{ marginTop: insets.top + 12 }} />
      <ScrollView ref={scroll.ref} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: 39, paddingBottom: insets.bottom + 16, paddingHorizontal: gutter }} keyboardShouldPersistTaps="handled">
        {/* 파도는 입력칸 뒤에 깔린 채 함께 스크롤 (디자인 474/1140) */}
        <Wave always style={{ position: 'absolute', left: 0, right: 0, top: 377 }} />
        <AuthTitle title={title} desc={social ? '몇 가지만 확인하면 바로 시작할 수 있어요.' : '몇 가지만 알려주면 바로 시작할 수 있어요.'} />
        <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 16 }} onLayout={ev => { formY.current = ev.nativeEvent.layout.y; }}>
          <View onLayout={at('email')}>
          <Field
            label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" disabled={!!providerEmail} onFocus={scroll.onFocus}
            help={providerEmail ? '소셜 계정의 이메일로 가입돼요' : undefined} error={errors.email}
            right={emailOk && !errors.email ? <Icon name="check" size={16} color={colors.primaryDeep} strokeWidth={2.2} /> : undefined}
          />
          </View>
          {!social && <View onLayout={at('password')}><Field label="비밀번호" value={password} onChangeText={setPassword} secure placeholder="비밀번호를 입력하세요" help="8~20자" error={errors.password} onFocus={scroll.onFocus} /></View>}
          <View onLayout={at('username')}><Field label="닉네임" value={username} onChangeText={t => setUsername(clampText(t, 15))} placeholder="지도에 표시될 이름" help="지도에 표시될 이름이에요 (최대 15자)" error={errors.username} onFocus={scroll.onFocus} right={<T v="caption" c="lineStrong">{textLength(username)}/15</T>} /></View>
          <View onLayout={at('birth')}><Field label="생년월일" value={birth} onChangeText={t => setBirth(formatBirth(t))} keyboardType="number-pad" placeholder="YYYY-MM-DD" error={errors.birth} onFocus={scroll.onFocus} /></View>
          <GenderSelect optional value={gender} onChange={setGender} />
          <ListenAppSelect value={listenApp} onChange={setListenApp} />

          {/* 약관 — 전체 동의 + 개별(필수 3 · 선택 혜택·소식 알림), 각 항목 '보기' */}
          <View style={{ borderRadius: 8, backgroundColor: colors.field, overflow: 'hidden' }}>
            <Press onPress={() => setAgreed(allOn ? {} : Object.fromEntries(terms.map(t => [t.type, true])))} accessibilityRole="checkbox" accessibilityState={{ checked: allOn }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
              <CheckBox on={allOn} />
              <T v="bodyStrong">전체 동의</T>
            </Press>
            {terms.map(t => (
              <Press key={t.type} onPress={() => setAgreed(a => ({ ...a, [t.type]: !a[t.type] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!agreed[t.type] }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <CheckBox on={!!agreed[t.type]} small />
                <T v="captionStrong" c="ink3" style={{ flex: 1, fontFamily: fonts.regular }}>
                  <T v="captionStrong" c={t.required ? 'primary' : 'ink2'}>{t.required ? '[필수] ' : '[선택] '}</T>{termTitle(t.type, t.title, true)}
                </T>
                <Press onPress={() => navigation.navigate('TermsView', { type: t.type })} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${termTitle(t.type, t.title, true)} 보기`}>
                  <T v="captionStrong" c="ink2" style={{ fontFamily: fonts.regular, textDecorationLine: 'underline' }}>보기</T>
                </Press>
              </Press>
            ))}
          </View>
        </View>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>
        <AuthButton label="가입하고 시작하기" onPress={submit} loading={busy} disabled={!requiredOk} />
        {social ? null : (
          <Press onPress={() => navigation.popTo('EmailLogin', {})} hitSlop={8} style={{ alignSelf: 'center', flexDirection: 'row', gap: 6 }} accessibilityRole="link">
            <T v="caption" c="ink2">이미 계정이 있나요?</T>
            <T v="caption" c="primaryDeep">로그인</T>
          </Press>
        )}
        </View>
      </ScrollView>
    </View>
  );
}
