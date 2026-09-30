import { expiryLabel, formatDuration, formatRelative, formatTotal } from '@/utils/format';

const now = Date.parse('2026-09-27T12:00:00Z');

test('formatRelative — 오프셋 없는 서버 시각도 UTC로 해석', () => {
  expect(formatRelative('2026-09-27T11:59:30', now)).toBe('방금');
  expect(formatRelative('2026-09-27T11:15:00Z', now)).toBe('45분 전');
  expect(formatRelative('2026-09-27T09:00:00Z', now)).toBe('3시간 전');
  expect(formatRelative('2026-09-25T12:00:00Z', now)).toBe('2일 전');
});

test('formatDuration / formatTotal', () => {
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(214.6)).toBe('3:35');
  expect(formatTotal(1500)).toBe('25분');
  expect(formatTotal(4500)).toBe('1시간 15분');
});

test('expiryLabel', () => {
  expect(expiryLabel('2026-09-27T11:00:00Z', now)).toBe('만료됨');
  expect(expiryLabel('2026-09-27T12:30:00Z', now)).toBe('곧 사라져요');
  expect(expiryLabel('2026-09-27T17:00:00Z', now)).toBe('5시간 남음');
  expect(expiryLabel('2026-09-30T12:00:00Z', now)).toBe('3일 남음');
});

import { validBirth } from '@/utils/birth';

test('validBirth — 없는 날짜·미래·14세 미만', () => {
  expect(validBirth('2001-02-29')).toBe('올바른 날짜를 입력해주세요.');
  expect(validBirth('2000-02-29')).toBeNull();
  expect(validBirth('2999-01-01')).toBe('올바른 날짜를 입력해주세요.');
  expect(validBirth('20000101')).toContain('YYYY-MM-DD');
  const kid = `${new Date().getFullYear() - 10}-01-01`;
  expect(validBirth(kid)).toContain('가입');
  expect(validBirth(kid, 'edit')).not.toContain('가입');
});
