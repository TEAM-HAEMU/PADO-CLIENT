/** 곡 행 — 검색 결과 / 후보 / 트랙 목록 공용 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Song } from '@/api/types';
import { Art, Icon, Press, T } from '@/components/ui';
import { usePreview } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

interface Props { song: Song; selected?: boolean; onPress?: () => void; right?: React.ReactNode; showPreview?: boolean; index?: number; dim?: boolean; subtitle?: string }

export function SongRow({ song, selected, onPress, right, showPreview = true, index, dim, subtitle }: Props) {
  const p = usePreview(showPreview ? song : null, { lazy: true });
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 16, backgroundColor: selected ? colors.primarySoft : 'transparent', borderWidth: selected ? 1.5 : 0, borderColor: colors.primary, opacity: dim ? 0.5 : 1 }}>
      {index !== undefined ? <T v="number" c={selected ? 'primary' : 'ink3'} style={{ width: 20 }}>{String(index + 1).padStart(2, '0')}</T> : null}
      <View>
        <Art uri={song.albumImagePath} size={index !== undefined ? 44 : 56} radius={12} />
        {selected ? (
          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(5,9,22,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.6, 10)]}>
              <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={2.4} />
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyStrong" c={selected ? 'primary' : 'ink'} numberOfLines={1}>{song.title}</T>
        <T v="caption" c="ink2" numberOfLines={1}>{subtitle ?? song.artist}</T>
      </View>
      {song.duration ? <T v="number" c="ink3">{formatDuration(song.duration)}</T> : null}
      {right ?? (showPreview && p.available ? (
        <Press onPress={p.toggle} disabled={p.loading} hitSlop={6} accessibilityLabel="미리듣기" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
          {p.loading ? <ActivityIndicator size="small" color={colors.ink2} /> : <Icon name={p.playing ? 'pause' : 'play'} size={14} color={selected || p.playing ? colors.primary : colors.ink2} />}
        </Press>
      ) : null)}
    </Press>
  );
}
