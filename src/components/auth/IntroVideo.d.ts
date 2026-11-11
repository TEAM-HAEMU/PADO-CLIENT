/** 플랫폼별 구현(IntroVideo.ios.tsx / IntroVideo.android.tsx)의 공통 타입 */
import type React from 'react';
import type { ViewStyle } from 'react-native';

export declare function IntroVideo(props: { scene: number; paused: boolean; style: ViewStyle; onReady: () => void }): React.JSX.Element;
