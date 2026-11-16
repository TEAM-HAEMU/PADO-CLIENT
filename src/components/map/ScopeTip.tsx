/**
 * 지도 위 지역 이름 아래 말풍선 — 보기·재생 범위가 바뀌었을 때 한 번 (문구는 utils/scopeTip).
 * 화면 너비만큼 넓게, 왼쪽에 해달(마스코트), 큰 줄 하나 + 받치는 줄.
 * 화면을 막지 않는다: 누르는 동작은 지도로 그대로 가고, 화면 어디든 처음 누르면 닫힌다(지도 화면이 닫음).
 * 모양: 짙은 남색 바탕·흰 글자·위쪽 작은 꼬리, 페이드만 (튕기는 움직임 없음)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import { T } from '@/components/ui';
import { colors } from '@/theme/tokens';

const otter = require('@/assets/otter/otter.webp');

export function ScopeTip({ title, body, top }: { title: string; body: string | null; top: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" accessible accessibilityLabel={body ? `${title}. ${body}` : title}
      style={{ position: 'absolute', top, left: 20, right: 20, opacity: fade }}>
      {/* 꼬리 — 지역 이름 첫 글자 쪽을 가리킨다 */}
      <View style={{ marginLeft: 20, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.ink }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderRadius: 20, paddingVertical: 14, paddingLeft: 12, paddingRight: 18, shadowColor: '#12214A', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        {/* 그림 둘레에 여백이 있어 크게 두고 위아래를 겹쳐 말풍선 높이는 그대로 */}
        <Image source={otter} style={{ width: 84, height: 84, marginVertical: -12, marginLeft: -6, marginRight: -4 }} accessibilityIgnoresInvertColors />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="headline" style={{ color: '#FFFFFF' }}>{title}</T>
          {body ? <T v="body" style={{ color: colors.accent2 }}>{body}</T> : null}
        </View>
      </View>
    </Animated.View>
  );
}
