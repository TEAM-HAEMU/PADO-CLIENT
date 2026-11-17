/**
 * 3.1 드랍 유형 선택 (시트) — Figma 'Type sheet'.
 * 예시 그림 9자리(음악 1·투표 3·플리 5)는 최근 드랍 앨범 이미지로 채운다 (hooks/useRecentAlbumArt, 자리 순서는 utils/albumSlots).
 * 받기 전·실패·모자란 자리는 그라데이션 예시 그대로
 */
import React from 'react';
import { Image, Linking, StyleSheet, View, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { DropType } from '@/api/types';
import { ChevronGlyph, PinGlyph, VoteGlyph } from '@/components/drop/glyphs';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen, RootStackParamList } from '@/navigation/types';
import { currentCoords, preciseDropHint, PRECISE_DROP_TITLE, tooImpreciseToDrop, useLocation } from '@/services/location';
import { useDraft } from '@/store/draft';
import { useRecentAlbumArt } from '@/hooks/useRecentAlbumArt';
import { SLOT } from '@/utils/albumSlots';
import { colors, fonts } from '@/theme/tokens';

const TYPES: { type: DropType; title: string; desc: string; route: keyof RootStackParamList }[] = [
  { type: 'MUSIC', title: '음악', desc: '한 곡을 골라 이 자리에 남겨요', route: 'SongSearch' },
  { type: 'VOTE', title: '투표', desc: '2~5곡 중 이 장소에 어울리는 곡을 사람들이 골라요', route: 'VoteCreate' },
  { type: 'PLAYLIST', title: '플레이리스트', desc: '여러 곡을 묶어 한 번에 남겨요', route: 'PlaylistDropCreate' },
];

/** 앨범 이미지 한 장 — 예시 그림(그라데이션) 위에 겹쳐 두고, 다 받은 뒤에야 보이게 해서 빈칸·깜빡임이 없다 */
function Cover({ uri }: { uri: string | null }) {
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => setLoaded(false), [uri]);
  if (!uri) return null;
  return <Image source={{ uri }} onLoad={() => setLoaded(true)} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: loaded ? 1 : 0 }]} accessibilityIgnoresInvertColors />;
}

/** 예시 그림 한 칸: 그라데이션 + (있으면) 앨범 이미지. 그림자(glow)는 잘리지 않게 바깥, 둥근 자르기는 안쪽 */
function Tile({ size, radius, cs, uri, style, shadow }: { size: number; radius: number; cs: string[]; uri: string | null; style?: ViewStyle | ViewStyle[]; shadow?: ViewStyle }) {
  return (
    <View style={[{ position: 'absolute', width: size, height: size, borderRadius: radius }, shadow ? [{ backgroundColor: colors.page }, shadow] : null, style]}>
      <View style={{ flex: 1, borderRadius: radius, overflow: 'hidden' }}>
        <LinearGradient colors={cs} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Cover uri={uri} />
      </View>
    </View>
  );
}

function Illustration({ type, art }: { type: DropType; art: (string | null)[] }) {
  const disc = (size: number, cs: string[], slot: number, style?: ViewStyle | ViewStyle[], shadow?: ViewStyle) => (
    <Tile size={size} radius={size / 2} cs={cs} uri={art[slot] ?? null} style={style} shadow={shadow} />
  );
  if (type === 'MUSIC')
    return (
      <View style={{ width: 76, height: 64 }}>
        {disc(56, ['#BFE0FF', '#4F97F2'], SLOT.music, { left: 10, top: 4 })}
      </View>
    );
  if (type === 'VOTE')
    return (
      <View style={{ width: 76, height: 64 }}>
        {disc(40, ['#4F97F2', '#E3EDF9'], SLOT.vote[1], { left: 0, top: 12, opacity: 0.8 })}
        {disc(40, ['#D3E6FD', '#7DB5F7'], SLOT.vote[2], { left: 36, top: 12, opacity: 0.8 })}
        {disc(46, ['#BFE0FF', '#4F97F2'], SLOT.vote[0], { left: 15, top: 6 })}
        <View style={{ position: 'absolute', left: 54, top: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <VoteGlyph />
        </View>
      </View>
    );
  return (
    <View style={{ width: 76, height: 64 }}>
      <Tile size={50} radius={12} cs={['#C7DEFC', '#F6FAFF']} uri={art[SLOT.playlistBack] ?? null} style={{ left: 6, top: 14, opacity: 0.6, transform: [{ rotate: '-10deg' }] }} />
      <View style={{ position: 'absolute', left: 20, top: 6, width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
        {[['#BFE0FF', '#4F97F2'], ['#4F97F2', '#D3E6FD'], ['#7DB5F7', '#E3EDF9'], ['#D3E6FD', '#BFE0FF']].map((c, i) => (
          // 52px을 2×2로 (테두리 없음)
          <View key={i} style={{ width: 26, height: 26 }}>
            <LinearGradient colors={c} style={StyleSheet.absoluteFill} />
            <Cover uri={art[SLOT.playlistTiles[i]] ?? null} />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function DropTypeScreen({ navigation }: RootScreen<'DropType'>) {
  const start = useDraft(s => s.start);
  const art = useRecentAlbumArt();
  const place = useLocation(s => s.address || s.label);
  const hasFix = useLocation(s => !!currentCoords(s)); // 낡은 좌표(백그라운드에서 오래 있다 돌아와 새 위치를 기다리는 중)는 없는 것으로
  const locating = useLocation(s => s.fix === 'locating');
  // 오차가 100m를 넘으면(대략적인 위치 등) 드랍을 막는다 — 감시가 더 정확한 위치를 주면 바로 유형 선택으로 바뀐다
  const imprecise = useLocation(tooImpreciseToDrop);
  // 이 창이 떠 있는 동안도 위치 감시를 붙잡는다 (지도와 같은 감시 하나 — 따로 새로 만들지 않음)
  React.useEffect(() => useLocation.getState().start(), []);
  const retry = async () => {
    const loc = useLocation.getState();
    if ((await loc.refreshPermission()) === 'granted' || (await loc.requestPermission()) === 'granted') loc.restart();
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
  if (imprecise) {
    return (
      <Sheet>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20, paddingHorizontal: 12 }}>
          <Icon name="locate" size={28} color={colors.primary} />
          <T v="title" style={{ textAlign: 'center' }}>{PRECISE_DROP_TITLE}</T>
          <T v="caption" c="ink2" style={{ textAlign: 'center' }}>{preciseDropHint()}</T>
          <PrimaryButton label="설정 열기" icon="settings" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </View>
      </Sheet>
    );
  }
  return (
    <Sheet>
      <View style={{ gap: 6, paddingLeft: 4, paddingBottom: 6, marginTop: -4 }}>
        <T v="title" style={{ fontFamily: fonts.bold, color: '#000000' }}>여기에 무엇을 남길까요?</T>
        {place ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <PinGlyph />
            <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.regular, fontSize: 10, lineHeight: 12, letterSpacing: -0.2, color: colors.accent }}>{place}</T>
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: 12 }}>
        {TYPES.map((t, i) => (
          <Press
            key={t.type}
            onPress={() => { start(t.type); navigation.replace(t.route as 'SongSearch'); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18, paddingHorizontal: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}
          >
            <Illustration type={t.type} art={art} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, letterSpacing: -0.255, color: '#000000' }}>{t.title}</T>
              <T style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.065, color: colors.ink2 }}>{t.desc}</T>
            </View>
            <ChevronGlyph />
          </Press>
        ))}
      </View>
    </Sheet>
  );
}
