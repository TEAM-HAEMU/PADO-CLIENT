/**
 * 푸시 알림 (FCM) — OS 권한, 기기 토큰 등록·삭제, 알림을 눌렀을 때 열 화면, 앱이 앞에 있을 때 띄우기.
 * 계약: handoff/push-fcm-contract.md (앱용 API · 보내는 조건과 문구 · 앱)
 *
 *  - 토큰: 로그인 + 권한 허용이면 PUT /push/tokens (앱 시작·로그인 직후·토큰 갱신). 로그아웃 직전 DELETE /push/tokens
 *  - 알림을 누르면 data.type에 따라 pado:// 딥링크로 연다 (navigation/linking이 받아 처리 — 로그인 전이면 보관)
 *  - 앱이 앞에 있을 때: iOS는 firebase.json의 presentation 옵션으로 시스템 배너, Android는 notifee로 같은 채널에 띄운다
 *  - Firebase 설정 파일이 없는 빌드(GoogleService-Info.plist·google-services.json 없음)에선 조용히 아무것도 하지 않는다
 */
import { AppState, Linking, Platform } from 'react-native';
import { checkNotifications, requestNotifications, RESULTS } from 'react-native-permissions';
import { getVersion } from 'react-native-device-info';
import { create } from 'zustand';
import { getApp } from '@react-native-firebase/app';
import {
  deleteToken, getInitialNotification, getMessaging, getToken, onMessage, onNotificationOpenedApp, onTokenRefresh,
} from '@react-native-firebase/messaging';
import { pushApi } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { queryClient } from '@/hooks/queryClient';
import { setBeforeSignOut, useAuth } from '@/store/auth';
import { kv } from '@/store/storage';
import { pushTarget } from '@/utils/pushRoute';
import { loadPushSettings } from './pushSettings';
import { track } from './analytics';
import { reportError } from './monitoring';

/** Android 알림 채널 — MainApplication이 앱 시작 때 만든다 (서버 발송의 android.notification.channel_id와 같음) */
export const CHANNEL_ID = 'pado_default';
const PLATFORM = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
/** 마지막으로 서버에 등록한 토큰 — 로그아웃 때 이 값으로 지운다 */
const TOKEN_KEY = 'push:token';
/** 로그아웃 직전 토큰 삭제를 기다리는 최대 시간 — 망이 느려도 탈퇴·다음 로그인이 오래 묶이지 않게 */
const UNREGISTER_WAIT_MS = 3000;
/** 등록이 실패했을 때 앱으로 돌아올 때마다 다시 시도하되, 이 간격보다 자주는 안 한다 */
const RETRY_GAP_MS = 30_000;

// 패키지가 타입을 내보내지 않아 함수 시그니처에서 꺼낸다
type Messaging = ReturnType<typeof getMessaging>;
type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];

/** unknown: 아직 안 물어봄(물어볼 수 있음) / granted: 허용 / denied: 거절해서 설정에서만 켤 수 있음 */
export type PushPermission = 'unknown' | 'granted' | 'denied';

interface PushState {
  permission: PushPermission;
  /** OS 권한을 한 번이라도 확인했는가 (확인 전 'unknown'은 '안 물어봄'이 아니라 '모름') */
  checked: boolean;
  refreshPermission: () => Promise<PushPermission>;
  /** 시스템 권한 창. 이미 막혀 있으면 창이 안 뜨고 denied. source: 분석용 (onboarding 가입 직후 · prompt 기존 사용자 안내 · settings) */
  requestPermission: (source: string) => Promise<PushPermission>;
}

const toPermission = (status: string): PushPermission =>
  status === RESULTS.GRANTED || status === RESULTS.LIMITED ? 'granted' : status === RESULTS.DENIED ? 'unknown' : 'denied';

export const usePush = create<PushState>((set, get) => ({
  permission: 'unknown',
  checked: false,
  refreshPermission: async () => {
    const p = toPermission((await checkNotifications()).status);
    if (p !== get().permission || !get().checked) set({ permission: p, checked: true });
    return p;
  },
  requestPermission: async source => {
    const was = get().permission;
    let p: PushPermission;
    try {
      p = toPermission((await requestNotifications(['alert', 'sound', 'badge'])).status);
    } catch (e) {
      reportError(e, 'push_permission');
      p = await get().refreshPermission().catch(() => was);
    }
    track('push_permission_result', { result: p, was, source });
    set({ permission: p, checked: true });
    if (p === 'granted') syncPushToken();
    return p;
  },
}));

/** Firebase가 설정된 빌드인가 — 설정 파일이 없으면 기본 앱이 없어 getApp()이 던진다 */
function messaging(): Messaging | null {
  try {
    return getMessaging(getApp());
  } catch {
    return null;
  }
}

/** 지금 이 기기로 푸시를 받는 중인가 (권한 허용 + 토큰 등록됨) — 인앱 SSE 토스트와 겹치지 않게 */
export const pushActive = () => usePush.getState().permission === 'granted' && !!kv.get<string | null>(TOKEN_KEY, null);

let syncing: Promise<void> | null = null;
/** 진행 중인 토큰 삭제(서버 + 기기) — 끝나기 전에 등록하면 곧 폐기될 토큰을 올리게 되므로 등록이 기다린다 */
let unregistering: Promise<void> | null = null;
/** 마지막 등록이 실패했다 — 앱으로 돌아올 때 다시 시도 */
let retryNeeded = false;
let lastSyncAt = 0;

/** 로그인 + 권한 허용이면 토큰을 서버에 등록 (같은 토큰이어도 매번 — 다른 계정에 있던 토큰을 지금 계정으로 옮김) */
export function syncPushToken(): Promise<void> {
  if (!syncing) {
    lastSyncAt = Date.now();
    syncing = (async () => {
      if (unregistering) await unregistering;
      if (useAuth.getState().status !== 'authed') return;
      if ((await usePush.getState().refreshPermission()) !== 'granted') return;
      const m = messaging();
      if (!m) return;
      const token = await getToken(m);
      await registerToken(token);
    })()
      .then(() => { retryNeeded = false; })
      .catch(e => { retryNeeded = true; tokenError(e); })
      .finally(() => { syncing = null; });
  }
  return syncing;
}

/** 등록이 실패한 채면 다시 시도 (앱이 앞으로 올 때) — 실패 직후 연달아 부르지 않게 간격을 둔다 */
export function retryPushTokenIfNeeded(now = Date.now()) {
  if (!retryNeeded || useAuth.getState().status !== 'authed' || now - lastSyncAt < RETRY_GAP_MS) return;
  syncPushToken();
}

/** API 오류는 클라이언트가 이미 남겼다 — 토큰 발급(Firebase) 오류만 진단에 */
const tokenError = (e: unknown) => { if (!(e instanceof ApiError)) reportError(e, 'push_token'); };

async function registerToken(token: string) {
  if (!token || useAuth.getState().status !== 'authed') return;
  await pushApi.registerToken(token, PLATFORM, getVersion());
  kv.set(TOKEN_KEY, token);
}

/**
 * 이 기기 토큰을 서버에서 지우고 기기에서도 폐기한다 (로그아웃·탈퇴 직전).
 * 서버 삭제 요청은 이 함수를 부르는 즉시 지금 로그인 토큰으로 보낸다 — 호출 측은 기다리지 않고 로그아웃 상태로 바꿔도 된다.
 * callServer: 아직 로그인 토큰이 살아 있을 때만 서버에 지우라고 한다 (세션 만료면 못 부름 — 기기 토큰 폐기로 더는 닿지 않게)
 * 돌려주는 Promise는 서버 삭제가 끝나면(최대 UNREGISTER_WAIT_MS) 끝난다
 */
export function unregisterPushToken(callServer = true): Promise<void> {
  const token = kv.get<string | null>(TOKEN_KEY, null);
  kv.remove(TOKEN_KEY);
  retryNeeded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = callServer && token
    ? Promise.race([
      pushApi.deleteToken(token).catch(() => {}),
      new Promise<void>(r => { timer = setTimeout(r, UNREGISTER_WAIT_MS); }),
    ]).finally(() => clearTimeout(timer))
    : Promise.resolve();
  const all = server.then(async () => {
    const m = messaging();
    if (m) await deleteToken(m).catch(() => {});
  });
  unregistering = all;
  all.finally(() => { if (unregistering === all) unregistering = null; }).catch(() => {});
  return server;
}

// 로그아웃 직전 — 아직 로그인 토큰이 있을 때 서버 토큰을 지운다 (auth 스토어가 기다림, 순환 import 방지로 등록 방식)
setBeforeSignOut(({ callServer }) => unregisterPushToken(callServer));

// ── 알림 누름 → 화면

type OpenListener = (url: string) => void;
const openListeners = new Set<OpenListener>();

/** 알림 data → 딥링크 URL (분석 push_opened). 우리 알림이 아니면 null */
export function openUrlFor(data: Record<string, unknown> | undefined | null): string | null {
  const t = pushTarget(data);
  if (!t) return null;
  track('push_opened', { type: t.type, has_drop: !!t.droppingId });
  return t.url;
}

/** 앱이 떠 있을 때 알림을 누름 — linking이 등록한 리스너로 넘긴다 */
function opened(data: Record<string, unknown> | undefined | null) {
  const url = openUrlFor(data);
  if (url) openListeners.forEach(l => l(url));
}

/** navigation/linking의 subscribe에서 — 알림을 누르면 이 URL로 */
export function subscribePushOpened(listener: OpenListener) {
  openListeners.add(listener);
  return () => { openListeners.delete(listener); };
}

/** 꺼져 있던 앱을 알림으로 열었으면 그 화면 URL (navigation/linking의 getInitialURL에서) */
export async function initialPushUrl(): Promise<string | null> {
  const m = messaging();
  let data: Record<string, unknown> | undefined;
  try {
    data = m ? (await getInitialNotification(m))?.data : undefined;
    // Android: 앱이 앞에 있을 때 notifee로 띄운 알림을 앱을 끈 뒤 누른 경우
    if (!data && Platform.OS === 'android') data = (await notifee()?.getInitialNotification())?.notification.data;
  } catch {}
  return data ? openUrlFor(data) : null;
}

// ── Android 앞에 있을 때 띄우기 (notifee) — iOS에선 연결하지 않는 모듈이라 Android에서만 불러온다
type Notifee = typeof import('@notifee/react-native').default;
function notifee(): Notifee | null {
  if (Platform.OS !== 'android') return null;
  try {
    return (require('@notifee/react-native') as typeof import('@notifee/react-native')).default;
  } catch {
    return null;
  }
}

async function showForeground(msg: RemoteMessage) {
  const n = notifee();
  if (!n || !msg.notification) return;
  await n.displayNotification({
    title: msg.notification.title,
    body: msg.notification.body,
    data: (msg.data ?? {}) as Record<string, string>,
    android: { channelId: CHANNEL_ID, smallIcon: 'ic_notification', color: '#4F97F2', pressAction: { id: 'default' } },
  });
}

let started = false;
/** 앱 시작 때 한 번 — 수신·누름·토큰 갱신 리스너와 로그인 상태에 따른 토큰 등록 */
export function startPush() {
  if (started) return;
  started = true;
  const m = messaging();
  usePush.getState().refreshPermission().catch(() => {});

  // 로그인되면(앱 시작 자동 로그인 포함) 토큰 등록 + 서버의 알림 설정 받아 두기 (인앱 토스트 거르기·설정 화면 첫 표시)
  const onAuthed = () => { syncPushToken(); loadPushSettings().catch(() => {}); };
  if (useAuth.getState().status === 'authed') onAuthed();
  useAuth.subscribe((s, prev) => { if (s.status === 'authed' && prev.status !== 'authed') onAuthed(); });
  // 설정 앱에서 알림을 켜고 돌아왔을 수 있다
  AppState.addEventListener('change', st => {
    if (st !== 'active') return;
    const before = usePush.getState().permission;
    usePush.getState().refreshPermission().then(p => {
      if (p === 'granted' && before !== 'granted') syncPushToken();
      // 등록이 실패했던 채라면 (망이 끊겼었다 등) 다음 앱 시작·재로그인까지 기다리지 않고 다시
      else retryPushTokenIfNeeded();
    }).catch(() => {});
  });

  if (!m) return;
  onTokenRefresh(m, token => { registerToken(token).catch(e => { retryNeeded = true; tokenError(e); }); });
  onNotificationOpenedApp(m, msg => opened(msg.data));
  onMessage(m, msg => {
    // 인앱 알림 목록도 새로
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    showForeground(msg).catch(e => reportError(e, 'push_foreground'));
  });
  const n = notifee();
  if (n) {
    const { EventType } = require('@notifee/react-native') as typeof import('@notifee/react-native');
    n.onForegroundEvent(({ type, detail }) => { if (type === EventType.PRESS) opened(detail.notification?.data); });
  }
}

/** 백그라운드에서 notifee 알림을 누름 (index.js가 등록) — 앱이 앞으로 오면 리스너가 받는다 */
export function onBackgroundPress(data: Record<string, unknown> | undefined) {
  opened(data);
}

/** 휴대폰 설정 › 이 앱 (알림 켜기 안내) */
export const openNotificationSettings = () => Linking.openSettings().catch(() => {});
