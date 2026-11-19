/**
 * 설정 › 알림 토글 ↔ 서버 (GET·PUT /push/settings). 서버가 보내기 전에 이 값으로 거른다.
 *  - 누르면 바로 화면에 반영하고 PUT, 실패하면 그 토글만 되돌린다
 *  - 같은 토글을 빠르게 여러 번 누르면 마지막 요청의 결과만 반영한다 (늦게 온 이전 응답·실패가 새 값을 덮지 않게)
 *  - 서버 응답(전체 값)은 요청 중인 토글을 빼고 맞춘다
 *  - 주변 새 드랍을 켜면 서버가 켜짐을 저장한 뒤에 지금 위치를 보낸다 (꺼져 있을 때 보낸 위치는 서버가 버림)
 *  - 혜택·소식(marketing): 가입 약관 MARKETING 동의와 함께 바꾸고, 서버 응답의 marketingUpdatedAt으로 처리 결과를 알린다 (changeMarketingConsent)
 */
import { pushApi, userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { PushSettings, PushSettingsResponse, UserAgreement } from '@/api/types';
import { queryClient } from '@/hooks/queryClient';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { marketingResultText } from '@/utils/marketingConsent';

export type PushSettingKey = keyof PushSettings;
const KEYS: PushSettingKey[] = ['like', 'comment', 'nearby', 'notice', 'marketing'];

/** 토글마다 마지막 요청 번호 — 요청 중이면 서버 응답으로 덮지 않는다 */
const seq: Record<PushSettingKey, number> = { like: 0, comment: 0, nearby: 0, notice: 0, marketing: 0 };
const pending: Record<PushSettingKey, number> = { like: 0, comment: 0, nearby: 0, notice: 0, marketing: 0 };
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

/**
 * 토글 하나 바꾸기. 실패하면 그 토글을 되돌리고 오류를 던진다 (화면이 토스트).
 * 이 요청이 마지막 요청으로 저장되면 서버 응답(전체 값 + marketingUpdatedAt)을 돌려준다.
 * 이미 같은 값이었거나 더 새 요청이 있으면 undefined (그 요청이 마무리한다 — 처리 결과도 그쪽이 알린다)
 */
export async function changePushSetting(key: PushSettingKey, value: boolean): Promise<PushSettingsResponse | undefined> {
  const prev = usePrefs.getState().notify[key];
  if (prev === value && pending[key] === 0) return undefined;
  const my = ++seq[key];
  if (pending[key] === 0) confirmed[key] = prev;
  pending[key]++;
  usePrefs.getState().setNotify(key, value);
  let res: PushSettingsResponse | undefined;
  let error: unknown;
  try {
    res = await pushApi.updateSettings({ [key]: value });
    confirmed[key] = typeof res?.[key] === 'boolean' ? res[key] : value;
  } catch (e) {
    error = e;
  } finally {
    pending[key]--;
  }
  if (my !== seq[key]) return undefined; // 그사이 같은 토글을 또 눌렀다 — 그 요청이 마무리한다
  if (error) {
    usePrefs.getState().applyNotify({ [key]: confirmed[key] ?? prev });
    throw error;
  }
  // 이번에 바꾼 토글은 서버가 확인한 값으로, 나머지는 요청 중이 아니면 서버 값으로
  if (res && typeof res[key] === 'boolean') usePrefs.getState().applyNotify({ [key]: res[key] });
  applyServer(res);
  if (key === 'nearby' && (res?.nearby ?? value) === value) onNearbyChanged?.(value);
  return res ?? { ...usePrefs.getState().notify };
}

const NOT_READY = '지금은 바꿀 수 없어요. 잠시 뒤 다시 해 주세요.';

/** 가입 약관의 MARKETING 동의 기록을 같은 값으로 (PUT /users/agreements/marketing) + 화면 캐시 맞추기 */
async function setMarketingAgreement(value: boolean) {
  await userApi.setMarketing(value);
  queryClient.setQueryData<UserAgreement[]>(['agreements'], old => old?.map(a => (a.type === 'MARKETING' ? { ...a, agreed: value } : a)));
  queryClient.invalidateQueries({ queryKey: ['agreements'] });
}

/**
 * 혜택·소식 알림(광고성, 이메일·앱 푸시 하나의 선택 동의) 동의·철회 — 설정 토글, 가입 직후 알림 안내의 체크, 가입 화면의 선택 동의가 함께 쓴다.
 *  - 푸시 설정 marketing과 가입 약관 MARKETING 동의를 같은 값으로 맞춘다 (agreement: false면 푸시만 — 가입 화면에서 이미 동의를 보낸 경우)
 *  - 둘 다 저장되면 서버의 marketingUpdatedAt 날짜로 처리 결과를 토스트로 한 번 알린다 (법이 요구하는 처리 결과 통지)
 *  - 하나라도 실패하면 토글을 되돌리고(이미 바뀐 푸시 설정도 원래대로 돌려 보고) 오류 토스트
 *  - 연달아 누르면 마지막 요청만 동의 기록까지 맞추고 결과를 알린다
 */
export async function changeMarketingConsent(value: boolean, opts: { agreement?: boolean } = {}): Promise<boolean> {
  const syncAgreement = opts.agreement ?? true;
  let res: PushSettingsResponse | undefined;
  try {
    res = await changePushSetting('marketing', value);
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
  if (!res) return true;
  // 서버가 아직 이 값을 모르면(배포 전) 저장되지 않은 것 — 동의했다고 알리지 않고 되돌린다
  if (typeof res.marketing !== 'boolean') {
    usePrefs.getState().applyNotify({ marketing: !value });
    toast(NOT_READY, 'error');
    return false;
  }
  if (syncAgreement) {
    try {
      await setMarketingAgreement(value);
    } catch (e) {
      // 동의 기록만 실패 — 이미 바꾼 푸시 설정을 원래대로 (그것도 실패하면 서버가 가진 값이 화면에 남는다)
      toast(errorMessage(e), 'error');
      await changePushSetting('marketing', !value).catch(() => {});
      return false;
    }
  }
  toast(marketingResultText(res.marketing, res.marketingUpdatedAt), 'success');
  return true;
}
