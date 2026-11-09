/**
 * 1.0 서비스 소개 3장 (Figma B 1.1~1.3) — 처음 온 손님에게 한 번만. 넘기거나 '다음'으로 진행, 4번째 점 = 로그인.
 * 다 보면(또는 마지막 장에서 더 넘기면) 로그인 화면으로 가고 다시는 안 보여준다.
 */
import React, { useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, useWindowDimensions, View } from 'react-native';
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

/** 마지막 장에서 이만큼 더 끌면 로그인으로 (iOS 바운스) */
const PULL_TO_FINISH = 48;

export default function OnboardingScreen({ navigation }: RootScreen<'Onboarding'>) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [page, setPage] = useState(0);
  const seen = usePrefs(s => s.setOnboardingSeen);

  // 로그인은 쌓아서 연다 — 로그인 화면의 '뒤로'로 마지막 장에 돌아올 수 있게
  const finish = () => { seen(); navigation.navigate('Login'); };
  const go = (i: number) => {
    if (i >= PAGES.length) return finish();
    pager.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== page && i >= 0 && i < PAGES.length) setPage(i);
  };
  const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (e.nativeEvent.contentOffset.x > (PAGES.length - 1) * width + PULL_TO_FINISH) finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {/* 파도는 장을 넘겨도 제자리 — 그림 자리와 같은 높이(디자인 348/874) */}
      <Wave style={{ position: 'absolute', left: 0, right: 0, top: '40%' }} />
      <AuthHeader page={page} onBack={page > 0 ? () => go(page - 1) : undefined} onNext={() => go(page + 1)} style={{ marginTop: insets.top + 12 }} />
      <ScrollView
        ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces
        onScroll={onScroll} scrollEventThrottle={32} onScrollEndDrag={onEndDrag} style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <View key={i} style={{ width, flex: 1 }} accessibilityElementsHidden={i !== page} importantForAccessibility={i === page ? 'auto' : 'no-hide-descendants'}>
            <AuthTitle title={p.title} desc={p.desc} style={{ marginTop: 39 }} />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}>
              <IntroArt page={i} />
            </View>
          </View>
        ))}
      </ScrollView>
      <AuthDisclaimer style={{ paddingTop: 16, paddingBottom: insets.bottom + 16 }} />
    </View>
  );
}
