/** 4.2 플레이리스트 드랍 (다른 사람이 남긴 플리) */
import React from 'react';
import { FlatList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { isPlaylistDetail } from '@/api/types';
import { PlaylistGlow, PlaylistHeader } from '@/components/music/PlaylistHeader';
import { Art, Icon, IconButton, Press, T } from '@/components/ui';
import { useCommentCount, useDrop, useLikeCount, useMyLikes, useToggleLike } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { startPreview } from '@/services/preview';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors } from '@/theme/tokens';
import { expiryLabel } from '@/utils/format';
import { shuffled } from '@/utils/shuffle';

export default function PlaylistDropScreen({ navigation, route }: RootScreen<'PlaylistDrop'>) {
  const { dropId } = route.params;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const drop = useDrop(dropId);
  const d = drop.data && isPlaylistDetail(drop.data) ? drop.data : null;
  // 플리 드랍 핀을 누르면 첫 곡 미리듣기를 바로
  const first = d?.songs[0];
  const autoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!first || autoStarted.current) return;
    autoStarted.current = true;
    startPreview({ id: first.songId, title: first.title, artist: first.artist, albumImagePath: first.albumImagePath });
  }, [first]);
  const likeCount = useLikeCount(dropId).data;
  const commentCount = useCommentCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId);
  const toggleLike = useToggleLike(dropId);
  const authed = useAuth(s => s.status === 'authed');
  const menu = useDropMenu(dropId, drop.data?.userId, '플레이리스트 드랍');

  if (!d) return <ScreenState title="플리 드랍" error={drop.error} onRetry={() => drop.refetch()} />;

  const open = (songId: string) => navigation.navigate('Player', { songId, dropId });
  const more = menu.open;


  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <PlaylistGlow />
      <FlatList
        data={d.songs}
        keyExtractor={s => s.songId}
        contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 110, paddingHorizontal: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 16 }}>
            <PlaylistHeader images={d.songs.map(s => s.albumImagePath)} title={d.playlistName} meta={`${d.songs.length}곡 · ${d.address} · ${expiryLabel(d.expiryDate)}`} onPlay={() => { const q = d.songs.map(s => s.songId); if (q.length) navigation.navigate('Player', { songId: q[0], dropId, queue: q, autoplay: true }); }} onShuffle={() => { const q = shuffled(d.songs.map(s => s.songId)); if (q.length) navigation.navigate('Player', { songId: q[0], dropId, queue: q, autoplay: true }); }} />
            {d.content ? <View style={{ marginHorizontal: 8, padding: 14, borderRadius: 14, backgroundColor: colors.card }}><T v="body">{d.content}</T></View> : null}
          </View>
        }
        renderItem={({ item: s, index }) => (
          <Press onPress={() => open(s.songId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14 }}>
            <T v="number" c="ink3" style={{ width: 20 }}>{String(index + 1).padStart(2, '0')}</T>
            <Art uri={s.albumImagePath} size={44} radius={10} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" numberOfLines={1}>{s.title}</T>
              <T v="caption" c="ink2" numberOfLines={1}>{s.artist}</T>
            </View>
            <Icon name="play" size={14} color={colors.ink3} />
          </Press>
        )}
      />
      <View style={{ position: 'absolute', top: insets.top + 6, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <IconButton name="more" onPress={more} accessibilityLabel="더보기" />
      </View>
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, flexDirection: 'row', gap: 10 }}>
        <Press accessibilityLabel="좋아요" onPress={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 52, borderRadius: 26, backgroundColor: colors.card2 }}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? colors.primary : colors.ink} />
          <T v="number">{likeCount ?? 0}</T>
        </Press>
        <Press onPress={() => navigation.navigate('Comments', { dropId })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: colors.card2 }}>
          <Icon name="comment" size={20} />
          <T v="bodyStrong">댓글 {commentCount ?? 0}</T>
        </Press>
      </View>
    </View>
  );
}
