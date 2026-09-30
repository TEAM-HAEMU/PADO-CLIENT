/** 30초 미리듣기 줄 — 재생 버튼 + 파티클 파형 + 시간 (Figma 2.2). 항상 iTunes 미리듣기 (전체 곡은 '전체 듣기') */
import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Song } from '@/api/types';
import { Icon, Press, T } from '@/components/ui';
import { usePreview, usePreviewProgress } from '@/services/preview';
import { colors, glow } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

export function PreviewRow({ song }: { song: Pick<Song, 'id' | 'title' | 'artist'> & Partial<Pick<Song, 'duration' | 'links' | 'albumImagePath'>> }) {
  const p = usePreview(song);
  return (
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Press onPress={p.toggle} disabled={!p.available} accessibilityLabel="30초 미리듣기" style={[{ width: 48, height: 48, borderRadius: 24, backgroundColor: p.available ? colors.primary : colors.card2, alignItems: 'center', justifyContent: 'center' }, p.available ? glow(0.5, 18) : null]}>
        {p.loading ? <ActivityIndicator color={colors.ink2} /> : <Icon name={p.playing ? 'pause' : 'play'} size={20} color={p.available ? colors.onPrimary : colors.ink3} />}
      </Press>
      <Waveform songId={song.id} playing={p.playing} available={p.available} idle={30} />
    </View>
  );
}

const COLS = Array.from({ length: 34 }, (_, i) => Math.max(1, Math.round(3 + 3 * Math.sin(i * 0.55) + 2 * Math.sin(i * 1.7))));

/** 파형 + 시간 — 진행률만 구독 */
function Waveform({ songId, playing, available, idle }: { songId: string; playing: boolean; available: boolean; idle: number }) {
  const { position, duration } = usePreviewProgress(songId);
  const lit = Math.round((duration ? position / duration : 0) * COLS.length);
  const bars = useMemo(() => COLS.map((n, i) => {
    const on = i < Math.max(lit, playing ? 1 : 0);
    return (
      <View key={i} style={{ gap: 2, alignItems: 'center' }}>
        {Array.from({ length: n }, (_, k) => (
          <View key={k} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: on ? colors.primary : colors.ink3, opacity: i < lit ? 1 - k * 0.08 : 0.5 }} />
        ))}
      </View>
    );
  }), [lit, playing]);
  return (
    <>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{bars}</View>
      <T v="number" c={available ? 'primary' : 'ink3'} style={{ minWidth: 34, textAlign: 'right' }}>
        {available ? formatDuration(playing || position ? position : idle) : '—'}
      </T>
    </>
  );
}
