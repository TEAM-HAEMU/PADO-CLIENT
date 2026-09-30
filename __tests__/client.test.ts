import { request, setTokenBridge } from '@/api/client';
import { ApiError, errorMessage } from '@/api/errors';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const reply = (status: number, body?: unknown) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

let tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' };
const onExpired = jest.fn();

beforeEach(() => {
  calls.length = 0;
  tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' };
  onExpired.mockReset();
  setTokenBridge({
    get: () => tokens,
    set: p => { tokens = { accessToken: p.accessToken, refreshToken: p.refreshToken }; },
    onExpired,
  });
});

const auth = (c: Call) => (c.init.headers as Record<string, string>).Authorization;

test('쿼리·Bearer 헤더·JSON 본문', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return reply(200, { ok: 1 }); }) as never;
  await request('POST', '/comments', { body: { content: 'hi' }, query: { a: 1, b: undefined, c: '가' } });
  expect(calls[0].url).toBe(`https://api.test/api/v1/comments?a=1&c=${encodeURIComponent('가')}`);
  expect(auth(calls[0])).toBe('Bearer old-access');
  expect(calls[0].init.body).toBe('{"content":"hi"}');
});

test('401(U2) → 동시 요청이어도 재발급은 한 번, 새 토큰으로 재시도', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) return reply(200, { accessToken: 'new-access', refreshToken: 'new-refresh', accessTokenExpiresIn: 1, refreshTokenExpiresIn: 1 });
    return auth({ url, init }) === 'Bearer new-access' ? reply(200, { n: 1 }) : reply(401, { code: 'U2', message: '만료' });
  }) as never;
  const [a, b] = await Promise.all([request<{ n: number }>('GET', '/users'), request<{ n: number }>('GET', '/notifications')]);
  expect(a.n).toBe(1);
  expect(b.n).toBe(1);
  expect(calls.filter(c => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  expect(tokens.refreshToken).toBe('new-refresh');
  expect(onExpired).not.toHaveBeenCalled();
});

test('재발급 실패 → onExpired, ApiError(U9 등) 던짐', async () => {
  globalThis.fetch = jest.fn(async (url: string) =>
    url.endsWith('/auth/refresh') ? reply(401, { code: 'U9', message: 'x' }) : reply(401, { code: 'U2', message: '만료' })) as never;
  await expect(request('GET', '/users')).rejects.toMatchObject({ code: 'U2', status: 401 });
  expect(onExpired).toHaveBeenCalledTimes(1);
});

test('재발급이 네트워크 오류면 로그아웃하지 않고 NETWORK 오류', async () => {
  globalThis.fetch = jest.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) throw new Error('offline');
    return reply(401, { code: 'U2', message: '만료' });
  }) as never;
  await expect(request('GET', '/users')).rejects.toMatchObject({ code: 'NETWORK' });
  expect(onExpired).not.toHaveBeenCalled();
  expect(tokens.refreshToken).toBe('old-refresh');
});

test('optional 요청은 재발급이 거절되면 세션 종료 + 비로그인으로 재시도', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) return reply(401, { code: 'U9', message: 'x' });
    return auth({ url, init }) ? reply(401, { code: 'U3', message: '무효' }) : reply(200, { droppings: [] });
  }) as never;
  const r = await request<{ droppings: unknown[] }>('GET', '/droppings', { auth: 'optional' });
  expect(r.droppings).toEqual([]);
  expect(onExpired).toHaveBeenCalledTimes(1); // 세션은 끝난 것으로 처리
  expect(auth(calls[calls.length - 1])).toBeUndefined();
});

test('재발급 중 로그아웃되면 새 토큰을 저장하지 않는다', async () => {
  globalThis.fetch = jest.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) {
      tokens = { accessToken: null as never, refreshToken: null as never }; // 그사이 로그아웃
      return reply(200, { accessToken: 'new', refreshToken: 'new-r', accessTokenExpiresIn: 1, refreshTokenExpiresIn: 1 });
    }
    return reply(401, { code: 'U2', message: '만료' });
  }) as never;
  await expect(request('GET', '/users')).rejects.toBeInstanceOf(ApiError);
  expect(tokens.refreshToken).toBeNull();
});

test('재발급 중 다른 계정으로 로그인했으면 이전 요청은 버린다', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) {
      tokens = { accessToken: 'b-access', refreshToken: 'b-refresh' }; // 그사이 B 계정 로그인
      return reply(200, { accessToken: 'x', refreshToken: 'x', accessTokenExpiresIn: 1, refreshTokenExpiresIn: 1 });
    }
    return auth({ url, init }) === 'Bearer b-access' ? reply(200, { ok: 1 }) : reply(401, { code: 'U2', message: '만료' });
  }) as never;
  // 이전 계정의 요청은 새 계정 토큰으로 재시도하지 않는다
  await expect(request('GET', '/users')).rejects.toMatchObject({ status: 401 });
  expect(calls.filter(c => auth(c) === 'Bearer b-access')).toHaveLength(0);
  expect(tokens.refreshToken).toBe('b-refresh');
  expect(onExpired).not.toHaveBeenCalled();
});

test('auth: none 요청에는 토큰을 붙이지 않고 401이어도 재발급하지 않음', async () => {
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return reply(401, { code: 'U5', message: '비번' }); }) as never;
  await expect(request('POST', '/auth/login', { body: {}, auth: 'none' })).rejects.toBeInstanceOf(ApiError);
  expect(auth(calls[0])).toBeUndefined();
  expect(calls).toHaveLength(1);
});

test('네트워크 오류 → NETWORK 코드와 한국어 안내', async () => {
  globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as never;
  const e = await request('GET', '/songs/search', { auth: 'none' }).catch(x => x);
  expect(e.code).toBe('NETWORK');
  expect(errorMessage(e)).toContain('네트워크');
});

test('errorMessage — 친절한 문구 우선, 제재(U21)는 서버 메시지 그대로', () => {
  expect(errorMessage(new ApiError(409, { code: 'D1', message: 'x' }))).toContain('1m');
  expect(errorMessage(new ApiError(403, { code: 'U21', message: '2026-10-01까지 정지' }))).toBe('2026-10-01까지 정지');
  expect(errorMessage(new ApiError(500, { code: 'ZZ', message: '서버 메시지' }))).toBe('서버 메시지');
});
