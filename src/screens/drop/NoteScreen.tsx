/** 3.3 한마디 남기기 — Figma 'B 3.3 한마디 남기기' (고른 곡 · 한마디 입력 · 추천 문구) → POST /droppings */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import type { CreateDropBody } from '@/api/types';
import { PinGlyph } from '@/components/drop/glyphs';
import { DiscArt } from '@/components/drop/parts';
import { Chip, PrimaryButton, T, TopBar } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useCreateDrop, useMyDrops } from '@/hooks/api';
import { regionOf } from '@/utils/address';
import { useFocusedInputScroll } from '@/hooks/useFocusedInputScroll';
import type { RootScreen } from '@/navigation/types';
import { currentCoords, useLocation } from '@/services/location';
import { usePreviewStore } from '@/services/preview';
import { draftArt, useDraft } from '@/store/draft';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { josa } from '@/utils/josa';
import { detailedOnly, track } from '@/services/analytics';

const MAX = 255; // 명세: content 최대 255자
const SUGGEST = ['퇴근길에 딱', '여기 풍경이랑 잘 어울려요', '친구와 함께 듣고싶어요', '여기서 처음 들었어요'];

export default function NoteScreen({ navigation }: RootScreen<'Note'>) {
  const insets = useSafeAreaInsets();
  const draft = useDraft();
  const { address, label } = useLocation();
  const [text, setText] = useState(draft.content);
  const [focus, setFocus] = useState(false);
  // 뒤로 갔다 와도 쓰던 메모가 남도록 초안에도 저장 (렌더 중이 아니라 반영 뒤에)
  useEffect(() => { useDraft.getState().set({ content: text }); }, [text]);
  const create = useCreateDrop();
  const myDrops = useMyDrops().data;
  const scroll = useFocusedInputScroll();
  const art = draftArt(draft);
  // 'GANADARA를 고르셨군요! / 음악을 바다에 빠뜨려보세요.' — 조사는 곡·플리 이름 받침에 맞춘다
  const head = useMemo(() => {
    if (draft.type === 'MUSIC') { const name = draft.song?.title ?? ''; return { name, tail: `${josa(name, '을', '를')} 고르셨군요!`, what: '음악을' }; }
    if (draft.type === 'VOTE') return { name: draft.topic, tail: ` · 후보 ${draft.options.length}곡`, what: '투표를' };
    const p = draft.playlist;
    const name = p?.name ?? '';
    return { name, tail: p?.kind === 'new' ? ` · ${p.songs.length}곡` : `${josa(name, '을', '를')} 고르셨군요!`, what: '플리를' };
  }, [draft]);

  // 곡 고르기에서 틀어 둔 미리듣기 — 여기서도 계속 재생
  const songId = draft.type === 'MUSIC' ? draft.song?.id : undefined;
  const songLoaded = usePreviewStore(st => !!songId && st.key === songId);
  const songPlaying = usePreviewStore(st => !!songId && st.key === songId && !st.paused);

  const submit = () => {
    if (create.isPending) return;
    // 실제 위치를 못 받았거나(권한·위치 서비스 꺼짐) 낡은 좌표면 엉뚱한 곳에 드랍되지 않게 막는다 — 누르는 순간의 위치로
    const coords = currentCoords(useLocation.getState());
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
        // 첫 드랍 여부 — 내 드랍 목록을 받아 둔 경우에만 (모르면 null)
        const first = myDrops ? myDrops.length === 0 : null;
        track('drop_created', { type: body.type, note_length: body.content.length, song_id: 'songId' in body ? body.songId : undefined, option_count: 'options' in body ? body.options.length : undefined, playlist_new: 'playlistName' in body, first_drop: first, region: regionOf(body.address), ...detailedOnly({ address: body.address, lat: body.latitude, lng: body.longitude }) });
        if (first) track('first_drop_created', { type: body.type });
        // 공유 카드용 — 제목 줄은 곡명 · 아티스트 (투표는 주제 · 후보 수, 플리는 이름 · 곡 수)
        const sub = draft.type === 'MUSIC' ? draft.song?.artist ?? '' : draft.type === 'VOTE' ? `후보 ${draft.options.length}곡` : draft.playlist?.kind === 'new' ? `${draft.playlist.songs.length}곡` : '플레이리스트';
        const card = { art, title: head.name, sub, place: body.address, note: body.content, latitude: body.latitude, longitude: body.longitude };
        draft.reset(); navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'DropSuccess', params: { art, content: body.content, kind: body.type, card } }] }); },
      onError: e => toast(errorMessage(e), 'error'),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      {/* Figma 'wave' 인스턴스 — 화면 아래쪽에 깔림 */}
      <Wave scale={1.2} style={{ position: 'absolute', left: -79, right: -79, bottom: -34 }} />
      <TopBar title="한마디 남기기" onBack={navigation.goBack} />
      {/* 버튼은 바닥에 고정하지 않고 내용 흐름 끝에 둔다 — 키보드 위로 따라 올라와 입력칸을 가리지 않게. 키보드가 뜨면 입력칸에 맞춰 스크롤 */}
      <ScrollView ref={scroll.ref} automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 26, gap: 36 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 20 }}>
          {/* 곡 고르기에서 틀어 둔 미리듣기가 있으면 아트를 눌러 일시정지/재개 */}
          <DiscArt uri={art} size={100} mark={songLoaded} playing={songPlaying} onToggle={songLoaded ? () => usePreviewStore.getState().toggle() : undefined} style={{ alignSelf: 'flex-start' }} />
          <View style={{ gap: 6 }}>
            <T numberOfLines={2} style={TXT14}>
              <T style={[TXT14, { color: colors.primary }]}>{head.name}</T>{head.tail}
            </T>
            <T style={{ fontFamily: fonts.medium, fontSize: 18, lineHeight: 25, letterSpacing: -0.36, color: '#090909' }}>{head.what} 바다에 빠뜨려보세요.</T>
          </View>
        </View>
        <View style={{ height: 206, borderRadius: 4, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: focus ? colors.primaryDeep : '#FAFBFC', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 26 }}>
          <TextInput
            value={text}
            onChangeText={t => setText(t.slice(0, MAX))}
            onFocus={() => { setFocus(true); scroll.onFocus(); }}
            onBlur={() => setFocus(false)}
            multiline
            placeholder={`최대 ${MAX}자 입력 · 비워둬도 괜찮아요`}
            placeholderTextColor="#B4B9BE"
            selectionColor={colors.primary}
            maxFontSizeMultiplier={1.2}
            style={{ flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, textAlignVertical: 'top', padding: 0 }}
          />
          <T style={{ position: 'absolute', right: 12, bottom: 8, fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: '#B4B9BE' }}>{text.length}/{MAX}</T>
        </View>
        <View style={{ gap: 20 }}>
          <T style={{ fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: -0.26, color: '#090909' }}>이런 말은 어때요?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 12 }}>
            {SUGGEST.map(s => <Chip key={s} label={s} onPress={() => setText(t => (t ? `${t} ${s}` : s).slice(0, MAX))} />)}
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <PinGlyph height={13} />
            <T v="captionStrong" c="ink2" numberOfLines={1} style={{ fontFamily: fonts.regular }}>지금 서 있는 {address || label || '이곳'}에 남겨져요</T>
          </View>
          <PrimaryButton label="여기 빠뜨리기" onPress={submit} loading={create.isPending} />
        </View>
      </ScrollView>
    </View>
  );
}

const TXT14 = { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: -0.28, color: '#090909' } as const;
