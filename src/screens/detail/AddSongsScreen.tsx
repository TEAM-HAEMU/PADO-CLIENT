/**
 * 4.3 곡 추가 (시트) — 검색 / 주변 드랍 / 좋아요 탭. (Figma 'B 4.5 곡 추가 (시트)')
 *  · { playlistId } : 선택한 곡을 POST /playlists/{id}/songs
 *  · { picker }     : 투표 후보·새 플리 곡 고르기 → useDraft.picked로 돌려줌
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { dropApi, playlistApi } from '@/api/endpoints';
import { ApiError, errorMessage } from '@/api/errors';
import { isMusicDetail, type DropDetail, type DropSummary, type Song } from '@/api/types';
import { Empty, Press, PrimaryButton, SecondaryButton, T } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { DiscRow, SheetTitle } from '@/components/detail/parts';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Sheet } from '@/components/ui/Sheet';
import { qk, useMyLikes, useSongSearch } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import { useDropLock } from '@/hooks/useDropLock';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
import { resolveLikedSongIds } from '@/utils/playlists';
import { track } from '@/services/analytics';

type Tab = 'search' | 'nearby' | 'liked';
/** 좋아요 탭에서 한 번에 상세를 받는 드랍 수 · 동시 요청 수 — 끝까지 내리면 다음 묶음 */
const LIKED_BATCH = 30;
const LIKED_CONCURRENCY = 4;
const DETAIL_STALE = 5 * 60_000;
/** 드랍이 없어졌다는 응답(지워짐·차단 등 4xx) — 다시 요청해도 같으니 다음 묶음에서 뺀다. 시간 초과·과다 요청은 다시 시도 */
const dropGone = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
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
  // 좋아요한 음악 드랍의 곡 — 좋아요 목록 응답엔 곡 ID가 없어 드랍 상세로 찾는다(백엔드에 songId 요청 중).
  // 응답·캐시(주변·내 드랍·상세)로 알 수 있으면 요청하지 않고, 나머지는 LIKED_BATCH개씩 동시 LIKED_CONCURRENCY개로
  const likesQ = useMyLikes();
  const likedMusic = useMemo(() => (likesQ.data ?? []).filter(l => l.droppingType === 'MUSIC'), [likesQ.data]);
  const [likedRound, setLikedRound] = useState(0);
  // 없다고 확인된 드랍(다시 요청 안 함) · 네트워크·5xx로 실패한 드랍(다음 묶음의 맨 뒤로)
  const likedGone = useRef(new Set<string>());
  const likedDeferred = useRef(new Set<string>());
  const likedQ = useQuery({
    queryKey: ['likedSongIds', likedMusic.map(l => l.droppingId), likedRound],
    enabled: tab === 'liked' && likedMusic.length > 0,
    staleTime: DETAIL_STALE,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const fromList = new Map(likedMusic.map(l => [l.droppingId, l.songId]));
      const summaries = [['nearby'], qk.myDrops].flatMap(key => qc.getQueriesData<DropSummary[]>({ queryKey: key }).flatMap(([, v]) => (Array.isArray(v) ? v : [])));
      const known = (id: string) => {
        const detail = qc.getQueryData<DropDetail>(qk.drop(id));
        if (detail && isMusicDetail(detail)) return detail.songId;
        const sum = summaries.find(x => x.droppingId === id);
        return fromList.get(id) ?? (sum?.type === 'MUSIC' ? sum.songId : null);
      };
      const fetchSongId = (id: string) => qc.fetchQuery({ queryKey: qk.drop(id), queryFn: () => dropApi.get(id), staleTime: DETAIL_STALE }).then(d => (isMusicDetail(d) ? d.songId : null));
      const r = await resolveLikedSongIds(likedMusic.map(l => l.droppingId), known, fetchSongId, { limit: LIKED_BATCH, concurrency: LIKED_CONCURRENCY, gone: likedGone.current, deferred: likedDeferred.current, isGone: dropGone });
      r.goneIds.forEach(id => { likedGone.current.add(id); likedDeferred.current.delete(id); });
      r.songIds.forEach((_, id) => likedDeferred.current.delete(id));
      r.failedIds.forEach(id => likedDeferred.current.add(id));
      return r;
    },
  });
  const likedSeen = new Set<string>();
  const liked = likedMusic.map(l => { const id = likedQ.data?.songIds.get(l.droppingId); return id ? asSong(id, l.title ?? '', l.artist ?? '', l.imageUrl) : null; }).filter((s): s is Song => !!s && !likedSeen.has(s.id) && !!likedSeen.add(s.id));
  const likedLoading = likesQ.isLoading || (likedQ.isFetching && !liked.length);
  const likedMore = !!likedQ.data?.remaining && !likedQ.isFetching;
  const likedFailed = likedQ.data?.failed ?? 0;
  // 다시 시도는 실패한 것부터 (맨 뒤로 미뤄 둔 것을 앞으로)
  const retryLiked = () => { likedDeferred.current.clear(); likedQ.refetch(); };
  // 목록 끝: 받는 중 표시 / 일부 실패 → 다시 시도 / 남은 좋아요 → 더 불러오기 (끝까지 내려도 자동으로 불러온다)
  const footerLink = (label: string, onPress: () => void, trackAs: string) => (
    <Press onPress={onPress} trackAs={trackAs} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <T style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.ink3 }}>{label}</T>
    </Press>
  );
  const likedFooter = tab !== 'liked' || !liked.length ? undefined
    : likedQ.isFetching ? <ActivityIndicator color={colors.primary} />
    : likedFailed ? footerLink(`${likedFailed}곡을 불러오지 못했어요 · 다시 시도`, retryLiked, '좋아요 곡 다시 불러오기')
    : likedMore ? footerLink('더 불러오기', () => setLikedRound(r => r + 1), '좋아요 곡 더 불러오기')
    : undefined;

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
          ListEmptyComponent={tab === 'search' && !query ? <Empty icon="search" title="어떤 곡을 담을까요?" /> : (tab === 'search' && search.isFetching) || (tab === 'liked' && likedLoading) ? <ActivityIndicator color={colors.primary} /> : tab === 'search' && search.isError ? <Empty icon="alert" title="검색하지 못했어요" desc={errorMessage(search.error)} /> : tab === 'liked' && (likesQ.isError || likedQ.isError || likedFailed) ? (
            <Empty icon="alert" title="좋아요한 곡을 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => (likesQ.isError ? likesQ.refetch() : retryLiked())} style={{ marginTop: 8 }} />} />
          ) : <Empty title={tab === 'liked' ? '좋아요한 음악 드랍이 없어요' : tab === 'nearby' ? '주변에 음악 드랍이 없어요' : '검색 결과가 없어요'} />}
          ListFooterComponent={likedFooter}
          onEndReached={tab === 'liked' && likedMore ? () => setLikedRound(r => r + 1) : undefined}
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
