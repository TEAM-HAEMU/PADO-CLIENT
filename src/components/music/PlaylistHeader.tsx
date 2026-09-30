/** 플레이리스트 헤더 — 글로우 콜라주 + 제목 + 전체 재생/셔플 (Figma 4.2) */
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Icon, Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { usePrefs } from '@/store/prefs';
import { colors, glow } from '@/theme/tokens';
import { Collage } from './Collage';

export function PlaylistGlow() {
  return (
    <Svg width="100%" height={420} style={{ position: 'absolute', top: -60 }}>
      <Defs>
        <RadialGradient id="plg" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#0E3A7A" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#050916" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50%" cy="210" rx="260" ry="210" fill="url(#plg)" />
    </Svg>
  );
}

export function PlaylistHeader({ images, title, meta, onPlay, onShuffle, onService }: { images: (string | null)[]; title: string; meta: string; onPlay: () => void; onShuffle: () => void; onService?: () => void }) {
  const service = usePrefs(s => s.service) ?? 'spotify';
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={glow(0.35, 36)}><Collage images={images} size={168} radius={24} /></View>
      <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 24 }}>
        <T v="display" numberOfLines={2} style={{ textAlign: 'center' }}>{title}</T>
        <T v="caption" c="ink2">{meta}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Press onPress={onPlay} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 22, paddingRight: 24, height: 50, borderRadius: 25, backgroundColor: colors.primary }, glow(0.45, 20)]}>
          <Icon name="play" size={18} color={colors.onPrimary} />
          <T v="bodyStrong" c="onPrimary">전체 재생</T>
        </Press>
        <Press onPress={onShuffle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 50, borderRadius: 25, backgroundColor: colors.card2 }}>
          <Icon name="shuffle" size={18} />
          <T v="bodyStrong">셔플</T>
        </Press>
        {onService ? (
          <Press onPress={onService} accessibilityLabel="재생 앱" style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
            <ServiceGlyph service={service} size={22} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}
