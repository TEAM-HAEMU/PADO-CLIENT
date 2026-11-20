import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runToastAction, useToast } from '@/store/toast';
import { colors, dropShadow } from '@/theme/tokens';
import { Icon } from './Icon';
import { Press, T } from './index';

export function ToastHost() {
  const t = useToast(s => s.current);
  const insets = useSafeAreaInsets();
  if (!t) return null;
  return (
    // 동작 버튼이 있을 때만 그 버튼이 터치를 받는다 — 토스트 몸통은 그대로 아래 화면으로 터치를 넘긴다
    <View pointerEvents={t.action ? 'box-none' : 'none'} style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
      <Animated.View key={t.id} pointerEvents={t.action ? 'box-none' : 'none'} accessibilityLiveRegion="polite" accessibilityRole="alert" entering={FadeInUp.duration(200)} exiting={FadeOutUp} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.98)', borderWidth: 1, borderColor: t.tone === 'error' ? 'rgba(226,104,58,0.4)' : colors.line, maxWidth: 370 }, dropShadow]}>
        <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'wave'} size={18} color={t.tone === 'error' ? colors.caution : colors.primary} />
        <T v="captionStrong" style={{ flexShrink: 1 }}>{t.text}</T>
        {t.action ? (
          <Press onPress={() => runToastAction(t.id)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }} accessibilityLabel={t.action.label} style={{ marginLeft: 2 }}>
            <T v="captionStrong" c="primary">{t.action.label}</T>
          </Press>
        ) : null}
      </Animated.View>
    </View>
  );
}
