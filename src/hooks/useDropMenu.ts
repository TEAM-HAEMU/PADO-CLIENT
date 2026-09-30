/** 드랍 ⋯ 메뉴 — 내 드랍이면 삭제, 남의 드랍이면 신고 (핀 미리보기·상세·재생 화면 공용) */
import { useNavigation } from '@react-navigation/native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { UUID } from '@/api/types';
import { toast } from '@/store/toast';
import { useIsMyDrop } from './api';

export function useDropMenu(dropId: UUID | undefined, ownerId: UUID | undefined, title = '드랍') {
  const navigation = useNavigation();
  const qc = useQueryClient();
  const mine = useIsMyDrop(dropId);

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
      mine
        ? { text: '드랍 삭제', style: 'destructive', onPress: remove }
        : { text: '신고하기', onPress: () => navigation.navigate('Report', { targetType: 'DROPPING', targetId: dropId, userId: ownerId, label: '이 드랍' }) },
      { text: '취소', style: 'cancel' },
    ]);
  };

  return { mine, open };
}
