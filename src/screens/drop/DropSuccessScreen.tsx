/** 3.6 드랍 완료 — 퍼지는 파문 */
import React from 'react';
import { Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ripples } from '@/components/anim';
import { Art, PrimaryButton, SecondaryButton, T } from '@/components/ui';
import type { RootScreen } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { colors, glow } from '@/theme/tokens';
import { track } from '@/services/analytics';

export default function DropSuccessScreen({ navigation, route }: RootScreen<'DropSuccess'>) {
  const insets = useSafeAreaInsets();
  const { art, content } = route.params;
  const { label, address } = useLocation();
  const { height } = useWindowDimensions();
  const compact = height < 740; // iPhone SE 등 작은 화면
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center' }}>
      <View style={{ marginTop: insets.top + (compact ? 16 : 60), alignItems: 'center', justifyContent: 'center' }}>
        <Ripples size={compact ? 260 : 360} count={5} duration={4200} />
        <View style={[{ position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 3, borderColor: colors.primary, overflow: 'hidden' }, glow(0.6, 40)]}>
          <Art uri={art} size={122} round />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32, marginTop: 8 }}>
        <T v="titleLarge" style={{ textAlign: 'center' }}>{label || '이곳'}에 드랍했어요</T>
        <T v="caption" c="ink2" style={{ textAlign: 'center' }}>누군가 좋아요나 댓글을 남기면 알려드릴게요</T>
      </View>
      {content ? (
        <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingRight: 16, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, maxWidth: 340 }}>
          <Art uri={art} size={36} radius={9} />
          <View style={{ flexShrink: 1 }}>
            <T v="caption" numberOfLines={1}>“{content}”</T>
            <T v="micro" c="ink3" numberOfLines={1}>{address || label} · 방금</T>
          </View>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16, gap: 10 }}>
        <PrimaryButton label="지도에서 보기" icon="map" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Map' } }] })} />
        <SecondaryButton label="친구에게 공유" icon="share" onPress={() => (track('share_opened', { kind: 'drop' }), Share.share({ message: `PADO — ${label || '이곳'}에 음악을 남겼어요. ${content ? `“${content}”` : ''}` }))} />
      </View>
    </View>
  );
}
