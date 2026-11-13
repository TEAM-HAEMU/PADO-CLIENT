/* Sentry — 전송 조건 · 개인정보 걸러내기(순수 함수) · init 옵션 · 이용 분석 '끔' 연동 · API 실패 보고 */
import { FILTERED, monitoringDecision, requestIdOf, scrubBreadcrumb, scrubData, scrubEvent, scrubString, scrubUrl, type MonitoringConfig } from '@/services/monitoringRules';

const base: MonitoringConfig = { dsn: 'https://k@o1.ingest.de.sentry.io/1', useMock: false, inMock: false, isDev: false, inDev: false, mode: 'basic' };

describe('monitoringDecision', () => {
  test('실서버 릴리스 + DSN → prod로 켬 (기본·상세 분석 모두)', () => {
    expect(monitoringDecision(base)).toEqual({ enabled: true, environment: 'prod' });
    expect(monitoringDecision({ ...base, mode: 'detailed' }).enabled).toBe(true);
  });
  test('DSN이 없거나 이용 분석을 끄면 끔', () => {
    expect(monitoringDecision({ ...base, dsn: '' }).enabled).toBe(false);
    expect(monitoringDecision({ ...base, mode: 'off' }).enabled).toBe(false);
  });
  test('목 모드는 SENTRY_IN_MOCK일 때만 (mock), 개발 빌드는 SENTRY_IN_DEV일 때만 (dev)', () => {
    expect(monitoringDecision({ ...base, useMock: true })).toEqual({ enabled: false, environment: 'mock' });
    expect(monitoringDecision({ ...base, useMock: true, inMock: true })).toEqual({ enabled: true, environment: 'mock' });
    expect(monitoringDecision({ ...base, isDev: true })).toEqual({ enabled: false, environment: 'dev' });
    expect(monitoringDecision({ ...base, isDev: true, inDev: true })).toEqual({ enabled: true, environment: 'dev' });
    // 개발 빌드 + 목 모드는 두 플래그가 다 있어야
    expect(monitoringDecision({ ...base, isDev: true, inDev: true, useMock: true }).enabled).toBe(false);
    expect(monitoringDecision({ ...base, isDev: true, inDev: true, useMock: true, inMock: true }).enabled).toBe(true);
  });
});

describe('scrubString', () => {
  test('Bearer 토큰 · JWT · token=값', () => {
    expect(scrubString('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [token]');
    expect(scrubString('t eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl x')).toBe('t [token] x');
    expect(scrubString('{"refreshToken":"r-123","password": "hunter2"}')).toBe(`{"refreshToken":"${FILTERED}","password": "${FILTERED}"}`);
    expect(scrubString('accessToken=zzz&x=1')).toBe(`accessToken=${FILTERED}&x=1`);
  });
  test('이메일', () => {
    expect(scrubString('가입되지 않은 user.name+1@example.co.kr 이에요')).toBe('가입되지 않은 [email] 이에요');
  });
  test('좌표 (lat=…, 좌표 쌍)', () => {
    expect(scrubString('nearby lat=35.158123&lng=129.059234')).toBe(`nearby lat=${FILTERED}&lng=${FILTERED}`);
    expect(scrubString('{"latitude": 35.1581, "longitude": 129.0592}')).toBe(`{"latitude": ${FILTERED}, "longitude": ${FILTERED}}`);
    expect(scrubString('at 35.158123, 129.059234 now')).toBe('at [coords] now');
  });
  test('도로명·지번 주소', () => {
    expect(scrubString('부산광역시 해운대구 해운대로 264 앞')).toBe('[address] 앞');
    expect(scrubString('구남로24번길 8')).toBe('[address]');
    expect(scrubString('부산광역시 해운대구 우동 1408')).toBe('[address]');
  });
  test('평범한 오류 문구·조사·시·군·구만 있는 지역은 그대로', () => {
    const plain = [
      "TypeError: Cannot read property 'title' of undefined",
      '인증번호는 1분에 한 번만 받을 수 있어요.',
      '1분으로 3번 시도',
      '부산광역시 해운대구',
      'v1.2.3 build 45',
    ];
    for (const s of plain) expect(scrubString(s)).toBe(s);
  });
});

test('scrubUrl — 쿼리·해시를 뺀다', () => {
  expect(scrubUrl('https://api.paado.app/api/v1/droppings/nearby?lat=35.1&lng=129.1&radius=300')).toBe(`https://api.paado.app/api/v1/droppings/nearby?${FILTERED}`);
  expect(scrubUrl('https://itunes.apple.com/search?term=노래#x')).toBe(`https://itunes.apple.com/search?${FILTERED}`);
  expect(scrubUrl('https://api.paado.app/api/v1/users')).toBe('https://api.paado.app/api/v1/users');
});

test('scrubData — 민감한 키는 가리고 request_id는 남긴다', () => {
  const out = scrubData({
    Authorization: 'Bearer x', email: 'a@b.co', lat: 35.1, lng: 129.1, roadAddress: '해운대로 264', body: '{"a":1}',
    request_id: 'abcd-1234-efgh', nested: { refresh_token: 'r', note: 'mail me a@b.co', list: ['Bearer tt'] }, count: 3,
  });
  expect(out).toEqual({
    Authorization: FILTERED, email: FILTERED, lat: FILTERED, lng: FILTERED, roadAddress: FILTERED, body: FILTERED,
    request_id: 'abcd-1234-efgh', nested: { refresh_token: FILTERED, note: 'mail me [email]', list: ['Bearer [token]'] }, count: 3,
  });
});

describe('scrubBreadcrumb', () => {
  test('네트워크: 메서드·상태·쿼리 뺀 URL만 (본문·헤더 버림)', () => {
    const c = scrubBreadcrumb({ category: 'xhr', type: 'http', data: { method: 'GET', status_code: 200, url: 'https://api.paado.app/api/v1/droppings/nearby?lat=35.1&lng=129.1', request_body_size: 10, request_headers: { Authorization: 'Bearer x' } } });
    expect(c.data).toEqual({ method: 'GET', status_code: 200, url: `https://api.paado.app/api/v1/droppings/nearby?${FILTERED}` });
    expect(c.type).toBe('http');
  });
  test('콘솔: 메시지는 걸러서 남기고 인자는 버린다', () => {
    const c = scrubBreadcrumb({ category: 'console', level: 'warning', message: 'login fail a@b.co Bearer zz', data: { logger: 'console', arguments: [{ password: 'x' }] } });
    expect(c.message).toBe('login fail [email] Bearer [token]');
    expect(c.data).toEqual({ logger: 'console' });
  });
  test('그 밖(api·navigation·touch): 데이터 키를 따라 거른다', () => {
    const c = scrubBreadcrumb({ category: 'api', data: { method: 'GET', path: '/droppings/:id', status_code: 500, request_id: 'rid-12345678' } });
    expect(c.data).toEqual({ method: 'GET', path: '/droppings/:id', status_code: 500, request_id: 'rid-12345678' });
    const n = scrubBreadcrumb({ category: 'navigation', data: { from: 'Map', to: 'Player', params: { lat: 1, dropId: 'd1' } } });
    expect(n.data).toEqual({ from: 'Map', to: 'Player', params: { lat: FILTERED, dropId: 'd1' } });
  });
});

test('scrubEvent — user·요청 본문·Authorization 제거, 문구·브레드크럼·span 거름, request_id 태그', () => {
  const ev = scrubEvent({
    message: 'failed for a@b.co',
    user: { id: 'install-id', ip_address: '{{auto}}' },
    request: { url: 'https://api.paado.app/api/v1/x?lat=1', data: '{"password":"p"}', cookies: { s: '1' }, headers: { Authorization: 'Bearer t', Accept: 'application/json' }, query_string: 'lat=1' },
    exception: { values: [{ type: 'ApiError', value: 'token=abc 실패' }] },
    breadcrumbs: [{ category: 'fetch', data: { url: 'https://x.test/a?b=c', method: 'POST', status_code: 500 } }],
    extra: { refreshToken: 'r', screen: 'Map' },
    contexts: { device: { model: 'iPhone17,1', family: 'iOS' }, os: { name: 'iOS', version: '26.0' }, custom: { address: '해운대로 264' } },
    spans: [{ description: 'GET https://api.paado.app/api/v1/droppings/nearby?lat=35.1&lng=129.1', data: { url: 'https://api.paado.app/api/v1/droppings/nearby?lat=35.1', 'http.query': '?lat=35.1', 'http.method': 'GET' } }],
    tags: { app_env: 'prod' },
  }, 'rid-1234-5678');
  expect(ev.user).toBeUndefined();
  expect(ev.request).toEqual({ url: `https://api.paado.app/api/v1/x?${FILTERED}`, headers: { Accept: 'application/json' } });
  expect(ev.message).toBe('failed for [email]');
  expect(ev.exception?.values?.[0]).toEqual({ type: 'ApiError', value: `token=${FILTERED} 실패` });
  expect(ev.breadcrumbs?.[0].data).toEqual({ url: `https://x.test/a?${FILTERED}`, method: 'POST', status_code: 500 });
  expect(ev.extra).toEqual({ refreshToken: FILTERED, screen: 'Map' });
  // 처리방침의 기기 정보(운영체제·기기 모델·앱 버전)는 그대로
  expect(ev.contexts?.device).toEqual({ model: 'iPhone17,1', family: 'iOS' });
  expect(ev.contexts?.custom).toEqual({ address: FILTERED });
  expect(ev.spans?.[0]).toEqual({ description: `GET https://api.paado.app/api/v1/droppings/nearby?${FILTERED}`, data: { url: `https://api.paado.app/api/v1/droppings/nearby?${FILTERED}`, 'http.query': FILTERED, 'http.method': 'GET' } });
  expect(ev.tags).toEqual({ app_env: 'prod', request_id: 'rid-1234-5678' });
});

test('scrubEvent — 화면 전환 거래의 route params·URL은 키째 뺀다 (가입 화면 signupToken·소셜 프로필)', () => {
  const routeData = {
    'sentry.op': 'navigation',
    'route.name': 'Signup',
    'route.key': 'Signup-k1',
    'route.params.signupToken': 'st-abc',
    'route.params.profile': '{"nickname":"파도","email":"a@b.co"}',
    'route.url': 'pado://signup?token=st-abc',
    'route.path': '/signup',
    'previous_route.name': 'Login',
    'previous_route.params.mode': 'social',
    'route.has_been_seen': false,
  };
  const ev = scrubEvent({
    transaction: 'Signup',
    contexts: { trace: { trace_id: 't1', span_id: 's1', op: 'navigation', data: routeData }, app: { app_version: '1.0' } },
    spans: [{ description: 'Navigation dispatch to screen Signup mounted', data: routeData }],
  });
  const kept = { 'sentry.op': 'navigation', 'route.name': 'Signup', 'route.key': 'Signup-k1', 'previous_route.name': 'Login', 'route.has_been_seen': false };
  expect(ev.contexts?.trace).toEqual({ trace_id: 't1', span_id: 's1', op: 'navigation', data: kept });
  expect(ev.spans?.[0].data).toEqual(kept);
  expect(ev.contexts?.app).toEqual({ app_version: '1.0' });
  expect(JSON.stringify(ev)).not.toContain('st-abc');
});

test('requestIdOf — ApiError.requestId만', () => {
  expect(requestIdOf({ requestId: 'rid-1234-5678' })).toBe('rid-1234-5678');
  expect(requestIdOf(new Error('x'))).toBeUndefined();
  expect(requestIdOf(null)).toBeUndefined();
});

// ── SDK 연결 (Sentry는 jest.setup의 목)
type Mod = typeof import('../src/services/monitoring');
type SentryMock = { init: jest.Mock; close: jest.Mock; addBreadcrumb: jest.Mock; captureException: jest.Mock; __scope: { setTags: jest.Mock; setFingerprint: jest.Mock } };

function load(cfg: { dsn?: string; mock?: boolean; inMock?: boolean } = {}): { m: Mod; sentry: SentryMock } {
  let m!: Mod;
  let sentry!: SentryMock;
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({
      env: { apiBaseUrl: 'https://api.test/api/v1', useMock: cfg.mock ?? false, sentryDsn: cfg.dsn ?? 'https://k@o1.ingest.de.sentry.io/1', sentryInDev: true, sentryInMock: cfg.inMock ?? false, sentryTracesSampleRate: 0.1, amplitudeApiKey: '', amplitudeInMock: false, replaySampleRate: 0.3 },
    }));
    sentry = require('@sentry/react-native');
    sentry.init.mockClear(); sentry.close.mockClear(); sentry.addBreadcrumb.mockClear(); sentry.captureException.mockClear();
    m = require('../src/services/monitoring');
  });
  return { m, sentry };
}

describe('monitoring (SDK 연결)', () => {
  test('init 옵션: PII·리플레이·스크린샷 끔, 네이티브 충돌·멈춤 켬, 낮은 샘플링, 추적 헤더 안 보냄', () => {
    const { m, sentry } = load();
    expect(m.initMonitoring('basic')).toBe(true);
    const o = sentry.init.mock.calls[0][0];
    expect(o).toMatchObject({
      sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false,
      enableNativeCrashHandling: true, enableAppHangTracking: true, enableNetworkBreadcrumbs: false, enableCaptureFailedRequests: false,
      tracesSampleRate: 0.1, tracePropagationTargets: [], environment: 'dev',
    });
    // 리플레이 옵션이 있으면(0이어도) SDK가 리플레이 통합을 붙인다
    expect(o.replaysSessionSampleRate).toBeUndefined();
    expect(o.replaysOnErrorSampleRate).toBeUndefined();
    expect(o.release).toBeUndefined(); // 네이티브 기본값(번들ID@버전+빌드) — 소스맵 업로드 이름과 같게
    // 두 번 불러도 한 번만
    m.initMonitoring('basic');
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  test('beforeSend가 걸러내고 ApiError의 요청 ID를 태그로', () => {
    const { m, sentry } = load();
    m.initMonitoring('basic');
    const { beforeSend } = sentry.init.mock.calls[0][0];
    const out = beforeSend({ message: 'x a@b.co', user: { id: 'i' } }, { originalException: Object.assign(new Error('e'), { requestId: 'rid-1234-5678' }) });
    expect(out).toEqual({ message: 'x [email]', tags: { request_id: 'rid-1234-5678' } });
  });

  test('beforeSendTransaction도 route params를 빼고 거른다', () => {
    const { m, sentry } = load();
    m.initMonitoring('basic');
    const { beforeSendTransaction } = sentry.init.mock.calls[0][0];
    const out = beforeSendTransaction({ transaction: 'Signup', contexts: { trace: { op: 'navigation', data: { 'route.name': 'Signup', 'route.params.signupToken': 'st-abc' } } } });
    expect(out.contexts.trace.data).toEqual({ 'route.name': 'Signup' });
  });

  test("이용 분석 '끔'이면 시작하지 않고, 켜져 있다가 끄면 닫는다 (닫힌 뒤 이벤트는 버림)", () => {
    const off = load();
    expect(off.m.initMonitoring('off')).toBe(false);
    expect(off.sentry.init).not.toHaveBeenCalled();

    const { m, sentry } = load();
    m.initMonitoring('basic');
    const { beforeSend } = sentry.init.mock.calls[0][0];
    m.setMonitoringMode('off');
    expect(sentry.close).toHaveBeenCalledTimes(1);
    expect(m.monitoringActive()).toBe(false);
    expect(beforeSend({ message: 'late' }, {})).toBeNull();
    m.setMonitoringMode('detailed');
    expect(sentry.init).toHaveBeenCalledTimes(2);
  });

  test('목 모드는 플래그 없으면 끔, DSN 없으면 끔', () => {
    expect(load({ mock: true }).m.initMonitoring('basic')).toBe(false);
    expect(load({ mock: true, inMock: true }).m.initMonitoring('basic')).toBe(true);
    expect(load({ dsn: '' }).m.initMonitoring('basic')).toBe(false);
  });

  test('API 실패: 브레드크럼에 request_id, 5xx만 이벤트로 (request_id 태그·묶음 키)', () => {
    const { m, sentry } = load();
    m.initMonitoring('basic');
    const err = new Error('서버 오류');
    m.reportApiFailure({ method: 'GET', path: '/users', status: 404, code: 'U1', requestId: 'rid-404-0000' }, err);
    expect(sentry.addBreadcrumb).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'api', data: expect.objectContaining({ request_id: 'rid-404-0000', status_code: 404 }) }));
    expect(sentry.captureException).not.toHaveBeenCalled();

    m.reportApiFailure({ method: 'POST', path: '/droppings/:id/likes', status: 503, code: null, requestId: 'rid-503-0000' }, err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, expect.any(Function));
    expect(sentry.__scope.setTags).toHaveBeenLastCalledWith({ request_id: 'rid-503-0000', api_path: '/droppings/:id/likes', api_status: '503' });
    expect(sentry.__scope.setFingerprint).toHaveBeenLastCalledWith(['api', 'POST', '/droppings/:id/likes', '503']);
  });

  test('처리한 오류(reportError) — 켜져 있으면 area 태그로 보내고, 꺼져 있으면 버림', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('init failed');
    const off = load({ dsn: '' });
    off.m.initMonitoring('basic');
    off.m.reportError(err, 'analytics_mode');
    expect(off.sentry.captureException).not.toHaveBeenCalled();
    const { m, sentry } = load();
    m.initMonitoring('basic');
    m.reportError(err, 'analytics_mode');
    expect(sentry.captureException).toHaveBeenCalledWith(err, expect.any(Function));
    expect(sentry.__scope.setTags).toHaveBeenLastCalledWith({ area: 'analytics_mode' });
    warn.mockRestore();
  });

  test('꺼져 있으면 API 실패도 보내지 않는다', () => {
    const { m, sentry } = load({ dsn: '' });
    m.initMonitoring('basic');
    m.reportApiFailure({ method: 'GET', path: '/users', status: 500, code: null, requestId: 'rid-500-0000' }, new Error('x'));
    expect(sentry.addBreadcrumb).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
