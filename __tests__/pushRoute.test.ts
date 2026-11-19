/* 푸시 알림 data → 열 화면 (계약: comment·like·nearby → 그 드랍, notice → target에 따라, target이 없거나 모르면 드랍이 있으면 드랍 아니면 알림 화면) */
import { pushTarget } from '@/utils/pushRoute';

const DROP = '0199a5e0-1111-7abc-8def-000000000123';
const NOTICE = '0199a5e0-2222-7abc-8def-000000000456';
const NONE = { noticeId: null, kind: null, target: null };

test.each(['comment', 'like', 'nearby'])('%s → 그 드랍 (알림에서 열림 표시)', type => {
  expect(pushTarget({ type, droppingId: DROP })).toEqual({ type, url: `pado://drop/${DROP}?source=notification`, droppingId: DROP, ...NONE });
});

test('공지(옛 서버, target 없음): 드랍이 있으면 그 드랍, 없으면 알림 화면', () => {
  expect(pushTarget({ type: 'notice', noticeId: '42', droppingId: DROP })?.url).toBe(`pado://drop/${DROP}?source=notification`);
  expect(pushTarget({ type: 'notice', noticeId: '42' })).toEqual({ type: 'notice', url: 'pado://notifications', droppingId: null, ...NONE });
  expect(pushTarget({ type: 'notice', noticeId: '42', droppingId: '' })?.url).toBe('pado://notifications');
});

describe('운영자 발송 target → 화면 (기존 pado:// 딥링크)', () => {
  const notice = (target: string, extra: Record<string, string> = {}) => pushTarget({ type: 'notice', noticeId: NOTICE, kind: 'AD', target, ...extra });

  test.each([
    ['CREATE_DROP', 'pado://new'],
    ['MAP', 'pado://map'],
    ['MY_PLAYLISTS', 'pado://playlists'],
    ['MY', 'pado://me'],
  ])('%s → %s', (target, url) => {
    expect(notice(target)).toEqual({ type: 'notice', url, droppingId: null, noticeId: NOTICE, kind: 'AD', target });
  });

  test('열 곳이 정해져 있으면 함께 온 드랍 ID보다 앞선다', () => {
    expect(notice('MAP', { droppingId: DROP })?.url).toBe('pado://map');
  });

  test('DROP → 그 드랍, 드랍 ID가 없거나 UUID가 아니면 알림 화면', () => {
    expect(notice('DROP', { droppingId: DROP })).toEqual({ type: 'notice', url: `pado://drop/${DROP}?source=notification`, droppingId: DROP, noticeId: NOTICE, kind: 'AD', target: 'DROP' });
    expect(notice('DROP')?.url).toBe('pado://notifications');
    expect(notice('DROP', { droppingId: 'nope' })?.url).toBe('pado://notifications');
  });

  test('DROP_OR_INBOX·모르는 값은 기존 동작 (드랍 → 드랍, 없으면 알림 화면), 분석용 target은 그대로', () => {
    expect(notice('DROP_OR_INBOX', { droppingId: DROP })?.url).toBe(`pado://drop/${DROP}?source=notification`);
    expect(notice('DROP_OR_INBOX')?.url).toBe('pado://notifications');
    expect(notice('SHOP')).toMatchObject({ url: 'pado://notifications', target: 'SHOP' });
    expect(notice('toString')?.url).toBe('pado://notifications');
  });

  test('noticeId는 UUID일 때만 (서버 집계 묶음이 거절되지 않게)', () => {
    expect(pushTarget({ type: 'notice', noticeId: 'abc', target: 'MAP' })?.noticeId).toBeNull();
  });

  test('운영자 발송이 아니면 target·kind·noticeId를 보지 않는다', () => {
    expect(pushTarget({ type: 'like', droppingId: DROP, target: 'MAP', kind: 'AD', noticeId: NOTICE })).toEqual({ type: 'like', url: `pado://drop/${DROP}?source=notification`, droppingId: DROP, ...NONE });
  });
});

test('드랍 ID가 없거나 UUID가 아니면 알림 화면 (다른 경로로 새지 않게)', () => {
  expect(pushTarget({ type: 'like' })?.url).toBe('pado://notifications');
  expect(pushTarget({ type: 'comment', droppingId: '../settings' })?.url).toBe('pado://notifications');
});

test('모르는 종류는 알림 화면, 분석용 종류는 그대로', () => {
  expect(pushTarget({ type: 'reply', droppingId: DROP })).toEqual({ type: 'reply', url: 'pado://notifications', droppingId: null, ...NONE });
});

test('우리 알림이 아니면(type 없음) 아무 화면도 열지 않는다', () => {
  expect(pushTarget({})).toBeNull();
  expect(pushTarget(undefined)).toBeNull();
  expect(pushTarget({ type: 3 })).toBeNull();
});
