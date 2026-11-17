import { Linking } from 'react-native';
import { CommonActions, getStateFromPath, type LinkingOptions } from '@react-navigation/native';
import { useAuth } from '@/store/auth';
import { initialPushUrl, subscribePushOpened } from '@/services/push';
import { navigationRef } from './ref';
import type { RootStackParamList } from './types';

const PREFIX = 'pado://';

// 딥링크로 받은 ID는 UUID만 허용 (다른 값이면 해당 화면이 오류 화면을 보여줌)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string) => (UUID_RE.test(v) ? v : 'invalid');

// 로그인 전(게스트)에 들어온 링크는 보관했다가 로그인 뒤에 연다
let pendingUrl: string | null = null;

const authReady = () => new Promise<string>(resolve => {
  const now = useAuth.getState().status;
  if (now !== 'loading') return resolve(now);
  const unsub = useAuth.subscribe(st => { if (st.status !== 'loading') { unsub(); resolve(st.status); } });
});

/** 로그인 직후 호출 — 보관한 링크가 있으면 그 화면으로 */
export function openPendingLink() {
  const url = pendingUrl;
  pendingUrl = null;
  if (!url || !navigationRef.isReady()) return;
  const state = getStateFromPath(url.replace(PREFIX, ''), linking.config);
  if (state) navigationRef.dispatch(CommonActions.reset(state as never));
}

/**
 * pado:// 딥링크. 드랍 공유 링크는 타입을 모르므로 PinPreview로 보내고,
 * PinPreview가 투표·플리 드랍이면 상세로 넘긴다.
 * 푸시 알림을 누른 것도 같은 경로로 연다 (services/push가 알림 data를 pado:// URL로 바꿔 줌)
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [PREFIX],
  async getInitialURL() {
    // 링크로 열었으면 그 링크, 아니면 꺼져 있던 앱을 알림으로 열었을 때 그 알림의 화면
    const url = (await Linking.getInitialURL()) ?? (await initialPushUrl());
    if (!url) return null;
    if ((await authReady()) !== 'authed') { pendingUrl = url; return null; }
    return url;
  },
  subscribe(listener) {
    const open = (url: string) => {
      if (useAuth.getState().status !== 'authed') pendingUrl = url;
      else listener(url);
    };
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    const unsubPush = subscribePushOpened(open);
    return () => { sub.remove(); unsubPush(); };
  },
  config: {
    // 앱이 꺼진 상태에서 딥링크로 열어도 뒤에 지도(탭)가 깔리게
    initialRouteName: 'Tabs',
    screens: {
      Tabs: {
        screens: { Map: 'map', Playlists: 'playlists', Profile: 'me' },
      },
      // source=notification: 푸시 알림에서 열림 (분석 drop_opened) — 다른 값은 버린다
      PinPreview: { path: 'drop/:dropId', parse: { dropId: uuid, source: (v: string) => (v === 'notification' ? 'notification' : undefined) } },
      VoteDrop: { path: 'vote/:dropId', parse: { dropId: uuid } },
      PlaylistDrop: { path: 'playlist-drop/:dropId', parse: { dropId: uuid } },
      // 링크로는 곡과 드랍만 — 대기열·자동재생 같은 내부 파라미터는 받지 않는다
      Player: { path: 'song/:songId', parse: { songId: uuid, dropId: uuid, queue: () => undefined, autoplay: () => undefined } },
      Comments: { path: 'drop/:dropId/comments', parse: { dropId: uuid } },
      PlaylistDetail: { path: 'playlist/:playlistId', parse: { playlistId: uuid, openAdd: () => undefined } },
      DropType: 'new',
      NewPlaylist: 'playlists/new',
      Notifications: 'notifications',
      Settings: 'settings',
      ProfileEdit: 'me/edit',
      BlockedUsers: 'settings/blocked',
    },
  },
};
