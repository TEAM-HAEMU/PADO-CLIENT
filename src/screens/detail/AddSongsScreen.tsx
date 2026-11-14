/**
 * 4.3 곡 추가 (시트) — 검색 / 주변 드랍 / 좋아요 탭. (Figma 'B 4.5 곡 추가 (시트)')
 *  · { playlistId } : 선택한 곡을 POST /playlists/{id}/songs
 *  · { picker }     : 투표 후보·새 플리 곡 고르기 → useDraft.picked로 돌려줌
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { dropApi, playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { isMusicDetail, type DropSummary, type Song } from '@/api/types';
import { Empty, Press, PrimaryButton, T } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { DiscRow, SheetTitle } from '@/components/detail/parts';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Sheet } from '@/components/ui/Sheet';
import { useMyLikes, useSongSearch } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import { useDropLock } from '@/hooks/useDropLock';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
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

  // 주변 드랍 곡 — 재생 반경 밖(잠긴 드랍)의 곡은 보이지 않는다
  const lockOf = useDropLock();
  const nearby = useMemo(() => {
    const all = qc.getQueriesData<DropSummary[]>({ queryKey: ['nearby'] }).flatMap(([, v]) => v ?? []);
    const seen = new Set<string>();
    return all.filter(d => d.type === 'MUSIC' && !lockOf(d).locked).map(d => d.type === 'MUSIC' ? asSong(d.songId, d.title, d.artist, d.albumImageUrl) : null).filter((s): s is Song => !!s && !seen.has(s.id) && !!seen.add(s.id));
  }, [qc, lockOf]);
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

  const desc = playlistId ? `${plName ? `${plName} · ` : ''}지금 ${p.existing.length}곡` : 'picker' in p && p.picker === 'vote' ? '투표 후보는 2~5곡이에요' : '플레이리스트에 담을 곡을 골라요';
  // 오른쪽 위 아이콘 두 개 = 좋아요 / 주변 드랍 목록. 다시 누르거나 검색칸을 누르면 검색으로
  const tabIcon = (k: Tab, glyph: 'heart' | 'drop', label: string) => (
    <Press key={k} onPress={() => setTab(tab === k ? 'search' : k)} accessibilityLabel={label} accessibilityState={{ selected: tab === k }} hitSlop={6}>
      <Glyph name={glyph} color={tab === k ? colors.accent : '#E9E9E9'} />
    </Press>
  );

  return (
    <Sheet style={{ height: '82%', paddingHorizontal: 26 }}>
      <View style={{ gap: 20, flex: 1 }}>
        <SheetTitle title="곡 추가" desc={desc} right={<View style={{ flexDirection: 'row', gap: 4 }}>{tabIcon('liked', 'heart', '좋아요')}{tabIcon('nearby', 'drop', '주변 드랍')}</View>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, borderColor: '#55B0FF' }}>
          <Glyph name="search" size={15} color="#55B0FF" />
          <TextInput value={q} onChangeText={setQ} onFocus={() => setTab('search')} placeholder="곡을 검색하세요" placeholderTextColor="#B0B0B2" selectionColor={colors.primary} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, letterSpacing: -0.065 }} autoFocus />
          <ServiceGlyph service="spotify" size={14} />
        </View>
        {tab !== 'search' ? <T style={{ marginTop: -8, fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.ink3 }}>{tab === 'liked' ? '좋아요한 음악 드랍' : '주변 드랍'}</T> : null}
        <FlatList
          style={{ flex: 1, marginHorizontal: -4 }}
          data={data}
          keyExtractor={s => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
          ListEmptyComponent={tab === 'search' && !query ? <Empty icon="search" title="어떤 곡을 담을까요?" /> : search.isFetching || likedLoading ? <ActivityIndicator color={colors.primary} /> : tab === 'search' && search.isError ? <Empty icon="alert" title="검색하지 못했어요" desc={errorMessage(search.error)} /> : <Empty title={tab === 'liked' ? '좋아요한 음악 드랍이 없어요' : tab === 'nearby' ? '주변에 음악 드랍이 없어요' : '검색 결과가 없어요'} />}
          renderItem={({ item: s }) => {
            const inList = existing.has(s.id);
            const on = picked.some(x => x.id === s.id);
            return (
              <DiscRow
                height={67}
                art={s.albumImagePath}
                title={s.title}
                artist={inList ? '이미 담긴 곡' : s.artist}
                duration={s.duration ? formatDuration(s.duration) : undefined}
                dim={inList}
                active={on}
                onPress={() => toggle(s)}
                trackAs="담을 곡 고르기"
                right={<Glyph name="checkCircle" color={on || inList ? colors.accent : '#DEDEDE'} />}
              />
            );
          }}
        />
        {/* 시안에는 없지만 고른 곡을 담으려면 필요 — 고른 곡이 있을 때만 */}
        {picked.length ? <PrimaryButton label={`완료 · ${picked.length}곡`} onPress={done} loading={busy} /> : null}
      </View>
    </Sheet>
  );
}
