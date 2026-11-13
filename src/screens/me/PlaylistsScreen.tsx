/** 4.5 플리 (탭) — 내 플레이리스트(전체) · 좋아요한 드랍 · 내가 드랍한 플리(바다에 떨어뜨린) (Figma 'B 4.3 플리 (탭)') */
import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import { Collage } from '@/components/music/Collage';
import type { PlaylistDropSummary } from '@/api/types';
import { Art, Chip, Empty, Loading, Press, T, PrimaryButton, SecondaryButton } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { BgWave } from '@/components/detail/parts';
import { useMyDrops, useMyLikes, useMyPlaylists } from '@/hooks/api';
import { colors, fonts } from '@/theme/tokens';
import { useNavigation } from '@react-navigation/native';

type Tab = 'mine' | 'liked' | 'dropped';
const TABS: [Tab, string][] = [['mine', '전체'], ['liked', '좋아요'], ['dropped', '바다에 떨어뜨린']];

/** 2열 격자 한 칸 — 정사각 커버(r18.9) + 이름 16 + 보조 12 */
function Cell({ size, cover, title, sub, onPress }: { size: number; cover: React.ReactNode; title: string; sub: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} trackAs="플레이리스트 칸" style={{ width: size, gap: 10 }}>
      {cover}
      <View style={{ gap: 2 }}>
        <T numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.32, color: '#090909' }}>{title}</T>
        <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.ink3 }}>{sub}</T>
      </View>
    </Press>
  );
}

export default function PlaylistsScreen() {
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - 48 - 14) / 2); // 좌우 여백 24 + 칸 사이 14
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const [tab, setTab] = useState<Tab>('mine');
  const { data: lists, isLoading, isError, refetch } = useMyPlaylists();
  const details = useQueries({ queries: (lists ?? []).map(p => ({ queryKey: ['playlist', p.id], queryFn: () => playlistApi.get(p.id) })) });
  const likes = useMyLikes().data ?? [];
  const droppedPlaylists = (useMyDrops().data ?? []).filter((d): d is PlaylistDropSummary => d.type === 'PLAYLIST');
  const grid = { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 20 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <BgWave />
      <View style={{ paddingTop: insets.top, paddingHorizontal: 14 }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* 탭 화면이라 뒤로 버튼 자리는 비워 둔다 */}
          <View style={{ width: 44 }} />
          <T v="navTitle">플레이리스트</T>
          <Press onPress={() => nav.navigate('NewPlaylist')} accessibilityLabel="새 플레이리스트" hitSlop={7} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="addCircle" size={30} color="#55B0FF" />
          </Press>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 120, gap: 24 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {TABS.map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
        </View>

        {tab === 'mine' ? (
          isLoading ? <Loading style={{ height: 200 }} /> : isError ? (
            <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} />
          ) : !lists?.length ? (
            <Empty icon="playlist" title="아직 플레이리스트가 없어요" desc="좋아하는 곡을 모아 두면 지금 있는 곳에 플리째 드랍할 수 있어요." action={<PrimaryButton label="첫 플레이리스트 만들기" icon="plus" onPress={() => nav.navigate('NewPlaylist')} style={{ alignSelf: 'stretch', marginTop: 8 }} />} />
          ) : (
            <View style={grid}>
              {lists.map((p, i) => {
                const d = details[i]?.data;
                return <Cell key={p.id} size={cell} cover={<Collage images={d?.songs.map(s => s.albumImagePath) ?? [p.albumImageUrl]} size={cell} radius={18.9} />} title={p.name} sub={d ? `${d.songs.length}곡` : ' '} onPress={() => nav.navigate('PlaylistDetail', { playlistId: p.id })} />;
              })}
            </View>
          )
        ) : tab === 'dropped' ? (
          droppedPlaylists.length ? (
            <View style={grid}>
              {droppedPlaylists.map(d => (
                <Cell key={d.droppingId} size={cell} cover={<Art uri={d.firstAlbumImageUrl} size={cell} radius={18.9} />} title={d.playlistName} sub={`${d.songIds.length}곡 · ${d.address}`} onPress={() => nav.navigate('PlaylistDrop', { dropId: d.droppingId, source: 'playlists' })} />
              ))}
            </View>
          ) : (
            <Empty icon="playlist" title="아직 드랍한 플리가 없어요" desc="+ 버튼 → 플레이리스트로 지금 있는 곳에 플리를 남겨보세요." />
          )
        ) : likes.length ? (
          <View style={grid}>
            {likes.map(l => (
              <Cell key={l.droppingId} size={cell} cover={<Art uri={l.imageUrl} size={cell} radius={18.9} />} title={l.title ?? l.topic ?? l.playlistName ?? ''} sub={`${l.droppingType === 'MUSIC' ? l.artist ?? '' : l.droppingType === 'VOTE' ? '투표' : '플레이리스트'} · ${l.address}`} onPress={() => nav.navigate(l.droppingType === 'VOTE' ? 'VoteDrop' : l.droppingType === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: l.droppingId, source: 'playlists' })} />
            ))}
          </View>
        ) : (
          <Empty icon="heart" title="좋아요한 드랍이 없어요" desc="주변에 드랍이 보이면 좋아요로 모아둘 수 있어요." />
        )}
      </ScrollView>
    </View>
  );
}
