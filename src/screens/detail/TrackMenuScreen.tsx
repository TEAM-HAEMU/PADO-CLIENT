/** 4.4 곡 메뉴 (시트) */
import React from 'react';
import { Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { playlistApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Art, Icon, type IconName, Press, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { openInService, SERVICES } from '@/services/musicLinks';
import { usePreviewStore } from '@/services/preview';
import { findItunes } from '@/services/itunes';
import { useDraft } from '@/store/draft';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
import { track } from '@/services/analytics';

export default function TrackMenuScreen({ navigation, route }: RootScreen<'TrackMenu'>) {
  const { playlistId, song } = route.params;
  const qc = useQueryClient();
  const service = usePrefs(s => s.service);
  const close = () => navigation.goBack();

  const items: [IconName, string, () => void, boolean?][] = [
    ['play', '30초 미리듣기', async () => { const r = await findItunes(song.title, song.artist); if (r.previewUrl) { usePreviewStore.getState().play(song.id, r.previewUrl, { title: song.title, artist: song.artist, image: song.albumImagePath }); close(); } else toast(r.unavailable ? '지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.' : '이 곡은 미리듣기를 지원하지 않아요.'); }],
    ['external', `${service ? SERVICES[service].label : '음악 앱'}에서 열기`, async () => { if (!service) return navigation.replace('ServicePicker', { song }); close(); if (!(await openInService(service, song))) toast(`${SERVICES[service].label}을(를) 열 수 없어요.`, 'error'); }],
    ['plus', '다른 플리에 담기', () => navigation.replace('PlaylistPicker', { song, excludeId: playlistId })],
    ['pin', '이 곡 여기에 드랍하기', () => { useDraft.getState().start('MUSIC'); useDraft.getState().set({ song }); navigation.replace('Note'); }, true],
    ['share', '공유하기', () => { track('share_opened', { kind: 'song', song_id: song.id }); return Share.share({ message: `${song.title} — ${song.artist}${song.links.spotify ? `\n${song.links.spotify}` : ''}` }) }],
  ];

  const removing = React.useRef(false);
  const remove = async () => {
    if (removing.current) return;
    removing.current = true;
    try {
      await playlistApi.removeSong(playlistId, song.id);
      track('playlist_song_removed', { playlist_id: playlistId, song_id: song.id });
      qc.invalidateQueries({ queryKey: ['playlist', playlistId] }); qc.invalidateQueries({ queryKey: ['playlists'] });
      close();
      toast('플레이리스트에서 뺐어요.');
    } catch (e) { toast(errorMessage(e), 'error'); } finally { removing.current = false; }
  };

  return (
    <Sheet>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 14 }}>
        <Art uri={song.albumImagePath} size={52} radius={12} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" numberOfLines={1}>{song.title}</T>
          <T v="caption" c="ink2">{song.artist} · {formatDuration(song.duration)}</T>
        </View>
      </View>
      <View style={{ borderRadius: 20, backgroundColor: colors.page, overflow: 'hidden' }}>
        {items.map(([ic, label, fn, accent], i) => (
          <Press key={label} onPress={fn} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <Icon name={ic} size={20} color={accent ? colors.primary : colors.ink} />
            <T v="body" c={accent ? 'primary' : 'ink'}>{label}</T>
          </Press>
        ))}
      </View>
      <Press onPress={remove} style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15, borderRadius: 20, backgroundColor: colors.page }}>
        <Icon name="close" size={20} color={colors.caution} />
        <T v="body" c="caution">이 플리에서 빼기</T>
      </Press>
    </Sheet>
  );
}
