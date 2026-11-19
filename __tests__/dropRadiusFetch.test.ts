/* 드랍 보기 설정 요청 — 여러 화면이 같이 써도 한 번, 실패해도 화면을 열 때마다 다시 묻지 않는다 (시작·로그아웃 때 겹치던 것) */
import './setup/screenEnv';

const mockDropRadius = jest.fn();
jest.mock('@/api/endpoints', () => ({ settingsApi: { dropRadius: (...a: unknown[]) => mockDropRadius(...a) } }));
const store: Record<string, unknown> = {};
jest.mock('@/store/storage', () => ({ kv: { get: (k: string, d: unknown) => (k in store ? store[k] : d), set: (k: string, v: unknown) => { store[k] = v; }, remove: (k: string) => { delete store[k]; } } }));
jest.mock('@/services/location', () => ({ useLocation: (sel: (s: { coords: null }) => unknown) => sel({ coords: null }) }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { shouldRetryQuery } from '@/hooks/queryClient';
import { useDropRadius } from '@/hooks/useDropRadius';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;

const OK = { mode: 'DISTANCE', regionUnit: null, displayMeters: 5000, playMeters: 500, region: null, updatedAt: null };
let qc: QueryClient;
const roots: import('react-test-renderer').ReactTestRenderer[] = [];
const Screen = () => { useDropRadius(); return null; };
const open = () => act(() => { roots.push(TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Screen)))); });
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise<void>(r => setTimeout(r, 0)); });

beforeEach(() => {
  mockDropRadius.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });
});
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()); }); qc.clear(); });

test('앱 시작(루트) 뒤 지도·잠금 판정·알림 화면이 같은 훅을 새로 마운트해도 한 번만 묻는다', async () => {
  mockDropRadius.mockResolvedValue(OK);
  open(); await flush();
  open(); open(); open(); await flush();
  expect(mockDropRadius).toHaveBeenCalledTimes(1);
});

test('서버가 실패하면(4xx) 다시 시도하지 않고, 화면을 새로 열어도 다시 묻지 않는다', async () => {
  mockDropRadius.mockRejectedValue(new ApiError(404, null));
  open(); await flush();
  open(); open(); await flush();
  expect(mockDropRadius).toHaveBeenCalledTimes(1);
});

test('네트워크 오류는 한 번만 다시 시도한다', async () => {
  mockDropRadius.mockRejectedValue(new ApiError(0, null));
  open(); await flush();
  open(); await flush();
  expect(mockDropRadius).toHaveBeenCalledTimes(2);
});
