/**
 * 드랍 핀 — Figma 새 디자인 '2.1 지도 홈' stay music: 흰 테두리 둥근 사각 앨범 아트가 줄기 위에 떠 있고, 떨어진 자리에 물결.
 * 마커 좌표는 물결 중심(점)에 맞춘다 → Marker anchor={{x: tipX/w, y: tipY/h}}
 */
import React, { useEffect } from 'react';
import { Image, Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, Image as SvgImage, Rect } from 'react-native-svg';
import { T, Icon } from '@/components/ui';
import { colors, glow } from '@/theme/tokens';
import { artUrl } from '@/utils/artUrl';
import type { DropType } from '@/api/types';

/** 멈춘 물결 — Figma 'Group 4' (81×29 타원 세 겹, 흰 선 1.2 · 투명도 0.15/0.35/0.7) */
function Ripple({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <Ellipse cx={cx} cy={cy} rx={39.9} ry={13.9} fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.15} />
      <Ellipse cx={cx} cy={cy} rx={26.7} ry={9.2} fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.35} />
      <Ellipse cx={cx} cy={cy} rx={14.6} ry={4.8} fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.7} />
    </>
  );
}

const RIPPLE_W = 81;
const RIPPLE_H = 29;

/** 떨어진 자리에서 퍼지는 물결 — 납작한 원(타원)이 커지며 사라진다 */
function WaveRing({ cx, cy, delay, duration }: { cx: number; cy: number; delay: number; duration: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, duration, v]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - v.value),
    transform: [{ scaleX: 0.15 + 0.85 * v.value }, { scaleY: (0.15 + 0.85 * v.value) * (RIPPLE_H / RIPPLE_W) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - RIPPLE_W / 2, top: cy - RIPPLE_W / 2, width: RIPPLE_W, height: RIPPLE_W, borderRadius: RIPPLE_W / 2, borderWidth: 2.4, borderColor: '#FFFFFF' }, st]}
    />
  );
}

function AnimatedRipple({ cx, cy, rings }: { cx: number; cy: number; rings: number }) {
  const duration = 2600;
  return <>{Array.from({ length: rings }, (_, i) => <WaveRing key={i} cx={cx} cy={cy} delay={(duration / rings) * i} duration={duration} />)}</>;
}

interface PinProps {
  type: DropType;
  art?: string | null;
  active?: boolean;
  title?: string;
  subtitle?: string;
  count?: number;
  /** 물결 애니메이션 (Google 지도에선 Marker tracksViewChanges가 켜져 있어야 보인다) */
  animated?: boolean;
  onImageLoad?: () => void;
}

/** 아트 한 변 A → 줄기 16 · 점(8×7) 중심 A+15.5 · 물결 반높이 14.5 */
const box = (A: number) => ({ w: RIPPLE_W, h: A + 31, tipX: RIPPLE_W / 2, tipY: A + 15.5 });
export const PIN_SIZE = { normal: box(55), active: box(63) };

/**
 * Figma 'stay music': 흰 바탕 · #FAFAFA 테두리 3 · 모서리 12 앨범 아트 + 아래로 반투명 줄기와 점.
 * Android 마커 비트맵은 overflow:hidden 클리핑을 못 그려서 앨범 아트는 Image 자체에 borderRadius를 준다
 */
export function DropPin({ type, art, active, title, subtitle, count, animated, onImageLoad }: PinProps) {
  const A = active ? 63 : 55;
  const B = 3;
  const inner = A - B * 2;
  const R = 12;
  const b = active ? PIN_SIZE.active : PIN_SIZE.normal;
  const left = (b.w - A) / 2;
  return (
    <View style={{ width: b.w, height: b.h }} accessible={!!title} accessibilityLabel={title ? `${title}${subtitle ? ` · ${subtitle}` : ''}` : undefined}>
      {animated ? <AnimatedRipple cx={b.tipX} cy={b.tipY} rings={active ? 3 : 2} /> : null}
      <Svg width={b.w} height={b.h} style={{ position: 'absolute' }}>
        {animated ? null : <Ripple cx={b.tipX} cy={b.tipY} />}
      </Svg>
      {/* 줄기 + 떨어진 점 */}
      <View style={{ position: 'absolute', left: b.tipX - 0.5, top: A, width: 1, height: 16, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, backgroundColor: 'rgba(250,250,250,0.7)' }} />
      <View style={{ position: 'absolute', left: b.tipX - 4, top: A + 12, width: 8, height: 7, borderRadius: 4, backgroundColor: 'rgba(250,250,250,0.7)' }} />
      <View
        style={[
          { position: 'absolute', left, top: 0, width: A, height: A, borderRadius: R, backgroundColor: '#FFFFFF', borderWidth: B, borderColor: active ? colors.accent : '#FAFAFA', alignItems: 'center', justifyContent: 'center' },
          Platform.OS === 'ios' ? (active ? glow(0.8, 14) : { shadowColor: '#12214A', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }) : null,
        ]}
      >
        {art ? (
          <MarkerArt images={[art]} size={inner} radius={R - B} onLoad={onImageLoad} />
        ) : (
          <View style={{ width: inner, height: inner, borderRadius: R - B, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={type === 'VOTE' ? 'vote' : type === 'PLAYLIST' ? 'playlist' : 'music'} size={18} color={colors.primary} />
          </View>
        )}
      </View>
      {type === 'VOTE' && art ? (
        <View style={{ position: 'absolute', left: left + A - 14, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="vote" size={11} color={colors.ink} strokeWidth={2.4} />
        </View>
      ) : null}
      {type === 'PLAYLIST' && count ? (
        <View style={{ position: 'absolute', left: left + A - 20, top: -4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: '#FFFFFF' }}>
          <T v="micro" c="page" style={{ fontSize: 10, lineHeight: 13 }}>{count}곡</T>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 지도 마커 안 앨범 아트 (4장 이상이면 2×2 콜라주).
 * Android 마커는 뷰를 비트맵으로 찍어 쓰는데, 일반 Image는 화면에 붙지 않은 마커 안에서 끝내 그려지지 않아 빈 칸으로 굳는다
 * → Android는 자기 캔버스에 직접 그리는 SVG 이미지로 그린다 (모서리는 clipPath)
 */
export function MarkerArt({ images, size, radius, onLoad }: { images: (string | null | undefined)[]; size: number; radius: number; onLoad?: () => void }) {
  const list = images.filter((u): u is string => !!u);
  const tiles = list.length >= 4 ? list.slice(0, 4) : list.slice(0, 1);
  const h = tiles.length === 4 ? size / 2 : size;
  const at = (i: number) => (tiles.length === 4 ? { x: (i % 2) * h, y: Math.floor(i / 2) * h } : { x: 0, y: 0 });
  if (Platform.OS === 'android') {
    return (
      <Svg width={size} height={size}>
        <Defs><ClipPath id="art"><Rect width={size} height={size} rx={radius} ry={radius} /></ClipPath></Defs>
        {tiles.map((u, i) => <SvgImage key={i} href={{ uri: artUrl(u, h)! }} {...at(i)} width={h} height={h} preserveAspectRatio="xMidYMid slice" clipPath="url(#art)" onLoad={onLoad} />)}
      </Svg>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
      {tiles.map((u, i) => <Image key={i} source={{ uri: artUrl(u, h)! }} onLoadEnd={onLoad} style={{ width: h, height: h, borderRadius: tiles.length === 4 ? 0 : radius }} />)}
    </View>
  );
}

/** 내 위치 — 입자 물결 링 */
export function MeMarker() {
  const dots: React.ReactNode[] = [];
  for (let k = 0; k < 3; k++) {
    const R = 22 + k * 14, n = 16 + k * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = 2.2 - k * 0.5;
      dots.push(<Ellipse key={`${k}-${i}`} cx={60 + R * Math.cos(a)} cy={60 + R * Math.sin(a)} rx={s / 2} ry={s / 2} fill="#FFFFFF" opacity={(0.9 - k * 0.25) * (0.5 + 0.5 * Math.sin(i * 1.3))} />);
    }
  }
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={120} height={120} style={{ position: 'absolute' }}>{dots}</Svg>
      <View style={[{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, borderWidth: 4, borderColor: '#FFFFFF' }, glow(0.9, 14)]} />
    </View>
  );
}
