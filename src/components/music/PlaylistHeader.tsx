/** 플레이리스트 헤더 — 콜라주 + 제목 + 셔플로 듣기 / 전체 재생 알약 (Figma 4.4 플레이리스트 상세 'Frame 174') */
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { PlayAllGlyph, ShuffleGlyph } from '@/components/player/glyphs';
import { usePrefs } from '@/store/prefs';
import { fonts } from '@/theme/tokens';
import { Collage } from './Collage';

/** 헤더 뒤 은은한 하늘빛 (새 디자인은 흰 바탕이라 아주 옅게) */
export function PlaylistGlow() {
  return (
    <Svg width="100%" height={420} style={{ position: 'absolute', top: -60 }}>
      <Defs>
        <RadialGradient id="plg" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#C8E8FF" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50%" cy="210" rx="260" ry="210" fill="url(#plg)" />
    </Svg>
  );
}

const pill = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 30, paddingHorizontal: 14, borderRadius: 999 } as const;

export function PlaylistHeader({ images, title, meta, onPlay, onShuffle, onService }: { images: (string | null)[]; title: string; meta: string; onPlay: () => void; onShuffle: () => void; onService?: () => void }) {
  const service = usePrefs(s => s.service) ?? 'spotify';
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <Collage images={images} size={170} radius={18.9} />
      <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 24 }}>
        <T v="titleLarge" numberOfLines={2} style={{ textAlign: 'center', color: '#090909' }}>{title}</T>
        <T v="captionStrong" style={{ fontFamily: fonts.regular, color: '#56627F' }}>{meta}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Press onPress={onShuffle} style={[pill, { backgroundColor: 'rgba(240,252,255,0.8)' }]}>
          <ShuffleGlyph />
          <T v="caption" c="primary" style={{ fontFamily: fonts.medium }}>셔플로 듣기</T>
        </Press>
        <Press onPress={onPlay} style={[pill, { backgroundColor: 'rgba(43,156,255,0.8)' }]}>
          <PlayAllGlyph />
          <T v="caption" style={{ fontFamily: fonts.medium, color: '#F0FCFF' }}>전체 재생</T>
        </Press>
        {onService ? (
          <Press onPress={onService} accessibilityLabel="재생 앱" style={[pill, { width: 30, paddingHorizontal: 0, backgroundColor: 'rgba(240,252,255,0.8)' }]}>
            <ServiceGlyph service={service} size={16} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}
