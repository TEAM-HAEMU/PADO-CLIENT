/* 설정 › 알림 토글 ↔ 서버 (GET·PUT /push/settings) — 바로 반영, 실패하면 되돌림, 연달아 누르면 마지막 것만 */
jest.mock('@/services/analytics', () => ({ migrateAnalyticsMode: () => 'basic', setAnalyticsMode: jest.fn(async () => undefined), setUserProps: jest.fn(), track: jest.fn() }));
jest.mock('@/services/monitoring', () => ({ setMonitoringMode: jest.fn(), reportError: jest.fn() }));
jest.mock('@/api/endpoints', () => ({ pushApi: { settings: jest.fn(), updateSettings: jest.fn() } }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { usePrefs } from '@/store/prefs';
import { changeMarketingConsent, changePushSetting, loadPushSettings, setOnNearbyChanged } from '@/services/pushSettings';

const { pushApi } = jest.requireMock('@/api/endpoints') as { pushApi: { settings: jest.Mock; updateSettings: jest.Mock } };
const analytics = jest.requireMock('@/services/analytics') as { track: jest.Mock };
const { toast } = jest.requireMock('@/store/toast') as { toast: jest.Mock };
const DEFAULTS = { like: true, comment: true, nearby: false, notice: true, marketing: false };
const nearbyChanged = jest.fn();
setOnNearbyChanged(nearbyChanged);

/** 직접 끝내는 요청 */
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  usePrefs.setState({ notify: { ...DEFAULTS } });
});

test('저장된 예전 설정(공지·혜택·소식 없음)도 공지 켜짐 · 혜택·소식 꺼짐으로 시작한다', () => {
  expect(usePrefs.getState().notify.notice).toBe(true);
  expect(usePrefs.getState().notify.marketing).toBe(false);
});

test('서버 값을 불러와 맞춘다 (분석 이벤트는 남기지 않음)', async () => {
  pushApi.settings.mockResolvedValueOnce({ like: false, comment: true, nearby: false, notice: false, marketing: true, marketingUpdatedAt: '2026-11-19T03:00:00Z' });
  await loadPushSettings();
  expect(usePrefs.getState().notify).toEqual({ like: false, comment: true, nearby: false, notice: false, marketing: true });
  expect(analytics.track).not.toHaveBeenCalled();
});

test('불러오기가 실패하면 마지막 값 그대로', async () => {
  pushApi.settings.mockRejectedValueOnce(new Error('network'));
  await expect(loadPushSettings()).rejects.toThrow('network');
  expect(usePrefs.getState().notify).toEqual(DEFAULTS);
});

test('누르면 바로 반영하고 바꾼 것만 서버에 보낸다', async () => {
  const d = deferred<typeof DEFAULTS>();
  pushApi.updateSettings.mockReturnValueOnce(d.promise);
  const p = changePushSetting('like', false);
  expect(usePrefs.getState().notify.like).toBe(false);
  expect(pushApi.updateSettings).toHaveBeenCalledWith({ like: false });
  expect(analytics.track).toHaveBeenCalledWith('setting_changed', { key: 'notify_like', value: false });
  d.resolve({ ...DEFAULTS, like: false });
  await p;
  expect(usePrefs.getState().notify.like).toBe(false);
});

test('저장이 실패하면 그 토글만 되돌리고 오류를 던진다', async () => {
  pushApi.updateSettings.mockRejectedValueOnce(new Error('500'));
  await expect(changePushSetting('comment', false)).rejects.toThrow('500');
  expect(usePrefs.getState().notify).toEqual(DEFAULTS);
});

test('같은 토글을 연달아 누르면 늦게 온 이전 응답이 새 값을 덮지 않는다', async () => {
  const first = deferred<typeof DEFAULTS>();
  const second = deferred<typeof DEFAULTS>();
  pushApi.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a = changePushSetting('notice', false);
  const b = changePushSetting('notice', true);
  second.resolve({ ...DEFAULTS, notice: true });
  await b;
  first.resolve({ ...DEFAULTS, notice: false }); // 이전 요청 응답이 늦게 옴
  await a;
  expect(usePrefs.getState().notify.notice).toBe(true);
});

test('연달아 누른 마지막 요청이 실패하면 서버가 마지막으로 확인한 값으로 되돌린다', async () => {
  const first = deferred<typeof DEFAULTS>();
  const second = deferred<typeof DEFAULTS>();
  pushApi.updateSettings.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const a = changePushSetting('like', false);
  const b = changePushSetting('like', true);
  first.resolve({ ...DEFAULTS, like: false }); // 서버는 꺼짐을 저장
  await a;
  second.reject(new Error('timeout'));
  await expect(b).rejects.toThrow('timeout');
  expect(usePrefs.getState().notify.like).toBe(false);
});

test('다른 토글의 응답은 요청 중인 토글을 덮지 않는다', async () => {
  const like = deferred<typeof DEFAULTS>();
  pushApi.updateSettings.mockReturnValueOnce(like.promise).mockResolvedValueOnce({ ...DEFAULTS, comment: false }); // 서버는 아직 like 켜짐
  const a = changePushSetting('like', false);
  await changePushSetting('comment', false);
  expect(usePrefs.getState().notify).toMatchObject({ like: false, comment: false });
  like.resolve({ ...DEFAULTS, like: false, comment: false });
  await a;
  expect(usePrefs.getState().notify).toMatchObject({ like: false, comment: false });
});

test('주변 새 드랍은 서버가 저장한 뒤에 켜짐·꺼짐을 알린다 (위치 보내기)', async () => {
  const d = deferred<typeof DEFAULTS>();
  pushApi.updateSettings.mockReturnValueOnce(d.promise);
  const p = changePushSetting('nearby', true);
  expect(nearbyChanged).not.toHaveBeenCalled();
  d.resolve({ ...DEFAULTS, nearby: true });
  await p;
  expect(nearbyChanged).toHaveBeenCalledWith(true);

  pushApi.updateSettings.mockResolvedValueOnce({ ...DEFAULTS, nearby: false });
  await changePushSetting('nearby', false);
  expect(nearbyChanged).toHaveBeenLastCalledWith(false);
});

test('주변 새 드랍 켜기가 실패하면 알리지 않는다', async () => {
  pushApi.updateSettings.mockRejectedValueOnce(new Error('500'));
  await expect(changePushSetting('nearby', true)).rejects.toThrow();
  expect(nearbyChanged).not.toHaveBeenCalled();
  expect(usePrefs.getState().notify.nearby).toBe(false);
});

test('불러온 서버 값에서 주변 새 드랍이 켜져 있으면 알린다 (다른 기기에서 켬)', async () => {
  pushApi.settings.mockResolvedValueOnce({ ...DEFAULTS, nearby: true });
  await loadPushSettings();
  expect(nearbyChanged).toHaveBeenCalledWith(true);
});

test('이미 같은 값이면 요청하지 않는다', async () => {
  await changePushSetting('like', true);
  expect(pushApi.updateSettings).not.toHaveBeenCalled();
});

describe('혜택·소식 알림 동의 — 처리 결과 알림', () => {
  test('동의하면 서버가 저장한 날짜로 알린다', async () => {
    pushApi.updateSettings.mockResolvedValueOnce({ ...DEFAULTS, marketing: true, marketingUpdatedAt: '2026-11-19T15:30:00Z' });
    await expect(changeMarketingConsent(true)).resolves.toBe(true);
    expect(pushApi.updateSettings).toHaveBeenCalledWith({ marketing: true });
    expect(usePrefs.getState().notify.marketing).toBe(true);
    expect(toast).toHaveBeenCalledWith('2026년 11월 20일 혜택·소식 알림 수신에 동의했어요', 'success');
  });

  test('철회하면 거부 문구', async () => {
    usePrefs.setState({ notify: { ...DEFAULTS, marketing: true } });
    pushApi.updateSettings.mockResolvedValueOnce({ ...DEFAULTS, marketing: false, marketingUpdatedAt: '2026-11-21T01:00:00+09:00' });
    await changeMarketingConsent(false);
    expect(toast).toHaveBeenCalledWith('2026년 11월 21일 혜택·소식 알림 수신을 거부했어요', 'success');
  });

  test('연달아 누르면 마지막 결과만 알린다', async () => {
    const first = deferred<typeof DEFAULTS>();
    pushApi.updateSettings.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...DEFAULTS, marketing: false, marketingUpdatedAt: '2026-11-19T03:00:00Z' });
    const a = changeMarketingConsent(true);
    await changeMarketingConsent(false);
    first.resolve({ ...DEFAULTS, marketing: true });
    await a;
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('2026년 11월 19일 혜택·소식 알림 수신을 거부했어요', 'success');
    expect(usePrefs.getState().notify.marketing).toBe(false);
  });

  test('저장이 실패하면 되돌리고 오류만 알린다', async () => {
    pushApi.updateSettings.mockRejectedValueOnce(new Error('500'));
    await expect(changeMarketingConsent(true)).resolves.toBe(false);
    expect(usePrefs.getState().notify.marketing).toBe(false);
    expect(toast).toHaveBeenCalledWith('500', 'error');
  });

  test('서버가 아직 marketing을 모르면(배포 전) 동의했다고 알리지 않고 되돌린다', async () => {
    pushApi.updateSettings.mockResolvedValueOnce({ like: true, comment: true, nearby: false, notice: true });
    await expect(changeMarketingConsent(true)).resolves.toBe(false);
    expect(usePrefs.getState().notify.marketing).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});
