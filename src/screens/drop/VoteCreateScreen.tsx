/** 3.4 투표 드랍 만들기 — 질문 + 후보 2~5곡 (명세: options 2~5개) · Figma '3.4 투표 드랍 만들기' */
import React, { useCallback } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Song } from '@/api/types';
import { RemoveGlyph } from '@/components/drop/glyphs';
import { AddLink, DiscArt, DropTopBar } from '@/components/drop/parts';
import { Press, PrimaryButton, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import type { RootScreen } from '@/navigation/types';
import { usePreview } from '@/services/preview';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';

const TOPIC_MAX = 40;

/** 후보 한 줄 (Figma 높이 80) — A·B·C 동그라미 · 아트(누르면 미리듣기) · 제목/아티스트 · 빼기 × */
function OptionRow({ song, index, onRemove }: { song: Song; index: number; onRemove: () => void }) {
  const p = usePreview(song, { lazy: true });
  return (
    <View style={{ height: 80, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingRight: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: '#DCF8FF', shadowColor: '#E7F9FF', shadowOpacity: 1, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 2 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(240,252,255,0.8)', alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.primary }}>{String.fromCharCode(65 + index)}</T>
      </View>
      <DiscArt uri={song.albumImagePath} playing={p.playing} loading={p.loading} onToggle={p.available ? p.toggle : undefined} />
      <View style={{ flex: 1, gap: 4, marginLeft: 2 }}>
        <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: '#090909' }}>{song.title}</T>
        <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 13, letterSpacing: -0.2, color: '#B9B9B9' }}>{song.artist}</T>
      </View>
      <Press onPress={onRemove} hitSlop={10} accessibilityLabel="후보 빼기"><RemoveGlyph /></Press>
    </View>
  );
}

export default function VoteCreateScreen({ navigation }: RootScreen<'VoteCreate'>) {
  const insets = useSafeAreaInsets();
  const { topic, options, picked, set } = useDraft();

  useFocusEffect(useCallback(() => {
    if (picked.length) {
      const merged = [...options, ...picked.filter(p => !options.some(o => o.id === p.id))].slice(0, 5);
      set({ options: merged, picked: [] });
    }
  }, [picked])); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!topic.trim() && options.length >= 2;
  const next = () => {
    if (!topic.trim()) return toast('질문을 입력해주세요.', 'error');
    if (options.length < 2) return toast('후보 곡을 2곡 이상 골라주세요.', 'error');
    navigation.navigate('Note');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      {/* Figma 'wave' 인스턴스 — 화면 아래쪽에 깔림 */}
      <Wave scale={1.2} style={{ position: 'absolute', left: -79, right: -79, bottom: -34 }} />
      <DropTopBar title="투표 드랍하기" onBack={navigation.goBack} onNext={next} nextEnabled={ready} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: insets.bottom + 110, gap: 30 }} keyboardShouldPersistTaps="handled">
        {/* 질문 카드 — #46BEFF 바탕 · 하늘빛 그림자 */}
        <View style={{ gap: 8, padding: 16, borderRadius: 16, backgroundColor: '#46BEFF', shadowColor: '#9BE7FF', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: '#EBF6FF' }}>질문</T>
            <T style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, letterSpacing: -0.2, color: '#EBF6FF' }}>{topic.length}/{TOPIC_MAX}</T>
          </View>
          <TextInput
            value={topic}
            onChangeText={t => set({ topic: t.slice(0, TOPIC_MAX) })}
            placeholder="이 장소에 가장 어울리는 곡은?"
            placeholderTextColor="rgba(255,255,255,0.6)"
            multiline
            selectionColor="#FFFFFF"
            maxFontSizeMultiplier={1.2}
            style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, padding: 0, minHeight: 56 }}
          />
        </View>
        <View style={{ gap: 20 }}>
          <T v="caption" c="ink2" style={{ marginBottom: -8, paddingLeft: 4 }}>후보 곡 {options.length}/5 · 2~5곡까지 담을 수 있어요</T>
          {options.map((s, i) => <OptionRow key={s.id} song={s} index={i} onRemove={() => set({ options: options.filter(o => o.id !== s.id) })} />)}
          {options.length < 5 ? <AddLink label="노래 추가" onPress={() => navigation.navigate('AddSongs', { picker: 'vote', existing: options.map(o => o.id) })} /> : null}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 26 }}>
        <PrimaryButton label="다음 한마디 남기기" onPress={next} disabled={!ready} />
      </View>
    </View>
  );
}
