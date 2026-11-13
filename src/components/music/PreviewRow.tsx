/** 30초 미리듣기 줄 — 남색 재생 버튼 + 막대 파형 + 시간 (Figma 2.3 재생 화면 파형). 항상 iTunes 미리듣기 (전체 곡은 '전체 듣기') */
import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Song } from '@/api/types';
import { Press, T } from '@/components/ui';
import { PlayCircleGlyph } from '@/components/player/glyphs';
import { ServiceGlyph } from '@/components/ui/Brand';
import { openInService } from '@/services/musicLinks';
import { usePreview, usePreviewProgress } from '@/services/preview';
import { colors } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

export function PreviewRow({ song }: { song: Pick<Song, 'id' | 'title' | 'artist'> & Partial<Pick<Song, 'duration' | 'links' | 'albumImagePath'>> }) {
  const p = usePreview(song);
  return (
    <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Press onPress={p.toggle} accessibilityLabel="30초 미리듣기" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: p.available ? 1 : 0.4 }}>
        {p.loading ? <ActivityIndicator color={colors.ink2} /> : <PlayCircleGlyph size={48} playing={p.playing} />}
      </Press>
      <Waveform songId={song.id} playing={p.playing} available={p.available} idle={30} />
    </View>
  );
}

// Figma 재생 화면 파형 막대 높이 비율 (12개 주기)
const COLS = Array.from({ length: 28 }, (_, i) => [0.78, 1, 0.78, 0.57, 0.38, 0.57, 0.78, 0.57, 0.38, 0.57, 0.78, 1][i % 12]);

/** 막대 파형 + 시간 — 진행률만 구독 (지난 부분 #00C9FF) */
function Waveform({ songId, playing, available, idle }: { songId: string; playing: boolean; available: boolean; idle: number }) {
  const { position, duration } = usePreviewProgress(songId);
  const lit = Math.round((duration ? position / duration : 0) * COLS.length);
  const bars = useMemo(() => COLS.map((h, i) => (
    <View key={i} style={{ width: 3.5, height: 30 * h, borderRadius: 1.75, backgroundColor: i < Math.max(lit, playing ? 1 : 0) ? '#00C9FF' : '#E1F6FF' }} />
  )), [lit, playing]);
  return (
    <>
      <View style={{ flex: 1, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>{bars}</View>
      <T v="caption" c={available ? 'primary' : 'ink3'} style={{ minWidth: 34, textAlign: 'right' }}>
        {available ? formatDuration(playing || position ? position : idle) : '—'}
      </T>
    </>
  );
}

/** 미리듣기 출처 표기 — iTunes 미리듣기 이용 조건(출처 표시 + Apple Music 링크) */
export function PreviewCredit({ song }: { song: { title: string; artist: string } }) {
  return (
    <Press onPress={() => { void openInService('appleMusic', song); }} hitSlop={8} accessibilityRole="link" accessibilityLabel="미리듣기 제공 Apple Music, Apple Music에서 열기" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <ServiceGlyph service="appleMusic" size={12} />
      <T v="tiny" c="ink3">미리듣기 제공 · Apple Music</T>
    </Press>
  );
}
