/** 2×2 앨범 아트 콜라주 (플레이리스트 커버 — 첫 4곡) */
import React from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { Art } from '@/components/ui';
import { colors } from '@/theme/tokens';

/** images가 null이면 아직 모르는 중 — 같은 크기의 빈 칸만 (곡 없는 플리의 음표 그림과 구분) */
export function Collage({ images, size, radius = 18, style }: { images: (string | null | undefined)[] | null; size: number; radius?: number; style?: ViewStyle }) {
  if (!images) return <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: colors.card2 }, style]} />;
  const list = images.filter(Boolean) as string[];
  if (list.length < 4) return <Art uri={list[0]} size={size} radius={radius} style={style} />;
  const h = size / 2;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card2 }, style]}>
      {list.slice(0, 4).map((u, i) => <Image key={i} source={{ uri: u }} style={{ width: h, height: h }} />)}
    </View>
  );
}
