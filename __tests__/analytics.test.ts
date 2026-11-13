/* 분석(Amplitude) 래퍼 — 전송 조건 · 두 단계 모드(기본 익명/상세) · 끄기 · 체류 시간 · 서버 집계 연결 */
type Amp = {
  init: jest.Mock; add: jest.Mock; remove: jest.Mock; track: jest.Mock; flush: jest.Mock;
  setOptOut: jest.Mock; setUserId: jest.Mock; identify: jest.Mock; reset: jest.Mock;
};
type Mod = typeof import('../src/services/analytics');
type Usage = typeof import('../src/services/usageEvents');

const loaded: Usage[] = [];
afterEach(() => loaded.splice(0).forEach(u => u.usageQueue.clear()));

function load(cfg: { key?: string; mock?: boolean; saved?: object } = {}): { a: Mod; amp: Amp; usage: Usage } {
  let a!: Mod;
  let amp!: Amp;
  let usage!: Usage;
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({ env: { apiBaseUrl: 'https://api.test/api/v1', amplitudeApiKey: cfg.key ?? 'k', useMock: cfg.mock ?? false, amplitudeInMock: false, replaySampleRate: 0.3 } }));
    if (cfg.saved) require('../src/store/storage').kv.set('prefs', cfg.saved);
    amp = require('@amplitude/analytics-react-native');
    usage = require('../src/services/usageEvents');
    a = require('../src/services/analytics');
  });
  loaded.push(usage);
  return { a, amp, usage };
}

const enrichOf = (amp: Amp) => amp.add.mock.calls.map(c => c[0]).find(p => p?.name === 'pado-context');
const names = (amp: Amp) => amp.track.mock.calls.map(c => c[0]);
const flushPromises = () => new Promise<void>(r => setImmediate(() => r()));

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ status: 204 }));
});

test('키가 없거나 목 모드면 초기화·전송하지 않음', async () => {
  for (const cfg of [{ key: '' }, { key: 'k', mock: true }]) {
    const { a, amp } = load(cfg);
    await a.setAnalyticsMode('basic');
    a.track('x');
    expect(amp.init).not.toHaveBeenCalled();
    expect(amp.track).not.toHaveBeenCalled();
  }
});

test('기본 모드: IP·광고 ID·IDFV 끔, 사용자 ID·세션 리플레이 없음', async () => {
  const { a, amp } = load();
  await a.setAnalyticsMode('basic');
  expect(amp.init).toHaveBeenCalledWith('k', undefined, expect.objectContaining({
    optOut: false,
    trackingOptions: { ipAddress: false, adid: false, appSetId: false, idfv: false, carrier: false },
  }));
  expect(amp.add.mock.calls.map(c => c[0]?.constructor?.name)).not.toContain('SessionReplayPlugin');
  a.identifyUser('user-123', { username: 'zerone', gender: true, birth: '2000-01-01' });
  expect(amp.setUserId).not.toHaveBeenCalled();
  expect(amp.identify.mock.calls.flatMap(c => Object.keys(c[0].props))).not.toContain('username');
});

test('기본 모드 공통 속성: 지역(시·군·구)·화면만, 정밀 위치는 붙이지 않음', async () => {
  const { a, amp } = load();
  await a.setAnalyticsMode('basic');
  a.setAnalyticsLocation(35.18891234, 128.90381234);
  a.setAnalyticsRegion('부산광역시 강서구');
  a.trackScreen('PinPreview');
  const ev = await enrichOf(amp).execute({ event_type: 'tap', user_id: 'leak', location_lat: 1, event_properties: { label: 'x' } });
  expect(ev.event_properties).toEqual({ app_env: 'prod', analytics_mode: 'basic', screen: 'PinPreview', region: '부산광역시 강서구', label: 'x' });
  expect(ev.location_lat).toBeUndefined();
  expect(ev.user_id).toBeUndefined();
  expect(a.detailedOnly({ lat: 1 })).toEqual({});
});

test('상세 모드: 사용자 ID·정밀 위치·세션 리플레이', async () => {
  const { a, amp } = load();
  await a.setAnalyticsMode('detailed');
  expect(amp.add.mock.calls.map(c => c[0]?.constructor?.name)).toContain('SessionReplayPlugin');
  a.identifyUser('user-123', { username: 'zerone' });
  expect(amp.setUserId).toHaveBeenCalledWith('user-123');
  a.setAnalyticsLocation(35.18891234, 128.90381234);
  const ev = await enrichOf(amp).execute({ event_type: 'tap', event_properties: {} });
  expect(ev.event_properties).toMatchObject({ analytics_mode: 'detailed', lat: 35.188912, lng: 128.903812 });
  expect(ev.location_lat).toBe(35.188912);
  expect(a.detailedOnly({ lat: 1 })).toEqual({ lat: 1 });
});

test('상세 → 기본으로 내리면 기기 ID를 새로 만들고 리플레이를 뗀다', async () => {
  const { a, amp } = load();
  await a.setAnalyticsMode('detailed');
  await a.setAnalyticsMode('basic');
  expect(amp.reset).toHaveBeenCalledTimes(1);
  expect(amp.remove).toHaveBeenCalledWith('@amplitude/plugin-session-replay-react-native');
});

test('끄면 전송 중단, 서버 집계도 보내지 않음', async () => {
  const { a, amp, usage } = load();
  await a.setAnalyticsMode('basic');
  a.track('drop_opened', { drop_id: 'd1' });
  expect(usage.usageQueue.size).toBe(1);
  await a.setAnalyticsMode('off');
  expect(amp.setOptOut).toHaveBeenCalledWith(true);
  expect(usage.usageQueue.size).toBe(0);
  amp.track.mockClear();
  a.track('x');
  a.track('app_opened');
  expect(amp.track).not.toHaveBeenCalled();
  expect(usage.usageQueue.size).toBe(0);
});

test('저장값으로 시작 모드를 정하고, SDK 시작 전 이벤트는 시작 뒤에 보낸다', async () => {
  const { a, amp } = load({ saved: { analyticsAsked: true, analytics: true } });
  expect(a.analyticsMode()).toBe('detailed');
  a.trackScreen('Map');
  expect(amp.track).not.toHaveBeenCalled();
  await a.setAnalyticsMode('detailed');
  expect(names(amp)).toEqual(['screen_viewed']);
});

test('화면 조회는 같은 화면 연속이면 한 번, 떠날 때 screen_left로 머문 시간', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  const { a, amp } = load();
  await a.setAnalyticsMode('basic');
  a.trackScreen('Map', { dropId: 'd1', queue: ['x'] }, 'map-1');
  a.trackScreen('Map', { dropId: 'd1' }, 'map-1');
  now.mockReturnValue(4_500);
  a.trackScreen('Player', { songId: 's1' }, 'player-1');
  a.trackTap('좋아요 12개', { kind: 'press' });
  expect(amp.track.mock.calls).toEqual([
    ['screen_viewed', { screen: 'Map', dropId: 'd1' }],
    ['screen_left', { screen: 'Map', duration_ms: 3500, reason: 'navigate' }],
    ['screen_viewed', { screen: 'Player', songId: 's1' }],
    ['tap', { label: '좋아요 #개', kind: 'press' }],
  ]);
  now.mockRestore();
});

test('백그라운드로 가면 화면 시간을 닫고, 돌아오면 다시 잰다. 5분 넘게 쉬면 app_opened', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(0);
  const { a, amp } = load();
  await a.setAnalyticsMode('basic');
  a.trackScreen('Map', undefined, 'm');
  now.mockReturnValue(2_000);
  a.onAppStateChange('background', 2_000);
  expect(amp.flush).toHaveBeenCalled();
  now.mockReturnValue(400_000);
  a.onAppStateChange('active', 400_000);
  now.mockReturnValue(401_000);
  a.onAppStateChange('background', 401_000);
  a.onAppStateChange('active', 402_000); // 잠깐 내렸다 올림 — app_opened 아님
  expect(amp.track.mock.calls.slice(1)).toEqual([
    ['screen_left', { screen: 'Map', duration_ms: 2000, reason: 'background' }],
    ['app_opened', { cold: false }],
    ['screen_left', { screen: 'Map', duration_ms: 1000, reason: 'background' }],
  ]);
  now.mockRestore();
});

test('서버 집계 이벤트는 드랍 ID와 함께 모아서 토큰 없이 POST /events', async () => {
  const fetch = (globalThis as unknown as { fetch: jest.Mock }).fetch;
  const { a } = load();
  await a.setAnalyticsMode('basic');
  a.track('drop_opened', { drop_id: 'd1', type: 'MUSIC' });
  a.track('preview_started', { song_id: 's1' });
  a.track('tap', { label: 'x' });
  a.onAppStateChange('background');
  await flushPromises();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://api.test/api/v1/events');
  expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(init.body)).toEqual({ events: [{ name: 'drop_opened', droppingId: 'd1' }, { name: 'preview_started' }] });
});

test('첫 실행이면 first_open, 이후엔 app_opened만', async () => {
  const { a, amp } = load();
  await a.setAnalyticsMode('basic');
  a.trackAppOpened();
  a.trackAppOpened();
  expect(names(amp)).toEqual(['first_open', 'app_opened', 'app_opened']);
});

test('버튼 라벨의 숫자는 #으로 고정', () => {
  const { a } = load();
  expect(a.stableLabel('잠긴 드랍 · 1.2km')).toBe('잠긴 드랍 · #km');
  expect(a.stableLabel('  ')).toBe('unlabeled');
  expect(a.stableLabel(undefined)).toBe('unlabeled');
});

test('저장된 설정 → 분석 모드 (예전 저장값 옮기기)', () => {
  const { a } = load();
  expect(a.migrateAnalyticsMode({})).toBe('basic'); // 고른 적 없음 (새 설치·예전 기본 켜짐 시절) → 기본 익명
  expect(a.migrateAnalyticsMode({ analytics: true })).toBe('basic'); // 예전 기본값(직접 고르지 않음)
  expect(a.migrateAnalyticsMode({ analyticsAsked: true, analytics: true })).toBe('detailed'); // 직접 켠 사람
  expect(a.migrateAnalyticsMode({ analyticsAsked: true, analytics: false })).toBe('off'); // 직접 끈 사람은 그대로 끔
  expect(a.migrateAnalyticsMode({ analyticsAsked: true })).toBe('off');
  expect(a.migrateAnalyticsMode({ analyticsMode: 'detailed', analyticsAsked: true, analytics: false })).toBe('detailed');
  expect(a.migrateAnalyticsMode({ analyticsMode: 'weird' as never })).toBe('basic');
});

test('토큰에서 사용자 ID (JWT sub), 형식이 다르면 null', () => {
  const { a } = load();
  const b64 = (o: object) => (globalThis as unknown as { btoa: (v: string) => string }).btoa(JSON.stringify(o)).replace(/=+$/, '');
  expect(a.userIdFromToken(`h.${b64({ sub: 'user-123' })}.s`)).toBe('user-123');
  expect(a.userIdFromToken('mock.access.abc')).toBeNull();
  expect(a.userIdFromToken(null)).toBeNull();
});
