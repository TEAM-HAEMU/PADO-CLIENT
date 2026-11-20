/* 로그아웃 — 푸시 토큰 삭제를 기다리지 않고 바로 로그아웃 화면으로, 세션 만료 안내, 재발급 때 다시 식별 안 함, 알림 설정 초기화 */
jest.mock('@/api/client', () => ({ setTokenBridge: jest.fn() }));
jest.mock('@/api/endpoints', () => ({ authApi: { logout: jest.fn(async () => undefined) }, userApi: { me: jest.fn(async () => ({ username: 'zerone' })) } }));
jest.mock('@/services/analytics', () => ({
  analyticsMode: jest.fn(() => 'detailed'), identifyUser: jest.fn(), resetUser: jest.fn(), track: jest.fn(), userIdFromToken: () => 'user-1',
  migrateAnalyticsMode: () => 'basic', setAnalyticsMode: jest.fn(async () => undefined), setUserProps: jest.fn(),
}));
jest.mock('@/services/monitoring', () => ({ setMonitoringMode: jest.fn(), reportError: jest.fn() }));
jest.mock('@/services/preview', () => ({ usePreviewStore: { getState: () => ({ stop: jest.fn() }) } }));
jest.mock('@/services/socialAuth', () => ({ signOutProviders: jest.fn() }));
jest.mock('@/services/playQueue', () => ({ clearQueue: jest.fn() }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));

import { setBeforeSignOut, useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import type { TokenBridge } from '@/api/client';

const { setTokenBridge } = jest.requireMock('@/api/client') as { setTokenBridge: jest.Mock };
const { authApi, userApi } = jest.requireMock('@/api/endpoints') as { authApi: { logout: jest.Mock }; userApi: { me: jest.Mock } };
const { toast } = jest.requireMock('@/store/toast') as { toast: jest.Mock };
const bridge = setTokenBridge.mock.calls[0][0] as TokenBridge;
const PAIR = { accessToken: 'a1', refreshToken: 'r1', accessTokenExpiresIn: 0, refreshTokenExpiresIn: 0 };
const flush = () => new Promise<void>(r => setImmediate(r));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(async () => {
  jest.clearAllMocks();
  await useAuth.getState().signIn(PAIR);
  await flush();
  jest.clearAllMocks();
});

test('푸시 토큰 삭제는 토큰이 있을 때 시작하고, 끝나길 기다리지 않고 바로 로그아웃 상태로 — 서버 로그아웃은 삭제 뒤에', async () => {
  const d = deferred();
  let tokenAtStart: string | null = null;
  const before = jest.fn(() => { tokenAtStart = useAuth.getState().accessToken; return d.promise; });
  setBeforeSignOut(before);
  const done = useAuth.getState().signOut();
  expect(before).toHaveBeenCalledWith({ callServer: true, accessToken: 'a1' });
  expect(tokenAtStart).toBe('a1');
  expect(useAuth.getState().status).toBe('guest');
  await done; // 푸시 삭제가 아직 안 끝나도 로그아웃은 끝난다
  expect(authApi.logout).not.toHaveBeenCalled();
  d.resolve();
  await flush();
  expect(authApi.logout).toHaveBeenCalledWith('r1');
});

test('푸시 토큰 삭제가 실패해도 서버 로그아웃은 한다', async () => {
  setBeforeSignOut(jest.fn(async () => { throw new Error('x'); }));
  await useAuth.getState().signOut();
  await flush();
  expect(useAuth.getState().status).toBe('guest');
  expect(authApi.logout).toHaveBeenCalledWith('r1');
});

test('세션이 끝나면 안내 토스트를 한 번만 띄우고 로그아웃 — 직접 로그아웃엔 띄우지 않음', async () => {
  setBeforeSignOut(jest.fn(async () => undefined));
  bridge.onExpired();
  bridge.onExpired(); // 동시에 여러 요청이 만료를 알려도
  expect(useAuth.getState().status).toBe('guest');
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('로그인이 만료됐어요. 다시 로그인해주세요.');
  await flush();
  expect(authApi.logout).not.toHaveBeenCalled();

  await useAuth.getState().signIn(PAIR);
  toast.mockClear();
  await useAuth.getState().signOut();
  expect(toast).not.toHaveBeenCalled();
});

test('토큰 재발급은 같은 사용자 — 사용자 정보를 다시 부르지 않는다 (로그인은 부름)', async () => {
  await bridge.set({ ...PAIR, accessToken: 'a2', refreshToken: 'r2' });
  expect(useAuth.getState().accessToken).toBe('a2');
  expect(userApi.me).not.toHaveBeenCalled();
  await useAuth.getState().signIn(PAIR);
  expect(userApi.me).toHaveBeenCalledTimes(1);
});

test('로그아웃하면 알림 설정을 기본값으로 되돌린다 (다음 사용자에게 이전 값이 보이지 않게)', async () => {
  setBeforeSignOut(jest.fn(async () => undefined));
  usePrefs.getState().applyNotify({ like: false, comment: false, nearby: true, notice: false, marketing: true });
  await useAuth.getState().signOut();
  expect(usePrefs.getState().notify).toEqual({ like: true, comment: true, nearby: false, notice: true, marketing: false });
});

test('로그아웃하면 전체 재생 대기열도 놓는다 — 건너뛰기 대기·곡 조회 중이어도 로그아웃 뒤에 다음 곡이 나오지 않게 (QA 리뷰 #52)', async () => {
  const { clearQueue } = jest.requireMock('@/services/playQueue') as { clearQueue: jest.Mock };
  await useAuth.getState().signOut({ callServer: false });
  expect(clearQueue).toHaveBeenCalledTimes(1);
});
