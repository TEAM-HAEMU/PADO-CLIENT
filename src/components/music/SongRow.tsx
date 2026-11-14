/** 곡 행 — 검색 결과 / 후보 / 트랙 목록 공용. Figma 4.4 곡 행: 흰 카드 · 원형 앨범 아트(가운데 흰 재생) · 제목 12 / 아티스트 · 시간 + 시안 재생 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Song } from '@/api/types';
import { Art, Icon, Press, T } from '@/components/ui';
import { ArtPlayGlyph, SmallPlayGlyph } from '@/components/player/glyphs';
import { usePreview } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

interface Props { song: Song; selected?: boolean; onPress?: () => void; right?: React.ReactNode; showPreview?: boolean; index?: number; dim?: boolean; subtitle?: string }

export function SongRow({ song, selected, onPress, right, showPreview = true, index, dim, subtitle }: Props) {
  const p = usePreview(showPreview ? song : null, { lazy: true });
  const size = index !== undefined ? 48 : 60;
  return (
    <Press onPress={onPress} trackAs="곡 행" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: selected || p.playing ? colors.primarySoft : colors.page, opacity: dim ? 0.5 : 1 }}>
      {index !== undefined ? <T v="caption" c={selected ? 'primary' : 'ink3'} style={{ width: 20 }}>{String(index + 1).padStart(2, '0')}</T> : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#000000' }}>
        <View style={{ opacity: 0.8 }}><Art uri={song.albumImagePath} size={size} round /></View>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? (
            <View style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.6, 10)]}>
              <Icon name="check" size={16} color={colors.page} strokeWidth={2.4} />
            </View>
          ) : <ArtPlayGlyph />}
        </View>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="caption" numberOfLines={1} style={{ color: selected ? colors.primary : '#090909' }}>{song.title}</T>
        <T v="tiny" numberOfLines={1} style={{ color: '#8D8D8D' }}>{subtitle ?? song.artist}</T>
      </View>
      {song.duration ? <T v="tiny" style={{ color: '#969696' }}>{formatDuration(song.duration)}</T> : null}
      {right ?? (showPreview && p.available ? (
        <Press onPress={p.toggle} disabled={p.loading} hitSlop={10} accessibilityLabel="미리듣기" style={{ width: 20, height: 20, marginLeft: 2, alignItems: 'center', justifyContent: 'center' }}>
          {p.loading ? <ActivityIndicator size="small" color={colors.accent} /> : <SmallPlayGlyph playing={p.playing} />}
        </Press>
      ) : null)}
    </Press>
  );
}
