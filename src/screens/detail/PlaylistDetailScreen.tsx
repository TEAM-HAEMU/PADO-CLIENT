/** 내 플레이리스트 상세 — 재생·셔플·곡 메뉴·곡 추가·이름 변경·삭제 (Figma 'B 4.4 플레이리스트 상세') */
import React from 'react';
import { FlatList, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Empty, Icon, IconButton, Press } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { AddSongRow, BgWave, DiscRow, PlaylistHero } from '@/components/detail/parts';
import { usePlaylist } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
import { formatDuration, formatTotal } from '@/utils/format';
import { shuffled } from '@/utils/shuffle';
import { track } from '@/services/analytics';

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
    { text: '이름 변경', icon: 'edit', onPress: rename },
    { text: '플레이리스트 삭제', style: 'destructive', icon: 'trash', onPress: () => dialog.alert('플레이리스트를 삭제할까요?', '담긴 곡 목록이 사라져요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => playlistApi.remove(playlistId).then(() => { track('playlist_deleted', { playlist_id: playlistId }); qc.invalidateQueries({ queryKey: ['playlists'] }); navigation.goBack(); }).catch(e => toast(errorMessage(e), 'error')) },
    ]) },
  ]);

  const play = (shuffle: boolean) => {
    p.songs.forEach(x => qc.setQueryData(['song', x.id], x));
    const ids = p.songs.map(x => x.id);
    const q = shuffle ? shuffled(ids) : ids;
    if (q.length) navigation.navigate('Player', { songId: q[0], queue: q, autoplay: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <BgWave />
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} color="#C5C5C5" accessibilityLabel="뒤로" />
        <IconButton name="more" onPress={more} color="#C5C5C5" accessibilityLabel="플레이리스트 관리" />
      </View>
      <FlatList
        data={p.songs}
        keyExtractor={s => s.id}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 24, gap: 20 }}
        ListHeaderComponent={<View style={{ marginBottom: 20 }}><PlaylistHero images={p.songs.map(s => s.albumImagePath)} title={p.name} meta={`${p.songs.length}곡 · ${formatTotal(total)}`} onPlay={() => play(false)} onShuffle={() => play(true)} onService={() => p.songs[0] && navigation.navigate('ServicePicker', { song: p.songs[0] })} /></View>}
        ListEmptyComponent={<Empty icon="playlist" title="아직 담긴 곡이 없어요" desc="아래 곡 추가로 채워보세요." />}
        renderItem={({ item: s }) => (
          <DiscRow
            art={s.albumImagePath}
            title={s.title}
            artist={s.artist}
            duration={formatDuration(s.duration)}
            onPress={() => open(s.id)}
            onLongPress={() => navigation.navigate('TrackMenu', { playlistId, song: s })}
            right={<>
              <Glyph name="playCircle" color={colors.accent} />
              <Press onPress={() => navigation.navigate('TrackMenu', { playlistId, song: s })} hitSlop={10} accessibilityLabel="곡 메뉴" style={{ marginLeft: -4 }}><Icon name="more" size={18} color="#C5C5C5" /></Press>
            </>}
          />
        )}
        ListFooterComponent={<AddSongRow onPress={() => navigation.navigate('AddSongs', { playlistId, existing: p.songs.map(s => s.id) })} />}
      />
    </View>
  );
}
