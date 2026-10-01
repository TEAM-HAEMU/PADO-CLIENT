/** 4.6 새 플레이리스트 (시트) — POST /playlists {name}. rename 파라미터가 오면 이름 변경(PATCH) */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts, glow } from '@/theme/tokens';
import { track } from '@/services/analytics';

const TAGS = ['퇴근길', '산책', '드라이브', '새벽'];

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
    <Sheet>
      <View style={{ gap: 18 }}>
        <T v="title" style={{ paddingHorizontal: 4 }}>{renaming ? '이름 변경' : '새 플레이리스트'}</T>
        {renaming ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 84, height: 84, borderRadius: 18, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}><Icon name="music" size={28} color={colors.ink3} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="caption" c="ink2">커버는 담은 곡으로 자동 생성돼요</T>
            <T v="micro" c="ink3">첫 4곡의 앨범 아트를 모아요</T>
          </View>
        </View>}
        <View style={{ gap: 8 }}>
          <T v="captionStrong" c="ink2">이름</T>
          <View style={[{ flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.page, borderWidth: 1.5, borderColor: colors.primary }, glow(0.22, 12)]}>
            <TextInput autoFocus value={name} onChangeText={t => setName(t.slice(0, 30))} placeholder="플레이리스트 이름" placeholderTextColor={colors.ink3} selectionColor={colors.primary} style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, color: colors.ink, fontFamily: fonts.regular, fontSize: 17 }} onSubmitEditing={create} />
            <T v="number" c="ink3">{name.length}/30</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TAGS.map(t => (
            <Press key={t} onPress={() => setName(n => (n ? `${n} ${t}` : t).slice(0, 30))} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line }}>
              <T v="caption" c="ink2"># {t}</T>
            </Press>
          ))}
        </View>
        <PrimaryButton label={renaming ? '저장' : '만들고 곡 담으러 가기'} onPress={create} loading={busy} disabled={!name.trim() || name.trim() === renaming?.name} />
      </View>
    </Sheet>
  );
}
