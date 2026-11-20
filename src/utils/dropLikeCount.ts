import type { DropSummary } from '@/api/types';

/** 내 드랍 목록이 드랍별 받은 좋아요 수(likeCount)를 담았는지 — 새 서버만 담는다. 예전 서버면 화면이 드랍마다 따로 묻는다 */
export const hasLikeCounts = (drops: readonly DropSummary[]) => drops.every(d => typeof d.likeCount === 'number');
