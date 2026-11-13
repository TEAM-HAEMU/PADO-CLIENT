/** 3.2 곡 검색 (음악 드랍) — Figma 'B 3.2 곡 검색' (장르 칩은 서버 지원이 없어 숨김) */
import React, { useState } from 'react';
import { FlatList, Keyboard, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import type { Song } from '@/api/types';
import { PickGlyph, SearchGlyph } from '@/components/drop/glyphs';
import { DiscArt, DropTopBar } from '@/components/drop/parts';
import { Empty, Icon, Loading, Press, PrimaryButton, T, SecondaryButton } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useSongSearch } from '@/hooks/api';
import { useDebounced } from '@/hooks/useDebounced';
import type { RootScreen } from '@/navigation/types';
import { startPreview, usePreviewStore } from '@/services/preview';
import { noPreviewMessage } from '@/services/previewSource';
import { toast } from '@/store/toast';
import { useDraft } from '@/store/draft';
import { colors, fonts } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

/**
 * 검색 결과 한 줄 (Figma 높이 70) — 동그란 아트(누르면 미리듣기) · 제목/아티스트 · 길이 · 파란 고르기 원.
 * 아트 버튼과 행 버튼을 나란히 둔다 — 버튼 안에 버튼을 넣으면 iOS 접근성(UI 테스트)에서 안쪽 버튼이 안 보인다.
 */
function ResultRow({ song, selected, playing, onPick, onToggle }: { song: Song; selected: boolean; playing: boolean; onPick: () => void; onToggle: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 70, paddingLeft: 8, marginHorizontal: -8, borderRadius: 16, backgroundColor: selected ? colors.primarySoft : 'transparent' }}>
      <DiscArt uri={song.albumImagePath} playing={playing} onToggle={onToggle} />
      <Press onPress={onPick} accessibilityState={{ selected }} style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 20, paddingRight: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T numberOfLines={1} style={{ fontFamily: selected ? fonts.medium : fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: selected ? colors.primary : '#090909' }}>{song.title}</T>
          <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 13, letterSpacing: -0.2, color: '#B9B9B9' }}>{song.artist}</T>
        </View>
        {song.duration ? <T style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, letterSpacing: -0.2, color: '#969696' }}>{formatDuration(song.duration)}</T> : null}
        <PickGlyph color={selected ? colors.accent : colors.primary} />
      </Press>
    </View>
  );
}

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
    if (r === 'none' || r === 'adult') toast(noPreviewMessage({ adult: r === 'adult' }));
    else if (r === 'unavailable') toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error');
  };
  // 아트를 누르면 미리듣기만 켜고 끈다 — 아직 안 고른 곡이면 고르면서 재생
  const toggle = (song: Song) => (usePreviewStore.getState().key === song.id ? usePreviewStore.getState().toggle() : pick(song));
  const playingKey = usePreviewStore(st => (st.paused ? null : st.key));

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      {/* Figma 'wave' 인스턴스 — 화면 아래쪽에 깔림 */}
      <Wave scale={1.2} style={{ position: 'absolute', left: -79, right: -79, bottom: -34 }} />
      <DropTopBar title="음악 고르기" onBack={navigation.goBack} onNext={next} nextEnabled={!!picked} />
      <View style={{ marginHorizontal: 24, marginTop: 20, height: 36, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, backgroundColor: '#FDFDFD', borderWidth: 1, borderColor: '#F0F0F0' }}>
        <SearchGlyph />
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="음악을 검색해보세요."
          placeholderTextColor="#C0C0C0"
          returnKeyType="search"
          selectionColor={colors.primary}
          maxFontSizeMultiplier={1.2}
          style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 12, letterSpacing: -0.24 }}
        />
        {q ? <Press onPress={() => setQ('')} hitSlop={13} accessibilityLabel="검색어 지우기" style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E1E1E1', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={10} color="#FFFFFF" strokeWidth={2.4} /></Press> : null}
      </View>
      {/* 장르 칩(ALL · R&B · JAZZ …)은 서버가 장르 검색을 지원하지 않아 숨김 */}
      <View style={{ flex: 1, marginTop: 20 }}>
        {!query ? (
          <Empty icon="search" title="어떤 곡을 남길까요?" desc="곡 이름이나 아티스트로 검색해보세요." />
        ) : search.isLoading ? <Loading /> : search.isError ? (
          <Empty icon="alert" title="검색하지 못했어요" desc={errorMessage(search.error)} action={<SecondaryButton label="다시 시도" onPress={() => search.refetch()} style={{ marginTop: 8 }} />} />
        ) : (
          <FlatList
            data={search.data}
            keyExtractor={s => s.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 100, gap: 20 }}
            ListEmptyComponent={<Empty title="검색 결과가 없어요" desc="다른 검색어로 찾아보세요." />}
            renderItem={({ item }) => <ResultRow song={item} selected={picked?.id === item.id} playing={playingKey === item.id} onPick={() => pick(item)} onToggle={() => toggle(item)} />}
          />
        )}
      </View>
      {picked ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 26 }}>
          <PrimaryButton label="다음" onPress={next} />
        </View>
      ) : null}
    </View>
  );
}
