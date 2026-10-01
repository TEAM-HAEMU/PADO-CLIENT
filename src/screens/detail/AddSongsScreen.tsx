/**
 * 4.3 곡 추가 (시트) — 검색 / 주변 드랍 / 좋아요 탭.
 *  · { playlistId } : 선택한 곡을 POST /playlists/{id}/songs
 *  · { picker }     : 투표 후보·새 플리 곡 고르기 → useDraft.picked로 돌려줌
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { dropApi, playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { isMusicDetail, type DropSummary, type Song } from '@/api/types';
import { Art, Empty, Icon, Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Sheet } from '@/components/ui/Sheet';
import { useMyLikes, useSongSearch } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts, glow } from '@/theme/tokens';
import { track } from '@/services/analytics';

type Tab = 'search' | 'nearby' | 'liked';
const asSong = (id: string, title: string, artist: string, art: string | null): Song => ({ id, title, artist, duration: 0, albumImagePath: art, links: { spotify: null, youtubeMusic: null } });

export default function AddSongsScreen({ navigation, route }: RootScreen<'AddSongs'>) {
  const p = route.params;
  const playlistId = 'playlistId' in p ? p.playlistId : null;
  const limit = 'picker' in p && p.picker === 'vote' ? 5 : 50;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const search = useSongSearch(tab === 'search' ? query : '');
  const [picked, setPicked] = useState<Song[]>([]);
  const [busy, setBusy] = useState(false);
  const existing = new Set(p.existing);
  const plName = playlistId ? qc.getQueryData<{ name: string }>(['playlist', playlistId])?.name : undefined;

  const nearby = useMemo(() => {
    const all = qc.getQueriesData<DropSummary[]>({ queryKey: ['nearby'] }).flatMap(([, v]) => v ?? []);
    const seen = new Set<string>();
    return all.filter(d => d.type === 'MUSIC').map(d => d.type === 'MUSIC' ? asSong(d.songId, d.title, d.artist, d.albumImageUrl) : null).filter((s): s is Song => !!s && !seen.has(s.id) && !!seen.add(s.id));
  }, [qc]);
  const likes = useMyLikes().data ?? [];
  const likedMusic = likes.filter(l => l.droppingType === 'MUSIC');
  const likedDetails = useQueries({ queries: tab === 'liked' ? likedMusic.map(l => ({ queryKey: ['drop', l.droppingId], queryFn: () => dropApi.get(l.droppingId) })) : [] });
  const likedSeen = new Set<string>();
  const liked = likedMusic.map((l, i) => { const d = likedDetails[i]?.data; return d && isMusicDetail(d) ? asSong(d.songId, l.title ?? '', l.artist ?? '', l.imageUrl) : null; }).filter((s): s is Song => !!s && !likedSeen.has(s.id) && !!likedSeen.add(s.id));
  const likedLoading = tab === 'liked' && likedDetails.some(x => x.isLoading);

  const data = tab === 'search' ? search.data ?? [] : tab === 'nearby' ? nearby : liked;
  const toggle = (s: Song) => {
    if (existing.has(s.id)) return;
    setPicked(prev => prev.some(x => x.id === s.id) ? prev.filter(x => x.id !== s.id) : prev.length + (playlistId ? 0 : p.existing.length) >= limit ? (toast(`최대 ${limit}곡까지 고를 수 있어요.`), prev) : [...prev, s]);
  };

  const submitting = React.useRef(false);
  const done = async () => {
    if (!picked.length) return navigation.goBack();
    if (playlistId) {
      if (submitting.current) return;
      submitting.current = true;
      setBusy(true);
      try {
        try {
          await playlistApi.addSongs(playlistId, picked.map(s => s.id));
        } catch (e) {
          // 이미 담긴 곡이 섞여 있으면(P3) 한 곡 때문에 전체가 실패하지 않게, 최신 목록을 받아 빼고 다시 담는다
          if ((e as { code?: string }).code !== 'P3') throw e;
          const fresh = await playlistApi.get(playlistId);
          const have = new Set(fresh.songs.map(x => x.id));
          const rest = picked.filter(x => !have.has(x.id));
          if (rest.length) await playlistApi.addSongs(playlistId, rest.map(x => x.id));
        }
        qc.invalidateQueries({ queryKey: ['playlist', playlistId] }); qc.invalidateQueries({ queryKey: ['playlists'] });
        track('playlist_songs_added', { playlist_id: playlistId, count: picked.length, source: 'add_songs' });
        toast(`${picked.length}곡을 담았어요.`, 'success');
        navigation.goBack();
      } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); submitting.current = false; }
    } else {
      useDraft.getState().set({ picked });
      navigation.goBack();
    }
  };

  return (
    <Sheet style={{ height: '82%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title">곡 추가</T>
          <T v="caption" c="ink2">{playlistId ? `${plName ? `${plName} · ` : ''}지금 ${p.existing.length}곡` : 'picker' in p && p.picker === 'vote' ? '투표 후보는 2~5곡이에요' : '플레이리스트에 담을 곡을 골라요'}</T>
        </View>
        <Press onPress={done} disabled={busy} style={[{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.primary }, glow(0.4, 12)]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <T v="captionStrong" c="onPrimary">완료{picked.length ? ` · ${picked.length}곡` : ''}</T>}
        </Press>
      </View>
      <View style={{ flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.page, gap: 4, marginBottom: 12 }}>
        {([['search', 'search', '검색'], ['nearby', 'pin', '주변 드랍'], ['liked', 'heart', '좋아요']] as const).map(([k, ic, l]) => (
          <Press key={k} onPress={() => setTab(k)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, backgroundColor: tab === k ? colors.card2 : 'transparent' }}>
            <Icon name={ic} size={14} color={tab === k ? colors.primary : colors.ink3} />
            <T v="captionStrong" c={tab === k ? 'ink' : 'ink3'}>{l}</T>
          </Press>
        ))}
      </View>
      {tab === 'search' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 12, height: 48, borderRadius: 16, backgroundColor: colors.page, borderWidth: 1.5, borderColor: colors.primary, marginBottom: 8 }}>
          <Icon name="search" size={18} color={colors.primary} />
          <TextInput value={q} onChangeText={setQ} placeholder="곡·아티스트 검색" placeholderTextColor={colors.ink3} selectionColor={colors.primary} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 }} autoFocus />
          <ServiceGlyph service="spotify" size={16} />
        </View>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={s => s.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 12, paddingVertical: 6, paddingBottom: 20 }}
        ListEmptyComponent={tab === 'search' && !query ? <Empty icon="search" title="어떤 곡을 담을까요?" /> : search.isFetching || likedLoading ? <ActivityIndicator color={colors.primary} /> : tab === 'search' && search.isError ? <Empty icon="alert" title="검색하지 못했어요" desc={errorMessage(search.error)} /> : <Empty title={tab === 'liked' ? '좋아요한 음악 드랍이 없어요' : tab === 'nearby' ? '주변에 음악 드랍이 없어요' : '검색 결과가 없어요'} />}
        renderItem={({ item: s }) => {
          const inList = existing.has(s.id);
          const on = picked.some(x => x.id === s.id);
          return (
            <Press onPress={() => toggle(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
              <Art uri={s.albumImagePath} size={50} radius={12} dim={inList} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong" c={inList ? 'ink3' : 'ink'} numberOfLines={1}>{s.title}</T>
                <T v="caption" c="ink3" numberOfLines={1}>{inList ? '이미 담긴 곡' : s.artist}</T>
              </View>
              {inList ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.card2 }}><T v="micro" c="ink3">담김</T></View>
              ) : (
                <View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: colors.line }, on ? glow(0.45, 10) : null]}>
                  <Icon name={on ? 'check' : 'plus'} size={16} color={on ? colors.onPrimary : colors.ink} strokeWidth={on ? 2.4 : 1.8} />
                </View>
              )}
            </Press>
          );
        }}
      />
    </Sheet>
  );
}
