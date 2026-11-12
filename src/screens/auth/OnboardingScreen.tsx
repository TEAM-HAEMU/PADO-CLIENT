/**
 * 1.0 서비스 소개 3장 (Figma B 1.1~1.3) — 처음 온 손님에게 한 번만. 넘기거나 '다음'으로 진행, 4번째 점 = 로그인.
 * 다 보면(또는 마지막 장에서 더 넘기면) 로그인 화면으로 가고 다시는 안 보여준다.
 * 캐릭터는 글씨보다 느리게(60%) 함께 밀리며 넘기는 내내 다음 장면과 서서히 섞인다 — 파도·캐릭터·글씨가 다른 속도로 움직여 깊이가 생긴다.
 *  · 제자리에서 중간에 바꿔 끼우면 '넘긴 뒤 새 그림을 불러오는' 것처럼 보이고, 페이지와 똑같이 밀면 같은 캐릭터가 나갔다 들어오는 것처럼 보여서 이 사이로 잡음
 *  · 넘기는 동안엔 양쪽 장면 영상을 둘 다 재생해 멈춘 그림이 밀려가지 않게 한다
 */
import React, { useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthDisclaimer, AuthHeader, AuthTitle } from '@/components/auth/AuthChrome';
import { IntroArt } from '@/components/auth/IntroArt';
import { Wave } from '@/components/ui/Wave';
import type { RootScreen } from '@/navigation/types';
import { usePrefs } from '@/store/prefs';
import { colors } from '@/theme/tokens';

const PAGES = [
  { title: '휴대폰을 들고 걸으며,\n숨겨진 음악들을 발견해요.', desc: '익숙한 일상 속에서도 새로운 순간을 발견할 수 있도록,\n휴대폰을 들고 천천히 주변을 둘러보세요.' },
  { title: '음악을 담은 편지를\n바다로 흘려보내요.', desc: '당신이 전하고 싶은 음악과 마음을 담아,\n현재 위치에 작은 음악을 떨어뜨려요.' },
  { title: '바다에 남겨진 흔적을 주워,\n그 안에 담긴 음악을 들어요.', desc: '다른 사용자들이 바다에 남겨둔 음악과 편지를 발견하고,\n그 안에 담긴 각자의 취향과 이야기를 만나보세요.' },
] as const;

/** 캐릭터가 글씨에 비해 움직이는 비율 */
const PARALLAX = 0.6;

/** 캐릭터 한 장면 — 넘긴 위치(장 단위)와의 거리만큼 옆으로 밀리고 옅어지고 조금 작아진다 */
function StageLayer({ i, pos, width, active }: { i: number; pos: SharedValue<number>; width: number; active: boolean }) {
  const st = useAnimatedStyle(() => {
    const d = i - pos.value;
    const far = Math.min(1, Math.abs(d));
    return { opacity: 1 - far, transform: [{ translateX: d * width * PARALLAX }, { scale: 1 - 0.08 * far }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }, st]}>
      <IntroArt page={i} active={active} />
    </Animated.View>
  );
}

export default function OnboardingScreen({ navigation }: RootScreen<'Onboarding'>) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  /** 지금 화면에 걸쳐 보이는 두 장 (멈춰 있으면 둘 다 같은 장) — 이 장들만 영상 재생 */
  const [span, setSpan] = useState<[number, number]>([0, 0]);
  const seen = usePrefs(s => s.setOnboardingSeen);
  /** 넘긴 위치 (장 단위, 0~2) — 캐릭터 장면을 섞는 데 쓴다 */
  const pos = useSharedValue(0);
  // 캐릭터 자리 = 첫 장의 그림 칸 위치 (페이지 안 위치 + 넘김 영역 위치)
  const [pagerY, setPagerY] = useState(0);
  const [art, setArt] = useState<{ y: number; h: number } | null>(null);

  // 로그인은 쌓아서 연다 — 로그인 화면의 '뒤로'로 마지막 장에 돌아올 수 있게
  const finish = () => { seen(); navigation.navigate('Login'); };
  const go = (i: number) => {
    if (i >= PAGES.length) return finish();
    pager.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    pos.value = e.nativeEvent.contentOffset.x / width;
    const lo = Math.max(0, Math.floor(pos.value)), hi = Math.min(PAGES.length - 1, Math.ceil(pos.value));
    if (lo !== span[0] || hi !== span[1]) setSpan([lo, hi]);
    const i = Math.round(pos.value);
    if (i !== page && i >= 0 && i < PAGES.length) setPage(i);
  };
  // 마지막 장 뒤의 빈 장까지 넘기면 로그인으로 — 튕김(bounce)에 기대지 않아 Android·iOS 모두 보통 넘기듯 밀면 된다.
  // 로그인 화면에서 '뒤로' 오면 마지막 장이 보이게 제자리로 돌려 둔다
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (e.nativeEvent.contentOffset.x < PAGES.length * width - width / 2) return;
    finish();
    setTimeout(() => pager.current?.scrollTo({ x: (PAGES.length - 1) * width, animated: false }), 400);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {/* 파도는 장을 넘겨도 제자리 — 그림 자리와 같은 높이(디자인 348/874) */}
      <Wave style={{ position: 'absolute', left: 0, right: 0, top: '40%' }} />
      <AuthHeader page={page} onBack={page > 0 ? () => go(page - 1) : undefined} onNext={() => go(page + 1)} style={{ marginTop: insets.top + 12 }} />
      <ScrollView
        ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces
        onScroll={onScroll} scrollEventThrottle={16} onMomentumScrollEnd={onMomentumEnd} onLayout={e => setPagerY(e.nativeEvent.layout.y)} style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <View key={i} style={{ width, flex: 1 }} accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}>
            <AuthTitle title={p.title} desc={p.desc} style={{ marginTop: 39 }} />
            {/* 그림 칸은 비워 두고 캐릭터는 아래 따로 움직이는 층에 그린다 */}
            <View style={{ flex: 1 }} onLayout={i === 0 ? e => setArt({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }) : undefined} />
          </View>
        ))}
        {/* 로그인으로 넘어가는 빈 장 */}
        <View style={{ width }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      </ScrollView>
      {art ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: pagerY + art.y, height: art.h }}>
          {PAGES.map((_, i) => <StageLayer key={i} i={i} pos={pos} width={width} active={i === span[0] || i === span[1]} />)}
        </View>
      ) : null}
      <AuthDisclaimer style={{ paddingTop: 16, paddingBottom: insets.bottom + 16 }} />
    </View>
  );
}
