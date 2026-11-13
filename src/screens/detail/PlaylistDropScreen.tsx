/** 4.2 플레이리스트 드랍 (다른 사람이 남긴 플리) — Figma 'B 4.2 플레이리스트 드랍' */
import React from 'react';
import { FlatList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { isPlaylistDetail } from '@/api/types';
import { IconButton, Press, T } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { BgWave, DiscRow, PlaylistHero } from '@/components/detail/parts';
import { useCommentCount, useDrop, useLikeCount, useMyLikes, useToggleLike } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { startPreview, usePreviewStore } from '@/services/preview';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors, fonts } from '@/theme/tokens';
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
    startPreview({ id: first.songId, title: first.title, artist: first.artist, albumImagePath: first.albumImagePath, previewUrl: first.previewUrl });
  }, [first]);
  const playingKey = usePreviewStore(s => s.key);
  const likeCount = useLikeCount(dropId).data;
  const commentCount = useCommentCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId);
  const toggleLike = useToggleLike(dropId);
  const authed = useAuth(s => s.status === 'authed');
  const menu = useDropMenu(dropId, drop.data?.userId, '플레이리스트 드랍', drop.data && 'username' in drop.data ? drop.data.username : undefined);

  if (!d) return <ScreenState title="플리 드랍" error={drop.error} onRetry={() => drop.refetch()} />;

  const open = (songId: string) => navigation.navigate('Player', { songId, dropId });
  const more = menu.open;
  const count = (n?: number) => (n ? <T style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: '#969696' }}>{n}</T> : null);


  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <BgWave />
      {/* 위 줄: 뒤로 · 드랍 한마디 알약 · 좋아요 · 댓글 · 더보기(신고·차단) */}
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 12 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} color="#C5C5C5" accessibilityLabel="뒤로" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          {d.content ? (
            <View style={{ maxWidth: '100%', paddingHorizontal: 18, paddingVertical: 5, borderRadius: 99, backgroundColor: 'rgba(245,245,245,0.8)' }}>
              <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.06, color: '#000000' }}>{d.content}</T>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Press accessibilityLabel="좋아요" accessibilityState={{ selected: liked }} hitSlop={6} onPress={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Glyph name="heart" color={liked ? '#EA383B' : '#E3E3E3'} />
            {count(likeCount)}
          </Press>
          <Press accessibilityLabel="댓글" hitSlop={6} onPress={() => navigation.navigate('Comments', { dropId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Glyph name="comment" color="#E3E3E3" />
            {count(commentCount)}
          </Press>
          <IconButton name="more" size={32} onPress={more} color="#C5C5C5" accessibilityLabel="더보기" />
        </View>
      </View>
      <FlatList
        data={d.songs}
        keyExtractor={s => s.songId}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 24, gap: 20 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 20 }}>
            <PlaylistHero
              images={d.songs.map(s => s.albumImagePath)}
              title={d.playlistName}
              meta={`${d.songs.length}곡 · ${d.address} · ${expiryLabel(d.expiryDate)}`}
              onPlay={() => { const q = d.songs.map(s => s.songId); if (q.length) navigation.navigate('Player', { songId: q[0], dropId, queue: q, autoplay: true }); }}
              onShuffle={() => { const q = shuffled(d.songs.map(s => s.songId)); if (q.length) navigation.navigate('Player', { songId: q[0], dropId, queue: q, autoplay: true }); }}
            />
          </View>
        }
        renderItem={({ item: s }) => (
          <DiscRow
            song={{ id: s.songId, title: s.title, artist: s.artist, albumImagePath: s.albumImagePath }}
            title={s.title}
            artist={s.artist}
            active={playingKey === s.songId}
            onPress={() => open(s.songId)}
          />
        )}
      />
    </View>
  );
}
