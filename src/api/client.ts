import { env } from '@/config';
import { ApiError } from './errors';
import type { TokenPair } from './types';

export type AuthMode = 'required' | 'optional' | 'none';

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  form?: FormData;
  auth?: AuthMode;
}

/** 토큰 저장소는 store/auth가 주입 (순환 import 방지) */
export interface TokenBridge {
  get(): { accessToken: string | null; refreshToken: string | null };
  set(pair: TokenPair): Promise<void> | void;
  onExpired(): void;
}
let bridge: TokenBridge = { get: () => ({ accessToken: null, refreshToken: null }), set: () => {}, onExpired: () => {} };
export const setTokenBridge = (b: TokenBridge) => { bridge = b; };

export type ReqBody = string | FormData;

export interface RawResponse { status: number; text: string }

const TIMEOUT_MS = 15_000;

async function transport(method: string, url: string, headers: Record<string, string>, body?: ReqBody): Promise<RawResponse> {
  // 목 서버는 목 모드에서만 불러온다 (운영 빌드에선 시드 데이터를 만들지 않음)
  if (env.useMock) return (require('./mock/server') as typeof import('./mock/server')).mockFetch(method, url, headers, body);
  // 멈춘 연결에서 요청이 무한정 걸려 있지 않게 타임아웃 (재발급 단일화가 전체를 막지 않도록)
  // 파일 업로드(FormData)는 느린 망에서 오래 걸릴 수 있어 넉넉하게
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), typeof body === 'string' || body === undefined ? TIMEOUT_MS : TIMEOUT_MS * 4);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    return { status: res.status, text: await res.text() };
  } catch {
    return { status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

const parse = (text: string) => {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
};

function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  return `${env.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`;
}

// 동시 401을 한 번의 재발급으로 묶는다 (리프레시 토큰은 1회용)
// ok: 새 토큰 저장 / rejected: 서버가 거절(재로그인 필요) / unavailable: 네트워크·서버 오류(토큰 유지)
type RefreshOutcome = 'ok' | 'rejected' | 'unavailable' | 'switched';
let refreshing: Promise<RefreshOutcome> | null = null;
async function refreshTokens(): Promise<RefreshOutcome> {
  const { refreshToken } = bridge.get();
  if (!refreshToken) return 'rejected';
  if (!refreshing) {
    refreshing = (async (): Promise<RefreshOutcome> => {
      const r = await transport('POST', buildUrl('/auth/refresh'), { 'Content-Type': 'application/json' }, JSON.stringify({ refreshToken }));
      if (r.status === 200) {
        // 재발급 도중 로그아웃/다른 계정 로그인이 일어났다면 결과를 버린다
        // (다른 계정으로 로그인했어도 이전 계정의 요청을 새 계정 토큰으로 재시도하면 안 된다)
        if (bridge.get().refreshToken !== refreshToken) return 'switched';
        await bridge.set(parse(r.text) as TokenPair);
        return 'ok';
      }
      return r.status === 0 || r.status >= 500 ? 'unavailable' : 'rejected';
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}



export async function request<T = void>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth ?? 'required';
  const send = async (withToken = true) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: ReqBody | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    const { accessToken } = bridge.get();
    if (withToken && auth !== 'none' && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return transport(method, buildUrl(path, opts.query), headers, body);
  };

  let res = await send();
  let expired = false;
  if (res.status === 401 && auth !== 'none' && bridge.get().accessToken) {
    const code = (parse(res.text) as { code?: string } | undefined)?.code;
    // U2 만료 / U3 무효 → 재발급 후 1회 재시도 (U13·U17은 가입 토큰 오류라 재발급 대상 아님)
    if (code !== 'U13' && code !== 'U17') {
      const outcome = await refreshTokens();
      if (outcome === 'ok') res = await send();
      else if (outcome === 'unavailable') throw new ApiError(0, null);
      else if (outcome === 'switched') throw new ApiError(401, { code: 'U3', message: '세션이 바뀌었어요.' });
      else {
        // 세션이 끝났다 — 로그아웃 처리하고, 로그인 없이도 되는 요청은 비로그인으로 재시도
        expired = true;
        bridge.onExpired();
        if (auth === 'optional') res = await send(false);
      }
    }
    if (!expired && res.status === 401 && auth === 'required' && bridge.get().accessToken) bridge.onExpired();
  }
  const data = parse(res.text);
  if (res.status >= 200 && res.status < 300) return data as T;
  throw new ApiError(res.status, typeof data === 'object' ? (data as never) : null);
}

export const api = {
  get: <T>(path: string, o?: RequestOptions) => request<T>('GET', path, o),
  post: <T = void>(path: string, body?: unknown, o?: RequestOptions) => request<T>('POST', path, { ...o, body }),
  put: <T = void>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PUT', path, { ...o, body }),
  patch: <T = void>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PATCH', path, { ...o, body }),
  delete: <T = void>(path: string, o?: RequestOptions) => request<T>('DELETE', path, o),
};
