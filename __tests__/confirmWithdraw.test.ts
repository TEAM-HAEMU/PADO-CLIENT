/* 탈퇴 확인 — 탈퇴가 실패하면 지운 푸시 토큰을 다시 등록, 처리 중엔 닫을 수 없음 */
import './setup/screenEnv';
import { BackHandler } from 'react-native';

const mockWithdraw = jest.fn();
const mockSignOut = jest.fn(async () => undefined);
const mockToast = jest.fn();
const mockUnregister = jest.fn(async () => undefined);
const mockSync = jest.fn(async () => undefined);
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/me/MeIcons', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/hooks/api', () => ({ useMyDrops: () => ({ data: [] }) }));
jest.mock('@/api/endpoints', () => ({ userApi: { withdraw: () => mockWithdraw() } }));
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: unknown) => unknown) => sel({ signOut: mockSignOut }) }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/services/push', () => ({ unregisterPushToken: () => mockUnregister(), syncPushToken: () => mockSync() }));

import ConfirmWithdrawScreen from '@/screens/me/ConfirmWithdrawScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const navigation = { goBack: jest.fn(), setOptions: jest.fn() };
let r: import('react-test-renderer').ReactTestRenderer;
const presses = () => r.root.findAll((n: Node) => (n.type as unknown) === 'Press');
const cancel = () => presses()[0];
const confirm = () => presses()[1];
const backdrop = () => r.root.findAll((n: Node) => n.props.accessibilityLabel === '닫기' && typeof n.props.onPress === 'function')[0];
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>(res => setTimeout(res, 0)); });
const deferred = () => { let resolve!: (v?: unknown) => void, reject!: (e: unknown) => void; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => {
  jest.clearAllMocks();
  act(() => { r = TestRenderer.create(React.createElement(ConfirmWithdrawScreen as never, { navigation, route: { params: undefined } })); });
});
afterEach(() => { act(() => { r.unmount(); }); });

test('탈퇴가 실패하면 로그인은 그대로이므로 푸시 토큰을 다시 등록한다', async () => {
  mockWithdraw.mockRejectedValueOnce(new Error('서버 오류'));
  act(() => { confirm().props.onPress(); });
  await flush();
  expect(mockUnregister).toHaveBeenCalledTimes(1);
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('서버 오류', 'error');
  expect(confirm().props.disabled).toBe(false);
});

test('탈퇴가 되면 다시 등록하지 않고 로그아웃', async () => {
  mockWithdraw.mockResolvedValueOnce(undefined);
  act(() => { confirm().props.onPress(); });
  await flush();
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockSignOut).toHaveBeenCalledWith({ callServer: false });
});

test('처리 중엔 취소·배경·Android 뒤로·쓸어내리기로 닫을 수 없다', async () => {
  const d = deferred();
  mockWithdraw.mockReturnValueOnce(d.promise);
  const spy = jest.spyOn(BackHandler, 'addEventListener');
  act(() => { confirm().props.onPress(); });
  await flush();
  expect(cancel().props.disabled).toBe(true);
  expect(backdrop().props.disabled).toBe(true);
  act(() => { cancel().props.onPress(); backdrop().props.onPress(); });
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  const handler = spy.mock.calls.find(c => c[0] === 'hardwareBackPress')?.[1] as (() => boolean) | undefined;
  expect(handler?.()).toBe(true);
  act(() => { confirm().props.onPress(); }); // 연타
  d.resolve();
  await flush();
  expect(mockWithdraw).toHaveBeenCalledTimes(1);
});
