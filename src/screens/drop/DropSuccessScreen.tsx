/** 3.6 드랍 완료 — Figma 'B 3.6 드랍 완료' (주소 알약 · 큰 동그란 아트 + 파문 다섯 겹 · 파도) */
import React, { useCallback, useEffect } from 'react';
import { BackHandler, Share, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlacePill } from '@/components/drop/parts';
import { Art, IconButton, PrimaryButton, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import type { RootScreen } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';

/** 드랍 종류별 문구 — Figma는 음악 기준이라 투표·플리는 바꿔 부른다 */
const WHAT = { MUSIC: '음악을', VOTE: '투표를', PLAYLIST: '플리를' } as const;

/** Figma Ripple 1~5 — 지름 152/204/256/308/360, #4FD1FF 1.2px, 바깥으로 갈수록 옅게 */
const RINGS = [
  { size: 152, opacity: 0.63 },
  { size: 204, opacity: 0.51 },
  { size: 256, opacity: 0.39 },
  { size: 308, opacity: 0.27 },
  { size: 360, opacity: 0.15 },
];

/** 아트가 떨어진 자리에서 안쪽 파문부터 차례로 퍼져 나와 디자인 모양에 멈춘다 */
function Ring({ size, opacity, index, scale }: { size: number; opacity: number; index: number; scale: number }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) v.value = withDelay(150 + index * 140, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [index, reduced, v]);
  const st = useAnimatedStyle(() => ({ opacity: opacity * v.value, transform: [{ scale: 0.7 + 0.3 * v.value }] }));
  const s = size * scale;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: s, height: s, borderRadius: s / 2, borderWidth: 1.2, borderColor: '#4FD1FF' }, st]} />;
}

export default function DropSuccessScreen({ navigation, route }: RootScreen<'DropSuccess'>) {
  const insets = useSafeAreaInsets();
  const { art, content, kind = 'MUSIC' } = route.params;
  const { label, address } = useLocation();
  const { height } = useWindowDimensions();
  const k = height < 740 ? 0.8 : 1; // iPhone SE 등 작은 화면은 파문·아트를 조금 줄인다
  const place = address || label;
  const toMap = useCallback(() => navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Map' } }] }), [navigation]);
  // 버튼은 공유 하나 — 닫기(X)와 Android 뒤로가기는 지도로 돌아간다 (앞 단계로 되돌아가면 같은 드랍을 또 만들 수 있음)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (toMap(), true));
    return () => sub.remove();
  }, [toMap]);
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top }}>
      <View style={{ height: 52, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 14 }}>
        <IconButton name="close" color="#C5C5C5" accessibilityLabel="지도로 돌아가기" onPress={toMap} />
      </View>
      <View style={{ alignItems: 'center', gap: 20, marginTop: height < 740 ? 0 : 14, paddingHorizontal: 24 }}>
        {place ? <PlacePill label={place} /> : null}
        <T style={{ textAlign: 'center', fontFamily: fonts.semibold, fontSize: 24, lineHeight: 33.6, letterSpacing: -0.48, color: '#090909' }}>{`${kind === 'MUSIC' ? '해당 음악을' : WHAT[kind]}\n바다에 떨어뜨렸어요.`}</T>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Figma 'wave' 인스턴스 — 파문 뒤, 아트보다 조금 아래에 깔림 */}
        <Wave scale={1.2} style={{ position: 'absolute', left: -79, right: -79, top: '50%', marginTop: -102 }} />
        {RINGS.map((r, i) => <Ring key={r.size} {...r} index={i} scale={k} />)}
        <View style={{ width: 140 * k, height: 140 * k, borderRadius: 70 * k, borderWidth: 2, borderColor: '#7FE3FF', overflow: 'hidden', backgroundColor: '#FFFFFF', shadowColor: '#9BE7FF', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 }}>
          <Art uri={art} size={140 * k - 4} round />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 26, gap: 16 }}>
        {/* 디자인 문구는 '알려드릴게요'지만 푸시 알림이 없으므로 앱 안 알림 목록 기준으로 */}
        <T style={{ textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, lineHeight: 16.8, letterSpacing: -0.24, color: '#AFAFAF' }}>좋아요나 댓글이 달리면 알림에서 볼 수 있어요.</T>
        <PrimaryButton label="공유" onPress={() => (track('share_opened', { kind: 'drop' }), Share.share({ message: `PADO — ${label || '이곳'}에 ${WHAT[kind]} 남겼어요. ${content ? `“${content}”` : ''}` }))} />
      </View>
    </View>
  );
}
