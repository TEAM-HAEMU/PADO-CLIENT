/** 5.3 알림 — 좋아요 · 댓글 · 주변 새 드랍, 모두 읽음 (스택 화면: 프로필 오른쪽 위 종 아이콘으로 연다) */
import React from 'react';
import { SectionList, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationApi } from '@/api/endpoints';
import type { AppNotification } from '@/api/types';
import { Avatar, Empty, Loading, Press, SecondaryButton, T, TopBar } from '@/components/ui';
import { MeGlyph, type MeGlyphName } from '@/components/me/MeIcons';
import { Wave } from '@/components/ui/Wave';
import { errorMessage } from '@/api/errors';
import { toast } from '@/store/toast';
import { useNotifications } from '@/hooks/api';
import { colors, fonts } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';

/** Figma 알림 카드 — 안 읽음: #F2FCFF + 테두리 #D8F5FF / 읽음: 흰 60% */
const UNREAD_BG = '#F2FCFF';
const UNREAD_LINE = '#D8F5FF';
/** Figma 아바타 배지 — 좋아요 #D9316C · 댓글 #47C831 · 새 드랍 #3A31D9 */
const META: Record<string, { glyph: MeGlyphName; tone: string; text: (d: Record<string, unknown>) => string; who: (d: Record<string, unknown>) => string }> = {
  'like-created': { glyph: 'badgeHeart', tone: '#D9316C', text: d => `${(d.likerUsername as string) || '누군가'}님이 내 드랍을 좋아해요`, who: d => (d.likerUsername as string) || '?' },
  'comment-created': { glyph: 'badgeComment', tone: '#47C831', text: d => `${(d.commenterUsername as string) || (d.username as string) || '누군가'}님이 댓글을 남겼어요`, who: d => (d.commenterUsername as string) || (d.username as string) || '?' },
  'dropping-created': { glyph: 'badgeDrop', tone: '#3A31D9', text: () => '근처에 새 드랍이 생겼어요', who: d => (d.username as string) || '?' },
};

/** Figma 간격 — 알림 사이 16 · 섹션 제목과 목록 사이 12 */
const ItemGap = () => <View style={{ height: 16 }} />;
const SectionGap = () => <View style={{ height: 12 }} />;

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
      <Wave scale={1.2} style={{ position: 'absolute', left: -102, right: 0, bottom: -22 }} />
      <TopBar title="알림" onBack={nav.goBack} right={
        data.some(n => !n.readAt)
          ? <Press onPress={() => notificationApi.readAll().then(refresh).catch(e => toast(errorMessage(e), 'error'))} hitSlop={10} style={{ minWidth: 44, alignItems: 'flex-end' }}><T v="captionStrong" c="accent">모두 읽음</T></Press>
          : undefined
      } />
      {isLoading ? <Loading /> : (
        <SectionList
          sections={sections}
          keyExtractor={n => n.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemGap}
          SectionSeparatorComponent={SectionGap}
          ListEmptyComponent={isError ? <Empty icon="alert" title="알림을 불러오지 못했어요" desc={errorMessage(error)} action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : <Empty icon="bell" title="아직 알림이 없어요" desc="내 드랍에 좋아요나 댓글이 달리면 여기에 모여요." />}
          renderSectionHeader={({ section }) => <T v="label" c="ink2" style={{ paddingTop: section.title === sections[0]?.title ? 0 : 18 }}>{section.title}</T>}
          renderItem={({ item: n }) => {
            const m = META[n.eventName] ?? META['dropping-created'];
            const unread = !n.readAt;
            return (
              <Press onPress={() => open(n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: unread ? UNREAD_BG : 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: unread ? UNREAD_LINE : 'transparent' }}>
                <View style={{ width: 62, height: 62 }}>
                  <Avatar name={m.who(n.data)} size={62} />
                  <View style={{ position: 'absolute', left: 47, top: 46, padding: 3.2, borderRadius: 999, backgroundColor: m.tone, borderWidth: 0.64, borderColor: '#EBF9FE' }}>
                    <MeGlyph name={m.glyph} size={8.6} />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T v="bodyStrong" style={{ fontSize: 14, lineHeight: 20, letterSpacing: 0, color: '#000000' }}>{m.text(n.data)}</T>
                  {typeof n.data.content === 'string' ? <T v="micro" c="ink2" numberOfLines={2} style={{ fontFamily: fonts.regular }}>“{n.data.content}”</T> : null}
                  <T v="tiny" c="ink3" style={{ lineHeight: 14 }}>{formatRelative(n.createdAt)}</T>
                </View>
              </Press>
            );
          }}
        />
      )}
    </View>
  );
}
