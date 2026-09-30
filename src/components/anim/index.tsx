/**
 * B · Deep 모션 — Figma 재생 화면 키프레임(8초 루프)을 Reanimated로 재현.
 *  · 파티클 파도 3겹: 402px 주기 그래픽을 -402px 이동 (이음매 없는 루프)
 *  · 레코드판처럼 도는 디스크: 8초 1회전
 *  · 숨 쉬는 링 / 퍼지는 파문
 */
import React, { useEffect, useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/tokens';

const W = 402;

function useLoop(duration: number, to = 1, enabled = true) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!enabled) { cancelAnimation(v); return; }
    v.value = withRepeat(withTiming(to, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(v);
  }, [duration, to, v, enabled]);
  return v;
}

function ParticleLayer({ yBase, rows, gap, amp, cycles, step, rMax, color, opMul, phase, width }: { yBase: number; rows: number; gap: number; amp: number; cycles: number; step: number; rMax: number; color: string; opMul: number; phase: number; width: number }) {
  const dots = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let r = 0; r < rows; r++)
      for (let x = 0; x < width * 2; x += step) {
        const a = (x / width) * Math.PI * 2 * cycles + phase;
        const y = yBase + r * gap + amp * Math.sin(a + r * 0.35) - r * r * 0.4;
        const o = opMul * (1 - r / rows) * (0.5 + 0.5 * Math.sin((x / width) * Math.PI * 2 * 3 + r));
        if (o < 0.12) continue;
        out.push(<Circle key={`${r}-${x}`} cx={x} cy={y} r={rMax * (1 - r * 0.08)} fill={color} opacity={o} />);
      }
    return out;
  }, [yBase, rows, gap, amp, cycles, step, rMax, color, opMul, phase, width]);
  return <Svg width={width * 2} height={340}>{dots}</Svg>;
}

/** 재생 화면 배경의 파티클 파도 (3겹, 서로 다른 속도감) */
export function ParticleWave({ style, width = W, animate = true }: { style?: ViewStyle; width?: number; animate?: boolean }) {
  const t = useLoop(8000, 1, animate);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!animate) { cancelAnimation(bob); return; }
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) })), -1);
    return () => cancelAnimation(bob);
  }, [animate, bob]);
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: animate ? -width * t.value : 0 }] }));
  const move2 = useAnimatedStyle(() => ({ transform: [{ translateX: animate ? -width * t.value : 0 }, { translateY: bob.value * 12 }] }));
  return (
    <View pointerEvents="none" style={[{ width, height: 340, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ position: 'absolute' }, move]}><ParticleLayer width={width} yBase={110} rows={5} gap={11} amp={34} cycles={1} step={12} rMax={1.3} color={colors.accent} opMul={0.7} phase={2} /></Animated.View>
      <Animated.View style={[{ position: 'absolute' }, move2]}><ParticleLayer width={width} yBase={150} rows={6} gap={10} amp={42} cycles={1} step={9} rMax={1.6} color={colors.primary} opMul={0.9} phase={0.3} /></Animated.View>
      <Animated.View style={[{ position: 'absolute' }, move]}><ParticleLayer width={width} yBase={200} rows={5} gap={9} amp={26} cycles={2} step={8} rMax={1.9} color={colors.accent2} opMul={1} phase={1.1} /></Animated.View>
    </View>
  );
}

/** 8초에 한 바퀴 도는 디스크 (paused면 정지) */
export function Spin({ children, paused, duration = 8000 }: { children: React.ReactNode; paused?: boolean; duration?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    // 일시정지면 그 자리에서 멈춘다 (이전엔 계속 돌았음)
    if (paused) { cancelAnimation(r); return; }
    r.value = r.value % 360;
    r.value = withRepeat(withTiming(r.value + 360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [paused, duration, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** 숨 쉬듯 커졌다 작아지는 링 */
export function BreathingRing({ size, opacity = 0.3, scaleTo = 1.08, style }: { size: number; opacity?: number; scaleTo?: number; style?: ViewStyle }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) })), -1);
  }, [v]);
  const st = useAnimatedStyle(() => ({ opacity: opacity * (1 - v.value * 0.6), transform: [{ scale: 1 + (scaleTo - 1) * v.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.primary }, st, style]} />;
}

/** 중심에서 계속 퍼져 나가는 파문 (드랍 완료 / 위치 안내) */
export function Ripples({ size = 360, count = 5, duration = 4000 }: { size?: number; count?: number; duration?: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => <RippleRing key={i} size={size} delay={(duration / count) * i} duration={duration} />)}
    </View>
  );
}
function RippleRing({ size, delay, duration }: { size: number; delay: number; duration: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, duration, v]);
  const st = useAnimatedStyle(() => ({ opacity: 0.75 * (1 - v.value), transform: [{ scale: 0.25 + 0.75 * v.value }] }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.2, borderColor: colors.primary }, st]} />;
}

/** 점으로 된 미리듣기 진행 바 (0~1) */
export function DotProgress({ progress, width, dots = 44 }: { progress: number; width: number; dots?: number }) {
  const filled = Math.round(progress * dots);
  return (
    <View style={{ width, height: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      {Array.from({ length: dots }, (_, i) => (
        <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: i < filled ? colors.primary : colors.ink3, opacity: i < filled ? 1 : 0.5, shadowColor: colors.primary, shadowOpacity: i < filled ? 0.8 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
      ))}
    </View>
  );
}
