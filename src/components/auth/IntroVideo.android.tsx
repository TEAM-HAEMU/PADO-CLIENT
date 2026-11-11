/** Android 캐릭터 영상 — 기본 플레이어는 알파를 버리므로, 위(색)·아래(알파)로 쌓은 mp4를 네이티브 AlphaVideoView(셰이더)로 합쳐 그린다 */
import React, { useEffect } from 'react';
import { requireNativeComponent, type ViewStyle } from 'react-native';

const PadoAlphaVideo = requireNativeComponent<{ source: string; paused?: boolean; style?: ViewStyle }>('PadoAlphaVideo');

export function IntroVideo({ scene, paused, style, onReady }: { scene: number; paused: boolean; style: ViewStyle; onReady: () => void }) {
  // 첫 프레임 알림은 받지 않으므로 붙자마자 준비된 것으로 본다 (뷰가 투명이라 로딩 중 빈칸만 보임)
  useEffect(() => { onReady(); }, [onReady]);
  return <PadoAlphaVideo source={`intro_scene${scene}`} paused={paused} style={style} />;
}
