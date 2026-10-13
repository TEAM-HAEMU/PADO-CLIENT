/** 사용자 차단 — 확인창 → POST /blocks → 그 사람의 드랍·댓글이 바로 사라지게 목록을 다시 불러옴 */
import { useQueryClient } from '@tanstack/react-query';
import { safetyApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { UUID } from '@/api/types';
import { dialog } from '@/components/ui/Dialog';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';

export function useBlockUser() {
  const qc = useQueryClient();
  return (userId: UUID, opts: { name?: string; source: 'drop' | 'comment'; onBlocked?: () => void }) => {
    dialog.alert(
      opts.name ? `${opts.name}님을 차단할까요?` : '이 사용자를 차단할까요?',
      '차단하면 이 사용자의 드랍과 댓글이 더 이상 보이지 않아요. 설정 › 차단한 사용자에서 언제든 해제할 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: () =>
            safetyApi.block(userId)
              .then(() => {
                track('user_blocked', { source: opts.source });
                for (const key of ['nearby', 'comments', 'commentCount', 'blocks']) qc.invalidateQueries({ queryKey: [key] });
                toast('차단했어요.', 'success');
                opts.onBlocked?.();
              })
              .catch(e => toast(errorMessage(e), 'error')),
        },
      ],
    );
  };
}
