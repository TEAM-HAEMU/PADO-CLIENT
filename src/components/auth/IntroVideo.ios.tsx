/** iOS 캐릭터 영상 — HEVC 알파 .mov를 react-native-video가 투명 배경 그대로 재생 (알파를 미리 곱해 인코딩해야 반투명 부분이 하얗게 뜨지 않음) */
import React from 'react';
import type { ViewStyle } from 'react-native';
import Video from 'react-native-video';

const SOURCES = [
  require('@/assets/otter/intro_scene0.mov'),
  require('@/assets/otter/intro_scene1.mov'),
  require('@/assets/otter/intro_scene2.mov'),
  require('@/assets/otter/intro_scene3.mov'),
];

export function IntroVideo({ scene, paused, style, onReady }: { scene: number; paused: boolean; style: ViewStyle; onReady: () => void }) {
  return (
    <Video
      source={SOURCES[scene]}
      repeat
      muted
      paused={paused}
      resizeMode="contain"
      shutterColor="transparent"
      // 소리 없는 꾸밈 영상 — 듣고 있던 음악을 끊지 않게 오디오 세션은 건드리지 않는다
      mixWithOthers="mix"
      disableAudioSessionManagement
      playInBackground={false}
      onReadyForDisplay={onReady}
      style={[style, { backgroundColor: 'transparent' }]}
    />
  );
}
