/**
 * 알림 권한 안내(한 장)를 띄울지 — 네이티브 의존 없음 (jest에서 바로 시험).
 *  - 막 가입한 사람: 온보딩에서 (위치 안내 다음, 지도 전)
 *  - 이미 가입한 사람: 새 버전을 처음 열고 지도에 들어온 직후 한 번
 * 둘 다 OS 권한이 아직 결정 전(iOS notDetermined · Android 13+ 아직 안 물어봄)이고 이 기기에서 안내를 본 적 없을 때만.
 * 이미 허용·거절한 사람(설정에서만 바꿀 수 있음)에겐 띄우지 않는다
 */
export type PushPermissionState = 'unknown' | 'granted' | 'denied';

export interface PushPromptInput {
  authed: boolean;
  /** OS 권한을 한 번이라도 확인했는가 — 확인 전의 'unknown'으로 띄우지 않게 */
  checked: boolean;
  permission: PushPermissionState;
  /** 이 기기에서 안내를 본 적 있음 */
  seen: boolean;
  /** 막 가입함 — 온보딩 쪽이 맡는다 */
  signupPending: boolean;
}

/** 가입 직후 온보딩 한 장 */
export const needSignupPushPrompt = (s: PushPromptInput) =>
  s.authed && s.signupPending && s.checked && s.permission === 'unknown';

/** 이미 가입한 사람 — 지도에 들어온 직후 한 번 (가입 직후 흐름과 겹치지 않게 signupPending이면 띄우지 않음) */
export const needExistingPushPrompt = (s: PushPromptInput) =>
  s.authed && !s.signupPending && !s.seen && s.checked && s.permission === 'unknown';
