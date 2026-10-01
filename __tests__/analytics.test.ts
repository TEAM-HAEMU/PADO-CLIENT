/* 분석(Amplitude) 래퍼 — 전송 조건 · 공통 속성 · 끄기 · 사용자 ID */
type Amp = { init: jest.Mock; add: jest.Mock; track: jest.Mock; setOptOut: jest.Mock; setUserId: jest.Mock };
type Mod = typeof import('../src/services/analytics');

function load(cfg: { key: string; mock: boolean }): { a: Mod; amp: Amp } {
  let a!: Mod;
  let amp!: Amp;
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({ env: { amplitudeApiKey: cfg.key, useMock: cfg.mock, amplitudeInMock: false, replaySampleRate: 0.3 } }));
    amp = require('@amplitude/analytics-react-native');
    a = require('../src/services/analytics');
  });
  return { a, amp };
}

beforeEach(() => jest.clearAllMocks());

test('키가 없거나 목 모드면 초기화·전송하지 않음', async () => {
  for (const cfg of [{ key: '', mock: false }, { key: 'k', mock: true }]) {
    const { a, amp } = load(cfg);
    await a.initAnalytics({ optOut: false });
    a.track('x');
    expect(amp.init).not.toHaveBeenCalled();
    expect(amp.track).not.toHaveBeenCalled();
  }
});

test('실서버 + 키 → 전송, 화면·탭 이벤트', async () => {
  const { a, amp } = load({ key: 'k', mock: false });
  await a.initAnalytics({ optOut: false });
  expect(amp.init).toHaveBeenCalledWith('k', undefined, expect.objectContaining({ optOut: false }));
  a.trackScreen('Map', { dropId: 'd1', queue: ['x'] });
  a.trackScreen('Map'); // 같은 화면 연속은 한 번만
  a.trackTap('좋아요', { kind: 'press' });
  expect(amp.track.mock.calls).toEqual([
    ['screen_viewed', { screen: 'Map', dropId: 'd1' }],
    ['tap', { label: '좋아요', kind: 'press' }],
  ]);
});

test('공통 속성: 위치(소수 6자리)와 화면 이름을 모든 이벤트에 붙임', async () => {
  const { a, amp } = load({ key: 'k', mock: false });
  await a.initAnalytics({ optOut: false });
  const plugin = amp.add.mock.calls.map(c => c[0]).find(p => p?.name === 'pado-context');
  a.setAnalyticsLocation(35.18891234, 128.90381234);
  a.trackScreen('PinPreview');
  const ev = await plugin.execute({ event_type: 'tap', event_properties: { label: 'x' } });
  expect(ev.event_properties).toEqual({ app_env: 'prod', screen: 'PinPreview', lat: 35.188912, lng: 128.903812, label: 'x' });
  expect(ev.location_lat).toBe(35.188912);
});

test('설정에서 끄면 전송 중단', async () => {
  const { a, amp } = load({ key: 'k', mock: false });
  await a.initAnalytics({ optOut: false });
  a.setAnalyticsOptOut(true);
  a.track('x');
  expect(amp.setOptOut).toHaveBeenCalledWith(true);
  expect(amp.track).not.toHaveBeenCalled();
});

test('토큰에서 사용자 ID (JWT sub), 형식이 다르면 null', () => {
  const { a } = load({ key: 'k', mock: false });
  const b64 = (o: object) => (globalThis as unknown as { btoa: (v: string) => string }).btoa(JSON.stringify(o)).replace(/=+$/, '');
  expect(a.userIdFromToken(`h.${b64({ sub: 'user-123' })}.s`)).toBe('user-123');
  expect(a.userIdFromToken('mock.access.abc')).toBeNull();
  expect(a.userIdFromToken(null)).toBeNull();
});
