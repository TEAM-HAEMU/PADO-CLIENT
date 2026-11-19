/**
 * 한 줄 글자가 폭보다 길면 잠깐 멈췄다가 왼쪽으로 흘러 끝까지 보여 주고, 다시 처음으로 이어지는 줄 (마키).
 * 폭 안에 들어가면 그냥 가운데 한 줄. 동작 줄이기(접근성)가 켜져 있으면 흐르지 않고 …으로 줄인다.
 * 같은 글을 gap 간격으로 두 번 붙여 흘리고, 한 바퀴(글 폭 + gap) 가면 0으로 돌아가 이음매 없이 반복한다.
 */
import React, { useEffect, useState } from 'react';
import { StyleProp, TextStyle, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { T, TypeName } from './index';
import { marqueeLoop } from '@/utils/marquee';

type Props = {
  children: string;
  /** 보이는 최대 폭 — 글이 이보다 길 때만 흐른다 */
  width: number;
  v?: TypeName;
  style?: StyleProp<TextStyle>;
  /** 두 번 붙인 글 사이 간격 */
  gap?: number;
  /** 흐르는 속도 (px/초) */
  speed?: number;
  /** 한 바퀴마다 처음 위치에서 멈추는 시간 (ms) */
  pause?: number;
};

export function Marquee({ children, width, v, style, gap = 40, speed = 32, pause = 1600 }: Props) {
  const reduced = useReducedMotion();
  const [textW, setTextW] = useState(0);
  const loop = marqueeLoop(width, textW, { reduced, gap, speed });
  const flows = loop !== null;
  const dist = loop?.dist ?? 0;
  const duration = loop?.duration ?? 0;
  const x = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (!dist) return;
    x.value = withRepeat(
      withSequence(
        withDelay(pause, withTiming(-dist, { duration, easing: Easing.linear })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [dist, duration, pause, x]);

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={{ maxWidth: width, alignSelf: 'center', overflow: 'hidden' }}>
      {/* 글 본래 폭 재기 — 넓은 상자 안에서 줄바꿈 없이 (보이지 않음, 읽기 도구도 건너뜀) */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0, flexDirection: 'row' }}>
        <T v={v} numberOfLines={1} style={style} onLayout={(e) => setTextW(Math.ceil(e.nativeEvent.layout.width))}>{children}</T>
      </View>
      {flows ? (
        <Animated.View accessible accessibilityLabel={children} style={[{ flexDirection: 'row', width: textW * 2 + gap }, moving]}>
          <T v={v} numberOfLines={1} style={[style, { width: textW }]}>{children}</T>
          <View style={{ width: gap }} />
          <T v={v} numberOfLines={1} style={[style, { width: textW }]} accessibilityElementsHidden importantForAccessibility="no">{children}</T>
        </Animated.View>
      ) : (
        <T v={v} numberOfLines={1} style={style}>{children}</T>
      )}
    </View>
  );
}
