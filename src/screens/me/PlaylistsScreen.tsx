/** 4.5 플리 (탭) — 내 플레이리스트 · 내가 드랍한 플리 · 좋아요한 드랍 */
import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import { Collage } from '@/components/music/Collage';
import type { PlaylistDropSummary } from '@/api/types';
import { Art, Chip, Empty, Icon, Loading, Press, T, PrimaryButton, SecondaryButton } from '@/components/ui';
import { useMyDrops, useMyLikes, useMyPlaylists } from '@/hooks/api';
import { colors, glow } from '@/theme/tokens';
import { formatTotal } from '@/utils/format';
import { useNavigation } from '@react-navigation/native';

export default function PlaylistsScreen() {
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 40 - 14) / 2); // 좌우 여백 20 + 칸 사이 14
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const [tab, setTab] = useState<'mine' | 'dropped' | 'liked'>('mine');
  const { data: lists, isLoading, isError, refetch } = useMyPlaylists();
  const details = useQueries({ queries: (lists ?? []).map(p => ({ queryKey: ['playlist', p.id], queryFn: () => playlistApi.get(p.id) })) });
  const likes = useMyLikes().data ?? [];
  const droppedPlaylists = (useMyDrops().data ?? []).filter((d): d is PlaylistDropSummary => d.type === 'PLAYLIST');
  const [first, ...rest] = lists ?? [];
  const firstD = details[0]?.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 18 }}>
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="titleLarge">플리</T>
          <Press onPress={() => nav.navigate('NewPlaylist')} accessibilityLabel="새 플레이리스트" style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.45, 14)]}>
            <Icon name="plus" size={20} color={colors.onPrimary} />
          </Press>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="내 플리" active={tab === 'mine'} onPress={() => setTab('mine')} />
          <Chip label="드랍한 플리" active={tab === 'dropped'} onPress={() => setTab('dropped')} />
          <Chip label="좋아요한 드랍" active={tab === 'liked'} onPress={() => setTab('liked')} />
        </View>

        {tab === 'mine' ? (
          isLoading ? <Loading style={{ height: 200 }} /> : isError ? (
            <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} />
          ) : !first ? (
            <Empty icon="playlist" title="아직 플레이리스트가 없어요" desc="좋아하는 곡을 모아 두면 지금 있는 곳에 플리째 드랍할 수 있어요." action={<PrimaryButton label="첫 플레이리스트 만들기" icon="plus" onPress={() => nav.navigate('NewPlaylist')} style={{ alignSelf: 'stretch', marginTop: 8 }} />} />
          ) : (
            <>
              <Press onPress={() => nav.navigate('PlaylistDetail', { playlistId: first.id })} style={{ flexDirection: 'row', gap: 18, padding: 20, borderRadius: 26, backgroundColor: '#0E2A5A', borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
                <View style={glow(0.35, 24)}><Collage images={firstD?.songs.map(s => s.albumImagePath) ?? [first.albumImageUrl]} size={130} radius={18} /></View>
                <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 4 }}>
                  <View style={{ gap: 4 }}>
                    <T v="micro" c="primary">최근 만든 플리</T>
                    <T v="title" numberOfLines={2}>{first.name}</T>
                    <T v="caption" c="ink2">{firstD ? `${firstD.songs.length}곡 · ${formatTotal(firstD.songs.reduce((a, s) => a + s.duration, 0))}` : ' '}</T>
                  </View>
                  <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary }}>
                    <Icon name="play" size={14} color={colors.onPrimary} />
                    <T v="captionStrong" c="onPrimary">열기</T>
                  </View>
                </View>
              </Press>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                {rest.map((p, i) => {
                  const d = details[i + 1]?.data;
                  return (
                    <Press key={p.id} onPress={() => nav.navigate('PlaylistDetail', { playlistId: p.id })} style={{ width: cell, gap: 8 }}>
                      <Collage images={d?.songs.map(s => s.albumImagePath) ?? [p.albumImageUrl]} size={cell} radius={20} />
                      <View>
                        <T v="bodyStrong" numberOfLines={1}>{p.name}</T>
                        <T v="caption" c="ink3">{d ? `${d.songs.length}곡` : ' '}</T>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </>
          )
        ) : tab === 'dropped' ? (
          droppedPlaylists.length ? (
            <View style={{ gap: 6 }}>
              {droppedPlaylists.map(d => (
                <Press key={d.droppingId} onPress={() => nav.navigate('PlaylistDrop', { dropId: d.droppingId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                  <Art uri={d.firstAlbumImageUrl} size={52} radius={12} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong" numberOfLines={1}>{d.playlistName}</T>
                    <T v="caption" c="ink2" numberOfLines={1}>{d.songIds.length}곡 · {d.address}</T>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.ink3} />
                </Press>
              ))}
            </View>
          ) : (
            <Empty icon="playlist" title="아직 드랍한 플리가 없어요" desc="+ 버튼 → 플레이리스트로 지금 있는 곳에 플리를 남겨보세요." />
          )
        ) : likes.length ? (
          <View style={{ gap: 6 }}>
            {likes.map(l => (
              <Press key={l.droppingId} onPress={() => nav.navigate(l.droppingType === 'VOTE' ? 'VoteDrop' : l.droppingType === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: l.droppingId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Art uri={l.imageUrl} size={52} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={1}>{l.title ?? l.topic ?? l.playlistName}</T>
                  <T v="caption" c="ink2" numberOfLines={1}>{l.droppingType === 'MUSIC' ? l.artist : l.droppingType === 'VOTE' ? '투표' : '플레이리스트'} · {l.address}</T>
                </View>
                <Icon name="heartFill" size={16} color={colors.primary} />
              </Press>
            ))}
          </View>
        ) : (
          <Empty icon="heart" title="좋아요한 드랍이 없어요" desc="주변에 드랍이 보이면 좋아요로 모아둘 수 있어요." />
        )}
      </ScrollView>
    </View>
  );
}
