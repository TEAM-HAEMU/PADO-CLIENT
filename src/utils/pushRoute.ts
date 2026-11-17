/** 푸시 알림 data → 열 화면 (네이티브 의존 없음). 기존 pado:// 딥링크 경로를 그대로 쓴다 (navigation/linking) */
import type { PushType } from '@/api/types';

const TYPES: PushType[] = ['comment', 'like', 'nearby', 'notice'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushTarget {
  /** data.type 그대로 (분석용 — 모르는 종류도 남긴다) */
  type: string;
  /** 열 딥링크 — 드랍이면 pado://drop/{id}?source=notification, 아니면 pado://notifications */
  url: string;
  droppingId: string | null;
}

/**
 * comment·like·nearby → 그 드랍, notice → droppingId가 있으면 그 드랍 아니면 알림 화면.
 * 모르는 종류거나 드랍 ID가 없는 드랍 알림이면 알림 화면으로 (아무 반응이 없으면 고장처럼 보인다).
 * data가 우리 푸시가 아니면(type 없음) null — 앱만 연다
 */
export function pushTarget(data: Record<string, unknown> | null | undefined): PushTarget | null {
  const raw = typeof data?.type === 'string' ? data.type : null;
  if (!raw) return null;
  const known = (TYPES as string[]).includes(raw);
  const id = typeof data?.droppingId === 'string' && UUID_RE.test(data.droppingId) ? data.droppingId : null;
  if (known && id) return { type: raw, url: `pado://drop/${id}?source=notification`, droppingId: id };
  return { type: raw, url: 'pado://notifications', droppingId: null };
}
