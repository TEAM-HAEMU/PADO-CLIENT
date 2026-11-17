/**
 * 핀 물결 레이어 — 가까운 핀 몇 개가 떨어진 자리에서 퍼지는 물결을 지도 마커 밖, 지도 위에 겹친 보통 뷰로 그린다.
 * 마커 안에서 움직이면 Google 지도가 그 마커 그림을 계속 다시 찍어야 하고(tracksViewChanges) 매 프레임 마커까지 다시 커밋돼 비싸다.
 *  · 마커 자체엔 늘 멈춘 물결(DropPin Ripple)이 있고, 이 레이어는 그 위에 움직이는 물결만 더한다
 *  · 지도가 멈춰 있을 때만 — 움직이는 동안엔 숨기고, 멈추면 핀의 화면 좌표를 다시 재서 띄운다
 *  · 좌표를 잰 기준(핀·멈춘 영역)이 지금과 다르면 그리지 않는다 (옛 자리에 한 프레임이라도 뜨지 않게)
 */
import React, { type RefObject, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import type MapView from 'react-native-maps';
import { rippleToken, type RipplePin } from '@/utils/ambientMotion';

// DropPin 멈춘 물결과 같은 크기 (Figma 'Group 4' 81×29)
const RIPPLE_W = 81;
const RIPPLE_H = 29;
const DURATION = 2600;

/** 떨어진 자리에서 퍼지는 물결 한 겹 — 납작한 원(타원)이 커지며 사라진다 */
function WaveRing({ cx, cy, delay }: { cx: number; cy: number; delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, v]);
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

interface Props {
  mapRef: RefObject<MapView | null>;
  /** 물결을 그릴 핀 — 비었으면 레이어 없음 */
  pins: readonly RipplePin[];
  /** 지도가 마지막으로 멈춘 영역 — 바뀌면 좌표를 다시 잰다 */
  view: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null;
  /** 지도가 움직이는 중 */
  moving: boolean;
}

export function PinRipples({ mapRef, pins, view, moving }: Props) {
  const token = rippleToken(pins, view);
  const [measured, setMeasured] = useState<{ token: string; points: { id: string; x: number; y: number; rings: number }[] } | null>(null);
  const off = moving || !pins.length || !view;

  useEffect(() => {
    if (off) return;
    let alive = true;
    const map = mapRef.current;
    if (!map) return;
    Promise.all(pins.map(p => map.pointForCoordinate({ latitude: p.latitude, longitude: p.longitude }).then(pt => ({ id: p.id, x: pt.x, y: pt.y, rings: p.active ? 3 : 2 }))))
      .then(points => { if (alive) setMeasured({ token, points }); })
      .catch(() => { if (alive) setMeasured(null); });
    return () => { alive = false; };
  }, [off, token]); // eslint-disable-line react-hooks/exhaustive-deps -- pins·view는 token에 다 들어 있다

  if (off || measured?.token !== token) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {measured.points.map(p => (
        <React.Fragment key={p.id}>
          {Array.from({ length: p.rings }, (_, i) => <WaveRing key={i} cx={p.x} cy={p.y} delay={(DURATION / p.rings) * i} />)}
        </React.Fragment>
      ))}
    </View>
  );
}
