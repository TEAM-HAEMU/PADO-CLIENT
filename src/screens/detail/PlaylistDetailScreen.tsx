/** 내 플레이리스트 상세 — 재생·셔플·곡 메뉴·곡 추가·이름 변경·삭제 */
import React from 'react';
import { FlatList, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { PlaylistGlow, PlaylistHeader } from '@/components/music/PlaylistHeader';
import { Art, Empty, Icon, IconButton, Press, T } from '@/components/ui';
import { usePlaylist } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
import { formatDuration, formatTotal } from '@/utils/format';
import { shuffled } from '@/utils/shuffle';

export default function PlaylistDetailScreen({ navigation, route }: RootScreen<'PlaylistDetail'>) {
  const { playlistId } = route.params;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data: p, error, refetch } = usePlaylist(playlistId);
  // 새 플리 만들기에서 왔으면 곡 담기 화면을 한 번 자동으로 연다
  const openAdd = route.params.openAdd;
  React.useEffect(() => {
    if (!openAdd || !p) return;
    navigation.setParams({ openAdd: undefined });
    navigation.navigate('AddSongs', { playlistId, existing: p.songs.map(s => s.id) });
  }, [openAdd, p, playlistId, navigation]);

  if (!p) return <ScreenState title="플레이리스트" error={error} onRetry={() => refetch()} />;
  const total = p.songs.reduce((a, s) => a + (s.duration || 0), 0);
  const open = (id: string) => navigation.navigate('Player', { songId: id });

  const rename = () => navigation.navigate('NewPlaylist', { rename: { id: playlistId, name: p.name } });
  const more = () => dialog.menu(p.name, [
    { text: '취소', style: 'cancel' },
    { text: '이름 변경', onPress: rename },
    { text: '플레이리스트 삭제', style: 'destructive', onPress: () => dialog.alert('플레이리스트를 삭제할까요?', '담긴 곡 목록이 사라져요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => playlistApi.remove(playlistId).then(() => { qc.invalidateQueries({ queryKey: ['playlists'] }); navigation.goBack(); }).catch(e => toast(errorMessage(e), 'error')) },
    ]) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <PlaylistGlow />
      <FlatList
        data={p.songs}
        keyExtractor={s => s.id}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40, paddingHorizontal: 12 }}
        ListHeaderComponent={<View style={{ marginBottom: 16 }}><PlaylistHeader images={p.songs.map(s => s.albumImagePath)} title={p.name} meta={`${p.songs.length}곡 · ${formatTotal(total)}`} onPlay={() => { p.songs.forEach(x => qc.setQueryData(['song', x.id], x)); const q = p.songs.map(s => s.id); if (q.length) navigation.navigate('Player', { songId: q[0], queue: q, autoplay: true }); }} onShuffle={() => { p.songs.forEach(x => qc.setQueryData(['song', x.id], x)); const q = shuffled(p.songs.map(s => s.id)); if (q.length) navigation.navigate('Player', { songId: q[0], queue: q, autoplay: true }); }} onService={() => p.songs[0] && navigation.navigate('ServicePicker', { song: p.songs[0] })} /></View>}
        ListEmptyComponent={<Empty icon="playlist" title="아직 담긴 곡이 없어요" desc="아래 곡 추가로 채워보세요." />}
        renderItem={({ item: s, index }) => (
          <Press onPress={() => open(s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, backgroundColor: index === 0 ? colors.card : 'transparent' }}>
            <T v="number" c={index === 0 ? 'primary' : 'ink3'} style={{ width: 20 }}>{String(index + 1).padStart(2, '0')}</T>
            <Art uri={s.albumImagePath} size={44} radius={10} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" c={index === 0 ? 'primary' : 'ink'} numberOfLines={1}>{s.title}</T>
              <T v="caption" c="ink2" numberOfLines={1}>{s.artist}</T>
            </View>
            <T v="number" c="ink3">{formatDuration(s.duration)}</T>
            <Press onPress={() => navigation.navigate('TrackMenu', { playlistId, song: s })} hitSlop={10} accessibilityLabel="곡 메뉴"><Icon name="more" size={18} color={colors.ink3} /></Press>
          </Press>
        )}
        ListFooterComponent={
          <Press onPress={() => navigation.navigate('AddSongs', { playlistId, existing: p.songs.map(s => s.id) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, marginTop: 4 }}>
            <View style={{ width: 20 }} />
            <View style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} color={colors.primary} /></View>
            <T v="bodyStrong" c="primary">곡 추가</T>
          </Press>
        }
      />
      <View style={{ position: 'absolute', top: insets.top + 6, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <IconButton name="more" onPress={more} accessibilityLabel="플레이리스트 관리" />
      </View>
    </View>
  );
}
