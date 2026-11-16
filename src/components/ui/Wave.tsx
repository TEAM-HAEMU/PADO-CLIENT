/**
 * 파도 배경 — Figma 'wave' 컴포넌트(뒤·앞 두 겹)를 'D · 흐르는 파도 + 일렁임' 시안대로 움직인다.
 *  · 각 겹을 [원본][좌우 반전][원본]으로 이어 붙여 두 폭만큼 흘려보내면 이음새 없이 8초마다 반복
 *  · 뒤 겹은 4초, 앞 겹은 2.7초 주기로 위아래 일렁임 (8초 안에 딱 맞아떨어지는 주기)
 *  · surge: 재생 중에만 쓰는 'E · 재생 중 출렁임' — 1.6초 주기로 더 크게 출렁임
 */
import React, { useEffect, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { useScreenVisible } from '@/hooks/useScreenVisible';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

const BACK = { w: 486.247, d: 'M102.178 10.5432C89.9941 49.2173 44.3925 73.2827 13.4876 83.7805C5.65364 86.4416 0 93.5872 0 101.861V198.858C0 208.8 8.05887 216.858 18 216.858H468.247C478.188 216.858 486.247 208.8 486.247 198.858V106.865C486.247 96.5089 477.405 88.4959 467.25 86.4622C425.116 78.0238 396.76 34.6159 386.136 9.37629C385.477 7.81203 384.674 6.30037 383.511 5.06449C375.182 -3.78534 366.565 0.718931 362.051 5.34185C361.017 6.40054 360.28 7.73207 359.67 9.08011C324.813 86.072 253.416 93.9217 220.525 88.0216C219.638 87.8625 218.762 87.7608 217.863 87.7032C171.478 84.7314 137.688 34.9557 125.713 8.66848C125.209 7.5616 124.642 6.49275 123.852 5.56785C119.272 0.204355 113.759 0.00614267 109.408 1.38969C105.474 2.64088 103.419 6.60545 102.178 10.5432Z' };
const FRONT = { w: 504.781, d: 'M113.096 10.5731C99.9716 49.4491 46.7778 73.5579 13.616 83.9579C5.6926 86.4428 0 93.6225 0 101.926V198.858C0 208.8 8.05886 216.858 18 216.858H486.781C496.722 216.858 504.781 208.8 504.781 198.858V106.843C504.781 96.4954 495.959 88.4798 485.795 86.5368C442.629 78.2846 413.578 34.7105 402.707 9.39318C402.031 7.81845 401.208 6.29802 400.021 5.06175C391.529 -3.78376 382.745 0.718738 378.142 5.34082C377.088 6.39893 376.334 7.73596 375.708 9.09175C340.145 86.1112 267.294 93.9292 233.78 88.0128C232.909 87.8591 232.051 87.7613 231.168 87.7065C183.851 84.7682 149.378 34.9793 137.158 8.67963C136.641 7.56559 136.059 6.49061 135.252 5.56444C130.568 0.188268 124.929 0.00530085 120.487 1.40212C116.517 2.65093 114.427 6.62927 113.096 10.5731Z' };
const H = 216.858;
/** 일렁임·출렁임으로 위로 올라가는 만큼 봉우리가 잘리지 않게 둔 윗여백 */
const HEAD = 24;

function Tiles({ shape, id }: { shape: typeof BACK; id: string }) {
  const { w, d } = shape;
  return (
    <Svg width={w * 3} height={H} viewBox={`0 0 ${w * 3} ${H}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#CDD9FF" />
          <Stop offset="0.428" stopColor="#FFFFFF" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill={`url(#${id})`} />
      <G transform={`translate(${w * 2} 0) scale(-1 1)`}><Path d={d} fill={`url(#${id})`} /></G>
      <G transform={`translate(${w * 2} 0)`}><Path d={d} fill={`url(#${id})`} /></G>
    </Svg>
  );
}

/**
 * 0→1 반복 값. running이 꺼지면(화면이 가려짐·앱 백그라운드) 그 자리에서 멈췄다가, 다시 보이면 멈춘 곳에서 이어 간다.
 * 이어 갈 때: 남은 만큼 1까지 간 뒤 원래 반복으로 (흐름은 0과 1이 같은 그림이라 1→0으로 바로 넘어가도 이음새가 없다).
 */
function useLoop(duration: number, enabled: boolean, reverse = false, running = true) {
  const v = useSharedValue(0);
  const paused = useRef(false);
  useEffect(() => {
    if (!enabled) { cancelAnimation(v); v.value = 0; paused.current = false; return; }
    if (!running) { cancelAnimation(v); paused.current = true; return; }
    const easing = reverse ? Easing.inOut(Easing.sin) : Easing.linear;
    if (paused.current) {
      paused.current = false;
      scheduleOnUI(() => {
        'worklet';
        const rest = { duration: Math.max(0, 1 - v.value) * duration, easing };
        v.value = reverse
          ? withSequence(withTiming(1, rest), withRepeat(withTiming(0, { duration, easing }), -1, true))
          : withSequence(withTiming(1, rest), withTiming(0, { duration: 0 }), withRepeat(withTiming(1, { duration, easing }), -1, false));
      });
    } else {
      v.value = withRepeat(withTiming(1, { duration, easing }), -1, reverse);
    }
    return () => cancelAnimation(v);
  }, [duration, enabled, reverse, running, v]);
  return v;
}

interface Props {
  /** 화면 아래쪽 등 배치용 스타일 (absolute 권장) */
  style?: ViewStyle;
  /** Figma 인스턴스 기본 투명도 0.4 */
  opacity?: number;
  /** 겹 전체 크기 배율 (Figma 592×254 기준 1) */
  scale?: number;
  /** 재생 중 출렁임 (E 시안) */
  surge?: boolean;
  /** 멈춘 그림만 (스크린샷·접근성 '동작 줄이기') */
  still?: boolean;
}

export function Wave({ style, opacity = 0.4, scale = 1, surge = false, still = false }: Props) {
  const reduced = useReducedMotion();
  const on = !still && !reduced;
  // 가려진 화면(native-stack 아래 화면·다른 탭)·백그라운드에서는 멈춘다 — 시트처럼 비쳐 보이는 덮개 아래에선 계속
  const visible = useScreenVisible();
  const flow = useLoop(8000, on, false, visible);
  const bobBack = useLoop(surge ? 800 : 2000, on, true, visible);
  const bobFront = useLoop(surge ? 800 : 1333, on, true, visible);

  const back = useAnimatedStyle(() => ({ transform: [{ translateX: -flow.value * BACK.w * 2 }, { translateY: (surge ? -18 : -7) + bobBack.value * (surge ? 18 : 10) }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ translateX: -flow.value * FRONT.w * 2 }, { translateY: 2 - bobFront.value * (surge ? 18 : 11) }, { scaleY: 1 + bobFront.value * (surge ? 0.1 : 0.07) }] }));

  return (
    <View pointerEvents="none" style={[{ height: (254 + HEAD) * scale, overflow: 'hidden', opacity }, style]}>
      <View style={{ transform: [{ scale }], transformOrigin: 'left top', width: BACK.w * 3, height: 254 + HEAD }}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: HEAD }, back]}><Tiles shape={BACK} id="waveBack" /></Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 87, top: HEAD + 37 }, front]}><Tiles shape={FRONT} id="waveFront" /></Animated.View>
      </View>
    </View>
  );
}
