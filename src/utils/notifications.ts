/**
 * 인앱 알림 중 알림이 아닌 것 — 작성자 본인 드랍 생성 기록(dropping-created).
 * 예전 서버가 드랍을 남긴 사람 본인의 알림함에 저장해서, 앱이 '근처에 새 드랍이 생겼어요'로 보여 주고 안 읽음 점도 띄웠다
 * (주변 새 드랍 알림을 꺼도). 서버는 이제 저장하지 않고 SSE 새로고침 신호(my-dropping-created)만 보낸다.
 * 이미 쌓인 기록은 지우지 않는다. 새 서버는 목록·안 읽음 수에서 빼고 주고, 앱도 예전 서버를 위해 한 번 더 거른다
 */
import type { AppNotification } from '@/api/types';

/** 목록·안 읽음 수·토스트에서 빼는 이벤트 (예전 서버가 저장한 본인 드랍 생성 기록) */
export const HIDDEN_NOTIFICATION_EVENTS: ReadonlySet<string> = new Set(['dropping-created']);

/** SSE로만 오는 새로고침 신호 — 지도(주변 드랍)를 다시 받는다. 알림이 아니라 토스트·목록에 쓰지 않는다 */
export const REFRESH_SIGNAL_EVENTS = ['dropping-created', 'my-dropping-created'] as const;

export const isHiddenNotification = (n: Pick<AppNotification, 'eventName'>) => HIDDEN_NOTIFICATION_EVENTS.has(n.eventName);

/** 서버 목록을 보여 줄 것과 안 읽은 숨김 항목(안 읽음 수에서 뺄 것)으로 나눈다 */
export function splitNotifications(list: AppNotification[]) {
  const visible: AppNotification[] = [];
  const hiddenUnread: AppNotification[] = [];
  for (const n of list) {
    if (!isHiddenNotification(n)) visible.push(n);
    else if (!n.readAt) hiddenUnread.push(n);
  }
  return { visible, hiddenUnread };
}

/** 서버 안 읽음 수에서 숨긴 안 읽음 항목을 뺀 값 (0 아래로 내려가지 않음) */
export const visibleUnreadCount = (serverCount: number, hiddenUnread: number) => Math.max(0, serverCount - hiddenUnread);

/**
 * 서버가 숨길 기록을 줄 수 있는지 (예전 서버). true면 안 읽음 수를 셀 때 목록도 한 번 본다 (hooks/api useUnreadCount).
 * 한 번 봐서 없으면 끄고, 예전 서버의 dropping-created 신호가 오거나 드랍을 만들거나 다시 로그인하면 켠다
 * — 새 서버는 목록에서 빼고 주므로 곧 꺼진 채로 남아 추가 요청이 없다
 */
export const hiddenNotifications = { mayExist: true };
