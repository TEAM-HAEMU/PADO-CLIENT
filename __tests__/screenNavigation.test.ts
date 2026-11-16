/* 화면 이동이 스택에 화면을 새로 쌓지 않는지 — 비밀번호 재설정 완료 · 알림에서 지도로 (React Navigation 7의 navigate는 push한다) */
import './setup/screenEnv';

const mockNav = { navigate: jest.fn(), popTo: jest.fn(), goBack: jest.fn() };
const mockToast = jest.fn();
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/me/MeIcons', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/auth/AuthChrome', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Field', () => ({ Field: require('./setup/screenEnv').mockHost('Field') }));
jest.mock('@/hooks/useFocusedInputScroll', () => ({ useFocusedInputScroll: () => ({ ref: { current: null }, onFocus: () => {} }) }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ getQueriesData: () => [], invalidateQueries: jest.fn() }) }));
jest.mock('@/hooks/useDropLock', () => ({ useDropLock: () => () => null }));
jest.mock('@/hooks/api', () => ({
  useDrop: () => ({ data: undefined }),
  useSong: () => ({ data: undefined }),
  useNotifications: () => ({
    data: [{ id: 'n1', eventName: 'dropping-created', data: { songId: 'gone' }, readAt: '2026-11-14T00:00:00Z', createdAt: new Date().toISOString() }],
    isLoading: false, isRefetching: false, isError: false, error: null, refetch: jest.fn(),
  }),
}));
jest.mock('@/api/endpoints', () => ({
  authApi: { passwordReset: { requestCode: jest.fn(async () => ({})), verify: jest.fn(async () => ({ resetToken: 'tok' })), reset: jest.fn(async () => ({})) } },
  notificationApi: { read: jest.fn(async () => ({})), readAll: jest.fn(async () => ({})) },
}));

import PasswordResetScreen from '@/screens/auth/PasswordResetScreen';
import NotificationsScreen from '@/screens/me/NotificationsScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

let mounted: import('react-test-renderer').ReactTestRenderer | undefined;
beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => { act(() => { mounted?.unmount(); }); mounted = undefined; jest.useRealTimers(); });

function render(el: React.ReactElement) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(el); });
  mounted = r;
  return r;
}
const byType = (r: import('react-test-renderer').ReactTestRenderer, type: string) => r.root.findAll((n: Node) => (n.type as unknown) === type);

test('비밀번호를 바꾸면 있던 로그인 화면으로 돌아간다 (popTo — 새 로그인 화면을 쌓지 않음)', async () => {
  const r = render(React.createElement(PasswordResetScreen as never, { navigation: mockNav, route: { params: { email: 'a@b.co' } } }));
  const press = async () => { await act(async () => { await byType(r, 'AuthButton')[0].props.onPress(); }); };
  await press(); // 이메일 → 인증번호 받기
  act(() => { byType(r, 'Field')[0].props.onChangeText('123456'); });
  await press(); // 인증번호 확인
  const [pw, confirm] = byType(r, 'Field');
  act(() => { pw.props.onChangeText('newpass12'); confirm.props.onChangeText('newpass12'); });
  await press(); // 비밀번호 바꾸기
  expect(mockNav.popTo).toHaveBeenCalledWith('EmailLogin', { email: 'a@b.co', reset: true });
  expect(mockNav.navigate).not.toHaveBeenCalled();
});

test('근처에 없는 새 드랍 알림을 누르면 탭(지도)으로 돌아간다 (popTo — 탭을 한 벌 더 쌓지 않음)', async () => {
  const r = render(React.createElement(NotificationsScreen as never));
  const row = byType(r, 'Press').find(n => n.props.trackAs === '알림 항목')!;
  await act(async () => { await row.props.onPress(); });
  expect(mockToast).toHaveBeenCalledWith('이 드랍은 지금 근처에 없거나 사라졌어요.');
  expect(mockNav.popTo).toHaveBeenCalledWith('Tabs', { screen: 'Map' });
  expect(mockNav.navigate).not.toHaveBeenCalled();
});
