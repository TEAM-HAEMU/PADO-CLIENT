import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/store/toast';
import { colors, dropShadow } from '@/theme/tokens';
import { Icon } from './Icon';
import { T } from './index';

export function ToastHost() {
  const t = useToast(s => s.current);
  const insets = useSafeAreaInsets();
  if (!t) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
      <Animated.View key={t.id} accessibilityLiveRegion="polite" accessibilityRole="alert" entering={FadeInUp.duration(200)} exiting={FadeOutUp} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(17,27,63,0.96)', borderWidth: 1, borderColor: t.tone === 'error' ? 'rgba(251,146,60,0.5)' : colors.line, maxWidth: 370 }, dropShadow]}>
        <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'wave'} size={18} color={t.tone === 'error' ? colors.caution : colors.primary} />
        <T v="captionStrong" style={{ flexShrink: 1 }}>{t.text}</T>
      </Animated.View>
    </View>
  );
}
