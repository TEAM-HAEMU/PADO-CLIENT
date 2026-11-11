/**
 * 소개·로그인 화면 가운데 캐릭터 '해달' — Figma '캐릭터가 움직이는 이미지' 자리(230×240).
 * 장면마다 AI로 만든 짧은 영상(첫·끝 장면을 같은 그림으로 지정해 만들고, 배경을 지운 뒤 끝 0.25초를 처음과 겹쳐 반복 이음새를 없앤 것)을 투명 배경으로 재생한다.
 *  · 0 휴대폰을 보다 빛 구슬을 발견 / 1 병을 물 위에 띄워 보냄 / 2 조개를 귀에 대고 리듬 / 3 로그인: 물 위에 둥실
 *  · 지금 보이는 장만 재생하고 나머지는 멈춘다 (소개 화면은 세 장이 동시에 붙어 있음)
 *  · 영상이 뜨기 전·'동작 줄이기'가 켜져 있으면 정지 그림
 * iOS는 HEVC 알파 .mov, Android는 위아래로 쌓은 mp4 + 셰이더 — IntroVideo.ios/.android 참고.
 */
import React, { useCallback, useState } from 'react';
import { Image, type StyleProp, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { IntroVideo } from './IntroVideo';

/** 디자인 자리 크기 (기준 폭 402) */
export const INTRO_ART = { width: 230, height: 240 };

const POSTER = require('@/assets/otter/intro_poster.webp');
const SCENES = 4;

// page: 0~2 소개 장면, 3 로그인 · active: 지금 화면에 보이는 장인지 (보일 때만 재생)
export function IntroArt({ page, active = true, style }: { page: number; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scene = Math.max(0, Math.min(SCENES - 1, page));
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

  return (
    <View
      pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[{ height: INTRO_ART.height, maxHeight: '100%', aspectRatio: INTRO_ART.width / INTRO_ART.height }, style]}
    >
      {/* 영상 첫 장면과 같은 정지 그림 — 영상이 뜨면 가린다 */}
      {reduced || !ready ? <Image source={POSTER} style={fill} resizeMode="contain" /> : null}
      {reduced ? null : <IntroVideo scene={scene} paused={!active} style={fill} onReady={onReady} />}
    </View>
  );
}
