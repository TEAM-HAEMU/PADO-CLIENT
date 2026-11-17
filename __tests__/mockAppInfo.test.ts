/* 목 응답 (api/mock/appInfo) — 개발용 플래그로 필수·선택 안내를 미리 볼 수 있다 */
jest.mock('react-native-device-info', () => ({ getVersion: () => '1.0' }));
import { mockVersionSettings, nextVersion } from '@/api/mock/appInfo';
import { decideUpdate } from '@/utils/appVersion';

describe('mock appInfo', () => {
  it('다음 버전', () => {
    expect(nextVersion('1.0')).toBe('1.1');
    expect(nextVersion('1.0.25')).toBe('1.0.26');
  });
  it('플래그대로 판정된다', () => {
    expect(decideUpdate('1.0', mockVersionSettings('1.0', 'required'), 'IOS')?.kind).toBe('required');
    expect(decideUpdate('1.0', mockVersionSettings('1.0', 'optional'), 'ANDROID')?.kind).toBe('optional');
    expect(decideUpdate('1.0', mockVersionSettings('1.0', 'none'), 'IOS')).toBeNull();
  });
});
