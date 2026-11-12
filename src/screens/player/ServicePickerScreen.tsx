/** 2.5 재생 앱 선택 (시트) — 전체 듣기를 어느 앱으로 할지. song 없이 열면 설정의 '기본 재생 앱' 선택 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { ServiceGlyph } from '@/components/ui/Brand';
import { CheckBoxGlyph, RadioGlyph } from '@/components/player/glyphs';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { listenFull } from '@/services/listen';
import { SERVICES } from '@/services/musicLinks';
import { type ServiceId, usePrefs } from '@/store/prefs';
import { colors } from '@/theme/tokens';

const ORDER: ServiceId[] = ['spotify', 'appleMusic', 'youtubeMusic'];
const SUB: Record<ServiceId, string> = { spotify: '앱이 없으면 웹으로 열려요', appleMusic: '앱이 없으면 웹으로 열려요', youtubeMusic: '앱이 없으면 YouTube 웹으로 열려요' };

export default function ServicePickerScreen({ navigation, route }: RootScreen<'ServicePicker'>) {
  const { song } = route.params;
  const current = usePrefs(s => s.service);
  const setService = usePrefs(s => s.setService);
  const settingsMode = !song;
  const [pick, setPick] = useState<ServiceId | null>(current ?? (settingsMode ? null : 'spotify'));
  const [remember, setRemember] = useState(true);

  const go = async () => {
    if (settingsMode) {
      setService(pick);
      navigation.goBack();
      return;
    }
    if (!pick) return;
    setService(pick, remember);
    navigation.goBack();
    await listenFull(pick, song);
  };

  // 재생 앱 선택: 고른 줄은 #F2FCFF + #E2F8FF 테두리, 나머지는 흰 바탕 + 회색 테두리 · 모서리 20 · 시안 라디오
  const row = (on: boolean) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingLeft: 14, paddingRight: 16, paddingVertical: 14, borderRadius: 20, backgroundColor: on ? '#F2FCFF' : colors.page, borderWidth: 1.5, borderColor: on ? '#E2F8FF' : colors.divider });

  return (
    <Sheet>
      <View style={{ gap: 4, paddingLeft: 4, marginBottom: 16 }}>
        <T v="title" style={{ color: '#000000' }}>{settingsMode ? '기본 재생 앱' : '어디서 전체 듣기를 할까요?'}</T>
        <T v="caption" c="ink3" style={{ fontSize: 13 }}>{settingsMode ? '전체 듣기를 누르면 이 앱으로 열려요' : '설치돼 있지 않으면 웹 플레이어로 열려요'}</T>
      </View>
      <View style={{ gap: 16 }}>
        {ORDER.map(s => {
          const on = pick === s;
          return (
            <Press key={s} onPress={() => setPick(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={SERVICES[s].label} style={row(on)}>
              <ServiceGlyph service={s} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong" style={{ color: '#000000' }}>{SERVICES[s].label}</T>
                <T v="caption" c="ink3" style={{ fontSize: 13 }}>{current === s ? '기본 앱 · ' : ''}{SUB[s]}</T>
              </View>
              <RadioGlyph on={on} />
            </Press>
          );
        })}
        {settingsMode ? (
          <Press onPress={() => setPick(null)} accessibilityRole="radio" accessibilityState={{ checked: pick === null }} accessibilityLabel="매번 선택" style={row(pick === null)}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="more" size={18} color={colors.ink2} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong" style={{ color: '#000000' }}>매번 선택</T>
              <T v="caption" c="ink3" style={{ fontSize: 13 }}>전체 듣기를 누를 때마다 물어봐요</T>
            </View>
            <RadioGlyph on={pick === null} />
          </Press>
        ) : null}
      </View>
      {settingsMode ? <View style={{ height: 16 }} /> : <Press onPress={() => setRemember(r => !r)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6, paddingTop: 20, paddingBottom: 16 }}>
        <CheckBoxGlyph on={remember} />
        <T v="captionStrong" c="ink3">다음에도 이 앱으로 열기</T>
      </Press>}
      {settingsMode
        ? <PrimaryButton label="저장" onPress={go} />
        : <PrimaryButton label={`${SERVICES[pick ?? 'spotify'].label}에서 듣기`} onPress={go} />}
    </Sheet>
  );
}
