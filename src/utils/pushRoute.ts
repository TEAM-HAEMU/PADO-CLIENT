/** 푸시 알림 data → 열 화면 (네이티브 의존 없음). 기존 pado:// 딥링크 경로를 그대로 쓴다 (navigation/linking) */
import type { PushNoticeTarget, PushType } from '@/api/types';

const TYPES: PushType[] = ['comment', 'like', 'nearby', 'notice'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 운영자 발송(notice)의 target → 딥링크 (handoff/push-marketing-contract.md '열 곳'). DROP·DROP_OR_INBOX는 드랍 ID로 정한다 */
const TARGET_URLS: Partial<Record<PushNoticeTarget, string>> = {
  CREATE_DROP: 'pado://new',
  MAP: 'pado://map',
  MY_PLAYLISTS: 'pado://playlists',
  MY: 'pado://me',
};

export interface PushTarget {
  /** data.type 그대로 (분석용 — 모르는 종류도 남긴다) */
  type: string;
  /** 열 딥링크 — 드랍이면 pado://drop/{id}?source=notification, 운영자 발송이면 target에 따라, 아니면 pado://notifications */
  url: string;
  droppingId: string | null;
  /** 운영자 발송(notice)만 — 서버 집계(push_opened)에 붙인다. UUID가 아니면 null (잘못된 값으로 묶음 전체가 거절되지 않게) */
  noticeId: string | null;
  /** 운영자 발송(notice)만 — NOTICE·AD (분석용, 모르는 값도 그대로) */
  kind: string | null;
  /** 운영자 발송(notice)만 — data.target 그대로 (분석용, 모르는 값도 그대로) */
  target: string | null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/**
 * comment·like·nearby → 그 드랍.
 * notice → target에 따라: DROP 그 드랍 · CREATE_DROP 드랍 남기기 · MAP 지도 홈 · MY_PLAYLISTS 내 플레이리스트 · MY 마이 탭.
 *   그 밖이나 값 없음(옛 서버·DROP_OR_INBOX)은 기존 동작 — droppingId가 있으면 그 드랍, 없으면 알림 화면.
 * 모르는 종류거나 드랍 ID가 없는 드랍 알림이면 알림 화면으로 (아무 반응이 없으면 고장처럼 보인다).
 * data가 우리 푸시가 아니면(type 없음) null — 앱만 연다
 */
export function pushTarget(data: Record<string, unknown> | null | undefined): PushTarget | null {
  const raw = typeof data?.type === 'string' ? data.type : null;
  if (!raw) return null;
  const known = (TYPES as string[]).includes(raw);
  const id = typeof data?.droppingId === 'string' && UUID_RE.test(data.droppingId) ? data.droppingId : null;
  const notice = raw === 'notice';
  const noticeId = notice && typeof data?.noticeId === 'string' && UUID_RE.test(data.noticeId) ? data.noticeId : null;
  const kind = notice ? str(data?.kind) : null;
  const target = notice ? str(data?.target) : null;
  const base = { type: raw, noticeId, kind, target };

  const fixed = target && Object.prototype.hasOwnProperty.call(TARGET_URLS, target) ? TARGET_URLS[target as PushNoticeTarget] : undefined;
  if (fixed) return { ...base, url: fixed, droppingId: null };
  if (known && id) return { ...base, url: `pado://drop/${id}?source=notification`, droppingId: id };
  return { ...base, url: 'pado://notifications', droppingId: null };
}
