/** 4.1 투표 드랍 — 곡을 눌러 투표 (다시 누르면 취소), 물결 득표율, 댓글 미리보기 (Figma 'B 4.1 투표 드랍') */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { isVoteDetail, type VoteOption } from '@/api/types';
import { Avatar, IconButton, Press, T, TopBar } from '@/components/ui';
import { Glyph, VoteFill, VOTE_FILL_W } from '@/components/detail/glyphs';
import { AddressPill, BgWave, CommentBar, DiscRow } from '@/components/detail/parts';
import { qk, useComments, useDrop, useLikeCount, useMyLikes, useToggleLike } from '@/hooks/api';
import { useDropOpenedEvent } from '@/hooks/useDropOpenedEvent';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors, fonts } from '@/theme/tokens';
import { expiryLabel, formatRelative } from '@/utils/format';
import { track } from '@/services/analytics';

export default function VoteDropScreen({ navigation, route }: RootScreen<'VoteDrop'>) {
  const { dropId, source } = route.params;
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const drop = useDrop(dropId);
  const d = drop.data && isVoteDetail(drop.data) ? drop.data : null;
  useDropOpenedEvent(dropId, 'VOTE', d, source);
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

  const menu = useDropMenu(dropId, d?.userId, '투표 드랍');
  const more = menu.open;


  if (!d) return <ScreenState title="투표" error={drop.error} onRetry={() => drop.refetch()} />;
  const total = d.totalVotes || 0;
  const voted = !!d.userVotedOption;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <BgWave />
      <TopBar title="투표" onBack={navigation.goBack} right={<IconButton name="more" onPress={more} color="#C5C5C5" accessibilityLabel="더보기" />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: insets.bottom + 90 }}>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AddressPill address={d.address} />
            <T v="tiny" c="faint">{formatRelative(d.createdAt)} · {expiryLabel(d.expiryDate)}</T>
          </View>
          <T style={{ fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, color: '#090909' }}>{d.topic}</T>
          {d.content ? <T v="captionStrong" c="ink2" style={{ fontFamily: fonts.regular }}>{d.content}</T> : null}
        </View>
        <View style={{ gap: 16, marginTop: 30 }}>
          {d.options.map(o => <VoteRow key={o.songId} o={o} mine={d.userVotedOption === o.songId} voted={voted} pct={total ? Math.round((o.voteCount / total) * 100) : 0} onVote={() => vote(o.songId)} />)}
        </View>
        <T v="caption" c="faint" style={{ marginTop: 14 }}>{total}명 참여 · {voted ? '다시 누르면 투표를 취소해요' : '마음에 드는 곡을 눌러 투표해보세요 (앨범을 누르면 미리듣기)'}</T>

        {comments.length ? (
          <View style={{ gap: 14, marginTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T v="navTitle" style={{ lineHeight: 22 }}>댓글</T>
              <T v="number" c="primary">{comments.length}</T>
            </View>
            {comments.slice(0, 3).map(c => (
              <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
                <Avatar name={c.username} size={30} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="caption" c="ink2">{c.username}</T>
                  <T v="captionStrong" style={{ fontFamily: fonts.regular }}>{c.content}</T>
                </View>
              </View>
            ))}
            {comments.length > 3 ? <Press onPress={() => navigation.navigate('Comments', { dropId })}><T v="caption" c="primaryDeep">댓글 {comments.length}개 모두 보기</T></Press> : null}
          </View>
        ) : null}
      </ScrollView>
      <CommentBar placeholder="이 투표에 한마디" onComment={() => navigation.navigate('Comments', { dropId })} liked={liked} likeCount={likeCount} onLike={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))} />
    </View>
  );
}

/** 투표 후보 한 줄 — 투표 뒤에만 물결 채움·득표율이 보인다. 앨범(CD)을 누르면 미리듣기 (듣는 중이면 CD가 돈다) */
function VoteRow({ o, mine, voted, pct, onVote }: { o: VoteOption; mine: boolean; voted: boolean; pct: number; onVote: () => void }) {
  const [w, setW] = React.useState(0);
  // Figma 시안: 물결 모양 채움의 오른쪽 끝이 득표율만큼 들어옴 (0%여도 꼬리는 살짝 보이게)
  const right = w ? Math.min(w, 24 + (w - 24) * (pct / 100) * 1.35) : 0;
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <DiscRow
        song={{ id: o.songId, title: o.title, artist: o.artist, albumImagePath: o.albumImagePath }}
        title={o.title}
        artist={o.artist}
        onPress={onVote}
        trackAs="투표 후보 곡"
        active={mine}
        style={{ backgroundColor: mine ? '#F6FFFF' : '#F8FAFB', borderWidth: mine ? 1 : 0, borderColor: colors.accent }}
        right={<>
          <Glyph name="checkCircle" color={mine ? colors.accent : '#E1E1E1'} />
          {voted ? <T style={{ width: 28, textAlign: 'right', fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, letterSpacing: -0.2, color: '#969696' }}>{pct}%</T> : null}
        </>}
      >
        {voted && w ? <View pointerEvents="none" style={{ position: 'absolute', bottom: mine ? -1 : 0, left: right - VOTE_FILL_W }}><VoteFill /></View> : null}
      </DiscRow>
    </View>
  );
}
