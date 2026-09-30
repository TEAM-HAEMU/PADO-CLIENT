/** 1.4 위치 권한 안내 */
import React from 'react';
import { Linking, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ripples } from '@/components/anim';
import { DropPin, MeMarker } from '@/components/map/DropPin';
import { Press, PrimaryButton, T } from '@/components/ui';
import type { RootScreen } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { usePrefs } from '@/store/prefs';
import { colors } from '@/theme/tokens';

export default function LocationPermissionScreen({ navigation }: RootScreen<'LocationPermission'>) {
  // 이미 '허용 안 함'으로 막혀 있으면 시스템 창이 뜨지 않으므로 설정을 연다. 오류가 나도 다음 화면으로 넘어간다
  const allow = async () => {
    try {
      const before = await useLocation.getState().refreshPermission();
      const after = await request();
      if (before === 'denied' && after !== 'granted') Linking.openSettings();
    } catch {} finally {
      finish();
    }
  };
  const insets = useSafeAreaInsets();
  const request = useLocation(s => s.requestPermission);
  const done = usePrefs(s => s.setLocationPrompted);
  const finish = () => { done(); navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ position: 'absolute', top: insets.top + 60, left: 0, right: 0, alignItems: 'center' }}>
        <Ripples size={300} count={4} duration={4800} />
        <View style={{ position: 'absolute', top: 90 }}><MeMarker /></View>
        {/* 장식용 핀 — 실제 데이터 아님 */}
        <View style={{ position: 'absolute', top: 10, left: 60 }}><DropPin type="MUSIC" /></View>
        <View style={{ position: 'absolute', top: 60, right: 58 }}><DropPin type="VOTE" /></View>
        <View style={{ position: 'absolute', top: 190, left: 110 }}><DropPin type="PLAYLIST" count={8} /></View>
      </View>
      <LinearGradient colors={['rgba(5,9,22,0)', colors.page]} locations={[0, 0.5]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 480 }} />
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20, gap: 20 }}>
        <View style={{ gap: 10 }}>
          <T v="titleLarge">{'지금 있는 곳의 음악을\n들으려면 위치가 필요해요'}</T>
          <T v="body" c="ink2">내 주변 1km에 남겨진 음악을 찾고, 지금 선 자리에 곡을 남길 때만 위치를 사용해요.</T>
        </View>
        <View style={{ gap: 12, alignItems: 'center' }}>
          <PrimaryButton label="위치 허용하기" icon="locate" style={{ alignSelf: 'stretch' }} onPress={allow} />
          <Press onPress={finish} hitSlop={10}><T v="captionStrong" c="ink3">나중에 할게요</T></Press>
        </View>
      </View>
    </View>
  );
}
