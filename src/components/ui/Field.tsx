import React, { useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { colors, fonts, glow } from '@/theme/tokens';
import { SERVICES } from '@/services/musicLinks';
import type { ServiceId } from '@/store/prefs';
import { ServiceGlyph } from './Brand';
import { Icon } from './Icon';
import { Press, T } from './index';

interface Props extends TextInputProps { label?: string; help?: string; error?: string | null; secure?: boolean; right?: React.ReactNode; disabled?: boolean }

export function Field({ label, help, error, secure, right, disabled, style, ...rest }: Props) {
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="captionStrong" c="ink2">{label}</T> : null}
      {/* 포커스 글로우는 그림자 속성을 항상 두고 투명도만 바꾼다 — 스타일 모양이 바뀌면 감싼 뷰가 다시 만들어져 입력칸이 포커스를 잃는다 */}
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 14, height: 54, borderRadius: 16, backgroundColor: disabled ? colors.page : colors.card, borderWidth: focus ? 1.5 : 1, borderColor: error ? colors.caution : focus ? colors.primary : colors.line }, glow(focus && !error ? 0.22 : 0, 12), { elevation: 0 }]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? help}
          maxFontSizeMultiplier={1.2}
          {...rest}
          editable={!disabled}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.ink3}
          onFocus={e => { setFocus(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocus(false); rest.onBlur?.(e); }}
          style={[{ flex: 1, color: disabled ? colors.ink3 : colors.ink, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 0 }, style]}
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.primary}
        />
        {secure ? (
          <Press onPress={() => setHidden(h => !h)} hitSlop={10} accessibilityLabel={hidden ? '비밀번호 보기' : '비밀번호 숨기기'}>
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} color={colors.ink3} />
          </Press>
        ) : null}
        {right}
      </View>
      {error ? <T v="micro" c="caution">{error}</T> : help ? <T v="micro" c="ink3">{help}</T> : null}
    </View>
  );
}

/** 여성/남성 세그먼트 (명세: gender true=남성, false=여성) */
/** optional이면 '선택 안 함'(null)도 고를 수 있다 — 가입 시 성별은 필수가 아님 (App Store 5.1.1(v)) */
export function GenderSelect({ value, onChange, optional }: { value: boolean | null; onChange: (v: boolean | null) => void; optional?: boolean }) {
  const options: (readonly [string, boolean | null])[] = optional ? [['여성', false], ['남성', true], ['선택 안 함', null]] : [['여성', false], ['남성', true]];
  return (
    <View style={{ gap: 6 }}>
      <T v="captionStrong" c="ink2">성별{optional ? <T v="caption" c="ink3"> (선택)</T> : null}</T>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
        {options.map(([label, v]) => {
          const on = value === v;
          return (
            <Press key={label} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }}>
              <T v="bodyStrong" c={on ? 'primary' : 'ink2'}>{label}</T>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const LISTEN_APPS: ServiceId[] = ['spotify', 'appleMusic', 'youtubeMusic'];

/** 가입 화면 '듣는 앱' — 전체 듣기를 열 앱 (선택, 설정에서 언제든 변경) */
export function ListenAppSelect({ value, onChange }: { value: ServiceId | null; onChange: (v: ServiceId) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="captionStrong" c="ink2">듣는 앱 <T v="caption" c="ink3">(선택)</T></T>
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
        {LISTEN_APPS.map(s => {
          const on = value === s;
          return (
            <Press key={s} onPress={() => onChange(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={SERVICES[s].label} style={{ flex: 1, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }}>
              <ServiceGlyph service={s} size={26} />
              <T v="captionStrong" c={on ? 'primary' : 'ink2'} numberOfLines={1}>{SERVICES[s].label}</T>
            </Press>
          );
        })}
      </View>
      <T v="micro" c="ink3">전체 듣기를 누르면 이 앱으로 열려요. 추후에 설정에서 변경할 수 있어요.</T>
    </View>
  );
}

export { formatBirth, validBirth } from '@/utils/birth';
