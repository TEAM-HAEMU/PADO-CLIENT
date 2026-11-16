/* 요청 ID — 형식(서버 [A-Za-z0-9-]{8,64}) · 요청마다 헤더 · 응답 헤더에서 다시 읽기 · ApiError/api_error/Sentry 보고에 같은 값 */
import { isValidRequestId, newRequestId, REQUEST_ID_HEADER, responseRequestId } from '@/api/requestId';
import { request, setTokenBridge } from '@/api/client';
import { ApiError } from '@/api/errors';
import { track } from '@/services/analytics';
import { reportApiFailure } from '@/services/monitoring';

jest.mock('../src/services/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/services/monitoring', () => ({ reportApiFailure: jest.fn() }));

const SERVER_FORMAT = /^[A-Za-z0-9-]{8,64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newRequestId', () => {
  test('UUID v4 모양이고 서버 허용 형식에 맞는다', () => {
    for (let i = 0; i < 200; i++) {
      const id = newRequestId();
      expect(id).toMatch(SERVER_FORMAT);
      expect(id).toMatch(UUID_V4);
    }
  });

  test('crypto.randomUUID가 없어도 (Hermes) 난수로 만든다', () => {
    let n = 0;
    const seq = () => ((n++ * 7919) % 1000) / 1000;
    const id = newRequestId(seq);
    expect(id).toMatch(UUID_V4);
  });

  test('겹치지 않는다', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newRequestId()));
    expect(ids.size).toBe(1000);
  });

  test('형식 검사', () => {
    expect(isValidRequestId('abcd-1234')).toBe(true);
    expect(isValidRequestId('short')).toBe(false);
    expect(isValidRequestId('a'.repeat(65))).toBe(false);
    expect(isValidRequestId('has space 123')).toBe(false);
    expect(isValidRequestId('under_score_1')).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
  });

  test('응답 헤더 값이 맞는 형식이면 그 값, 아니면 보낸 값', () => {
    const h = (v: string | null) => ({ get: (k: string) => (k === REQUEST_ID_HEADER ? v : null) });
    expect(responseRequestId(h('server-echo-1234'), 'sent-0000-1111')).toBe('server-echo-1234');
    expect(responseRequestId(h('bad id!'), 'sent-0000-1111')).toBe('sent-0000-1111');
    expect(responseRequestId(h(null), 'sent-0000-1111')).toBe('sent-0000-1111');
    expect(responseRequestId(undefined, 'sent-0000-1111')).toBe('sent-0000-1111');
  });
});

describe('API 클라이언트', () => {
  type Call = { url: string; headers: Record<string, string> };
  const calls: Call[] = [];
  /** 서버처럼 받은 X-Request-Id를 응답 헤더로 돌려준다 */
  const reply = (status: number, body: unknown, sentId?: string) => ({
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'x-request-id' ? sentId ?? null : null) },
    text: async () => JSON.stringify(body),
  });
  let tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' };

  beforeEach(() => {
    calls.length = 0;
    (track as jest.Mock).mockClear();
    (reportApiFailure as jest.Mock).mockClear();
    tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' };
    setTokenBridge({ get: () => tokens, set: p => { tokens = { accessToken: p.accessToken, refreshToken: p.refreshToken }; }, onExpired: jest.fn() });
  });

  const fetchWith = (handler: (url: string, id: string) => ReturnType<typeof reply>) => {
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, headers });
      return handler(url, headers[REQUEST_ID_HEADER]);
    }) as never;
  };

  test('요청마다 새 X-Request-Id — 재발급·재시도도 각각 다른 값', async () => {
    fetchWith((url, id) => {
      if (url.endsWith('/auth/refresh')) return reply(200, { accessToken: 'new-access', refreshToken: 'new-refresh' }, id);
      return calls.filter(c => !c.url.endsWith('/auth/refresh')).length === 1 ? reply(401, { code: 'U2', message: '만료' }, id) : reply(200, { ok: 1 }, id);
    });
    await request('GET', '/users');
    expect(calls).toHaveLength(3);
    const ids = calls.map(c => c.headers[REQUEST_ID_HEADER]);
    ids.forEach(id => expect(id).toMatch(SERVER_FORMAT));
    expect(new Set(ids).size).toBe(3);
  });

  test('실패하면 같은 요청 ID가 ApiError · api_error · Sentry 보고에 함께', async () => {
    fetchWith((_, id) => reply(500, { code: 'S1', message: '서버 오류' }, id));
    const err = await request('GET', '/droppings/0b8e6f4a-1f2c-4d3e-9a7b-123456789abc').catch(e => e);
    const sent = calls[0].headers[REQUEST_ID_HEADER];
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).requestId).toBe(sent);
    expect(track).toHaveBeenCalledWith('api_error', { method: 'GET', path: '/droppings/:id', status: 500, code: 'S1', request_id: sent });
    expect(reportApiFailure).toHaveBeenCalledWith({ method: 'GET', path: '/droppings/:id', status: 500, code: 'S1', requestId: sent }, err);
  });

  test('서버가 다른 ID를 돌려주면 그 값을 쓴다 (서버 로그와 같은 값)', async () => {
    fetchWith(() => reply(404, { code: 'D2', message: '없음' }, 'server-made-id-1234'));
    const err = (await request('GET', '/droppings/x').catch(e => e)) as ApiError;
    expect(err.requestId).toBe('server-made-id-1234');
    expect((track as jest.Mock).mock.calls[0][1].request_id).toBe('server-made-id-1234');
  });

  test('네트워크 오류여도 보낸 ID는 남는다', async () => {
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => { calls.push({ url, headers: init.headers as Record<string, string> }); throw new Error('offline'); }) as never;
    const err = (await request('GET', '/users', { auth: 'none' }).catch(e => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    expect(err.requestId).toBe(calls[0].headers[REQUEST_ID_HEADER]);
  });

  test('성공하면 보고하지 않는다', async () => {
    fetchWith((_, id) => reply(200, { ok: 1 }, id));
    await request('GET', '/users');
    expect(track).not.toHaveBeenCalled();
    expect(reportApiFailure).not.toHaveBeenCalled();
  });
});
