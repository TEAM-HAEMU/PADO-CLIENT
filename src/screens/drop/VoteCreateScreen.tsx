/** 3.4 투표 드랍 만들기 — 질문 + 후보 2~5곡 (명세: options 2~5개) */
import React, { useCallback } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Art, Icon, IconButton, Press, PrimaryButton, T } from '@/components/ui';
import type { RootScreen } from '@/navigation/types';
import { useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts, glow } from '@/theme/tokens';

const TOPIC_MAX = 40;

export default function VoteCreateScreen({ navigation }: RootScreen<'VoteCreate'>) {
  const insets = useSafeAreaInsets();
  const { topic, options, picked, set } = useDraft();

  useFocusEffect(useCallback(() => {
    if (picked.length) {
      const merged = [...options, ...picked.filter(p => !options.some(o => o.id === p.id))].slice(0, 5);
      set({ options: merged, picked: [] });
    }
  }, [picked])); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (!topic.trim()) return toast('질문을 입력해주세요.', 'error');
    if (options.length < 2) return toast('후보 곡을 2곡 이상 골라주세요.', 'error');
    navigation.navigate('Note');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.primarySoft }}>
          <Icon name="vote" size={14} color={colors.primary} />
          <T v="captionStrong" c="primary">투표 드랍</T>
        </View>
        <View style={{ flex: 1 }} />
        <T v="number" c="ink3">1/2</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={[{ gap: 8, padding: 18, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary }, glow(0.2, 14)]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="captionStrong" c="primary">질문</T>
            <T v="number" c="ink3">{topic.length}/{TOPIC_MAX}</T>
          </View>
          <TextInput value={topic} onChangeText={t => set({ topic: t.slice(0, TOPIC_MAX) })} placeholder="이 장소에 가장 어울리는 곡은?" placeholderTextColor={colors.ink3} multiline selectionColor={colors.primary} style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, padding: 0 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
          <T v="captionStrong">후보 곡</T>
          <T v="number" c="primary">{options.length}/5</T>
          <T v="caption" c="ink3">· 2~5곡까지 담을 수 있어요</T>
        </View>
        {options.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><T v="captionStrong" c="primary">{String.fromCharCode(65 + i)}</T></View>
            <Art uri={s.albumImagePath} size={48} radius={12} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" numberOfLines={1}>{s.title}</T>
              <T v="caption" c="ink2" numberOfLines={1}>{s.artist}</T>
            </View>
            <Press onPress={() => set({ options: options.filter(o => o.id !== s.id) })} hitSlop={10} accessibilityLabel="후보 빼기"><Icon name="close" size={18} color={colors.ink3} /></Press>
          </View>
        ))}
        {options.length < 5 ? (
          <Press onPress={() => navigation.navigate('AddSongs', { picker: 'vote', existing: options.map(o => o.id) })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 18, borderWidth: 1.2, borderColor: colors.primary, borderStyle: 'dashed' }}>
            <Icon name="plus" size={18} color={colors.primary} />
            <T v="bodyStrong" c="primary">후보 곡 추가</T>
          </Press>
        ) : null}
      </ScrollView>
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 16 }}>
        <PrimaryButton label="다음 · 한마디 남기기" onPress={next} disabled={!topic.trim() || options.length < 2} />
      </View>
    </View>
  );
}
