/** 3.3 한마디 남기기 — 쪽지 한 장 (편지지 줄 · 손글씨 명조 · 소인) → POST /droppings */
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import type { CreateDropBody } from '@/api/types';
import { Art, Icon, IconButton, Press, PrimaryButton, T } from '@/components/ui';
import { useCreateDrop } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useLocation } from '@/services/location';
import { usePreviewStore } from '@/services/preview';
import { draftArt, useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, dropShadow, fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';

const MAX = 255; // 명세: content 최대 255자
const SUGGEST = ['퇴근길에 딱', '여기 풍경이랑 잘 어울려요', '비 오는 날 추천', '여기서 처음 들었어요'];

export default function NoteScreen({ navigation }: RootScreen<'Note'>) {
  const insets = useSafeAreaInsets();
  const draft = useDraft();
  const { coords, address, label } = useLocation();
  const [text, setText] = useState(draft.content);
  // 뒤로 갔다 와도 쓰던 메모가 남도록 초안에도 저장 (렌더 중이 아니라 반영 뒤에)
  useEffect(() => { useDraft.getState().set({ content: text }); }, [text]);
  const create = useCreateDrop();
  const art = draftArt(draft);
  const head = useMemo(() => {
    if (draft.type === 'MUSIC') return { title: draft.song?.title ?? '', sub: draft.song?.artist ?? '' };
    if (draft.type === 'VOTE') return { title: draft.topic, sub: `투표 · 후보 ${draft.options.length}곡` };
    const p = draft.playlist;
    return { title: p?.name ?? '', sub: p?.kind === 'new' ? `플레이리스트 · ${p.songs.length}곡` : '플레이리스트' };
  }, [draft]);
  const today = new Date();
  const stampDate = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // 곡 고르기에서 틀어 둔 미리듣기 — 여기서도 계속 재생, 카드에서 일시정지/재개
  const songId = draft.type === 'MUSIC' ? draft.song?.id : undefined;
  const songLoaded = usePreviewStore(st => !!songId && st.key === songId);
  const songPlaying = usePreviewStore(st => !!songId && st.key === songId && !st.paused);

  const submit = () => {
    if (create.isPending) return;
    // 실제 위치를 못 받았으면 엉뚱한 곳에 드랍되지 않게 막는다
    if (!coords) return toast('지금 위치를 확인할 수 없어요. 위치 권한과 GPS를 확인해주세요.', 'error');
    const pos = coords;
    const base = { content: text.trim(), latitude: pos.latitude, longitude: pos.longitude, address: (address || label || '현재 위치').slice(0, 200) };
    let body: CreateDropBody;
    if (draft.type === 'MUSIC' && draft.song) body = { ...base, type: 'MUSIC', songId: draft.song.id };
    else if (draft.type === 'VOTE') body = { ...base, type: 'VOTE', topic: draft.topic.trim(), options: draft.options.map(s => s.id) };
    else if (draft.playlist?.kind === 'existing') body = { ...base, type: 'PLAYLIST', playlistId: draft.playlist.playlistId };
    else if (draft.playlist?.kind === 'new') body = { ...base, type: 'PLAYLIST', playlistName: draft.playlist.name, songIds: draft.playlist.songs.map(s => s.id) };
    else return toast('드랍할 곡을 먼저 골라주세요.', 'error');
    create.mutate(body, {
      onSuccess: () => {
        track('drop_created', { type: body.type, note_length: body.content.length, song_id: 'songId' in body ? body.songId : undefined, option_count: 'options' in body ? body.options.length : undefined, playlist_new: 'playlistName' in body, address: body.address, lat: body.latitude, lng: body.longitude });
        draft.reset(); navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'DropSuccess', params: { art, content: body.content } }] }); },
      onError: e => toast(errorMessage(e), 'error'),
    });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ paddingTop: insets.top, height: insets.top + 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <T v="headline" style={{ flex: 1 }}>한마디 남기기</T>
        <T v="number" c="ink3">2/2</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={[{ borderRadius: 28, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 20, minHeight: 400, overflow: 'hidden' }, dropShadow]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Art uri={art} size={52} radius={12} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" numberOfLines={1}>{head.title}</T>
              <T v="caption" c="ink2" numberOfLines={1}>{head.sub}</T>
            </View>
            {songLoaded ? (
              <Press onPress={() => usePreviewStore.getState().toggle()} hitSlop={8} accessibilityLabel={songPlaying ? '미리듣기 일시정지' : '미리듣기 재생'} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={songPlaying ? 'pause' : 'play'} size={15} color={colors.primary} />
              </Press>
            ) : null}
          </View>
          {/* 편지지 줄 */}
          {Array.from({ length: 6 }, (_, i) => <View key={i} style={{ position: 'absolute', left: 20, right: 20, top: 130 + i * 38, height: 1, backgroundColor: colors.line }} />)}
          <TextInput
            value={text}
            onChangeText={t => setText(t.slice(0, MAX))}
            multiline
            placeholder={`${draft.type === 'VOTE' ? '투표를 남기며' : draft.type === 'PLAYLIST' ? '이 플리를 남기며' : '이 곡을 남기며'} 한마디…\n(비워둬도 괜찮아요)`}
            placeholderTextColor={colors.ink3}
            selectionColor={colors.primary}
            style={{ marginTop: 26, minHeight: 230, color: colors.ink, fontFamily: fonts.note, fontSize: 21, lineHeight: 38, textAlignVertical: 'top', paddingTop: 0 }}
          />
          <T v="number" c="ink3" style={{ position: 'absolute', left: 20, bottom: 16 }}>{text.length} / {MAX}</T>
          {/* 소인 */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 18, bottom: 18, width: 92, height: 92, transform: [{ rotate: '-12deg' }], alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={200} height={40} style={{ position: 'absolute', left: -110, top: 30, opacity: 0.55 }} viewBox="0 0 120 30">
              {[8, 16, 24].map(y => <Path key={y} d={`M0 ${y} Q10 ${y - 6} 20 ${y} T40 ${y} T60 ${y} T80 ${y} T100 ${y} T120 ${y}`} stroke={colors.primary} strokeWidth={1.4} fill="none" />)}
            </Svg>
            <View style={{ position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 1.5, borderColor: colors.primary, opacity: 0.8 }} />
            <View style={{ position: 'absolute', width: 78, height: 78, borderRadius: 39, borderWidth: 0.8, borderColor: colors.primary, borderStyle: 'dashed', opacity: 0.6 }} />
            <T v="captionStrong" c="primary" numberOfLines={1} style={{ maxWidth: 70 }}>{label || 'PADO'}</T>
            <T v="micro" c="primary">{stampDate}</T>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <T v="captionStrong" c="ink3">이런 말은 어때요</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGEST.map(s => (
              <Press key={s} onPress={() => setText(t => (t ? `${t} ${s}` : s).slice(0, MAX))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
                <T v="caption" c="ink2">{s}</T>
              </Press>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="pin" size={14} color={colors.primary} />
          <T v="caption" c="ink2" numberOfLines={1}>지금 서 있는 {address || label || '이곳'}에 남겨져요</T>
        </View>
        <PrimaryButton label="여기에 드랍하기" icon="wave" onPress={submit} loading={create.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}
