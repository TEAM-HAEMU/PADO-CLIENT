/** 4.1 투표 드랍 — 곡을 눌러 투표 (다시 누르면 취소), 득표율 막대, 댓글 미리보기 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { isVoteDetail } from '@/api/types';
import { Art, Avatar, Divider, Icon, IconButton, Press, T } from '@/components/ui';
import { qk, useComments, useDrop, useLikeCount, useMyLikes, useToggleLike } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { usePreviewStore } from '@/services/preview';
import { findItunes } from '@/services/itunes';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors, glow } from '@/theme/tokens';
import { expiryLabel, formatRelative } from '@/utils/format';
import { track } from '@/services/analytics';

export default function VoteDropScreen({ navigation, route }: RootScreen<'VoteDrop'>) {
  const { dropId } = route.params;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const drop = useDrop(dropId);
  const d = drop.data && isVoteDetail(drop.data) ? drop.data : null;
  const comments = useComments(dropId).data ?? [];
  const likeCount = useLikeCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId);
  const toggleLike = useToggleLike(dropId);
  const authed = useAuth(s => s.status === 'authed');

  const voting = React.useRef(false);
  const vote = async (songId: string) => {
    if (!d || voting.current) return;
    if (!authed) return toast('로그인이 필요해요.');
    voting.current = true;
    try {
      if (d.userVotedOption === songId) { await dropApi.unvote(dropId); track('vote_cancelled', { drop_id: dropId, song_id: songId }); }
      else { await dropApi.vote(dropId, songId); track('vote_cast', { drop_id: dropId, song_id: songId, changed: !!d.userVotedOption }); }
      await qc.invalidateQueries({ queryKey: qk.drop(dropId) });
    } catch (e) { toast(errorMessage(e), 'error'); } finally { voting.current = false; }
  };

  const preview = async (title: string, artist: string, id: string) => {
    const r = await findItunes(title, artist);
    if (r.previewUrl) usePreviewStore.getState().play(id, r.previewUrl, { title, artist, image: d?.options.find(o => o.songId === id)?.albumImagePath });
    else toast(r.unavailable ? '지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.' : '이 곡은 미리듣기를 지원하지 않아요.');
  };

  const menu = useDropMenu(dropId, d?.userId, '투표 드랍');
  const more = menu.open;


  if (!d) return <ScreenState title="투표" error={drop.error} onRetry={() => drop.refetch()} />;
  const total = d.totalVotes || 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <IconButton name="chevronLeft" onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <T v="headline">투표</T>
        <IconButton name="more" onPress={more} accessibilityLabel="더보기" />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="pin" size={12} color={colors.primary} />
          <T v="caption" c="ink2" numberOfLines={1} style={{ flex: 1 }}>{d.address} · {formatRelative(d.createdAt)} · {expiryLabel(d.expiryDate)}</T>
        </View>
        <T v="titleLarge">{d.topic}</T>
        {d.content ? <T v="body" c="ink2">{d.content}</T> : null}
        <View style={{ gap: 10 }}>
          {d.options.map(o => {
            const mine = d.userVotedOption === o.songId;
            const pct = total ? Math.round((o.voteCount / total) * 100) : 0;
            return (
              <Press key={o.songId} onPress={() => vote(o.songId)} onLongPress={() => preview(o.title, o.artist, o.songId)} style={[{ height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card, borderWidth: mine ? 1.5 : 1, borderColor: mine ? colors.primary : colors.line }, mine ? glow(0.25, 14) : {}]}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${d.userVotedOption ? pct : 0}%`, backgroundColor: mine ? colors.primarySoft : colors.card2 }} />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 }}>
                  <Art uri={o.albumImagePath} size={52} radius={12} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" numberOfLines={1}>{o.title}</T>
                    <T v="caption" c="ink2" numberOfLines={1}>{o.artist}</T>
                  </View>
                  {mine ? <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.4} /></View> : null}
                  {d.userVotedOption ? <T v="number" c={mine ? 'primary' : 'ink2'} style={{ width: 40, textAlign: 'right' }}>{pct}%</T> : null}
                </View>
              </Press>
            );
          })}
        </View>
        <T v="caption" c="ink3">{total}명 참여 · {d.userVotedOption ? '다시 누르면 투표를 취소해요' : '마음에 드는 곡을 눌러 투표해보세요 (길게 누르면 미리듣기)'}</T>
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="headline">댓글</T>
          <T v="number" c="primary">{comments.length}</T>
        </View>
        {comments.slice(0, 3).map(c => (
          <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
            <Avatar name={c.username} size={32} />
            <View style={{ flex: 1, gap: 3 }}>
              <T v="captionStrong">{c.username}</T>
              <T v="body">{c.content}</T>
            </View>
          </View>
        ))}
        {comments.length > 3 ? <Press onPress={() => navigation.navigate('Comments', { dropId })}><T v="captionStrong" c="primary">댓글 {comments.length}개 모두 보기</T></Press> : null}
        <T v="micro" c="ink3">{formatRelative(d.createdAt)} 드랍</T>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: colors.page, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Press onPress={() => navigation.navigate('Comments', { dropId })} style={{ flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', paddingHorizontal: 14 }}>
          <T v="body" c="ink3">이 투표에 한마디</T>
        </Press>
        <Press accessibilityLabel="좋아요" onPress={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={22} color={colors.accent2} />
          <T v="number" c="ink2">{likeCount ?? 0}</T>
        </Press>
      </View>
    </View>
  );
}
