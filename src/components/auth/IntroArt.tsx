/**
 * 소개·로그인 화면 가운데 그림 자리 — Figma에선 '캐릭터가 움직이는 이미지' 자리표시자(230×240).
 * 캐릭터 애니메이션 에셋이 오면 이 컴포넌트 안만 바꾸면 된다 (page로 장면을 고를 수 있게 열어둠).
 * 지금은 PADO 심볼만 은은하게 띄운다.
 */
import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { PadoSymbol } from '@/components/ui/Brand';

/** 디자인 자리 크기 (기준 폭 402) */
export const INTRO_ART = { width: 230, height: 240 };

// page: 0~2 소개 장면, 3 로그인 — 지금은 모두 같은 그림
export function IntroArt({ style }: { page: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[{ width: INTRO_ART.width, maxWidth: '70%', height: INTRO_ART.height, maxHeight: '100%', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <PadoSymbol size={112} />
    </View>
  );
}
