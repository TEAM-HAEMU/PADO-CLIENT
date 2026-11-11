/**
 * 미니 디스크 — 지금 재생 중인 곡을 작은 원(앨범 아트)으로 탭 화면 오른쪽에 띄운다.
 *  - 재생 중엔 천천히 돌고, 테두리에 진행률
 *  - 탭: 일시정지/재생 · 길게 누르기: 화면이 등록한 동작(지도에선 다음 주변 곡)
 *  - 탭 화면(지도·플리·프로필)에서만 — 상세 화면들은 자체 재생 컨트롤이 있다
 *  - 곡을 누르면 미리듣기 주소를 찾고 버퍼링하는 몇 초 동안에도 곧바로 그 곡 커버로 떠서 테두리가 '불러오는 중'으로 돈다
 *  - 화면마다 높이가 달라도(지도는 '가까운 드랍' 줄 위) 순간 이동하지 않고 미끄러지듯 옮겨 간다
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Spin } from '@/components/anim';
import { Art, Press } from '@/components/ui';
import { ArtPlayGlyph } from '@/components/player/glyphs';
import { navigationRef } from '@/navigation/ref';
import { usePreviewStore } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';

/** 길게 누르기 동작 — 지금 보이는 화면이 등록 (지도: 다음 주변 곡) */
export const useMiniDiscActions = create<{ onLongPress: (() => void) | null }>(() => ({ onLongPress: null }));

const TABS = ['Map', 'Playlists', 'Profile'];
const SIZE = 52;
const RING = SIZE + 8;

function useCurrentRouteName() {
  const [name, setName] = useState<string | undefined>(() => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined));
  useEffect(() => navigationRef.addListener('state', () => setName(navigationRef.getCurrentRoute()?.name)), []);
  return name;
}

/** 진행률 테두리 — 250ms마다 바뀌므로 이 부분만 다시 그린다 */
function ProgressRing() {
  const position = usePreviewStore(s => s.position);
  const duration = usePreviewStore(s => s.duration);
  const r = RING / 2 - 2;
  const c = 2 * Math.PI * r;
  const p = duration ? Math.min(1, position / duration) : 0;
  return (
    <Svg width={RING} height={RING} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} pointerEvents="none">
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.line} strokeWidth={2.5} fill="none" />
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="#00C9FF" strokeWidth={2.5} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round" />
    </Svg>
  );
}

/** '불러오는 중' — 테두리 위를 짧은 호가 빙글빙글 */
function LoadingRing() {
  const r = RING / 2 - 2;
  const c = 2 * Math.PI * r;
  const spin = useSharedValue(0);
  useEffect(() => { spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false); }, [spin]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: RING, height: RING }, st]}>
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.line} strokeWidth={2.5} fill="none" />
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="#00C9FF" strokeWidth={2.5} fill="none" strokeDasharray={`${c * 0.22} ${c}`} strokeLinecap="round" />
      </Svg>
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
  const target = insets.bottom + (route === 'Map' ? 262 : 112);
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
