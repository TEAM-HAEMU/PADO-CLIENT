/** 2.5 재생 앱 선택 (시트) — 전체 듣기를 어느 앱으로 할지. song 없이 열면 설정의 '기본 재생 앱' 선택 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Icon, Press, PrimaryButton, Radio, T } from '@/components/ui';
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

  return (
    <Sheet>
      <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 14 }}>
        <T v="title">{settingsMode ? '기본 재생 앱' : '어디서 전체 듣기를 할까요?'}</T>
        <T v="caption" c="ink2">{settingsMode ? '전체 듣기를 누르면 이 앱으로 열려요' : '설치돼 있지 않으면 웹 플레이어로 열려요'}</T>
      </View>
      <View style={{ gap: 10 }}>
        {ORDER.map(s => {
          const on = pick === s;
          return (
            <Press key={s} onPress={() => setPick(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={SERVICES[s].label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: on ? colors.primarySoft : colors.page, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }}>
              <ServiceGlyph service={s} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong">{SERVICES[s].label}</T>
                <T v="caption" c="ink2">{current === s ? '기본 앱 · ' : ''}{SUB[s]}</T>
              </View>
              <Radio on={on} />
            </Press>
          );
        })}
        {settingsMode ? (
          <Press onPress={() => setPick(null)} accessibilityRole="radio" accessibilityState={{ checked: pick === null }} accessibilityLabel="매번 선택" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: pick === null ? colors.primarySoft : colors.page, borderWidth: pick === null ? 1.5 : 1, borderColor: pick === null ? colors.primary : colors.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="more" size={18} color={colors.ink2} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong">매번 선택</T>
              <T v="caption" c="ink2">전체 듣기를 누를 때마다 물어봐요</T>
            </View>
            <Radio on={pick === null} />
          </Press>
        ) : null}
      </View>
      {settingsMode ? <View style={{ height: 16 }} /> : <Press onPress={() => setRemember(r => !r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 14 }}>
        <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: remember ? colors.primary : 'transparent', borderWidth: remember ? 0 : 1.5, borderColor: colors.line }}>
          {remember ? <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.4} /> : null}
        </View>
        <T v="captionStrong" c="ink2">다음에도 이 앱으로 열기</T>
      </Press>}
      {settingsMode
        ? <PrimaryButton label="저장" onPress={go} />
        : <PrimaryButton label={`${SERVICES[pick ?? 'spotify'].label}에서 듣기`} right="external" onPress={go} />}
    </Sheet>
  );
}
