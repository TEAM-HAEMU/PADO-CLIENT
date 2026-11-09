/** 1.4 위치 권한 안내 — 새 디자인엔 없는 화면이라 소개·로그인 화면의 말투(흰 바탕 · 가운데 제목 · 아래 파도)로 맞춤 */
import React from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ripples } from '@/components/anim';
import { AuthTitle } from '@/components/auth/AuthChrome';
import { Icon, PrimaryButton } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import type { RootScreen } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { usePrefs } from '@/store/prefs';
import { colors, glow } from '@/theme/tokens';

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
      <Wave style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      <AuthTitle
        title={'지금 있는 곳의 음악을\n들으려면 위치가 필요해요'}
        desc={'내 주변 1km에 남겨진 음악을 찾고,\n지금 선 자리에 곡을 남길 때만 위치를 사용해요.'}
        style={{ marginTop: insets.top + 80 }}
      />
      {/* 장식 — 내 자리에서 퍼지는 파문 */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ripples size={240} count={4} duration={4800} />
        <View style={[{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconTint, alignItems: 'center', justifyContent: 'center' }, glow(0.6, 16)]}>
          <Icon name="pin" size={28} color={colors.primary} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20 }}>
        {/* 안내 다음엔 항상 시스템 권한 창으로 — 허용 유도 문구·건너뛰기 버튼 금지 (App Store 5.1.1(iv)) */}
        <PrimaryButton label="계속" style={{ alignSelf: 'stretch' }} onPress={allow} />
      </View>
    </View>
  );
}
