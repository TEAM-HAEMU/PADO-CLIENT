/** 2.4 댓글 (시트) — 목록·작성(100자)·내 댓글 수정/삭제·타인 댓글 신고 */
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { commentApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { Comment } from '@/api/types';
import { Avatar, Empty, Icon, Press, SecondaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import { qk, useComments, useMe } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';

export default function CommentsScreen({ navigation, route }: RootScreen<'Comments'>) {
  const { dropId } = route.params;
  const qc = useQueryClient();
  const me = useMe().data;
  const { data: list = [], isLoading, isError, refetch } = useComments(dropId);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => { qc.invalidateQueries({ queryKey: qk.comments(dropId) }); qc.invalidateQueries({ queryKey: ['commentCount', dropId] }); };
  const submit = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      if (editing) await commentApi.update(editing.id, content);
      else await commentApi.create(dropId, content);
      setText(''); setEditing(null); refresh();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  };

  const menu = (c: Comment) => {
    const mine = !!me && c.username === me.username;
    dialog.menu(mine ? '내 댓글' : '댓글', mine ? [
      { text: '취소', style: 'cancel' },
      { text: '수정', onPress: () => { setEditing(c); setText(c.content); } },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => dialog.alert('댓글을 삭제할까요?', undefined, [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => commentApi.remove(c.id)
              .then(() => { if (editing?.id === c.id) { setEditing(null); setText(''); } refresh(); })
              .catch(e => toast(errorMessage(e), 'error')),
          },
        ]),
      },
    ] : [
      { text: '신고하기', onPress: () => navigation.navigate('Report', { targetType: 'COMMENT', targetId: c.id, label: '이 댓글' }) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  return (
    <Sheet dim={0.55} style={{ paddingHorizontal: 0, maxHeight: '78%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 12 }}>
        <T v="headline">댓글</T>
        <T v="number" c="primary">{list.length}</T>
      </View>
      <FlatList
        data={list}
        keyExtractor={c => c.id}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 18, paddingBottom: 12 }}
        ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.primary} /> : isError ? <Empty icon="alert" title="댓글을 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="comment" title="아직 댓글이 없어요" desc="이 곡에 첫 한마디를 남겨보세요." />}
        renderItem={({ item: c }) => {
          const mine = !!me && c.username === me.username;
          return (
            <Press onLongPress={() => menu(c)} style={{ flexDirection: 'row', gap: 10 }}>
              <Avatar name={c.username} size={34} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T v="captionStrong">{c.username}</T>
                  {mine ? <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.primarySoft }}><T v="micro" c="primary">나</T></View> : null}
                </View>
                <T v="body">{c.content}</T>
              </View>
              <Press onPress={() => menu(c)} hitSlop={14} accessibilityLabel="댓글 메뉴"><Icon name="more" size={18} color={colors.ink3} /></Press>
            </Press>
          );
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Avatar uri={me?.profileImageUrl} name={me?.username} size={32} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, height: 44, borderRadius: 22, backgroundColor: colors.page, borderWidth: 1, borderColor: editing ? colors.primary : colors.line }}>
          <TextInput value={text} onChangeText={t => setText(t.slice(0, 100))} placeholder={editing ? '댓글 수정' : '이 곡에 한마디'} placeholderTextColor={colors.ink3} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 }} onSubmitEditing={submit} returnKeyType="send" selectionColor={colors.primary} />
          {editing ? <Press onPress={() => { setEditing(null); setText(''); }} hitSlop={8} accessibilityLabel="수정 취소" style={{ marginRight: 6 }}><Icon name="close" size={16} color={colors.ink3} /></Press> : null}
          <Press onPress={submit} disabled={!text.trim() || busy} hitSlop={8} accessibilityLabel="보내기" style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: text.trim() ? colors.primary : colors.card2, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Icon name="send" size={15} color={text.trim() ? colors.onPrimary : colors.ink3} />}
          </Press>
        </View>
      </View>
    </Sheet>
  );
}
