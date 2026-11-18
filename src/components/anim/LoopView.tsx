/**
 * iOS 반복 장식 애니메이션을 Core Animation으로 — 네이티브 PADOLoopView (ios/PADO/PADOLoopView.m).
 * Reanimated로 돌리면 앱의 UI 스레드가 매 프레임 값을 계산해 뷰에 넣는다(재생 중 지도·프로필이 늘 60fps로 일함).
 * Core Animation 애니메이션은 렌더 서버가 돌려서, 한 번 걸어 두면 앱은 프레임마다 아무 일도 하지 않는다.
 *  · 애니메이션은 이 뷰의 자식(그림)에 걸린다 — 테두리·배경 같은 모양은 자식 View에 준다 (이 뷰의 style은 위치·크기만)
 *  · paused: 그 자리에서 멈추고, 풀면 멈춘 곳에서 이어 간다
 * Android는 지금처럼 Reanimated로 그린다 (nativeLoops가 false).
 */
import React from 'react';
import { Platform, requireNativeComponent, type ViewProps } from 'react-native';
import type { Loop } from '@/utils/ambientMotion';

/** 이 기기에서 Core Animation 반복을 쓰는가 (iOS) */
export const nativeLoops = Platform.OS === 'ios';

type NativeProps = ViewProps & { loops: readonly Loop[]; paused?: boolean };
const Native = nativeLoops ? requireNativeComponent<NativeProps>('PADOLoopView') : null;

export function LoopView({ loops, paused = false, children, ...rest }: NativeProps) {
  if (!Native) return null;
  return <Native loops={loops} paused={paused} {...rest}>{children}</Native>;
}
