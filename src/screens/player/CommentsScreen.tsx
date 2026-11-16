/** 2.4 댓글 (시트) — 목록·작성(100자)·내 댓글 수정/삭제·타인 댓글 신고 */
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { commentApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { type Comment, isPlaylistDetail, isVoteDetail } from '@/api/types';
import { Avatar, Empty, Icon, Press, SecondaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import { qk, useComments, useDrop, useMe } from '@/hooks/api';
import { useBlockUser } from '@/hooks/useBlockUser';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';
import { formatRelative } from '@/utils/format';
import { MoreGlyph, SendGlyph } from '@/components/player/glyphs';

const SEND = '#12214A'; // Figma 보내기 버튼 남색

export default function CommentsScreen({ navigation, route }: RootScreen<'Comments'>) {
  const { dropId } = route.params;
  const qc = useQueryClient();
  const blockUser = useBlockUser();
  const me = useMe().data;
  const { data: list = [], isLoading, isError, refetch } = useComments(dropId);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  // 댓글이 칸에 다 들어가면 목록 스크롤을 꺼서, 목록 위에서 쓸어내려도 시트가 닫히게 (스크롤이 켜져 있으면 목록이 제스처를 가져감)
  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // 투표·플리 드랍의 댓글이면 '이 곡에'가 아니라 그 드랍을 부른다 (상세는 앞 화면에서 이미 불러와 캐시에 있음)
  const drop = useDrop(dropId).data;
  const target = drop && isVoteDetail(drop) ? '이 투표에' : drop && isPlaylistDetail(drop) ? '이 플리에' : '이 곡에';

  const refresh = () => { qc.invalidateQueries({ queryKey: qk.comments(dropId) }); qc.invalidateQueries({ queryKey: ['commentCount', dropId] }); };
  const submit = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (editing) { await commentApi.update(editing.id, content); track('comment_edited', { drop_id: dropId, length: content.length }); }
      else { await commentApi.create(dropId, content); track('comment_created', { drop_id: dropId, length: content.length }); }
      setText(''); setEditing(null); refresh();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  };

  const menu = (c: Comment) => {
    const mine = !!me && c.username === me.username;
    dialog.menu(mine ? '내 댓글' : '댓글', mine ? [
      { text: '취소', style: 'cancel' },
      { text: '수정', icon: 'edit', onPress: () => { setEditing(c); setText(c.content); } },
      {
        text: '삭제',
        style: 'destructive',
        icon: 'trash',
        onPress: () => dialog.alert('댓글을 삭제할까요?', undefined, [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => commentApi.remove(c.id)
              .then(r => { track('comment_deleted', { drop_id: dropId }); return r; })
              .then(() => { if (editing?.id === c.id) { setEditing(null); setText(''); } refresh(); })
              .catch(e => toast(errorMessage(e), 'error')),
          },
        ]),
      },
    ] : [
      { text: '신고하기', style: 'destructive', icon: 'flag', onPress: () => navigation.navigate('Report', { targetType: 'COMMENT', targetId: c.id, userId: c.userId, label: '이 댓글' }) },
      ...(c.userId ? [{ text: '차단하기', style: 'destructive' as const, icon: 'block' as const, onPress: () => blockUser(c.userId!, { name: c.username, source: 'comment' }) }] : []),
      { text: '취소', style: 'cancel' },
    ]);
  };

  return (
    <Sheet dim={0.55} style={{ paddingHorizontal: 0, maxHeight: '78%' }}>
      {/* Figma B 2.4 댓글 (시트): '댓글' SemiBold 16 + 시안 개수 · 34px 아바타 줄 · 아래 회색 알약 입력 + 남색 보내기 (가사는 표시하지 않음) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, marginBottom: 20 }}>
        <T v="bodyLarge" style={{ fontFamily: fonts.semibold, color: '#000000' }}>댓글</T>
        <T v="caption" style={{ color: colors.accent }}>{list.length}</T>
      </View>
      <FlatList
        data={list}
        keyExtractor={c => c.id}
        style={{ flexGrow: 0 }}
        scrollEnabled={contentH > listH + 1}
        onLayout={e => setListH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentH(h)}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 20, paddingBottom: 16 }}
        ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.primary} /> : isError ? <Empty icon="alert" title="댓글을 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="comment" title="아직 댓글이 없어요" desc={`${target} 첫 한마디를 남겨보세요.`} />}
        renderItem={({ item: c }) => {
          const mine = !!me && c.username === me.username;
          return (
            <Press onLongPress={() => menu(c)} trackAs="댓글" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Avatar name={c.username} size={34} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T v="caption" style={{ fontFamily: fonts.medium, color: '#000000' }}>{c.username}</T>
                  {mine ? <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.primarySoft }}><T v="tiny" c="primary">나</T></View> : null}
                  {c.createdAt ? <T v="tiny" style={{ color: '#BBBBBB' }}>{formatRelative(c.createdAt)}</T> : null}
                </View>
                <T v="caption" style={{ lineHeight: 22, color: '#000000' }}>{c.content}</T>
              </View>
              <Press onPress={() => menu(c)} hitSlop={14} accessibilityLabel="댓글 메뉴"><MoreGlyph /></Press>
            </Press>
          );
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 8, height: 38, borderRadius: 99, backgroundColor: '#F7F7F7', borderWidth: editing ? 1 : 0, borderColor: colors.primaryDeep }}>
          <TextInput value={text} onChangeText={t => setText(t.slice(0, 100))} placeholder={editing ? '댓글 수정' : `${target} 한마디`} placeholderTextColor="#BABABA" style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 14 }} onSubmitEditing={submit} returnKeyType="send" selectionColor={colors.primary} />
          {editing ? <Press onPress={() => { setEditing(null); setText(''); }} hitSlop={8} accessibilityLabel="수정 취소"><Icon name="close" size={16} color={colors.ink3} /></Press> : null}
        </View>
        <Press onPress={submit} disabled={!text.trim() || busy} hitSlop={8} accessibilityLabel="보내기" style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: SEND, opacity: text.trim() ? 1 : 0.35, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <SendGlyph />}
        </Press>
      </View>
    </Sheet>
  );
}
