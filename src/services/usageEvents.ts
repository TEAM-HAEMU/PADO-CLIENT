/**
 * 서버 이용 집계 (POST /events) — 전체 사용자 기준 숫자(앱 열기·드랍 열기·미리듣기·잠금 탭·공유)를 서버가 합계로만 센다.
 *  - 모아서 보낸다: 마지막 이벤트 10초 뒤, 50개가 차면 바로, 앱이 백그라운드로 갈 때
 *  - 로그인 토큰을 붙이지 않는다 (서버도 사용자와 연결하지 않음). 이름과 드랍 ID 말고는 보내지 않는다
 *  - 분석을 완전히 끈 사람은 보내지 않는다 (analytics.ts가 판단해서 enqueue를 부른다)
 *  - 화면을 막지 않는다: 실패는 조용히. 네트워크 오류면 다음 번에 다시, 404(서버 배포 전)·400이면 버린다
 *  - 목 모드에선 보내지 않는다
 */
import { env } from '@/config';

export const SERVER_EVENTS = ['app_opened', 'drop_opened', 'preview_started', 'drop_locked_tap', 'share_opened'] as const;
export type ServerEventName = (typeof SERVER_EVENTS)[number];
export interface ServerEvent { name: ServerEventName; droppingId?: string }

export const isServerEvent = (name: string): name is ServerEventName => (SERVER_EVENTS as readonly string[]).includes(name);

/** 서버 한 번 요청 한도 */
export const BATCH_MAX = 50;
const DEBOUNCE_MS = 10_000;
/** 오래 오프라인이어도 기기에 무한정 쌓지 않는다 */
const QUEUE_MAX = 500;
const TIMEOUT_MS = 10_000;

type Send = (events: ServerEvent[]) => Promise<number>;

const defaultSend: Send = async events => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.apiBaseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      signal: ctrl.signal,
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
};

export function createUsageQueue(opts: { send?: Send; debounceMs?: number; enabled?: () => boolean } = {}) {
  const send = opts.send ?? defaultSend;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
  const enabled = opts.enabled ?? (() => !env.useMock);
  let queue: ServerEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending: Promise<void> | null = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, debounceMs);
  };

  async function flushOnce() {
    while (queue.length) {
      const batch = queue.slice(0, BATCH_MAX);
      queue = queue.slice(batch.length);
      const status = await send(batch).catch(() => 0);
      // 네트워크 오류·서버 오류(5xx)는 다음 기회에 다시 (앞에 되돌려 놓음). 2xx·4xx(404 배포 전 포함)는 버린다
      if (status === 0 || status >= 500) {
        queue = [...batch, ...queue].slice(-QUEUE_MAX);
        return;
      }
    }
  }

  /** 지금 모인 것을 보낸다 (보내는 중이면 그 요청을 기다린다) */
  function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!enabled() || !queue.length) return sending ?? Promise.resolve();
    if (!sending) sending = flushOnce().finally(() => { sending = null; });
    return sending;
  }

  return {
    enqueue(name: ServerEventName, droppingId?: string | null) {
      if (!enabled()) return;
      queue.push(droppingId ? { name, droppingId } : { name });
      if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
      if (queue.length >= BATCH_MAX) flush();
      else schedule();
    },
    flush,
    /** 분석을 끄면 아직 안 보낸 것도 버린다 */
    clear() { queue = []; if (timer) { clearTimeout(timer); timer = null; } },
    get size() { return queue.length; },
  };
}

export const usageQueue = createUsageQueue();
