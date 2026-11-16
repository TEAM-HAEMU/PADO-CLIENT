/** 차단한 사용자 — GET /blocks, DELETE /blocks/{id} */
import React from 'react';
import { FlatList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safetyApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Avatar, Empty, Loading, Press, T, SecondaryButton, TopBar } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useBlocks } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
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
      <Wave scale={1.2} style={{ position: 'absolute', left: -102, right: 0, bottom: -22 }} />
      <TopBar title="차단한 사용자" onBack={navigation.goBack} />
      {isLoading ? <Loading /> : (
        <FlatList
          data={data}
          keyExtractor={b => b.userId}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 32 }}
          ListEmptyComponent={isError ? <Empty icon="alert" title="차단 목록을 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="block" title="차단한 사용자가 없어요" desc="차단하면 그 사람의 드랍과 댓글이 보이지 않아요." />}
          ListFooterComponent={data.length ? <T v="captionStrong" style={{ fontFamily: fonts.regular, color: '#C1C6D2' }}>차단하면 그 사람의 드랍과 댓글이 보이지 않아요.</T> : undefined}
          renderItem={({ item: b }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 6, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Avatar uri={b.profileImageUrl} name={b.username} size={62} />
              <View style={{ flex: 1, gap: 4 }}>
                <T v="bodyStrong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 20, letterSpacing: 0, color: '#000000' }}>{b.username}</T>
                <T v="micro" c="ink2" style={{ fontFamily: fonts.regular }}>{formatRelative(b.blockedAt)} 차단</T>
              </View>
              {/* Figma 'tag' 켜짐 (h28) */}
              <Press onPress={() => unblock(b.userId)} style={{ height: 28, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(43,156,255,0.8)', alignItems: 'center', justifyContent: 'center' }}>
                <T v="caption" c="primarySoft" style={{ fontFamily: fonts.medium, letterSpacing: -0.24 }}>차단 해제</T>
              </Press>
            </View>
          )}
        />
      )}
    </View>
  );
}
