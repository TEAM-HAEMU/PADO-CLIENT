/* 가입 폼 검사 — 오류 문구와 화면에서 가장 위에 있는 오류 칸 (버튼은 맨 아래라 그 칸으로 올리고 토스트) */
import { firstSignupError, validateSignup } from '@/utils/signupForm';

const ok = { email: 'a@b.co', password: 'password1', username: '파도', birth: '2000-01-01', social: false, providerEmail: null };

test('모두 맞으면 오류 없음', () => {
  expect(firstSignupError(validateSignup(ok))).toBeNull();
});

test('여러 칸이 틀리면 화면 위쪽 칸이 먼저', () => {
  const e = validateSignup({ ...ok, email: 'nope', birth: '2000' });
  expect(e.email).toBe('이메일 형식을 확인해주세요.');
  expect(e.birth).toBe('YYYY-MM-DD 형식으로 입력해주세요.');
  expect(firstSignupError(e)).toEqual({ field: 'email', message: '이메일 형식을 확인해주세요.' });
  expect(firstSignupError(validateSignup({ ...ok, password: 'short', username: ' ' }))?.field).toBe('password');
  expect(firstSignupError(validateSignup({ ...ok, username: '' }))?.field).toBe('username');
});

test('소셜 가입: 비밀번호는 없고, 소셜 이메일이 있으면 이메일도 검사하지 않음', () => {
  expect(firstSignupError(validateSignup({ ...ok, password: '', email: '', social: true, providerEmail: 'x@y.z' }))).toBeNull();
  expect(firstSignupError(validateSignup({ ...ok, password: '', email: 'bad', social: true, providerEmail: null }))?.field).toBe('email');
});
