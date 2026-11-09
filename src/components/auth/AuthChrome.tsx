/**
 * 온보딩·로그인·가입 화면 공통 부품 — Figma '0 파도 가이드' (B 1.1~1.4)
 *  · 위쪽 줄: 뒤로(왼쪽 'next' 칩 반전) · 페이지 점 4개(4번째 = 로그인) · 다음('next' 칩)
 *  · 가운데 정렬 제목(30 SemiBold) + 회색 설명 한 줄(12)
 *  · 'Login/*' 버튼 (47px, 모서리 8)
 *  · 맨 아래 약관 안내 (10px #C7C7C7)
 */
import React from 'react';
import { ActivityIndicator, type StyleProp, View, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon, IconButton, Press, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { colors, fonts } from '@/theme/tokens';

/** 디자인의 설명 글자 회색 (팔레트에 없는 값 — 이 영역 설명 한 줄에만 씀) */
export const SUBTLE = '#858585';
/** 페이지 점 꺼짐 (iOS fills/secondary) */
const DOT_OFF = 'rgba(120,120,128,0.16)';
/** 소개 3장 + 로그인 */
export const AUTH_PAGES = 4;

/** 페이지 점 — 켜진 점은 14×4 막대 */
export function PageDots({ index, count = AUTH_PAGES }: { index: number; count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`${count}쪽 중 ${index + 1}쪽`}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ height: 4, width: i === index ? 14 : 4, borderRadius: 99, backgroundColor: i === index ? colors.primary : DOT_OFF }} />
      ))}
    </View>
  );
}

const CHIP = 29;

/** 'next' 칩 (옅은 하늘 알약 + 파란 삼각형). back이면 좌우 반전 — 눌림 효과의 transform과 겹치지 않게 바깥 View를 뒤집는다 */
function StepChip({ back, onPress }: { back?: boolean; onPress: () => void }) {
  const button = <IconButton name="play" filled size={CHIP} color={colors.primary} onPress={onPress} accessibilityLabel={back ? '뒤로' : '다음'} />;
  return back ? <View style={{ transform: [{ scaleX: -1 }] }}>{button}</View> : button;
}

/** 화면 맨 위 줄 — 안전영역 아래 12px. page를 안 주면 점을 숨긴다 */
export function AuthHeader({ page, onBack, onNext, style }: { page?: number; onBack?: () => void; onNext?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height: CHIP, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
      <View style={{ width: CHIP }}>{onBack ? <StepChip back onPress={onBack} /> : null}</View>
      {page != null ? <PageDots index={page} /> : <View />}
      <View style={{ width: CHIP }}>{onNext ? <StepChip onPress={onNext} /> : null}</View>
    </View>
  );
}

/** 가운데 정렬 제목 + 설명 한 줄 */
export function AuthTitle({ title, desc, style }: { title: string; desc?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: 'center', gap: 18, paddingHorizontal: 24 }, style]}>
      <T v="display" style={{ textAlign: 'center' }} accessibilityRole="header">{title}</T>
      {desc ? <T v="caption" style={{ color: SUBTLE, textAlign: 'center' }}>{desc}</T> : null}
    </View>
  );
}

/**
 * Figma 'Login/*' 버튼 — 47px · 모서리 8. 기본은 파란 바탕(#2B9CFF) + 옅은 글자(#EAF1FF).
 * 글자: 폼 제출(로그인·가입)은 Regular 16, 로그인 수단 고르기(카카오·Google·이메일)는 strong = Medium 15
 */
export function AuthButton({ label, onPress, icon, bg = colors.primary, fg = colors.onPrimary, border, loading, disabled, strong, style }: {
  label: string; onPress: () => void; icon?: React.ReactNode; bg?: string; fg?: string; border?: string; loading?: boolean; disabled?: boolean; strong?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Press
      onPress={onPress} disabled={disabled || loading} accessibilityLabel={label} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[{ height: 47, borderRadius: 8, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20, borderWidth: border ? 1 : 0, borderColor: border }, disabled && !loading ? { opacity: 0.4 } : null, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <T v={strong ? 'bodyStrong' : 'bodyLarge'} style={{ color: fg, fontFamily: strong ? fonts.medium : fonts.regular }}>{label}</T>
    </Press>
  );
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** 맨 아래 약관 안내 (10px #C7C7C7) — 약관 두 개는 눌러서 볼 수 있다 */
export function AuthDisclaimer({ style }: { style?: StyleProp<ViewStyle> }) {
  const navigation = useNavigation<Nav>();
  const link = { textDecorationLine: 'underline' as const };
  return (
    <View style={[{ alignItems: 'center', paddingHorizontal: 24 }, style]}>
      <T v="tiny" c="faint" style={{ textAlign: 'center' }}>
        {'서비스 이용을 위해 로그인이 필요합니다.\n로그인 시 '}
        <T v="tiny" c="faint" style={link} onPress={() => navigation.navigate('TermsView', { type: 'SERVICE' })} accessibilityRole="link">이용약관</T>
        {' 및 '}
        <T v="tiny" c="faint" style={link} onPress={() => navigation.navigate('TermsView', { type: 'PRIVACY' })} accessibilityRole="link">개인정보 처리방침</T>
        에 동의하게 됩니다.
      </T>
    </View>
  );
}

/** 약관 체크 — 켜짐: 파란 바탕 + 흰 체크, 꺼짐: 입력칸 테두리 */
export function CheckBox({ on, small }: { on: boolean; small?: boolean }) {
  const s = small ? 20 : 24;
  return (
    <View style={{ width: s, height: s, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : colors.field, borderWidth: on ? 0 : 1, borderColor: colors.lineStrong }}>
      {on ? <Icon name="check" size={s - 6} color="#FFFFFF" strokeWidth={2.4} /> : null}
    </View>
  );
}
