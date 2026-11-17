/* 앱 업데이트 안내 흐름 (services/appUpdate) — 확인 주기·실패 시 유지·'나중에' 저장·스토어 여는 순서 */
const mockAppVersion = jest.fn();
const mockTrack = jest.fn();
const mockInApp = jest.fn();
let mockVersion = '1.0.25';
jest.mock('@/api/endpoints', () => ({ settingsApi: { appVersion: () => mockAppVersion() } }));
jest.mock('@/services/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/services/inAppUpdate', () => ({ startInAppUpdate: () => mockInApp() }));
jest.mock('react-native-device-info', () => ({ getVersion: () => mockVersion }));

const RN = require('react-native') as typeof import('react-native');
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false; // 개발 빌드는 확인하지 않으므로 출시 빌드처럼
const svc = require('@/services/appUpdate') as typeof import('@/services/appUpdate');
const { kv } = require('@/store/storage') as typeof import('@/store/storage');

const rows = (min: string, latest: string) => ['IOS', 'ANDROID'].map(platform => ({ platform, minVersion: min, latestVersion: latest }));
let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  svc.useAppUpdate.setState({ decision: null, nextCheckAt: 0, promptedThisRun: null });
  kv.remove('appUpdate.dismissedLatest');
  mockVersion = '1.0.25';
  openURL = jest.spyOn(RN.Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(RN.Linking, 'canOpenURL').mockResolvedValue(true);
  RN.Platform.OS = 'ios';
});

describe('checkAppVersion', () => {
  it('필수·선택을 판정하고, 1시간 안에는 다시 부르지 않는다', async () => {
    mockAppVersion.mockResolvedValue(rows('1.0.26', '1.0.27'));
    await svc.checkAppVersion(true);
    expect(svc.useAppUpdate.getState().decision).toEqual({ kind: 'required', latestVersion: '1.0.27' });
    await svc.checkAppVersion();
    expect(mockAppVersion).toHaveBeenCalledTimes(1);
    mockAppVersion.mockResolvedValue(rows('0', '1.0.27'));
    await svc.checkAppVersion(true);
    expect(svc.useAppUpdate.getState().decision).toEqual({ kind: 'optional', latestVersion: '1.0.27' });
  });
  it('실패하면(배포 전 404·네트워크) 안내하지 않고 지난 판정을 유지, 5분 뒤 다시', async () => {
    mockAppVersion.mockRejectedValue(new Error('404'));
    await svc.checkAppVersion(true);
    expect(svc.useAppUpdate.getState().decision).toBeNull();
    const next = svc.useAppUpdate.getState().nextCheckAt - Date.now();
    expect(next).toBeGreaterThan(4 * 60_000);
    expect(next).toBeLessThanOrEqual(5 * 60_000);
    svc.useAppUpdate.setState({ decision: { kind: 'required', latestVersion: '2.0' } });
    await svc.checkAppVersion(true);
    expect(svc.useAppUpdate.getState().decision?.kind).toBe('required');
  });
  it('동시에 여러 번 불러도 한 번만 요청', async () => {
    mockAppVersion.mockResolvedValue(rows('0', '0'));
    await Promise.all([svc.checkAppVersion(true), svc.checkAppVersion(true)]);
    expect(mockAppVersion).toHaveBeenCalledTimes(1);
  });
});

describe('선택 안내', () => {
  it("'나중에'를 누르면 같은 latestVersion은 다시 안 띄우고, 더 새 버전이면 다시", () => {
    svc.useAppUpdate.setState({ decision: { kind: 'optional', latestVersion: '1.0.27' } });
    expect(svc.optionalPromptDue()).toBe(true);
    svc.dismissOptionalUpdate();
    expect(mockTrack).toHaveBeenCalledWith('app_update_dismissed', { latest_version: '1.0.27' });
    expect(svc.optionalPromptDue()).toBe(false);
    svc.useAppUpdate.setState({ decision: { kind: 'optional', latestVersion: '1.0.28' } });
    expect(svc.optionalPromptDue()).toBe(true);
  });
  it('한 번 띄웠으면 같은 실행 안에선 다시 안 띄운다 (업데이트를 누르고 돌아온 경우)', () => {
    svc.useAppUpdate.setState({ decision: { kind: 'optional', latestVersion: '1.0.27' } });
    svc.markPromptShown('optional');
    expect(mockTrack).toHaveBeenCalledWith('app_update_prompt_shown', expect.objectContaining({ kind: 'optional' }));
    expect(svc.optionalPromptDue()).toBe(false);
  });
  it('필수는 선택 시트 대상이 아니다', () => {
    svc.useAppUpdate.setState({ decision: { kind: 'required', latestVersion: '1.0.27' } });
    expect(svc.optionalPromptDue()).toBe(false);
  });
});

describe('openAppUpdate', () => {
  it('iOS: App Store 앱 → 안 되면 웹', async () => {
    await svc.openAppUpdate('required');
    expect(openURL).toHaveBeenCalledWith('itms-apps://apps.apple.com/app/id6820077981');
    expect(mockTrack).toHaveBeenCalledWith('app_update_clicked', expect.objectContaining({ kind: 'required' }));
    openURL.mockReset().mockRejectedValueOnce(new Error('no')).mockResolvedValue(undefined);
    await svc.openAppUpdate('optional');
    expect(openURL.mock.calls.map(c => c[0])).toEqual(['itms-apps://apps.apple.com/app/id6820077981', 'https://apps.apple.com/app/id6820077981']);
    expect(mockInApp).not.toHaveBeenCalled();
  });
  it('iOS: App Store 앱이 없으면(시뮬레이터) 바로 웹', async () => {
    jest.spyOn(RN.Linking, 'canOpenURL').mockResolvedValue(false);
    await svc.openAppUpdate('required');
    expect(openURL.mock.calls.map(c => c[0])).toEqual(['https://apps.apple.com/app/id6820077981']);
  });
  it('Android: Play 인앱 업데이트가 뜨면 스토어를 열지 않는다', async () => {
    RN.Platform.OS = 'android';
    mockInApp.mockResolvedValue(true);
    await svc.openAppUpdate('required');
    expect(openURL).not.toHaveBeenCalled();
  });
  it('Android: 인앱 업데이트 실패(사이드로드·Play 없음) → market:// → 웹', async () => {
    RN.Platform.OS = 'android';
    mockInApp.mockResolvedValue(false);
    openURL.mockReset().mockRejectedValueOnce(new Error('no market')).mockResolvedValue(undefined);
    await svc.openAppUpdate('optional');
    expect(openURL.mock.calls.map(c => c[0])).toEqual(['market://details?id=com.paado.app', 'https://play.google.com/store/apps/details?id=com.paado.app']);
  });
});
