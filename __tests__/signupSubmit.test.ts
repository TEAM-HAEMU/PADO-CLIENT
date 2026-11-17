/* 가입 화면 — 버튼(맨 아래)을 눌렀는데 위쪽 칸이 틀렸으면 그 칸으로 올리고 토스트로 알린다 */
import './setup/screenEnv';

const mockToast = jest.fn();
const mockScrollTo = jest.fn();
const mockRegister = jest.fn();
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Field', () => {
  const host = require('./setup/screenEnv').mockHostModule();
  return { Field: host.Field, GenderSelect: host.GenderSelect, ListenAppSelect: host.ListenAppSelect, formatBirth: (t: string) => t };
});
jest.mock('@/components/auth/AuthChrome', () => {
  const host = require('./setup/screenEnv').mockHostModule();
  return { AUTH_PAGES: 3, AuthButton: host.AuthButton, AuthHeader: host.AuthHeader, AuthTitle: host.AuthTitle, CheckBox: host.CheckBox };
});
// ScrollView가 ref에 자기 자신을 넣어도 스크롤 호출은 여기로 오게 (setter 무시)
jest.mock('@/hooks/useFocusedInputScroll', () => {
  const ref = { get current() { return { scrollTo: (...a: unknown[]) => mockScrollTo(...a) }; }, set current(_v: unknown) {} };
  return { useFocusedInputScroll: () => ({ ref, onFocus: () => {} }) };
});
jest.mock('@/api/endpoints', () => ({ authApi: { terms: jest.fn(async () => []), register: (...a: unknown[]) => mockRegister(...a) } }));
jest.mock('@/store/auth', () => ({ useAuth: (sel: (s: unknown) => unknown) => sel({ signIn: jest.fn() }) }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/services/socialAuth', () => ({ getProviderCredential: jest.fn() }));
jest.mock('@/store/prefs', () => ({ usePrefs: { getState: () => ({ service: null, setService: jest.fn() }) } }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SignupScreen from '@/screens/auth/SignupScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const navigation = { goBack: jest.fn(), popTo: jest.fn(), popToTop: jest.fn(), navigate: jest.fn() };
let r: import('react-test-renderer').ReactTestRenderer;
const field = (label: string) => r.root.findAll((n: Node) => (n.type as unknown) === 'Field' && n.props.label === label)[0];
/** 감싼 View의 onLayout으로 위치를 알린다 */
const layout = (n: Node, y: number) => {
  let p = n.parent;
  while (p && typeof p.props.onLayout !== 'function') p = p.parent;
  act(() => { p?.props.onLayout({ nativeEvent: { layout: { y } } }); });
};

beforeEach(() => {
  jest.clearAllMocks();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  act(() => { r = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(SignupScreen as never, { navigation, route: { params: { mode: 'email' } } }))); });
});
afterEach(() => { act(() => { r.unmount(); }); });

test('위쪽 칸이 틀리면 가입 요청 없이 첫 오류 칸으로 올리고 토스트', () => {
  const form = r.root.findAll((n: Node) => typeof n.props.onLayout === 'function' && n.props.style?.paddingTop === 24)[0];
  act(() => { form.props.onLayout({ nativeEvent: { layout: { y: 200 } } }); });
  layout(field('이메일'), 0);
  layout(field('비밀번호'), 80);
  act(() => { field('이메일').props.onChangeText('a@b.co'); field('닉네임').props.onChangeText('파도'); field('생년월일').props.onChangeText('2000-01-01'); });
  const button = r.root.findAll((n: Node) => (n.type as unknown) === 'AuthButton')[0];
  act(() => { button.props.onPress(); });
  expect(mockRegister).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('비밀번호는 8~20자예요.', 'error');
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 200 + 80 - 24, animated: true });
  expect(field('비밀번호').props.error).toBe('비밀번호는 8~20자예요.');
});
