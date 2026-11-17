import { needExistingPushPrompt, needSignupPushPrompt, type PushPromptInput } from '@/utils/pushPrompt';

const base: PushPromptInput = { authed: true, checked: true, permission: 'unknown', seen: false, signupPending: false };

describe('알림 권한 안내 — 기존 사용자', () => {
  it('로그인 + 권한 결정 전 + 본 적 없음이면 띄운다', () => {
    expect(needExistingPushPrompt(base)).toBe(true);
  });
  it('권한을 아직 확인하지 못했으면(모름) 띄우지 않는다', () => {
    expect(needExistingPushPrompt({ ...base, checked: false })).toBe(false);
  });
  it('이미 허용·거절했으면 띄우지 않는다', () => {
    expect(needExistingPushPrompt({ ...base, permission: 'granted' })).toBe(false);
    expect(needExistingPushPrompt({ ...base, permission: 'denied' })).toBe(false);
  });
  it('한 번 본 기기엔 다시 띄우지 않는다', () => {
    expect(needExistingPushPrompt({ ...base, seen: true })).toBe(false);
  });
  it('막 가입한 흐름(온보딩이 맡음)과 겹치지 않는다', () => {
    expect(needExistingPushPrompt({ ...base, signupPending: true })).toBe(false);
  });
  it('로그아웃 상태면 띄우지 않는다', () => {
    expect(needExistingPushPrompt({ ...base, authed: false })).toBe(false);
  });
});

describe('알림 권한 안내 — 가입 직후', () => {
  it('막 가입했고 권한 결정 전이면 띄운다', () => {
    expect(needSignupPushPrompt({ ...base, signupPending: true })).toBe(true);
  });
  it('가입 흐름이 아니면 띄우지 않는다', () => {
    expect(needSignupPushPrompt(base)).toBe(false);
  });
});
