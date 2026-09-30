/** 3.2 곡 검색 (음악 드랍) */
import React, { useState } from 'react';
import { FlatList, Keyboard, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import type { Song } from '@/api/types';
import { SongRow } from '@/components/music/SongRow';
import { Art, Empty, Icon, IconButton, Loading, Press, T, SecondaryButton } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { useSongSearch } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import type { RootScreen } from '@/navigation/types';
import { startPreview, usePreviewStore } from '@/services/preview';
import { toast } from '@/store/toast';
import { useDraft } from '@/store/draft';
import { colors, fonts, glow } from '@/theme/tokens';

export default function SongSearchScreen({ navigation }: RootScreen<'SongSearch'>) {
  const insets = useSafeAreaInsets();
  const draft = useDraft();
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const search = useSongSearch(query);
  const [picked, setPicked] = useState<Song | null>(draft.song);

  // 한마디 쓰는 동안에도, 드랍을 마친 뒤에도 듣던 미리듣기는 이어서 (다른 곡을 틀 때만 바뀜)
  const next = () => { if (!picked) return; draft.set({ song: picked }); navigation.navigate('Note'); };

  // 곡을 고르면(임시 선택) 바로 미리듣기 — 고른 곡을 다시 누르면 일시정지/재개
  const pick = async (song: Song) => {
    Keyboard.dismiss();
    const st = usePreviewStore.getState();
    if (picked?.id === song.id && st.key === song.id) return st.toggle();
    setPicked(song);
    const r = await startPreview(song);
    if (r === 'none') toast('이 곡은 미리듣기를 지원하지 않아요.');
    else if (r === 'unavailable') toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error');
  };
  const pickedPlaying = usePreviewStore(st => !!picked && st.key === picked.id && !st.paused);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.primarySoft }}>
          <Icon name="music" size={14} color={colors.primary} />
          <T v="captionStrong" c="primary">음악 드랍</T>
        </View>
        <View style={{ flex: 1 }} />
        <T v="number" c="ink3">1/2</T>
      </View>
      <View style={[{ marginHorizontal: 16, marginTop: 4, height: 54, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary }, glow(0.2, 14)]}>
        <Icon name="search" size={20} color={colors.primary} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="곡, 아티스트 검색" placeholderTextColor={colors.ink3} returnKeyType="search" selectionColor={colors.primary} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 17 }} />
        {q ? <Press onPress={() => setQ('')} hitSlop={13} accessibilityLabel="검색어 지우기" style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={12} color={colors.ink2} /></Press> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 14, marginBottom: 6 }}>
        <ServiceGlyph service="spotify" size={14} />
        <T v="caption" c="ink3">Spotify · YouTube Music 통합 검색</T>
      </View>
      {!query ? (
        <Empty icon="search" title="어떤 곡을 남길까요?" desc="곡 이름이나 아티스트로 검색해보세요." />
      ) : search.isLoading ? <Loading /> : search.isError ? (
        <Empty icon="alert" title="검색하지 못했어요" desc={errorMessage(search.error)} action={<SecondaryButton label="다시 시도" onPress={() => search.refetch()} style={{ marginTop: 8 }} />} />
      ) : (
        <FlatList
          data={search.data}
          keyExtractor={s => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 140, gap: 4 }}
          ListEmptyComponent={<Empty title="검색 결과가 없어요" desc="다른 검색어로 찾아보세요." />}
          renderItem={({ item }) => <SongRow song={item} selected={picked?.id === item.id} onPress={() => pick(item)} />}
        />
      )}
      {picked ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingLeft: 10, borderRadius: 28, backgroundColor: 'rgba(11,19,48,0.95)', borderWidth: 1, borderColor: colors.line }}>
          <View style={{ borderRadius: 22, borderWidth: 2, borderColor: colors.primary }}><Art uri={picked.albumImagePath} size={40} round /></View>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" numberOfLines={1}>{picked.title}</T>
            <T v="caption" c="ink2" numberOfLines={1}>{picked.artist}</T>
          </View>
          <Press onPress={() => (usePreviewStore.getState().key === picked.id ? usePreviewStore.getState().toggle() : pick(picked))} hitSlop={8} accessibilityLabel={pickedPlaying ? '미리듣기 일시정지' : '미리듣기 재생'} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={pickedPlaying ? 'pause' : 'play'} size={16} color={colors.primary} />
          </Press>
          <Press onPress={next} style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 18, paddingRight: 16, height: 46, borderRadius: 23, backgroundColor: colors.primary }, glow(0.45, 16)]}>
            <T v="bodyStrong" c="onPrimary">다음</T>
            <Icon name="chevronRight" size={16} color={colors.onPrimary} />
          </Press>
        </View>
      ) : null}
    </View>
  );
}
