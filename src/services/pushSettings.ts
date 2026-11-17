/**
 * 설정 › 알림 토글 ↔ 서버 (GET·PUT /push/settings). 서버가 보내기 전에 이 값으로 거른다.
 *  - 누르면 바로 화면에 반영하고 PUT, 실패하면 그 토글만 되돌린다
 *  - 같은 토글을 빠르게 여러 번 누르면 마지막 요청의 결과만 반영한다 (늦게 온 이전 응답·실패가 새 값을 덮지 않게)
 *  - 서버 응답(전체 값)은 요청 중인 토글을 빼고 맞춘다
 *  - 주변 새 드랍을 켜면 서버가 켜짐을 저장한 뒤에 지금 위치를 보낸다 (꺼져 있을 때 보낸 위치는 서버가 버림)
 */
import { pushApi } from '@/api/endpoints';
import type { PushSettings } from '@/api/types';
import { usePrefs } from '@/store/prefs';

export type PushSettingKey = keyof PushSettings;
const KEYS: PushSettingKey[] = ['like', 'comment', 'nearby', 'notice'];

/** 토글마다 마지막 요청 번호 — 요청 중이면 서버 응답으로 덮지 않는다 */
const seq: Record<PushSettingKey, number> = { like: 0, comment: 0, nearby: 0, notice: 0 };
const pending: Record<PushSettingKey, number> = { like: 0, comment: 0, nearby: 0, notice: 0 };
/** 연달아 누르는 동안 서버가 마지막으로 확인한 값 — 마지막 요청이 실패하면 이 값으로 되돌린다 */
const confirmed: Partial<Record<PushSettingKey, boolean>> = {};

/** 주변 새 드랍이 켜지고 꺼질 때 할 일 — services/pushRegion이 등록 (켬: 지금 위치 보내기, 끔: 보낸 기록 지우기) */
let onNearbyChanged: ((on: boolean) => void) | undefined;
export const setOnNearbyChanged = (fn: (on: boolean) => void) => { onNearbyChanged = fn; };

/** 서버 응답 중 쓸 수 있는 값만 — 요청 중인 토글은 빼고 */
function applyServer(s: Partial<PushSettings> | null | undefined) {
  if (!s || typeof s !== 'object') return;
  const next: Partial<PushSettings> = {};
  for (const k of KEYS) if (typeof s[k] === 'boolean' && pending[k] === 0) next[k] = s[k];
  const was = usePrefs.getState().notify.nearby;
  usePrefs.getState().applyNotify(next);
  const now = usePrefs.getState().notify.nearby;
  if (now !== was) onNearbyChanged?.(now);
}

/** 서버 값 불러오기 (설정 화면 열 때·로그인 뒤). 실패하면 마지막 값 그대로 두고 던진다 */
export async function loadPushSettings(): Promise<PushSettings> {
  const s = await pushApi.settings();
  applyServer(s);
  return usePrefs.getState().notify;
}

/** 토글 하나 바꾸기. 실패하면 그 토글을 되돌리고 오류를 던진다 (화면이 토스트) — 더 새 요청이 있으면 조용히 끝남 */
export async function changePushSetting(key: PushSettingKey, value: boolean): Promise<void> {
  const prev = usePrefs.getState().notify[key];
  if (prev === value && pending[key] === 0) return;
  const my = ++seq[key];
  if (pending[key] === 0) confirmed[key] = prev;
  pending[key]++;
  usePrefs.getState().setNotify(key, value);
  let res: PushSettings | undefined;
  let error: unknown;
  try {
    res = await pushApi.updateSettings({ [key]: value });
    confirmed[key] = typeof res?.[key] === 'boolean' ? res[key] : value;
  } catch (e) {
    error = e;
  } finally {
    pending[key]--;
  }
  if (my !== seq[key]) return; // 그사이 같은 토글을 또 눌렀다 — 그 요청이 마무리한다
  if (error) {
    usePrefs.getState().applyNotify({ [key]: confirmed[key] ?? prev });
    throw error;
  }
  // 이번에 바꾼 토글은 서버가 확인한 값으로, 나머지는 요청 중이 아니면 서버 값으로
  if (res && typeof res[key] === 'boolean') usePrefs.getState().applyNotify({ [key]: res[key] });
  applyServer(res);
  if (key === 'nearby' && (res?.nearby ?? value) === value) onNearbyChanged?.(value);
}
