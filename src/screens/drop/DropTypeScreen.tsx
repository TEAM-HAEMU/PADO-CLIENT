/** 3.1 드랍 유형 선택 (시트) */
import React from 'react';
import { View, Linking } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { DropType } from '@/api/types';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen, RootStackParamList } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { useDraft } from '@/store/draft';
import { colors, glow } from '@/theme/tokens';

const TYPES: { type: DropType; title: string; desc: string; route: keyof RootStackParamList }[] = [
  { type: 'MUSIC', title: '음악', desc: '한 곡을 골라 이 자리에 남겨요', route: 'SongSearch' },
  { type: 'VOTE', title: '투표', desc: '2~5곡 중 이 장소에 어울리는 곡을 사람들이 골라요', route: 'VoteCreate' },
  { type: 'PLAYLIST', title: '플레이리스트', desc: '여러 곡을 묶어 한 번에 남겨요', route: 'PlaylistDropCreate' },
];

function Illustration({ type }: { type: DropType }) {
  const disc = (size: number, cs: string[], style?: object) => (
    <LinearGradient colors={cs} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }, style]} />
  );
  if (type === 'MUSIC')
    return (
      <View style={{ width: 76, height: 64 }}>
        {disc(56, ['#9BE7FF', '#3B6BFF'], [{ left: 10, top: 4, borderWidth: 2, borderColor: colors.primary }, glow(0.4, 12)])}
        <View style={{ position: 'absolute', left: 32, top: 26, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.page, borderWidth: 1.5, borderColor: colors.primary }} />
      </View>
    );
  if (type === 'VOTE')
    return (
      <View style={{ width: 76, height: 64 }}>
        {disc(40, ['#3B6BFF', '#111B3F'], { left: 0, top: 12, opacity: 0.8 })}
        {disc(40, ['#0E2A5A', '#4FD1FF'], { left: 36, top: 12, opacity: 0.8 })}
        {disc(46, ['#9BE7FF', '#3B6BFF'], [{ left: 15, top: 6, borderWidth: 2, borderColor: colors.primary }])}
        <View style={{ position: 'absolute', left: 54, top: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="vote" size={12} strokeWidth={2.4} />
        </View>
      </View>
    );
  return (
    <View style={{ width: 76, height: 64 }}>
      <LinearGradient colors={['#1B3170', '#0B1330']} style={{ position: 'absolute', left: 6, top: 14, width: 50, height: 50, borderRadius: 12, opacity: 0.6, transform: [{ rotate: '-10deg' }] }} />
      <View style={{ position: 'absolute', left: 20, top: 6, width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.line }}>
        {[['#9BE7FF', '#3B6BFF'], ['#3B6BFF', '#0E2A5A'], ['#4FD1FF', '#111B3F'], ['#0E2A5A', '#9BE7FF']].map((c, i) => <LinearGradient key={i} colors={c} style={{ width: 26, height: 26 }} />)}
      </View>
    </View>
  );
}

export default function DropTypeScreen({ navigation }: RootScreen<'DropType'>) {
  const start = useDraft(s => s.start);
  const place = useLocation(s => s.address || s.label);
  const hasFix = useLocation(s => !!s.coords);
  const locating = useLocation(s => s.fix === 'locating');
  const retry = async () => {
    const loc = useLocation.getState();
    if ((await loc.refreshPermission()) === 'granted' || (await loc.requestPermission()) === 'granted') loc.start();
    else Linking.openSettings();
  };
  if (!hasFix) {
    // 드랍은 지금 선 자리에 남기는 것 — 위치 없이 곡 고르고 메모까지 쓴 뒤 막히지 않게 먼저 안내
    return (
      <Sheet>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20, paddingHorizontal: 12 }}>
          <Icon name="pin" size={28} color={colors.primary} />
          <T v="title" style={{ textAlign: 'center' }}>{locating ? '지금 있는 곳을 찾고 있어요' : '위치를 확인할 수 없어요'}</T>
          <T v="caption" c="ink2" style={{ textAlign: 'center' }}>드랍은 지금 서 있는 자리에 남겨져요. 위치 권한과 GPS를 확인해주세요.</T>
          {locating ? null : <PrimaryButton label="위치 켜기" icon="locate" onPress={retry} style={{ alignSelf: 'stretch', marginTop: 8 }} />}
        </View>
      </Sheet>
    );
  }
  return (
    <Sheet>
      <View style={{ gap: 4, paddingHorizontal: 4, paddingBottom: 6 }}>
        <T v="title">여기에 무엇을 남길까요?</T>
        {place ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="pin" size={12} color={colors.primary} />
            <T v="caption" c="ink2" numberOfLines={1}>{place}</T>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 12, marginTop: 8 }}>
        {TYPES.map(t => (
          <Press
            key={t.type}
            onPress={() => { start(t.type); navigation.replace(t.route as 'SongSearch'); }}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 22, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line }]}
          >
            <Illustration type={t.type} />
            <View style={{ flex: 1, gap: 4 }}>
              <T v="headline">{t.title}</T>
              <T v="caption" c="ink2">{t.desc}</T>
            </View>
            <Icon name="chevronRight" size={20} color={colors.ink3} />
          </Press>
        ))}
      </View>
    </Sheet>
  );
}
