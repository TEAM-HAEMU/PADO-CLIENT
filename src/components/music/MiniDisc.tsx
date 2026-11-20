/**
 * 미니 디스크 — 지금 재생 중인 곡을 작은 원(앨범 아트)으로 탭 화면 오른쪽에 띄운다.
 *  - 재생 중엔 천천히 돌고, 테두리에 진행률 (일시정지·앱 백그라운드면 그 자리에서 멈춘다)
 *  - 탭: 일시정지/재생 · 길게 누르기: 화면이 등록한 동작(지도에선 다음 주변 곡)
 *  - 탭 화면(지도·플리·프로필)에서만 — 상세 화면들은 자체 재생 컨트롤이 있다
 *  - 곡을 누르면 미리듣기 주소를 찾고 버퍼링하는 몇 초 동안에도 곧바로 그 곡 커버로 떠서 테두리가 '불러오는 중'으로 돈다
 *  - 화면마다 높이가 달라도(지도는 '가까운 드랍' 줄 위) 순간 이동하지 않고 미끄러지듯 옮겨 간다
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, makeMutable, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Spin } from '@/components/anim';
import { LoopView, nativeLoops } from '@/components/anim/LoopView';
import { spinLoops } from '@/utils/ambientMotion';
import { Art, Press } from '@/components/ui';
import { ArtPlayGlyph } from '@/components/player/glyphs';
import { useScreenVisible } from '@/hooks/useScreenVisible';
import { navigationRef } from '@/navigation/ref';
import { usePreviewStore } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';
import { MINI_DISC_RING, MINI_DISC_SIZE, MINI_DISC_TAB_BOTTOM } from './miniDiscLayout';

/** 길게 누르기 동작 — 지금 보이는 화면이 등록 (지도: 다음 주변 곡) */
export const useMiniDiscActions = create<{ onLongPress: (() => void) | null }>(() => ({ onLongPress: null }));

const TABS = ['Map', 'Playlists', 'Profile'];
const SIZE = MINI_DISC_SIZE;
const RING = MINI_DISC_RING;

function useCurrentRouteName() {
  const [name, setName] = useState<string | undefined>(() => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined));
  useEffect(() => navigationRef.addListener('state', () => setName(navigationRef.getCurrentRoute()?.name)), []);
  return name;
}

/** 재생 진행률(0~1) — 플레이어가 250ms마다 알려 주는 위치를 UI 스레드 값으로 옮겨 둔다 */
export const progressOf = (position: number, duration: number) => (duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0);
const ringProgress = makeMutable(progressOf(usePreviewStore.getState().position, usePreviewStore.getState().duration));
usePreviewStore.subscribe((s, prev) => {
  if (s.position !== prev.position || s.duration !== prev.duration) ringProgress.value = progressOf(s.position, s.duration);
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = RING / 2 - 2;
const RING_C = 2 * Math.PI * RING_R;

/**
 * 진행률 테두리 — 진행률을 React 상태로 구독하지 않고 Reanimated 값으로 테두리 길이만 바꾼다.
 * 재생 중 250ms마다 오는 위치 갱신이 JS에서 커밋(다시 그리기)을 만들지 않는다 (2026-11-20 QA R-04)
 */
function ProgressRing() {
  const arc = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - ringProgress.value) }));
  return (
    <Svg width={RING} height={RING} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} pointerEvents="none">
      <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={colors.line} strokeWidth={2.5} fill="none" />
      <AnimatedCircle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="#00C9FF" strokeWidth={2.5} fill="none" strokeDasharray={`${RING_C} ${RING_C}`} strokeLinecap="round" animatedProps={arc} />
    </Svg>
  );
}

/**
 * '불러오는 중' — 테두리 위를 짧은 호가 빙글빙글.
 * 불러오는 동안 계속 돈다. 앱이 백그라운드거나 화면이 가려지면 멈췄다가 돌아오면 이어서 돈다.
 */
const LoadingRing = nativeLoops ? LoadingRingNative : LoadingRingAnimated;

function LoadingArc() {
  const r = RING / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={RING} height={RING}>
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.line} strokeWidth={2.5} fill="none" />
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="#00C9FF" strokeWidth={2.5} fill="none" strokeDasharray={`${c * 0.22} ${c}`} strokeLinecap="round" />
    </Svg>
  );
}

const LOADING_LOOPS = spinLoops(900);
/** iOS — Core Animation 회전 (앱이 매 프레임 각도를 계산하지 않는다) */
function LoadingRingNative() {
  const visible = useScreenVisible();
  return (
    <LoopView loops={LOADING_LOOPS} paused={!visible} pointerEvents="none" style={{ position: 'absolute', width: RING, height: RING }}>
      <LoadingArc />
    </LoopView>
  );
}

function LoadingRingAnimated() {
  const spin = useSharedValue(0);
  const visible = useScreenVisible();
  useEffect(() => {
    if (!visible) { cancelAnimation(spin); return; }
    spin.value = spin.value % 1;
    spin.value = withRepeat(withTiming(spin.value + 1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin, visible]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: RING, height: RING }, st]}>
      <LoadingArc />
    </Animated.View>
  );
}

export function MiniDisc() {
  const insets = useSafeAreaInsets();
  const route = useCurrentRouteName();
  const key = usePreviewStore(s => s.key);
  const playingMeta = usePreviewStore(s => s.meta);
  const pending = usePreviewStore(s => s.pending);
  const buffering = usePreviewStore(s => s.buffering);
  const paused = usePreviewStore(s => s.paused);
  // 지도는 하단 '가까운 드랍' 줄 위, 다른 탭은 하단 독 위 — 화면이 바뀌면 그 높이로 미끄러지듯
  const target = insets.bottom + (route === 'Map' ? 262 : MINI_DISC_TAB_BOTTOM);
  const bottom = useSharedValue(target);
  const placed = useRef(false);
  useEffect(() => {
    if (!placed.current) { bottom.value = target; placed.current = true; return; }
    bottom.value = withTiming(target, { duration: 420, easing: Easing.inOut(Easing.cubic) });
  }, [bottom, target]);
  const pos = useAnimatedStyle(() => ({ bottom: bottom.value }));
  const loading = !!pending || buffering;
  const meta = pending?.meta ?? playingMeta;
  if ((!key && !pending) || !route || !TABS.includes(route)) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', right: 14 }, pos]}>
      <Press
        onPress={() => usePreviewStore.getState().toggle()}
        onLongPress={() => useMiniDiscActions.getState().onLongPress?.()}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={`재생 중인 곡 ${meta ? `${meta.title} · ${meta.artist}` : ''}`}
        trackAs="미니 디스크"
        accessibilityHint={loading ? '불러오는 중' : paused ? '누르면 다시 재생' : '누르면 일시정지'}
        accessibilityState={{ selected: !paused }}
        style={[{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }, glow(paused ? 0.15 : 0.55, 14)]}
      >
        {loading ? <LoadingRing /> : <ProgressRing />}
        <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', backgroundColor: colors.card }}>
          <Spin paused={paused || loading}>
            <Art uri={meta?.image} size={SIZE} round />
          </Spin>
        </View>
        {/* 가운데 구멍 (레코드) · 일시정지면 재생 아이콘 */}
        <View pointerEvents="none" style={{ position: 'absolute', width: paused && !loading ? 24 : 12, height: paused && !loading ? 24 : 12, borderRadius: 12, backgroundColor: paused && !loading ? 'rgba(255,255,255,0.94)' : colors.page, borderWidth: paused && !loading ? 0 : 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          {paused && !loading ? <ArtPlayGlyph size={18} color="#12214A" /> : null}
        </View>
      </Press>
    </Animated.View>
  );
}
