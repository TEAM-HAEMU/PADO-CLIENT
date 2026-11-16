/**
 * 지도 위 지역 이름 아래 말풍선 — 보기·재생 범위가 바뀌었을 때 한 번 (문구는 utils/scopeTip).
 * 화면을 막지 않는다: 누르는 동작은 지도로 그대로 가고, 화면 어디든 처음 누르면 닫힌다(지도 화면이 닫음).
 * 모양: 짙은 남색 바탕·흰 글자·위쪽 작은 꼬리, 페이드만 (튕기는 움직임 없음)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { T } from '@/components/ui';
import { colors } from '@/theme/tokens';

export function ScopeTip({ text, top }: { text: string; top: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" accessible accessibilityLabel={text}
      style={{ position: 'absolute', top, left: 20, maxWidth: 280, opacity: fade }}>
      {/* 꼬리 — 지역 이름 첫 글자 쪽을 가리킨다 */}
      <View style={{ marginLeft: 18, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.ink }} />
      <View style={{ backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, shadowColor: '#12214A', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
        <T v="caption" style={{ color: '#FFFFFF', lineHeight: 20 }}>{text}</T>
      </View>
    </Animated.View>
  );
}
