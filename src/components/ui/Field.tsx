import React, { useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { colors, fonts, glow } from '@/theme/tokens';
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
export function GenderSelect({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="captionStrong" c="ink2">성별</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['여성', false], ['남성', true]] as const).map(([label, v]) => {
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

export { formatBirth, validBirth } from '@/utils/birth';
