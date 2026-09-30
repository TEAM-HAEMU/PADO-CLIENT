/** 3.5 플리 드랍 만들기 — 내 플레이리스트 선택 또는 새로 구성 (명세: playlistId | playlistName+songIds 1~50) */
import React, { useCallback, useState, useEffect } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playlistApi } from '@/api/endpoints';
import type { Song } from '@/api/types';
import { Collage } from '@/components/music/Collage';
import { Empty, Icon, IconButton, Loading, Press, PrimaryButton, Radio, T, SecondaryButton } from '@/components/ui';
import { useMyPlaylists } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts, glow } from '@/theme/tokens';
import { formatTotal } from '@/utils/format';

export default function PlaylistDropCreateScreen({ navigation }: RootScreen<'PlaylistDropCreate'>) {
  const insets = useSafeAreaInsets();
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

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.primarySoft }}>
          <Icon name="playlist" size={14} color={colors.primary} />
          <T v="captionStrong" c="primary">플리 드랍</T>
        </View>
        <View style={{ flex: 1 }} />
        <T v="number" c="ink3">1/2</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <T v="titleLarge" style={{ marginBottom: 6 }}>{'어떤 플레이리스트를\n여기 남길까요?'}</T>
        {isLoading ? <Loading style={{ height: 120 }} /> : isError ? <Empty icon="alert" title="플레이리스트를 불러오지 못했어요" action={<SecondaryButton label="다시 시도" onPress={() => refetch()} style={{ marginTop: 8 }} />} /> : !mine?.length ? <Empty icon="playlist" title="아직 플레이리스트가 없어요" desc="아래에서 새 플리를 만들어 바로 드랍할 수 있어요." /> : null}
        {(mine ?? []).map((p, i) => {
          const d = details[i]?.data;
          const on = mode === 'existing' && selectedId === p.id;
          const total = d?.songs.reduce((a, s) => a + (s.duration || 0), 0) ?? 0;
          return (
            <Press key={p.id} onPress={() => { setMode('existing'); set({ playlist: { kind: 'existing', playlistId: p.id, name: p.name, art: p.albumImageUrl } }); }} style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, paddingRight: 16, borderRadius: 20, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }, on ? glow(0.25, 14) : {}]}>
              <Collage images={d?.songs.map(s => s.albumImagePath) ?? [p.albumImageUrl]} size={64} radius={14} />
              <View style={{ flex: 1, gap: 3 }}>
                <T v="headline" numberOfLines={1}>{p.name}</T>
                <T v="caption" c="ink2">{d ? `${d.songs.length}곡 · ${formatTotal(total)}` : ' '}</T>
              </View>
              <Radio on={on} />
            </Press>
          );
        })}
        <Press onPress={() => setMode('new')} style={{ gap: 12, padding: 12, paddingRight: 16, borderRadius: 20, borderWidth: mode === 'new' ? 1.5 : 1.2, borderColor: mode === 'new' ? colors.primary : colors.line, borderStyle: mode === 'new' ? 'solid' : 'dashed', backgroundColor: mode === 'new' ? colors.primarySoft : 'transparent' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {newSongs.length ? <Collage images={newSongs.map(s => s.albumImagePath)} size={64} radius={14} /> : (
              <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={24} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <T v="headline">새 플레이리스트</T>
              <T v="caption" c="ink2">{newSongs.length ? `${newSongs.length}곡 담김` : '곡을 골라 바로 만들어요'}</T>
            </View>
            <Radio on={mode === 'new'} />
          </View>
          {mode === 'new' ? (
            <View style={{ gap: 10 }}>
              <TextInput value={newName} onChangeText={t => setNewName(t.slice(0, 30))} placeholder="플레이리스트 이름" placeholderTextColor={colors.ink3} selectionColor={colors.primary} style={{ height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 }} />
              <Press onPress={() => navigation.navigate('AddSongs', { picker: 'newPlaylist', existing: newSongs.map(s => s.id) })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: colors.card2 }}>
                <Icon name="plus" size={16} color={colors.primary} />
                <T v="captionStrong" c="primary">곡 고르기</T>
              </Press>
            </View>
          ) : null}
        </Press>
      </ScrollView>
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16 }}>
        <PrimaryButton label="다음 · 한마디 남기기" disabled={!ready} onPress={next} />
      </View>
    </KeyboardAvoidingView>
  );
}
