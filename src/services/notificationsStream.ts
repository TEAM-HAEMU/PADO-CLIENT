/**
 * 인앱 알림 SSE (GET /notifications/subscribe).
 * 명세: 연결 타임아웃 60분 → 끊기면 재연결. 이벤트: dropping-created / like-created / comment-created
 */
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { notificationApi } from '@/api/endpoints';
import { env } from '@/config';
import { queryClient } from '@/hooks/queryClient';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';

type Events = 'connect' | 'like-created' | 'comment-created' | 'dropping-created';
let es: EventSource<Events> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let rotate: ReturnType<typeof setTimeout> | undefined;
let backoff = 5_000;
let wanted = false; // 로그인 상태에서 스트림을 원하는지 (백그라운드 복귀 시 재연결 판단)
let appStateSub: { remove: () => void } | null = null;

/** 서버 타임아웃(60분) 전에 먼저 다시 연결 — 정상 종료가 이벤트 없이 끝나는 경우까지 커버 */
const ROTATE_MS = 55 * 60_000;
const MAX_BACKOFF = 5 * 60_000;

const TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  'like-created': d => `${(d.likerUsername as string) || '누군가'}님이 내 드랍을 좋아해요`,
  'comment-created': d => `${(d.commenterUsername as string) || (d.username as string) || '누군가'}님이 댓글을 남겼어요`,
  'dropping-created': () => '근처에 새 드랍이 생겼어요',
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
  const onEvent = (name: Events) => (e: { data?: string | null }) => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    try {
      const payload = JSON.parse(e.data ?? '{}');
      const prefs = usePrefs.getState().notify;
      const allowed = name === 'like-created' ? prefs.like : name === 'comment-created' ? prefs.comment : prefs.nearby;
      if (allowed && TEXT[name]) toast(TEXT[name](payload.data ?? {}));
      if (name === 'dropping-created') queryClient.invalidateQueries({ queryKey: ['nearby'] });
    } catch {}
  };
  (['like-created', 'comment-created', 'dropping-created'] as const).forEach(n => es!.addEventListener(n, onEvent(n)));
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
