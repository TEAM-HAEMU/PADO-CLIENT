/**
 * 드랍 핀 — Figma "B/Drop Pin/*": 물방울 안 앨범 아트 + 떨어진 자리의 파문.
 * 마커 좌표는 물방울 끝(파문 중심)에 맞춘다 → Marker anchor={{x: tipX/w, y: tipY/h}}
 */
import React, { useEffect } from 'react';
import { Image, Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { T, Icon } from '@/components/ui';
import { colors, glow } from '@/theme/tokens';
import { artUrl } from '@/utils/artUrl';
import type { DropType } from '@/api/types';

const drop = (D: number) => {
  const R = D / 2, H = D * 1.28;
  return `M${R} ${H} C ${R - D * 0.12} ${H - D * 0.2}, 0 ${D * 0.86}, 0 ${R} A ${R} ${R} 0 1 1 ${D} ${R} C ${D} ${D * 0.86}, ${R + D * 0.12} ${H - D * 0.2}, ${R} ${H} Z`;
};

function Ripple({ cx, cy, sizes, ops }: { cx: number; cy: number; sizes: number[]; ops: number[] }) {
  return (
    <>
      {sizes.map((w, i) => (
        <Ellipse key={w} cx={cx} cy={cy} rx={w / 2} ry={(w * 0.34) / 2} fill="none" stroke={colors.primary} strokeWidth={1.2} opacity={ops[i]} />
      ))}
    </>
  );
}

/** 떨어진 자리에서 퍼지는 파동 — 납작한 원(타원)이 커지며 사라진다 */
function WaveRing({ cx, cy, max, delay, duration }: { cx: number; cy: number; max: number; delay: number; duration: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, duration, v]);
  const st = useAnimatedStyle(() => ({
    opacity: 1 - v.value,
    transform: [{ scaleX: 0.15 + 0.85 * v.value }, { scaleY: (0.15 + 0.85 * v.value) * 0.34 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - max / 2, top: cy - max / 2, width: max, height: max, borderRadius: max / 2, borderWidth: 2, borderColor: colors.primary }, st]}
    />
  );
}

function AnimatedRipple({ cx, cy, max, rings }: { cx: number; cy: number; max: number; rings: number }) {
  const duration = 2600;
  return <>{Array.from({ length: rings }, (_, i) => <WaveRing key={i} cx={cx} cy={cy} max={max} delay={(duration / rings) * i} duration={duration} />)}</>;
}

interface PinProps {
  type: DropType;
  art?: string | null;
  active?: boolean;
  title?: string;
  subtitle?: string;
  count?: number;
  /** 파동 애니메이션 (Google 지도에선 Marker tracksViewChanges가 켜져 있어야 보인다) */
  animated?: boolean;
  onImageLoad?: () => void;
}

export const PIN_SIZE = {
  normal: { w: 56, h: 84, tipX: 28, tipY: 72 },
  active: { w: 190, h: 104, tipX: 34, tipY: 90 },
};

// Android 마커 비트맵은 overflow:hidden 클리핑을 못 그려서 앨범 아트는 Image 자체에 borderRadius를 준다
export function DropPin({ type, art, active, title, subtitle, count, animated, onImageLoad }: PinProps) {
  const D = active ? 60 : 48;
  const box = active ? PIN_SIZE.active : PIN_SIZE.normal;
  const off = 4;
  return (
    <View style={{ width: box.w, height: box.h }}>
      {animated ? <AnimatedRipple cx={box.tipX} cy={box.tipY} max={active ? 68 : 56} rings={active ? 3 : 2} /> : null}
      <Svg width={box.w} height={box.h} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#9BE7FF" />
            <Stop offset="1" stopColor="#3B6BFF" />
          </LinearGradient>
        </Defs>
        {animated ? null : active ? <Ripple cx={box.tipX} cy={box.tipY} sizes={[66, 44, 24]} ops={[0.15, 0.35, 0.7]} /> : <Ripple cx={box.tipX} cy={box.tipY} sizes={[44, 24]} ops={[0.25, 0.6]} />}
        <Path d={drop(D)} transform={`translate(${off},${off})`} fill={colors.card} stroke="url(#pg)" strokeWidth={active ? 2 : 1.6} />
        <Ellipse cx={box.tipX} cy={box.tipY} rx={active ? 7 : 6} ry={active ? 2.5 : 2} fill={colors.primary} />
      </Svg>
      <View style={[{ position: 'absolute', left: off + (D - (D - 8)) / 2, top: off + 4, width: D - 8, height: D - 8, borderRadius: (D - 8) / 2, alignItems: 'center', justifyContent: 'center' }, active && Platform.OS === 'ios' ? glow(0.55, 18) : null]}>
        {type === 'VOTE' && !art ? (
          <Icon name="vote" size={18} color={colors.accent2} />
        ) : art ? (
          <Image source={{ uri: artUrl(art, D - 8)! }} onLoadEnd={onImageLoad} style={{ width: D - 8, height: D - 8, borderRadius: (D - 8) / 2 }} />
        ) : (
          <Icon name={type === 'PLAYLIST' ? 'playlist' : 'music'} size={18} color={colors.ink2} />
        )}
      </View>
      {type === 'VOTE' && art ? (
        <View style={{ position: 'absolute', left: D - 8, top: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="vote" size={11} color={colors.ink} strokeWidth={2.4} />
        </View>
      ) : null}
      {type === 'PLAYLIST' && count ? (
        <View style={{ position: 'absolute', left: D - 12, top: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.primary }}>
          <T v="micro" c="onPrimary">{count}곡</T>
        </View>
      ) : null}
      {active && title ? (
        <View style={{ position: 'absolute', left: 70, top: 14, paddingLeft: 12, paddingRight: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(11,19,48,0.9)', borderWidth: 1, borderColor: colors.line, maxWidth: 118 }}>
          <T v="captionStrong" numberOfLines={1}>{title}</T>
          {subtitle ? <T v="micro" c="ink2" numberOfLines={1}>{subtitle}</T> : null}
        </View>
      ) : null}
    </View>
  );
}

/** 내 위치 — 입자 파문 링 (B/Me) */
export function MeMarker() {
  const dots: React.ReactNode[] = [];
  for (let k = 0; k < 3; k++) {
    const R = 22 + k * 14, n = 16 + k * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = 2.2 - k * 0.5;
      dots.push(<Ellipse key={`${k}-${i}`} cx={60 + R * Math.cos(a)} cy={60 + R * Math.sin(a)} rx={s / 2} ry={s / 2} fill={colors.primary} opacity={(0.8 - k * 0.25) * (0.5 + 0.5 * Math.sin(i * 1.3))} />);
    }
  }
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={120} height={120} style={{ position: 'absolute' }}>{dots}</Svg>
      <View style={[{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, borderWidth: 4, borderColor: colors.primary }, glow(0.9, 14)]} />
    </View>
  );
}
