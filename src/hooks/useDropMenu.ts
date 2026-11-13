/**
 * 드랍 ⋯ 메뉴 — 내 드랍이면 삭제, 남의 드랍이면 드랍 신고·사용자 신고·차단 (핀 미리보기·상세·재생 화면 공용)
 * song을 넘기면(음악 드랍) 맨 위에 '내 플리에 담기'. 드랍 정보가 있으면 '공유하기'(스토리 카드).
 */
import { useNavigation } from '@react-navigation/native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { isPlaylistDetail, isVoteDetail, type DropDetail, type DropSummary, type Song, type UUID } from '@/api/types';
import type { ShareCardData } from '@/components/share/StoryCard';
import { toast } from '@/store/toast';
import { useDrop, useDropAddress, useIsMyDrop } from './api';
import { useBlockUser } from './useBlockUser';

export function useDropMenu(dropId: UUID | undefined, ownerId: UUID | undefined, title = '드랍', ownerName?: string, song?: Song) {
  const navigation = useNavigation();
  const blockUser = useBlockUser();
  const qc = useQueryClient();
  const mine = useIsMyDrop(dropId);
  const drop = useDrop(dropId).data;
  const address = useDropAddress(dropId, drop && 'address' in drop ? drop.address : undefined);
  const card = drop ? withCoords(shareCard(drop, song, address), drop, dropId, qc) : null;

  const remove = () => {
    if (!dropId) return;
    dialog.alert('이 드랍을 삭제할까요?', '삭제한 드랍은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          dropApi.remove(dropId)
            .then(() => {
              qc.invalidateQueries({ queryKey: ['nearby'] });
              qc.invalidateQueries({ queryKey: ['myDrops'] });
              qc.removeQueries({ queryKey: ['drop', dropId] });
              toast('드랍을 삭제했어요.');
              if (navigation.canGoBack()) navigation.goBack();
            })
            .catch(e => toast(errorMessage(e), 'error')),
      },
    ]);
  };

  const open = () => {
    if (!dropId) return;
    dialog.menu(title, [
      ...(song ? [{ text: '내 플리에 담기', icon: 'plus' as const, onPress: () => navigation.navigate('PlaylistPicker', { song }) }] : []),
      ...(card ? [{ text: '공유하기', icon: 'share' as const, onPress: () => navigation.navigate('ShareCard', card) }] : []),
      ...(mine
        ? [{ text: '드랍 삭제', style: 'destructive' as const, icon: 'trash' as const, onPress: remove }]
        : [
            { text: '신고하기', style: 'destructive' as const, icon: 'flag' as const, onPress: () => navigation.navigate('Report', { targetType: 'DROPPING', targetId: dropId, userId: ownerId, label: '이 드랍' }) },
            ...(ownerId ? [{ text: '사용자 신고', style: 'destructive' as const, icon: 'flag' as const, onPress: () => navigation.navigate('Report', { targetType: 'USER', targetId: ownerId, userId: ownerId, label: ownerName ? `${ownerName}님` : '이 사용자' }) }] : []),
            ...(ownerId ? [{ text: '차단하기', style: 'destructive' as const, icon: 'block' as const, onPress: () => blockUser(ownerId, { name: ownerName, source: 'drop', onBlocked: () => { if (navigation.canGoBack()) navigation.goBack(); } }) }] : []),
          ]),
      { text: '취소', style: 'cancel' },
    ]);
  };

  return { mine, open };
}

/** 공유 카드 내용 — 음악은 곡 정보가 있어야 만든다 */
/** 공유 카드 지도용 드랍 위치 — 투표·플리 상세엔 좌표가 있고, 음악 드랍은 받아 둔 주변·내 드랍·좋아요 목록에서 찾는다 */
function withCoords(card: ShareCardData | null, d: DropDetail, dropId: UUID | undefined, qc: QueryClient): ShareCardData | null {
  if (!card) return null;
  if ('latitude' in d && 'longitude' in d) return { ...card, latitude: d.latitude, longitude: d.longitude };
  for (const key of [['nearby'], ['myDrops'], ['myLikes']]) {
    for (const [, list] of qc.getQueriesData<DropSummary[]>({ queryKey: key })) {
      const hit = Array.isArray(list) ? list.find(x => x?.droppingId === dropId) : undefined;
      if (hit && hit.latitude != null) return { ...card, latitude: hit.latitude, longitude: hit.longitude };
    }
  }
  return card;
}

function shareCard(d: DropDetail, song: Song | undefined, place = ''): ShareCardData | null {
  if (isVoteDetail(d)) return { art: d.options[0]?.albumImagePath ?? null, title: d.topic, sub: `후보 ${d.options.length}곡`, place, note: d.content };
  if (isPlaylistDetail(d)) return { art: d.songs[0]?.albumImagePath ?? null, title: d.playlistName, sub: `${d.songs.length}곡`, place, note: d.content };
  if (!song) return null;
  return { art: d.albumImageUrl ?? song.albumImagePath, title: song.title, sub: song.artist, place, note: d.content };
}
