/**
 * 인앱 알림 SSE (GET /notifications/subscribe).
 * 명세: 연결 타임아웃 60분 → 끊기면 재연결.
 * 이벤트: like-created / comment-created (알림함에 저장된 알림 — 목록 새로고침 + 토스트)
 *        my-dropping-created / dropping-created (내 드랍이 생김 — 지도 새로고침 신호만. utils/notifications)
 *  - dropping-created는 예전 서버가 본인 알림함에 저장하며 보내던 이름. '근처 새 드랍'이 아니라 토스트를 띄우지 않는다
 */
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { notificationApi } from '@/api/endpoints';
import { env } from '@/config';
import { queryClient } from '@/hooks/queryClient';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { hiddenNotifications, REFRESH_SIGNAL_EVENTS } from '@/utils/notifications';
import { pushActive } from './push';

type NotificationEvents = 'like-created' | 'comment-created';
type Events = 'connect' | NotificationEvents | (typeof REFRESH_SIGNAL_EVENTS)[number];
let es: EventSource<Events> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let rotate: ReturnType<typeof setTimeout> | undefined;
let backoff = 5_000;
let wanted = false; // 로그인 상태에서 스트림을 원하는지 (백그라운드 복귀 시 재연결 판단)
let appStateSub: { remove: () => void } | null = null;

/** 서버 타임아웃(60분) 전에 먼저 다시 연결 — 정상 종료가 이벤트 없이 끝나는 경우까지 커버 */
const ROTATE_MS = 55 * 60_000;
const MAX_BACKOFF = 5 * 60_000;

const TEXT: Record<NotificationEvents, (d: Record<string, unknown>) => string> = {
  'like-created': d => `${(d.likerUsername as string) || '누군가'}님이 내 드랍을 좋아해요`,
  'comment-created': d => `${(d.commenterUsername as string) || (d.username as string) || '누군가'}님이 댓글을 남겼어요`,
};

function connect() {
  closeCurrent();
  if (env.useMock) return; // 목 서버는 SSE를 흉내 내지 않는다
  if (!useAuth.getState().accessToken) return;
  es = new EventSource<Events>(`${env.apiBaseUrl}/notifications/subscribe`, {
    headers: { Authorization: { toString: () => `Bearer ${useAuth.getState().accessToken}` } },
    timeoutBeforeConnection: 0,
    // 스트림이 정상 종료(프록시 유휴 타임아웃 등)되면 라이브러리가 이 간격 뒤 다시 연결한다 — 이벤트 없이 끝나는 경우 대비
    // (오류는 아래 error 리스너가 직접 백오프로 처리)
    pollingInterval: 3_000,
  });
  const onEvent = (name: NotificationEvents) => (e: { data?: string | null }) => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    try {
      const payload = JSON.parse(e.data ?? '{}');
      const prefs = usePrefs.getState().notify;
      const allowed = name === 'like-created' ? prefs.like : prefs.comment;
      // 이 기기로 푸시를 받는 중이면 같은 소식이 시스템 배너로도 오므로 토스트는 띄우지 않는다
      if (allowed && !pushActive()) toast(TEXT[name](payload.data ?? {}));
    } catch {}
  };
  const onRefresh = (name: (typeof REFRESH_SIGNAL_EVENTS)[number]) => () => {
    queryClient.invalidateQueries({ queryKey: ['nearby'] });
    // 예전 서버는 이 신호와 함께 본인 알림함에 기록을 남긴다 — 안 읽음 수를 다시 세며 거른다
    if (name === 'dropping-created') { hiddenNotifications.mayExist = true; queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] }); }
  };
  (['like-created', 'comment-created'] as const).forEach(n => es!.addEventListener(n, onEvent(n)));
  REFRESH_SIGNAL_EVENTS.forEach(n => es!.addEventListener(n, onRefresh(n)));
  es.addEventListener('open', () => { backoff = 5_000; });
  es.addEventListener('close', () => scheduleReconnect(false));
  // 라이브러리는 error 이벤트를 보낸 '뒤에' 자체 재연결 타이머를 건다 → 다음 틱에 닫아야 close()가 그 타이머까지 지운다
  // (바로 닫으면 닫힌 인스턴스가 리스너 없이 다시 열리는 누수가 생김)
  const mine = es;
  es.addEventListener('error', e => {
    const unauthorized = (e as { xhrStatus?: number }).xhrStatus === 401;
    setTimeout(() => {
      if (es !== mine) return; // 그사이 새 연결로 바뀌었으면 무시
      if (AppState.currentState !== 'active') { closeCurrent(); return; } // 백그라운드면 복귀 때 다시 연결
      scheduleReconnect(unauthorized);
    }, 0);
  });
  rotate = setTimeout(connect, ROTATE_MS);
}

function scheduleReconnect(unauthorized: boolean) {
  closeCurrent();
  if (!wanted) return;
  const delay = backoff;
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
  retry = setTimeout(async () => {
    // 토큰 만료로 끊긴 경우: 인증이 필요한 가벼운 요청으로 재발급 흐름을 태운 뒤 다시 연결
    if (unauthorized) await notificationApi.unreadCount().catch(() => {});
    if (wanted) connect();
  }, delay);
}

function closeCurrent() {
  clearTimeout(retry);
  clearTimeout(rotate);
  if (es) { es.removeAllEventListeners(); es.close(); es = null; }
}

export function startNotificationStream() {
  wanted = true;
  hiddenNotifications.mayExist = true; // 로그인한 계정이 바뀌었을 수 있다 — 첫 안 읽음 수는 다시 거른다
  backoff = 5_000;
  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', st => {
      if (st === 'active') { if (wanted && !es) { backoff = 5_000; connect(); } }
      else if (st === 'background') closeCurrent();
    });
  }
  connect();
}

export function stopNotificationStream() {
  wanted = false;
  closeCurrent();
}
