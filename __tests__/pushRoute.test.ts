/* 푸시 알림 data → 열 화면 (계약: comment·like·nearby → 그 드랍, notice → 드랍이 있으면 드랍 아니면 알림 화면) */
import { pushTarget } from '@/utils/pushRoute';

const DROP = '0199a5e0-1111-7abc-8def-000000000123';

test.each(['comment', 'like', 'nearby'])('%s → 그 드랍 (알림에서 열림 표시)', type => {
  expect(pushTarget({ type, droppingId: DROP })).toEqual({ type, url: `pado://drop/${DROP}?source=notification`, droppingId: DROP });
});

test('공지: 드랍이 있으면 그 드랍, 없으면 알림 화면', () => {
  expect(pushTarget({ type: 'notice', noticeId: '42', droppingId: DROP })?.url).toBe(`pado://drop/${DROP}?source=notification`);
  expect(pushTarget({ type: 'notice', noticeId: '42' })).toEqual({ type: 'notice', url: 'pado://notifications', droppingId: null });
  expect(pushTarget({ type: 'notice', noticeId: '42', droppingId: '' })?.url).toBe('pado://notifications');
});

test('드랍 ID가 없거나 UUID가 아니면 알림 화면 (다른 경로로 새지 않게)', () => {
  expect(pushTarget({ type: 'like' })?.url).toBe('pado://notifications');
  expect(pushTarget({ type: 'comment', droppingId: '../settings' })?.url).toBe('pado://notifications');
});

test('모르는 종류는 알림 화면, 분석용 종류는 그대로', () => {
  expect(pushTarget({ type: 'reply', droppingId: DROP })).toEqual({ type: 'reply', url: 'pado://notifications', droppingId: null });
});

test('우리 알림이 아니면(type 없음) 아무 화면도 열지 않는다', () => {
  expect(pushTarget({})).toBeNull();
  expect(pushTarget(undefined)).toBeNull();
  expect(pushTarget({ type: 3 })).toBeNull();
});
