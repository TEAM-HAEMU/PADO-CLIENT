/** 다른 플리에 담기 (시트) — 곡 메뉴에서 내 다른 플레이리스트를 골라 한 곡 추가 */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Art, Empty, Icon, Press, SecondaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import { useMyPlaylists } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
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
      track('playlist_songs_added', { playlist_id: id, count: 1, source: 'track_menu', song_id: song.id });
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
    <Sheet style={{ maxHeight: '70%' }}>
      <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 12 }}>
        <T v="title">다른 플리에 담기</T>
        <T v="caption" c="ink2" numberOfLines={1}>{song.title} · {song.artist}</T>
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : isError ? (
        <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} />
      ) : !lists.length ? (
        <Empty icon="playlist" title="담을 수 있는 다른 플리가 없어요" desc="플리 탭의 + 로 새 플레이리스트를 만들어보세요." />
      ) : (
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {lists.map(p => (
            <Press key={p.id} onPress={() => add(p.id, p.name)} accessibilityLabel={`${p.name}에 담기`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line }}>
              <Art uri={p.albumImageUrl} size={48} radius={12} />
              <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{p.name}</T>
              {busy === p.id ? <ActivityIndicator color={colors.primary} /> : <Icon name="plus" size={18} color={colors.primary} />}
            </Press>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}
