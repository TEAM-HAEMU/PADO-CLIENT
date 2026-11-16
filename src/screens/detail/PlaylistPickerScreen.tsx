/** 다른 플리에 담기 (시트) — 곡 메뉴에서 내 다른 플레이리스트를 골라 한 곡 추가 (Figma 'B 4.7 다른 플리에 담기 (시트)'). 드랍 ⋯ 메뉴의 '내 플리에 담기'도 이 시트 (excludeId 없음) */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Art, Empty, Press, SecondaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import { Glyph } from '@/components/detail/glyphs';
import { SheetTitle } from '@/components/detail/parts';
import { useMyPlaylists } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';

export default function PlaylistPickerScreen({ navigation, route }: RootScreen<'PlaylistPicker'>) {
  const { song, excludeId } = route.params;
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useMyPlaylists();
  const lists = (data ?? []).filter(p => p.id !== excludeId);
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (id: string, name: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await playlistApi.addSongs(id, [song.id]);
      track('playlist_songs_added', { playlist_id: id, count: 1, source: excludeId ? 'track_menu' : 'drop_menu', song_id: song.id });
      qc.invalidateQueries({ queryKey: ['playlist', id] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      toast(`'${name}'에 담았어요.`, 'success');
      navigation.goBack();
    } catch (e) {
      toast((e as { code?: string }).code === 'P3' ? `'${name}'에 이미 있는 곡이에요.` : errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet style={{ maxHeight: '70%', paddingHorizontal: 25 }}>
      <View style={{ marginBottom: 20 }}><SheetTitle title={excludeId ? '다른 플레이리스트에 담기' : '내 플레이리스트에 담기'} desc={`${song.title} · ${song.artist}`} /></View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : isError ? (
        <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} />
      ) : !lists.length ? (
        <Empty icon="playlist" title={excludeId ? '담을 수 있는 다른 플리가 없어요' : '아직 플레이리스트가 없어요'} desc="플리 탭의 + 로 새 플레이리스트를 만들어보세요." />
      ) : (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {lists.map(p => (
            <Press key={p.id} onPress={() => add(p.id, p.name)} accessibilityLabel={`${p.name}에 담기`} trackAs="플레이리스트에 담기" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, paddingRight: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, backgroundColor: busy === p.id ? '#F8FDFF' : '#FDFCFC', borderColor: busy === p.id ? '#D3F2FC' : '#F6F4F4' }}>
              <Art uri={p.albumImageUrl} size={48} radius={12} />
              <T numberOfLines={1} style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.15, color: '#000000' }}>{p.name}</T>
              {busy === p.id ? <ActivityIndicator color={colors.accent} /> : <Glyph name="plus" color="#B7B7B7" />}
            </Press>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}
