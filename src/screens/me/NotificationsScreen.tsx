/** 5.3 알림 — 좋아요 · 댓글 · 주변 새 드랍, 모두 읽음 */
import React from 'react';
import { SectionList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationApi } from '@/api/endpoints';
import type { AppNotification } from '@/api/types';
import { Avatar, Empty, Icon, type IconName, Loading, Press, SecondaryButton, T } from '@/components/ui';
import { errorMessage } from '@/api/errors';
import { toast } from '@/store/toast';
import { useNotifications } from '@/hooks/api';
import { colors, glow } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';

const META: Record<string, { icon: IconName; tone: string; text: (d: Record<string, unknown>) => string; who: (d: Record<string, unknown>) => string }> = {
  'like-created': { icon: 'heart', tone: colors.accent, text: d => `${(d.likerUsername as string) || '누군가'}님이 내 드랍을 좋아해요`, who: d => (d.likerUsername as string) || '?' },
  'comment-created': { icon: 'comment', tone: colors.primary, text: d => `${(d.commenterUsername as string) || (d.username as string) || '누군가'}님이 댓글을 남겼어요`, who: d => (d.commenterUsername as string) || (d.username as string) || '?' },
  'dropping-created': { icon: 'pin', tone: colors.positive, text: () => '근처에 새 드랍이 생겼어요', who: d => (d.username as string) || '?' },
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const qc = useQueryClient();
  const { data = [], isLoading, refetch, isRefetching, isError, error } = useNotifications();
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const dayAgo = Date.now() - 86_400_000;
  const sections = [
    { title: '오늘', data: data.filter(n => new Date(n.createdAt).getTime() >= dayAgo) },
    { title: '이전', data: data.filter(n => new Date(n.createdAt).getTime() < dayAgo) },
  ].filter(s => s.data.length);

  const open = async (n: AppNotification) => {
    if (!n.readAt) notificationApi.read(n.id).then(refresh).catch(() => {});
    const dropId = n.data.droppingId as string | undefined;
    if (dropId) nav.navigate('PinPreview', { dropId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <T v="titleLarge">알림</T>
        {data.some(n => !n.readAt) ? <Press onPress={() => notificationApi.readAll().then(refresh).catch(e => toast(errorMessage(e), 'error'))} hitSlop={10}><T v="captionStrong" c="primary">모두 읽음</T></Press> : null}
      </View>
      {isLoading ? <Loading /> : (
        <SectionList
          sections={sections}
          keyExtractor={n => n.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 120, gap: 6 }}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={isError ? <Empty icon="alert" title="알림을 불러오지 못했어요" desc={errorMessage(error)} action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="bell" title="아직 알림이 없어요" desc="내 드랍에 좋아요나 댓글이 달리면 여기에 모여요." />}
          renderSectionHeader={({ section }) => <T v="label" c="ink3" style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: 6 }}>{section.title}</T>}
          renderItem={({ item: n }) => {
            const m = META[n.eventName] ?? META['dropping-created'];
            const unread = !n.readAt;
            return (
              <Press onPress={() => open(n)} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: unread ? 'rgba(14,42,74,0.45)' : 'transparent', borderWidth: unread ? 1 : 0, borderColor: 'rgba(79,209,255,0.18)' }}>
                {unread ? <View style={[{ position: 'absolute', left: 5, top: 32, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }, glow(0.8, 6)]} /> : null}
                <View>
                  <Avatar name={m.who(n.data)} size={44} />
                  <View style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: m.tone, borderWidth: 2, borderColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={m.icon} size={11} color={colors.onPrimary} strokeWidth={2.4} />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="body">{m.text(n.data)}</T>
                  {typeof n.data.content === 'string' ? <T v="caption" c="ink2" numberOfLines={2}>“{n.data.content}”</T> : null}
                  <T v="micro" c="ink3">{formatRelative(n.createdAt)}</T>
                </View>
              </Press>
            );
          }}
        />
      )}
    </View>
  );
}
