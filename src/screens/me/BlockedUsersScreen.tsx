/** 차단한 사용자 — GET /blocks, DELETE /blocks/{id} */
import React from 'react';
import { FlatList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safetyApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Avatar, Empty, IconButton, Loading, Press, T, SecondaryButton } from '@/components/ui';
import { useBlocks } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';
import { track } from '@/services/analytics';

export default function BlockedUsersScreen({ navigation }: RootScreen<'BlockedUsers'>) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useBlocks();
  const [pending, setPending] = React.useState<string | null>(null);
  const unblock = (id: string) => { if (pending) return; setPending(id); track('user_unblocked'); safetyApi.unblock(id).finally(() => setPending(null)).then(() => { qc.invalidateQueries({ queryKey: ['blocks'] }); qc.invalidateQueries({ queryKey: ['nearby'] }); qc.invalidateQueries({ queryKey: ['comments'] }); qc.invalidateQueries({ queryKey: ['commentCount'] }); toast('차단을 해제했어요.'); }).catch(e => toast(errorMessage(e), 'error')); };
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <T v="title">차단한 사용자</T>
      </View>
      {isLoading ? <Loading /> : (
        <FlatList
          data={data}
          keyExtractor={b => b.userId}
          contentContainerStyle={{ padding: 20, gap: 14 }}
          ListEmptyComponent={isError ? <Empty icon="alert" title="차단 목록을 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="block" title="차단한 사용자가 없어요" desc="차단하면 그 사람의 드랍과 댓글이 보이지 않아요." />}
          renderItem={({ item: b }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar uri={b.profileImageUrl} name={b.username} size={44} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{b.username}</T>
                <T v="micro" c="ink3">{formatRelative(b.blockedAt)} 차단</T>
              </View>
              <Press onPress={() => unblock(b.userId)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.line }}><T v="captionStrong" c="ink2">차단 해제</T></Press>
            </View>
          )}
        />
      )}
    </View>
  );
}
