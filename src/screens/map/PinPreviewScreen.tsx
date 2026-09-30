/**
 * 2.2 핀 미리보기 (바텀시트) — 음악 드랍.
 * 투표/플리 드랍은 지도에서 바로 상세 화면으로 간다.
 */
import React from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/api/errors';
import { isMusicDetail, isPlaylistDetail, isVoteDetail } from '@/api/types';
import { Art, Avatar, Icon, Loading, Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Sheet } from '@/components/ui/Sheet';
import { PreviewRow } from '@/components/music/PreviewRow';
import { useCommentCount, useDrop, useDropAddress, useLikeCount, useMyLikes, useSong, useToggleLike } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { listenFull } from '@/services/listen';
import { startPreview } from '@/services/preview';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors, glow } from '@/theme/tokens';
import { formatDateTime } from '@/utils/format';

export default function PinPreviewScreen({ navigation, route }: RootScreen<'PinPreview'>) {
  // 듣던 곡은 화면을 닫아도 계속 (다른 곡을 틀 때만 바뀜)
  const { dropId } = route.params;
  const qc = useQueryClient();
  const drop = useDrop(dropId);
  const d = drop.data;
  const music = d && isMusicDetail(d) ? d : null;
  const song = useSong(music?.songId);
  // 핀을 누르면 그 곡 미리듣기를 바로 (지도 자동 재생으로 듣던 곡이면 이어서)
  const autoStarted = React.useRef<string | null>(null);
  React.useEffect(() => {
    const s = song.data;
    if (!s || autoStarted.current === s.id) return;
    autoStarted.current = s.id;
    startPreview(s);
  }, [song.data]);
  const likeCount = useLikeCount(dropId).data;
  const commentCount = useCommentCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId);
  const toggleLike = useToggleLike(dropId);
  const authed = useAuth(s => s.status === 'authed');
  const service = usePrefs(s => s.service);
  const menu = useDropMenu(dropId, d?.userId, '드랍');
  const address = useDropAddress(dropId);

  React.useEffect(() => {
    if (!d) return;
    if (isVoteDetail(d)) navigation.replace('VoteDrop', { dropId });
    else if (isPlaylistDetail(d)) navigation.replace('PlaylistDrop', { dropId });
  }, [d, dropId, navigation]);

  // 전체 듣기 — 고른 음악 앱으로 딥링크 (없으면 선택 시트)
  const listen = () => { if (song.data) listenFull(service, song.data); };

  const more = menu.open;


  if (!music) {
    return <Sheet><View style={{ height: 320 }}>{drop.isError ? <T v="body" c="ink2" style={{ textAlign: 'center', marginTop: 60 }}>{errorMessage(drop.error)}</T> : <Loading />}</View></Sheet>;
  }

  return (
    <Sheet
      style={{ paddingTop: 72 }}
      headerOverlap={56}
      header={
        <Press accessibilityLabel="재생 화면 열기" onPress={() => { if (!song.data) return; navigation.replace('Player', { songId: song.data.id, dropId }); }}>
          <View style={[{ width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: colors.primary, overflow: 'hidden' }, glow(0.6, 30)]}>
            <Art uri={music.albumImageUrl ?? song.data?.albumImagePath} size={106} round />
          </View>
          <View style={{ position: 'absolute', left: 49, top: 49, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.page, borderWidth: 1.5, borderColor: colors.primary }} />
        </Press>
      }
    >
      <Press onPress={more} hitSlop={10} style={{ position: 'absolute', top: 14, right: 18 }} accessibilityLabel="더보기">
        <Icon name="more" size={22} color={colors.ink2} />
      </Press>

      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.primarySoft }}>
            <Icon name="music" size={12} color={colors.primary} />
            <T v="label" c="primary">Music</T>
          </View>
          {address ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
              <Icon name="pin" size={12} color={colors.ink2} />
              <T v="caption" c="ink2" numberOfLines={1}>{address}</T>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T v="display" numberOfLines={1}>{song.data?.title ?? ' '}</T>
          <T v="body" c="ink2">{song.data?.artist ?? ' '}</T>
        </View>
        {music.content ? (
          <View style={{ alignSelf: 'stretch', gap: 10, padding: 16, borderRadius: 14, backgroundColor: colors.card2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar name={music.username} size={22} />
              <T v="captionStrong">{music.username}</T>
              <T v="number" c="ink3">{formatDateTime(music.createdAt)}</T>
            </View>
            <T v="body">{music.content}</T>
          </View>
        ) : null}
        {song.data ? <PreviewRow song={song.data} /> : null}
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
          <Press
            accessibilityLabel="좋아요"
            onPress={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 52, borderRadius: 26, backgroundColor: colors.card2 }}
          >
            <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? colors.primary : colors.ink} />
            <T v="number">{likeCount ?? 0}</T>
          </Press>
          <Press accessibilityLabel="댓글" onPress={() => navigation.navigate('Comments', { dropId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 52, borderRadius: 26, backgroundColor: colors.card2 }}>
            <Icon name="comment" size={20} />
            <T v="number">{commentCount ?? 0}</T>
          </Press>
          <Press onPress={listen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.line }}>
            <ServiceGlyph service={service ?? 'spotify'} size={20} />
            <T v="bodyStrong">전체 듣기</T>
            <Icon name="external" size={16} color={colors.ink2} />
          </Press>
        </View>
      </View>
    </Sheet>
  );
}
