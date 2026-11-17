/* 앱 버전 비교·업데이트 안내 판정 (utils/appVersion) */
import { compareVersions, decideUpdate, parseVersion, shouldPrompt } from '@/utils/appVersion';

const rows = (ios: [string, string], android: [string, string] = ['0', '0']) => [
  { platform: 'IOS', minVersion: ios[0], latestVersion: ios[1] },
  { platform: 'ANDROID', minVersion: android[0], latestVersion: android[1] },
];

describe('parseVersion / compareVersions', () => {
  it('숫자 단위로 비교한다 (문자열 비교 아님)', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
    expect(compareVersions('1.2', '1.10')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });
  it('모자란 자리는 0으로 본다', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('0', '0')).toBe(0);
  });
  it('앞뒤 공백은 무시', () => {
    expect(compareVersions(' 1.0.25 ', '1.0.25')).toBe(0);
  });
  it('형식이 이상하면 null', () => {
    for (const bad of ['', 'v1.0', '1.0.0-beta', '1..0', '.1', '1.', 'abc', '1.0.0.0.0', '1,0', null, undefined, 3, {}]) {
      expect(parseVersion(bad)).toBeNull();
      expect(compareVersions(bad, '1.0')).toBeNull();
      expect(compareVersions('1.0', bad)).toBeNull();
    }
  });
});

describe('decideUpdate', () => {
  it('지금 < minVersion → 필수 (안내 버전은 latestVersion)', () => {
    expect(decideUpdate('1.0.24', rows(['1.0.25', '1.0.27']), 'IOS')).toEqual({ kind: 'required', latestVersion: '1.0.27' });
  });
  it('min ≤ 지금 < latestVersion → 선택', () => {
    expect(decideUpdate('1.0.25', rows(['1.0.25', '1.0.27']), 'IOS')).toEqual({ kind: 'optional', latestVersion: '1.0.27' });
    expect(decideUpdate('1.0.26', rows(['1.0.25', '1.0.27']), 'IOS')).toEqual({ kind: 'optional', latestVersion: '1.0.27' });
  });
  it('지금 ≥ latestVersion → 안내 없음', () => {
    expect(decideUpdate('1.0.27', rows(['1.0.25', '1.0.27']), 'IOS')).toBeNull();
    expect(decideUpdate('1.0.30', rows(['1.0.25', '1.0.27']), 'IOS')).toBeNull();
  });
  it('1.0.9 < 1.0.10 (숫자 단위)', () => {
    expect(decideUpdate('1.0.9', rows(['1.0.10', '1.0.10']), 'IOS')?.kind).toBe('required');
  });
  it('저장된 기준이 없으면("0") 안내 없음', () => {
    expect(decideUpdate('1.0', rows(['0', '0']), 'IOS')).toBeNull();
  });
  it('플랫폼별로 따로 본다', () => {
    const r = rows(['0', '0'], ['1.0.30', '1.0.30']);
    expect(decideUpdate('1.0.25', r, 'IOS')).toBeNull();
    expect(decideUpdate('1.0.25', r, 'ANDROID')?.kind).toBe('required');
  });
  it('형식이 이상한 값은 없는 것으로 → 안내 안 함', () => {
    expect(decideUpdate('1.0.25', rows(['1.0.x', 'latest']), 'IOS')).toBeNull();
    expect(decideUpdate('dev', rows(['1.0.30', '1.0.30']), 'IOS')).toBeNull();
    // min만 이상하면 latest로 선택 안내는 한다
    expect(decideUpdate('1.0.25', rows(['?', '1.0.27']), 'IOS')).toEqual({ kind: 'optional', latestVersion: '1.0.27' });
    // latest가 이상하거나 min보다 낮으면 필수 안내 버전은 min
    expect(decideUpdate('1.0.20', rows(['1.0.25', 'x']), 'IOS')).toEqual({ kind: 'required', latestVersion: '1.0.25' });
    expect(decideUpdate('1.0.20', rows(['1.0.25', '1.0.21']), 'IOS')).toEqual({ kind: 'required', latestVersion: '1.0.25' });
  });
  it('응답 모양이 이상하거나 이 플랫폼 행이 없으면 null', () => {
    for (const bad of [null, undefined, {}, 'x', [null], [{ platform: 'WEB', minVersion: '9', latestVersion: '9' }]]) {
      expect(decideUpdate('1.0', bad, 'IOS')).toBeNull();
    }
  });
});

describe('shouldPrompt', () => {
  const optional = { kind: 'optional' as const, latestVersion: '1.0.27' };
  it('필수는 늘 띄운다', () => {
    expect(shouldPrompt({ kind: 'required', latestVersion: '1.0.27' }, '1.0.27')).toBe(true);
  });
  it("선택은 '나중에'를 누른 latestVersion이면 다시 안 띄운다", () => {
    expect(shouldPrompt(optional, null)).toBe(true);
    expect(shouldPrompt(optional, '1.0.27')).toBe(false);
    expect(shouldPrompt(optional, '1.0.26')).toBe(true); // 더 새 버전이 나오면 다시
  });
  it('판정이 없으면 안 띄운다', () => {
    expect(shouldPrompt(null, null)).toBe(false);
  });
});
