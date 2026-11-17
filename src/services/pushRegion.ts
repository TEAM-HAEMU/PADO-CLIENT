/**
 * 주변 새 드랍 알림 — 마지막으로 앱을 쓴 곳을 서버에 알린다 (PUT /push/region).
 * 서버는 좌표를 행정동 코드로 바꿔 그것만 남기고 좌표는 버린다 (위치 약관 3조).
 *  - 주변 새 드랍이 켜져 있고, 로그인했고, 앱이 앞에 있고, 지금 위치(낡지 않은 좌표)를 받았을 때만
 *  - 지난번 보낸 뒤 30분이 지났거나 300m 넘게 움직였을 때만 (utils/pushRegion)
 *  - 실패하면 5분 동안은 다시 시도하지 않는다 (위치가 올 때마다 요청이 쌓이지 않게)
 */
import { AppState } from 'react-native';
import { pushApi } from '@/api/endpoints';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { kv } from '@/store/storage';
import { currentCoords, useLocation } from './location';
import { setOnNearbyChanged } from './pushSettings';
import { shouldSendRegion, type SentRegion } from '@/utils/pushRegion';

const LAST_KEY = 'push:region';
const RETRY_AFTER_MS = 5 * 60_000;

let last: SentRegion | null = kv.get<SentRegion | null>(LAST_KEY, null);
let inflight = false;
let failedAt = 0;

/** 보낸 기록 지우기 — 주변 새 드랍을 끔(서버도 지움)·로그아웃 */
export function forgetPushRegion() {
  last = null;
  failedAt = 0;
  kv.remove(LAST_KEY);
}

/** 조건이 맞으면 지금 위치를 보낸다 */
export function maybeSendPushRegion(now = Date.now()) {
  if (inflight || AppState.currentState !== 'active') return;
  if (useAuth.getState().status !== 'authed' || !usePrefs.getState().notify.nearby) return;
  const c = currentCoords(useLocation.getState());
  if (!c) return;
  if (failedAt && now - failedAt < RETRY_AFTER_MS) return;
  if (!shouldSendRegion(last, c, now)) return;
  inflight = true;
  pushApi.region(c.latitude, c.longitude)
    .then(() => {
      // 보내는 사이 로그아웃했으면 기록하지 않는다
      if (useAuth.getState().status !== 'authed') return;
      last = { latitude: c.latitude, longitude: c.longitude, at: now };
      failedAt = 0;
      kv.set(LAST_KEY, last);
    })
    .catch(() => { failedAt = now; })
    .finally(() => { inflight = false; });
}

let started = false;
/** 앱 시작 때 한 번 */
export function startPushRegionSync() {
  if (started) return;
  started = true;
  // 위치가 새로 들어오거나 낡음이 풀릴 때
  useLocation.subscribe((s, p) => { if (s.coords !== p.coords || s.stale !== p.stale) maybeSendPushRegion(); });
  // 앱이 앞으로 올 때 (위치 감시는 지도 화면이 다시 켠다 — 새 위치가 오면 위에서 다시 본다)
  AppState.addEventListener('change', st => { if (st === 'active') maybeSendPushRegion(); });
  useAuth.subscribe((s, p) => {
    if (s.status === 'authed' && p.status !== 'authed') maybeSendPushRegion();
    if (s.status === 'guest' && p.status === 'authed') forgetPushRegion();
  });
  // 서버가 주변 새 드랍 켜짐을 저장한 뒤에 바로 보낸다 / 끄면 서버가 행을 지우므로 기록도 지운다
  setOnNearbyChanged(on => {
    forgetPushRegion();
    if (on) maybeSendPushRegion();
  });
  maybeSendPushRegion();
}
