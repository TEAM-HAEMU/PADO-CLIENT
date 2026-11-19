/* 혜택·소식 알림 동의·철회 처리 결과 문구 — 서버 marketingUpdatedAt을 한국 시간 날짜로 */
import { kstDateLabel, marketingResultText } from '@/utils/marketingConsent';

const NOW = new Date('2026-11-19T03:00:00Z'); // 한국 2026-11-19 12:00

test('동의·거부 문구 (계약 그대로)', () => {
  expect(marketingResultText(true, '2026-11-19T12:00:00+09:00', NOW)).toBe('2026년 11월 19일 혜택·소식 알림 수신에 동의했어요');
  expect(marketingResultText(false, '2026-11-19T12:00:00+09:00', NOW)).toBe('2026년 11월 19일 혜택·소식 알림 수신을 거부했어요');
});

test('날짜는 한국 시간 기준 — UTC로는 전날이어도 한국에선 다음 날', () => {
  expect(marketingResultText(true, '2026-11-19T15:30:00Z', NOW)).toBe('2026년 11월 20일 혜택·소식 알림 수신에 동의했어요');
  expect(marketingResultText(true, '2026-12-31T23:59:59+09:00', NOW)).toMatch(/^2026년 12월 31일 /);
  expect(marketingResultText(true, '2026-12-31T15:00:00Z', NOW)).toMatch(/^2027년 1월 1일 /);
});

test('오프셋 없는 서버 시각은 UTC로 본다 (utils/format과 같은 규칙)', () => {
  expect(marketingResultText(true, '2026-11-19T16:00:00', NOW)).toMatch(/^2026년 11월 20일 /);
  expect(marketingResultText(true, '2026-11-19T16:00:00.123456', NOW)).toMatch(/^2026년 11월 20일 /);
});

test('날짜가 없거나 읽을 수 없으면 지금 날짜로', () => {
  expect(marketingResultText(true, null, NOW)).toBe('2026년 11월 19일 혜택·소식 알림 수신에 동의했어요');
  expect(marketingResultText(false, undefined, NOW)).toBe('2026년 11월 19일 혜택·소식 알림 수신을 거부했어요');
  expect(marketingResultText(true, 'not-a-date', NOW)).toMatch(/^2026년 11월 19일 /);
});

test('월·일은 앞에 0을 붙이지 않는다', () => {
  expect(kstDateLabel(new Date('2026-03-04T00:00:00+09:00'))).toBe('2026년 3월 4일');
});
