/**
 * 미니 디스크 — 지금 재생 중인 곡을 작은 원(앨범 아트)으로 탭 화면 오른쪽에 띄운다.
 *  - 재생 중엔 천천히 돌고, 테두리에 진행률
 *  - 탭: 일시정지/재생 · 길게 누르기: 화면이 등록한 동작(지도에선 다음 주변 곡)
 *  - 탭 화면(지도·플리·알림·프로필)에서만 — 상세 화면들은 자체 재생 컨트롤이 있다
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { Spin } from '@/components/anim';
import { Art, Icon, Press } from '@/components/ui';
import { navigationRef } from '@/navigation/ref';
import { usePreviewStore } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';

/** 길게 누르기 동작 — 지금 보이는 화면이 등록 (지도: 다음 주변 곡) */
export const useMiniDiscActions = create<{ onLongPress: (() => void) | null }>(() => ({ onLongPress: null }));

const TABS = ['Map', 'Playlists', 'Notifications', 'Profile'];
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
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round" />
    </Svg>
  );
}

export function MiniDisc() {
  const insets = useSafeAreaInsets();
  const route = useCurrentRouteName();
  const key = usePreviewStore(s => s.key);
  const meta = usePreviewStore(s => s.meta);
  const paused = usePreviewStore(s => s.paused);
  if (!key || !route || !TABS.includes(route)) return null;
  // 지도는 하단 '가까운 드랍' 줄 위, 다른 탭은 하단 독 위
  const bottom = insets.bottom + (route === 'Map' ? 262 : 112);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom }}>
      <Press
        onPress={() => usePreviewStore.getState().toggle()}
        onLongPress={() => useMiniDiscActions.getState().onLongPress?.()}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={`재생 중인 곡 ${meta ? `${meta.title} · ${meta.artist}` : ''}`}
        accessibilityHint={paused ? '누르면 다시 재생' : '누르면 일시정지'}
        accessibilityState={{ selected: !paused }}
        style={[{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }, glow(paused ? 0.15 : 0.55, 14)]}
      >
        <ProgressRing />
        <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden', backgroundColor: colors.card }}>
          <Spin paused={paused}>
            <Art uri={meta?.image} size={SIZE} round />
          </Spin>
        </View>
        {/* 가운데 구멍 (레코드) · 일시정지면 재생 아이콘 */}
        <View pointerEvents="none" style={{ position: 'absolute', width: paused ? 24 : 12, height: paused ? 24 : 12, borderRadius: 12, backgroundColor: paused ? 'rgba(5,9,22,0.75)' : colors.page, borderWidth: paused ? 0 : 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          {paused ? <Icon name="play" size={12} color={colors.primary} /> : null}
        </View>
      </Press>
    </View>
  );
}
