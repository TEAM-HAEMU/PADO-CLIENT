/** 가입 폼 검사 (순수 함수 — 테스트 대상). 화면 위에서 아래 순서대로 */
import { validBirth } from './birth';

export const SIGNUP_FIELDS = ['email', 'password', 'username', 'birth'] as const;
export type SignupField = (typeof SIGNUP_FIELDS)[number];
export type SignupErrors = Partial<Record<SignupField, string | null>>;

export interface SignupInput {
  email: string;
  password: string;
  username: string;
  birth: string;
  /** 소셜 가입이면 비밀번호 칸이 없다 */
  social: boolean;
  /** 소셜 계정이 준 이메일 — 있으면 이메일 칸은 고칠 수 없고 검사하지 않는다 */
  providerEmail: string | null;
}

export const validEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim());

export function validateSignup(f: SignupInput): SignupErrors {
  const e: SignupErrors = {};
  if (!f.social || !f.providerEmail) e.email = validEmail(f.email) ? null : '이메일 형식을 확인해주세요.';
  if (!f.social) e.password = f.password.length >= 8 && f.password.length <= 20 ? null : '비밀번호는 8~20자예요.';
  const name = f.username.trim();
  e.username = name.length >= 1 && name.length <= 15 ? null : '닉네임은 1~15자예요.';
  e.birth = validBirth(f.birth);
  return e;
}

/** 화면에서 가장 위에 있는 오류 칸 (스크롤·안내 문구용). 오류가 없으면 null */
export function firstSignupError(e: SignupErrors): { field: SignupField; message: string } | null {
  for (const field of SIGNUP_FIELDS) {
    const message = e[field];
    if (message) return { field, message };
  }
  return null;
}
