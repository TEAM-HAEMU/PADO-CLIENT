/**
 * 핀 물결 레이어 — 가까운 핀 몇 개가 떨어진 자리에서 퍼지는 물결을 지도 마커 밖, 지도 위에 겹친 보통 뷰로 그린다.
 * 마커 안에서 움직이면 Google 지도가 그 마커 그림을 계속 다시 찍어야 하고(tracksViewChanges) 매 프레임 마커까지 다시 커밋돼 비싸다.
 *  · 마커 자체엔 늘 멈춘 물결(DropPin Ripple)이 있고, 이 레이어는 그 위에 움직이는 물결만 더한다
 *  · 지도가 보이고 · 재생 중이고 · 지도가 멈춰 있을 때만. 움직이기 시작하면 곧바로 숨기고(hide — React 렌더 없이),
 *    멈추고 SETTLE_MS 뒤에 핀의 화면 좌표를 다시 재서 띄운다 (멈춘 직후엔 마커 교체·말풍선이 몰려 있다)
 *  · 좌표를 잰 기준(핀·멈춘 영역)이 지금과 다르면 그리지 않는다 (옛 자리에 한 프레임이라도 뜨지 않게)
 *  · 고리 뷰는 다시 만들지 않는다 — 위치·보이기는 공유 값으로 UI 스레드에서 바꾸고, 고리들은 시계 하나를 어긋나게 나눠 쓴다.
 *    드랍을 고르거나 지도를 움직여도 다시 재기·마운트·애니메이션 재시작이 없고, 크게 그린 핀이 바뀌면 그 핀의 셋째 고리만 붙이거나 뗀다
 *    (늘 3겹을 만들어 두고 숨기면 보이지 않는 고리도 매 프레임 UI 스레드에서 계산된다)
 *  · iOS는 고리가 퍼지는 움직임을 Core Animation(LoopView)이 돌린다 — Reanimated로 테두리 있는 뷰를 매 프레임 바꾸면
 *    RN이 프레임마다 테두리 그림을 CPU로 다시 그렸다(RCTGetBorderImage, 재생 중 지도 메인 스레드의 약 3/4). 테두리는 움직이지 않는 자식 뷰에 둔다
 */
import React, { type Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type MapView from 'react-native-maps';
import { usePreviewStore } from '@/services/preview';
import { LoopView, nativeLoops } from '@/components/anim/LoopView';
import { isPlaying, type Loop, RING_COUNT, ringLoops, ringProgress, RIPPLE, rippleToken, type RipplePin } from '@/utils/ambientMotion';

// DropPin 멈춘 물결과 같은 크기 (Figma 'Group 4' 81×29)
const RIPPLE_W = RIPPLE.w;
const RIPPLE_H = RIPPLE.h;
const DURATION = RIPPLE.duration;
/** 지도가 멈추고 물결을 다시 띄우기까지 */
export const SETTLE_MS = 300;
/** 다시 띄울 때 페이드 */
const FADE_MS = 200;

type Points = Record<string, { x: number; y: number }>;

/** 떨어진 자리에서 퍼지는 물결 한 겹 — 납작한 원(타원)이 커지며 사라진다 */
function WaveRing({ id, i, rings, clock, shown, points }: { id: string; i: number; rings: number; clock: SharedValue<number>; shown: SharedValue<number>; points: SharedValue<Points> }) {
  const st = useAnimatedStyle(() => {
    const p = points.value[id];
    const t = ringProgress(clock.value, i, rings);
    const e = t < 0 ? 0 : 1 - (1 - t) * (1 - t); // Easing.out(quad)
    const s = 0.15 + 0.85 * e;
    return {
      opacity: p && t >= 0 ? shown.value * 0.85 * (1 - e) : 0,
      transform: [{ translateX: (p ? p.x : 0) - RIPPLE_W / 2 }, { translateY: (p ? p.y : 0) - RIPPLE_W / 2 }, { scaleX: s }, { scaleY: s * (RIPPLE_H / RIPPLE_W) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, st]} />;
}

/**
 * iOS — 핀 하나의 물결 고리들. 위치·보이기만 공유 값으로 바꾸고(지도가 멈춰 좌표를 다시 잴 때뿐), 퍼지는 움직임은 Core Animation이 돌린다.
 * 모습은 WaveRing과 같다 (ringLoops: 같은 곡선·같은 어긋남). 재생 중 지도에 가만히 있어도 앱 UI 스레드가 매 프레임 고리를 계산하지 않는다
 */
function PinRings({ id, rings, shown, points }: { id: string; rings: number; shown: SharedValue<number>; points: SharedValue<Points> }) {
  const st = useAnimatedStyle(() => {
    const p = points.value[id];
    return {
      opacity: p ? shown.value : 0,
      transform: [{ translateX: (p ? p.x : 0) - RIPPLE_W / 2 }, { translateY: (p ? p.y : 0) - RIPPLE_W / 2 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.pin, st]}>
      {Array.from({ length: rings }, (_, i) => (
        <LoopView key={i} pointerEvents="none" loops={RING_LOOPS[rings]?.[i] ?? ringLoops(i, rings)} style={StyleSheet.absoluteFill}>
          <View style={styles.nativeRing} />
        </LoopView>
      ))}
    </Animated.View>
  );
}
const RING_LOOPS: Record<number, Loop[][]> = Object.fromEntries(
  [RING_COUNT.normal, RING_COUNT.active].map(n => [n, Array.from({ length: n }, (_, i) => ringLoops(i, n))]),
);

export interface PinRipplesHandle {
  /** 지도가 움직이기 시작함 — 곧바로 숨기고 재던 좌표는 버린다 (다시 멈추면 view가 바뀌어 다시 잰다) */
  hide: () => void;
}

interface Props {
  ref?: Ref<PinRipplesHandle>;
  mapRef: React.RefObject<MapView | null>;
  /** 물결을 그릴 핀 */
  pins: readonly RipplePin[];
  /** 크게 그린 핀(고른·가장 가까운 핀) — 고리 3겹 */
  activeId: string | null | undefined;
  /** 지도가 마지막으로 멈춘 영역 — 바뀌면(새 객체) 좌표를 다시 잰다 */
  view: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null;
  /** 지도 화면이 보이는가 (포커스 · 앱이 앞). 재생 중인지는 여기서 본다 — 지도 화면이 재생 상태를 구독하지 않게 */
  visible: boolean;
}

export function PinRipples({ ref, mapRef, pins, activeId, view, visible }: Props) {
  const playing = usePreviewStore(isPlaying);
  const on = visible && playing && pins.length > 0 && !!view;
  const token = rippleToken(pins, view);

  const clock = useSharedValue(0);
  const shown = useSharedValue(0);
  const points = useSharedValue<Points>({});

  /** 재기 회차 — 숨기거나 다시 잴 때 올려서, 늦게 끝난 재기는 버린다 */
  const round = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showing = useRef(false);
  const hide = useCallback(() => {
    round.current++;
    clearTimeout(timer.current);
    if (!showing.current) return;
    showing.current = false;
    cancelAnimation(shown);
    shown.value = 0;
    cancelAnimation(clock);
  }, [shown, clock]);
  useImperativeHandle(ref, () => ({ hide }), [hide]);

  const measuredView = useRef(view);
  useEffect(() => {
    if (!on) { hide(); return; }
    // 지도가 다른 곳에 멈췄으면 옛 좌표로 그리지 않게 바로 숨기고, 조금 기다렸다 잰다. 핀만 바뀌었으면(같은 자리) 곧바로 잰다
    const moved = measuredView.current !== view;
    measuredView.current = view;
    if (moved) hide();
    const my = ++round.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      Promise.all(pins.map(p => map.pointForCoordinate({ latitude: p.latitude, longitude: p.longitude }).then(pt => [p.id, { x: pt.x, y: pt.y }] as const)))
        .then(list => {
          if (round.current !== my) return;
          points.value = Object.fromEntries(list);
          if (showing.current) return;
          showing.current = true;
          // iOS는 고리가 Core Animation으로 퍼진다 — 시계를 돌리면 아무도 안 써도 UI 스레드가 매 프레임 깨어난다
          if (!nativeLoops) {
            clock.value = 0;
            clock.value = withRepeat(withTiming(1, { duration: DURATION, easing: Easing.linear }), -1, false);
          }
          shown.value = withTiming(1, { duration: FADE_MS });
        })
        .catch(() => { if (round.current === my) hide(); });
    }, moved ? SETTLE_MS : 0);
    return () => clearTimeout(timer.current);
  }, [on, token, view]); // eslint-disable-line react-hooks/exhaustive-deps -- pins는 token에 다 들어 있다 (GPS 갱신마다 새 배열)
  useEffect(() => () => { round.current++; clearTimeout(timer.current); cancelAnimation(clock); cancelAnimation(shown); }, [clock, shown]);

  if (!visible || !playing || !pins.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pins.map(p => {
        const rings = p.id === activeId ? RING_COUNT.active : RING_COUNT.normal;
        if (nativeLoops) return <PinRings key={p.id} id={p.id} rings={rings} shown={shown} points={points} />;
        return Array.from({ length: rings }, (_, i) => <WaveRing key={`${p.id}:${i}`} id={p.id} i={i} rings={rings} clock={clock} shown={shown} points={points} />);
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, top: 0, width: RIPPLE_W, height: RIPPLE_W, borderRadius: RIPPLE_W / 2, borderWidth: 2.4, borderColor: '#FFFFFF' },
  pin: { position: 'absolute', left: 0, top: 0, width: RIPPLE_W, height: RIPPLE_W },
  nativeRing: { width: RIPPLE_W, height: RIPPLE_W, borderRadius: RIPPLE_W / 2, borderWidth: 2.4, borderColor: '#FFFFFF' },
});
