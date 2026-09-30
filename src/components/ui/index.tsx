/**
 * B · Deep 기본 컴포넌트. 타이포 스케일은 Figma 텍스트 스타일 "B Deep/*" 그대로.
 */
import React from 'react';
import {
  ActivityIndicator, Image, Pressable, type PressableProps, type StyleProp, StyleSheet, Text, type TextProps, View, type ViewProps, type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, glow } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { artUrl } from '@/utils/artUrl';

// ── Typography
const ls = (size: number, pct: number) => (size * pct) / 100;
export const type = StyleSheet.create({
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38, letterSpacing: ls(30, -2.5) },
  titleLarge: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34, letterSpacing: ls(26, -2) },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: ls(22, -2) },
  headline: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, letterSpacing: ls(17, -1.5) },
  bodyLarge: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, letterSpacing: ls(17, -1) },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, letterSpacing: ls(15, -1) },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, letterSpacing: ls(15, -1) },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: ls(13, -0.5) },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: ls(13, -0.5) },
  micro: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
  label: { fontFamily: fonts.groteskMedium, fontSize: 11, lineHeight: 14, letterSpacing: ls(11, 6), textTransform: 'uppercase' },
  number: { fontFamily: fonts.groteskMedium, fontSize: 13, lineHeight: 16 },
  numberLarge: { fontFamily: fonts.groteskBold, fontSize: 28, lineHeight: 32, letterSpacing: ls(28, -2) },
  wordmark: { fontFamily: fonts.groteskBold, fontSize: 20, lineHeight: 24, letterSpacing: ls(20, 4) },
  note: { fontFamily: fonts.note, fontSize: 21, lineHeight: 34, letterSpacing: ls(21, -1) },
  key: { fontFamily: fonts.regular, fontSize: 22, lineHeight: 26 },
});
export type TypeName = keyof typeof type;
export type ColorName = keyof typeof colors;

interface TProps extends TextProps { v?: TypeName; c?: ColorName; className?: string }
export function T({ v = 'body', c = 'ink', style, ...rest }: TProps) {
  // 시스템 글자 크기를 따르되, 고정 높이 레이아웃이 깨지지 않게 1.2배까지만
  return <Text maxFontSizeMultiplier={1.2} {...rest} style={[type[v], { color: colors[c] }, style]} />;
}

// ── Screen
export function Screen({ children, style, edges = ['top'], ...rest }: ViewProps & { edges?: ('top' | 'bottom')[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.page, paddingTop: edges.includes('top') ? insets.top : 0, paddingBottom: edges.includes('bottom') ? insets.bottom : 0 }, style]}
    >
      {children}
    </View>
  );
}

// ── Pressables
// NativeWind 인터롭이 함수형 style을 버리므로 눌림 상태를 직접 들고 정적 style을 넘긴다
export function Press({ style, children, onPressIn, onPressOut, accessibilityRole = 'button', ...rest }: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      {...rest}
      accessibilityRole={accessibilityRole}
      onPressIn={e => { setPressed(true); onPressIn?.(e); }}
      onPressOut={e => { setPressed(false); onPressOut?.(e); }}
      style={[style, pressed ? s.pressed : null]}
    >
      {children}
    </Pressable>
  );
}

interface BtnProps extends PressableProps { label: string; icon?: IconName; loading?: boolean; style?: ViewStyle; right?: IconName }
export function PrimaryButton({ label, icon, loading, disabled, style, right, ...rest }: BtnProps) {
  return (
    <Press {...rest} disabled={disabled || loading} style={[s.primary, disabled ? { opacity: 0.4 } : glow(0.45, 20), style ?? {}]}>
      {loading ? <ActivityIndicator color={colors.onPrimary} /> : (
        <>
          {icon && <Icon name={icon} size={20} color={colors.onPrimary} />}
          <T v="bodyStrong" c="onPrimary">{label}</T>
          {right && <Icon name={right} size={18} color={colors.onPrimary} />}
        </>
      )}
    </Press>
  );
}

export function SecondaryButton({ label, icon, style, loading, ...rest }: BtnProps) {
  return (
    <Press {...rest} style={[s.secondary, style ?? {}]}>
      {loading ? <ActivityIndicator color={colors.ink} /> : (
        <>
          {icon && <Icon name={icon} size={18} color={colors.ink} />}
          <T v="bodyStrong">{label}</T>
        </>
      )}
    </Press>
  );
}

export function IconButton({ name, onPress, size = 44, color = colors.ink, badge, style, accessibilityLabel }: { name: IconName; onPress?: () => void; size?: number; color?: string; badge?: boolean; style?: ViewStyle; accessibilityLabel?: string }) {
  return (
    <Press onPress={onPress} accessibilityLabel={accessibilityLabel} hitSlop={6} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, style ?? {}]}>
      <Icon name={name} size={size * 0.48} color={color} />
      {badge && <View style={s.badge} />}
    </Press>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Press onPress={onPress} style={[s.chip, active ? { backgroundColor: colors.primarySoft, borderColor: 'rgba(79,209,255,0.6)' } : null] as ViewStyle[]}>
      {icon && <Icon name={icon} size={14} color={active ? colors.primary : colors.ink2} />}
      <T v="captionStrong" c={active ? 'primary' : 'ink2'}>{label}</T>
    </Press>
  );
}

// ── Media
export function Art({ uri, size, radius = 12, round, style, dim }: { uri?: string | null; size: number; radius?: number; round?: boolean; style?: ViewStyle; dim?: boolean }) {
  const r = round ? size / 2 : radius;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: colors.card2, opacity: dim ? 0.55 : 1 }, style]}>
      {/* Image에도 radius — Android 지도 마커 스냅샷은 부모 overflow 클리핑을 못 그린다 */}
      {uri ? <Image source={{ uri: artUrl(uri, size)! }} style={{ width: size, height: size, borderRadius: r }} /> : (
        <LinearGradient colors={['#0E2A5A', '#111B3F']} style={{ flex: 1, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="music" size={size * 0.38} color={colors.ink3} />
        </LinearGradient>
      )}
    </View>
  );
}

export function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.card2 }} />;
  const initial = (name ?? '?').trim().charAt(0) || '?';
  return (
    <LinearGradient colors={['#1B5BA8', '#0B1330']} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <T v={size > 48 ? 'title' : 'captionStrong'} style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>{initial}</T>
    </LinearGradient>
  );
}

// ── Misc
export const Divider = ({ style }: { style?: ViewStyle }) => <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <Press onPress={() => onChange(!value)} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? colors.primary : colors.card2, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: value ? colors.onPrimary : colors.ink2 }} />
    </Press>
  );
}

export const Radio = ({ on }: { on: boolean }) => (
  <View style={[{ width: 24, height: 24, borderRadius: 12, borderWidth: on ? 7 : 1.5, borderColor: on ? colors.primary : colors.line }, on ? glow(0.5, 8) : null]} />
);

export function Loading({ style }: { style?: ViewStyle }) {
  return <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}><ActivityIndicator color={colors.primary} /></View>;
}

export function Empty({ icon = 'music', title, desc, action }: { icon?: IconName; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
        <Icon name={icon} size={24} color={colors.ink3} />
      </View>
      <T v="headline" style={{ textAlign: 'center' }}>{title}</T>
      {desc ? <T v="caption" c="ink2" style={{ textAlign: 'center' }}>{desc}</T> : null}
      {action}
    </View>
  );
}

export function TopBar({ title, onBack, right, left = 'chevronLeft' }: { title?: string; onBack?: () => void; right?: React.ReactNode; left?: IconName }) {
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
      {onBack ? <IconButton name={left} onPress={onBack} accessibilityLabel="뒤로" /> : <View style={{ width: 44 }} />}
      {title ? <T v="headline">{title}</T> : <View />}
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  primary: { height: 56, borderRadius: 30, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondary: { height: 52, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  badge: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.card },
});

export { Icon };
export type { IconName };
