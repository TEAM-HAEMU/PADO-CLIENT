/** 4.6 새 플레이리스트 (시트) — POST /playlists {name}. rename 파라미터가 오면 이름 변경(PATCH) (Figma 'B 4.8 새 플레이리스트 (시트)') */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { PrimaryButton, T } from '@/components/ui';
import { Glyph } from '@/components/detail/glyphs';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';

export default function NewPlaylistScreen({ navigation, route }: RootScreen<'NewPlaylist'>) {
  const qc = useQueryClient();
  const renaming = route.params?.rename;
  const [name, setName] = useState(renaming?.name ?? '');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    if (!name.trim()) return toast('이름을 입력해주세요.', 'error');
    setBusy(true);
    try {
      if (renaming) {
        await playlistApi.rename(renaming.id, name.trim());
        qc.invalidateQueries({ queryKey: ['playlist', renaming.id] });
        qc.invalidateQueries({ queryKey: ['playlists'] });
        navigation.goBack();
        return;
      }
      // 명세상 생성 응답 본문이 없어, 생성 전 목록에 없던 플리를 새 플리로 본다 (같은 이름이 있어도 정확)
      const prior = await playlistApi.mine().catch(() => null);
      const before = prior ? new Set(prior.map(p => p.id)) : null;
      await playlistApi.create(name.trim());
      track('playlist_created', { name_length: name.trim().length });
      const list = await playlistApi.mine();
      qc.setQueryData(['playlists'], list);
      const created = (before && list.find(p => !before.has(p.id))) || list.find(p => p.name === name.trim());
      // 시트 위에 새 화면을 쌓으면 iOS가 카드 모달로 띄우므로 시트를 새 화면으로 바꾼다
      // 버튼 문구대로 곧바로 곡 담기 화면까지 — 담고 나면(또는 뒤로) 방금 만든 플리 상세
      if (created) navigation.replace('PlaylistDetail', { playlistId: created.id, openAdd: true });
      else navigation.goBack();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet style={{ paddingHorizontal: 20 }}>
      <View style={{ gap: 24 }}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 20, lineHeight: 30, letterSpacing: -0.4, color: '#000000' }}>{renaming ? '이름 변경' : '새 플레이리스트'}</T>
        {renaming ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' }}><Glyph name="note" color="#989898" /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <T style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.065, color: '#4F5874' }}>커버는 담은 곡으로 자동 생성돼요</T>
            <T style={{ fontFamily: fonts.regular, fontSize: 11, lineHeight: 14, color: '#D6D6D6' }}>첫 4곡의 앨범 아트를 모아요</T>
          </View>
        </View>}
        <View style={{ gap: 8 }}>
          <T style={{ fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: -0.065, color: '#000000' }}>이름</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 99, paddingHorizontal: 16, borderWidth: 1, borderColor: '#EBEBEB' }}>
            <TextInput autoFocus value={name} onChangeText={t => setName(t.slice(0, 30))} placeholder="플레이리스트 이름" placeholderTextColor="#9D9D9D" selectionColor={colors.primary} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, letterSpacing: -0.065 }} onSubmitEditing={create} />
            <T style={{ fontFamily: fonts.medium, fontSize: 10, lineHeight: 16, color: '#E0E0E2' }}>{name.length}/30</T>
          </View>
        </View>
        {/* 시안의 태그 칩(#퇴근길 #산책 #바다)은 서버에 태그가 없어 숨김 */}
        <PrimaryButton label={renaming ? '저장' : '만들고 곡 담기'} onPress={create} loading={busy} disabled={!name.trim() || name.trim() === renaming?.name} />
      </View>
    </Sheet>
  );
}
