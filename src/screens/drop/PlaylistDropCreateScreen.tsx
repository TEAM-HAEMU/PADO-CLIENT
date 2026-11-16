/** 3.5 플리 드랍 만들기 — 내 플레이리스트 선택 또는 새로 구성 (명세: playlistId | playlistName+songIds 1~50) · Figma '3.4 플리 드랍' */
import React, { useCallback, useState, useEffect } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import type { Song } from '@/api/types';
import { RadioGlyph } from '@/components/drop/glyphs';
import { AddLink, DropTopBar } from '@/components/drop/parts';
import { Collage } from '@/components/music/Collage';
import { Empty, Loading, Press, PrimaryButton, T, SecondaryButton } from '@/components/ui';
import { Field } from '@/components/ui/Field';
import { Wave } from '@/components/ui/Wave';
import { useMyPlaylists } from '@/hooks/api';
import { useFocusedInputScroll } from '@/hooks/useFocusedInputScroll';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { formatTotal } from '@/utils/format';

/** 플리 카드 (Figma 높이 80 · 모서리 4) — 고르면 옅은 하늘 바탕 + 시안 동그라미 */
const card = (on: boolean): ViewStyle => ({
  minHeight: 80, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 4, borderWidth: 1,
  backgroundColor: on ? 'rgba(185,237,255,0.2)' : 'rgba(255,255,255,0.2)',
  borderColor: on ? '#DBF6FF' : '#E1F7FF',
  shadowColor: '#4FD1FF', shadowOpacity: 0.1, shadowRadius: on ? 6 : 10, shadowOffset: { width: 0, height: 0 },
});
const NAME = { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19.6, letterSpacing: -0.28, color: '#050916' } as const;
const META = { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, letterSpacing: -0.06, color: '#B9B9B9' } as const;

export default function PlaylistDropCreateScreen({ navigation }: RootScreen<'PlaylistDropCreate'>) {
  const insets = useSafeAreaInsets();
  const scroll = useFocusedInputScroll();
  const { playlist, picked, set } = useDraft();
  const { data: mine, isLoading, isError, refetch } = useMyPlaylists();
  const details = useQueries({ queries: (mine ?? []).map(p => ({ queryKey: ['playlist', p.id], queryFn: () => playlistApi.get(p.id) })) });
  const [newName, setNewName] = useState(playlist?.kind === 'new' ? playlist.name : '');
  const [newSongs, setNewSongs] = useState<Song[]>(playlist?.kind === 'new' ? playlist.songs : []);
  const [mode, setMode] = useState<'existing' | 'new'>(playlist?.kind ?? 'existing');
  const selectedId = playlist?.kind === 'existing' ? playlist.playlistId : null;

  // 플리가 하나도 없으면 바로 '새로 만들기'로
  useEffect(() => { if (mine && !mine.length && !playlist) setMode('new'); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    if (picked.length) { setNewSongs(prev => [...prev, ...picked.filter(p => !prev.some(x => x.id === p.id))].slice(0, 50)); set({ picked: [] }); setMode('new'); }
  }, [picked])); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = mode === 'new' ? !!newName.trim() && newSongs.length > 0 : !!selectedId;

  const next = () => {
    if (mode === 'new') {
      if (!newName.trim()) return toast('플레이리스트 이름을 입력해주세요.', 'error');
      if (!newSongs.length) return toast('곡을 1곡 이상 담아주세요.', 'error');
      set({ playlist: { kind: 'new', name: newName.trim(), songs: newSongs } });
    } else if (!selectedId) return toast('플레이리스트를 골라주세요.', 'error');
    navigation.navigate('Note');
  };
  const isNew = mode === 'new';

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      {/* 아래 버튼은 키보드를 따라 올라오지 않는다 (올라오면 입력칸을 가림) — 키보드가 뜨면 이름 칸에 맞춰 스크롤 */}
      {/* Figma 'wave' 인스턴스 — 화면 아래쪽에 깔림 */}
      <Wave scale={1.2} style={{ position: 'absolute', left: -79, right: -79, bottom: -34 }} />
      <DropTopBar title="플리 드랍하기" onBack={navigation.goBack} onNext={next} nextEnabled={ready} />
      <ScrollView ref={scroll.ref} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 110, gap: 30 }} keyboardShouldPersistTaps="handled">
        <T style={{ fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, color: '#090909' }}>{'바다에 떨어뜨릴\n플리를 골라요.'}</T>
        <View style={{ gap: 20 }}>
          {isLoading ? <Loading style={{ height: 120 }} /> : isError ? <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : !mine?.length ? <Empty icon="playlist" title="아직 플레이리스트가 없어요" desc="아래에서 새 플리를 만들어 바로 드랍할 수 있어요." /> : null}
          {(mine ?? []).map((p, i) => {
            const d = details[i]?.data;
            const on = !isNew && selectedId === p.id;
            const total = d?.songs.reduce((a, s) => a + (s.duration || 0), 0) ?? 0;
            return (
              <Press key={p.id} trackAs="기존 플레이리스트 고르기" accessibilityState={{ selected: on }} onPress={() => { setMode('existing'); set({ playlist: { kind: 'existing', playlistId: p.id, name: p.name, art: p.albumImageUrl } }); }} style={[card(on), { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
                <Collage images={d?.songs.map(s => s.albumImagePath) ?? [p.albumImageUrl]} size={60} radius={30} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T numberOfLines={1} style={NAME}>{p.name}</T>
                  <T style={META}>{d ? `${d.songs.length}곡 · ${formatTotal(total)}` : ' '}</T>
                </View>
                <RadioGlyph on={on} />
              </Press>
            );
          })}
          {isNew ? (
            // 새 플레이리스트 — 이름 + 곡 고르기 (태그는 서버 지원이 없어 넣지 않음)
            <View style={[card(true), { gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Collage images={newSongs.map(s => s.albumImagePath)} size={60} radius={30} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T numberOfLines={1} style={NAME}>새 플레이리스트</T>
                  <T style={META}>{newSongs.length ? `${newSongs.length}곡 담김` : '곡을 골라 바로 만들어요'}</T>
                </View>
                <RadioGlyph on />
              </View>
              <Field value={newName} onChangeText={t => setNewName(t.slice(0, 30))} placeholder="플레이리스트 이름" accessibilityLabel="플레이리스트 이름" onFocus={scroll.onFocus} />
              <AddLink label="곡 고르기" onPress={() => navigation.navigate('AddSongs', { picker: 'newPlaylist', existing: newSongs.map(s => s.id) })} />
            </View>
          ) : (
            <AddLink label="새로운 플리 추가" onPress={() => setMode('new')} />
          )}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 26 }}>
        <PrimaryButton label="다음 한마디 남기기" disabled={!ready} onPress={next} />
      </View>
    </View>
  );
}
