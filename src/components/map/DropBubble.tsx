/**
 * 지도 말풍선 — 하단 목록이나 지도 핀에서 고른 드랍의 핀 위에 뜨는 흰 말풍선 (문구 규칙은 utils/dropBubble).
 *
 * 핀과 같은 좌표의 지도 마커로 그린다 (화면 좌표로 바꿔 지도 위에 얹지 않는다):
 *  - 지도를 손으로 끄는 동안에도 지도 엔진이 핀과 같은 프레임에 옮기므로 말풍선이 핀에서 떨어지거나 늦게 따라오지 않는다.
 *    좌표→화면 변환(pointForCoordinate)은 비동기라 끄는 동안 매 프레임 JS를 오가야 하고, 그래도 한두 프레임씩 밀린다
 *  - 말풍선 아래 끝(꼬리)이 핀 머리 위에 오도록 anchor를 1보다 크게 준다 (높이를 재서 계산) → 마커가 차지하는 자리는 말풍선뿐이라
 *    선택된 핀은 그대로 따로 눌린다
 *  - Google 지도 마커는 뷰를 그림으로 찍어 쓰므로, 처음·문구가 바뀔 때·높이를 잰 뒤에만 잠깐 다시 찍는다 (DropMarker와 같은 방식)
 *  - Android 마커 그림은 뷰 밖 그림자를 잘라내고 elevation 그림자를 못 그려서, iOS는 그림자·Android는 옅은 테두리로 경계를 낸다
 * 모양: 흰 바탕 · 모서리 18 · 아래 가운데 작은 꼬리, 짧은 페이드 + 4pt 올라오기 (튕기는 움직임 없음)
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Marker } from 'react-native-maps';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { DropSummary, DropRadius } from '@/api/types';
import { Icon, T } from '@/components/ui';
import { PIN_SIZE } from '@/components/map/DropPin';
import { useDrop } from '@/hooks/api';
import { colors, fonts } from '@/theme/tokens';
import { bubbleText } from '@/utils/dropBubble';
import { lockMessage, type DropLock } from '@/utils/dropLock';

/** 그림자 자리 (Android 마커 그림이 뷰 밖을 잘라내므로 뷰 안에 둔다) */
const PAD = 10;
const TAIL = 7;
/** 핀 머리(선택된 핀은 active 크기) 위로 띄우는 틈 */
const GAP = 4;
/** 마커 좌표(핀 끝)에서 말풍선 꼬리 끝까지의 높이 */
// 핀 꼭대기(아트 윗변)부터 말풍선까지 GAP — 핀 위 배지 여백(top)은 빼고 잰다
const LIFT = PIN_SIZE.active.tipY - PIN_SIZE.active.top + GAP;
/** 높이를 재기 전 어림값 (한마디 한 줄 + 둘째 줄) */
const GUESS_H = 96;

interface BubbleMarkerProps {
  id: string;
  latitude: number;
  longitude: number;
  quote: string | null;
  title: string | null;
  sub: string;
  locked: boolean;
  onPress: (id: string) => void;
}

/** 말풍선 마커 — props는 원시값만 (지도 화면이 GPS 갱신으로 다시 그려져도 문구가 같으면 그대로) */
export const DropBubbleMarker = memo(function DropBubbleMarkerItem({ id, latitude, longitude, quote, title, sub, locked, onPress }: BubbleMarkerProps) {
  const { width } = useWindowDimensions();
  const maxW = Math.min(width - 48, 320);
  const [h, setH] = useState(0);
  const [tracking, setTracking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackFor = useCallback((ms: number) => {
    setTracking(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTracking(false), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 처음 뜰 때·문구가 바뀔 때(닉네임이 늦게 옴 등) 새 모습을 찍는다 — 페이드(180ms)가 끝날 때까지 넉넉히.
  // Android는 이미 찍힌 마커에 다시 찍기를 켜도 바뀐 글자가 반영되지 않아, 문구가 바뀌면 마커만 새로 만든다 (페이드 값은 이 컴포넌트에 있어 다시 흐려지지 않음)
  const [epoch, setEpoch] = useState(0);
  const firstText = useRef(true);
  useEffect(() => {
    trackFor(700);
    if (firstText.current) { firstText.current = false; return; }
    if (Platform.OS === 'android') setEpoch(e => e + 1);
  }, [quote, title, sub, trackFor]);

  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [fade]);
  const st = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: (1 - fade.value) * 4 }] }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setH(prev => (prev === next ? prev : next));
  }, []);
  // 뷰 아래 끝(그림자 여백 PAD 포함)에서 LIFT만큼 더 위 → 꼬리 끝이 핀 머리 바로 위
  const total = h || GUESS_H;
  const anchor = useMemo(() => ({ x: 0.5, y: 1 + (LIFT - PAD) / total }), [total]);
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const press = useCallback(() => onPress(id), [onPress, id]);

  return (
    <Marker key={epoch} coordinate={coordinate} anchor={anchor} tracksViewChanges={tracking} zIndex={10} onPress={press}>
      <View onLayout={onLayout} style={{ padding: PAD, maxWidth: maxW + PAD * 2, alignItems: 'center' }}>
        <Animated.View
          style={[{ alignItems: 'center', maxWidth: maxW }, st]}
          accessible
          accessibilityRole={locked ? 'text' : 'button'}
          accessibilityLabel={[quote ?? title, sub].filter(Boolean).join(', ')}
          accessibilityHint={locked ? undefined : '드랍 자세히 보기'}
        >
          <View style={[bubble, Platform.OS === 'ios' ? shadow : edge]}>
            {quote ? (
              <T v="body" numberOfLines={2}>{quote}</T>
            ) : (
              <T v="bodyLarge" numberOfLines={1} style={{ fontFamily: fonts.bold }}>{title}</T>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {locked ? <Icon name="lock" size={12} color={colors.ink2} strokeWidth={2.2} /> : null}
              <T v="caption" c="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>{sub}</T>
              {locked ? null : (
                <>
                  <View style={{ flexGrow: 1, minWidth: 8 }} />
                  <Icon name="chevronRight" size={14} color={colors.ink3} strokeWidth={2.4} />
                </>
              )}
            </View>
          </View>
          {/* 꼬리 — 핀 머리를 가리킨다 */}
          <View style={{ width: 0, height: 0, borderLeftWidth: TAIL, borderRightWidth: TAIL, borderTopWidth: TAIL, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF', marginTop: -0.5 }} />
        </Animated.View>
      </View>
    </Marker>
  );
});

const bubble = { backgroundColor: '#FFFFFF', borderRadius: 18, paddingTop: 12, paddingBottom: 11, paddingHorizontal: 16, gap: 3, minWidth: 180 } as const;
const shadow = { shadowColor: '#12214A', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } } as const;
const edge = { borderWidth: 1, borderColor: colors.divider } as const;

/**
 * 지도 화면이 쓰는 모양 — 고른 드랍 하나의 말풍선. 닉네임은 주변 목록에 없어 열린 드랍만 상세를 받아 붙인다
 * (잠긴 드랍은 닉네임을 쓰지 않으므로 받지 않는다. 투표·플리 상세는 지도 화면이 미리 받아 둔다)
 */
export function SelectedDropBubble({ drop, lock, radius, onPress }: { drop: DropSummary; lock: DropLock; radius: DropRadius; onPress: (id: string) => void }) {
  const detail = useDrop(lock.locked ? undefined : drop.droppingId).data;
  const username = detail && 'username' in detail ? detail.username : null;
  const t = bubbleText(drop, { username, lock, lockMsg: lockMessage(lock, radius) });
  return <DropBubbleMarker id={drop.droppingId} latitude={drop.latitude} longitude={drop.longitude} quote={t.quote} title={t.title} sub={t.sub} locked={t.locked} onPress={onPress} />;
}
