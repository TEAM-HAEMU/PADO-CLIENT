/* 설정 › 이용 분석 변경 — SDK 시작이 실패해도 처리되지 않은 거부 없이 진단에 남기고, 고른 값은 유지 */
jest.mock('@/services/analytics', () => ({
  migrateAnalyticsMode: () => 'basic',
  setAnalyticsMode: jest.fn(async () => undefined),
  setUserProps: jest.fn(),
  track: jest.fn(),
}));
jest.mock('@/services/monitoring', () => ({ setMonitoringMode: jest.fn(), reportError: jest.fn() }));

import { setOnDetailedAnalyticsEnabled, usePrefs } from '@/store/prefs';

const analytics = jest.requireMock('@/services/analytics') as { setAnalyticsMode: jest.Mock; track: jest.Mock };
const monitoring = jest.requireMock('@/services/monitoring') as { setMonitoringMode: jest.Mock; reportError: jest.Mock };
const flush = () => new Promise<void>(r => setImmediate(r));
const onDetailed = jest.fn();
setOnDetailedAnalyticsEnabled(onDetailed);

beforeEach(() => {
  jest.clearAllMocks();
  usePrefs.setState({ analyticsMode: 'basic' });
});

test('상세로 켜면 적용 뒤 기록하고 사용자 식별', async () => {
  usePrefs.getState().setAnalyticsMode('detailed');
  expect(monitoring.setMonitoringMode).toHaveBeenCalledWith('detailed');
  await flush();
  expect(analytics.track).toHaveBeenCalledWith('setting_changed', { key: 'analytics_mode', value: 'detailed' });
  expect(onDetailed).toHaveBeenCalledTimes(1);
  expect(monitoring.reportError).not.toHaveBeenCalled();
});

test('분석 SDK 시작이 실패하면 오류 진단에 남기고, 고른 값은 그대로 · 켠 뒤 할 일은 안 함', async () => {
  const err = new Error('amplitude init failed');
  analytics.setAnalyticsMode.mockRejectedValueOnce(err);
  usePrefs.getState().setAnalyticsMode('detailed');
  await flush();
  expect(monitoring.reportError).toHaveBeenCalledWith(err, 'analytics_mode');
  expect(usePrefs.getState().analyticsMode).toBe('detailed');
  expect(onDetailed).not.toHaveBeenCalled();
  expect(analytics.track).not.toHaveBeenCalledWith('setting_changed', expect.anything());
});
