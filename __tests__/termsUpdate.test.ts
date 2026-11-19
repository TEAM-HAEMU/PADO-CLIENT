/* 약관 개정 시트 (닫을 수 없는 시트) — 혜택·소식 알림 동의는 바꿨을 때만 저장하고, 저장이 실패해도 갇히지 않는다 */
import './setup/screenEnv';

const mockClose = jest.fn();
const mockToast = jest.fn();
const mockConsent = jest.fn();
const mockKvSet = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Sheet', () => ({
  Sheet: (p: { closeRef?: { current: unknown } }) => { if (p.closeRef) p.closeRef.current = mockClose; return require('./setup/screenEnv').mockHost('Sheet')(p); },
}));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/store/storage', () => ({ kv: { set: (...a: unknown[]) => mockKvSet(...a), get: () => undefined } }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/api/endpoints', () => ({ authApi: { terms: jest.fn() } }));
jest.mock('@/services/pushSettings', () => ({ changeMarketingConsent: (...a: unknown[]) => mockConsent(...a) }));
// 예전에 이메일 마케팅에만 동의한 사람 — 푸시 설정 marketing은 꺼짐
jest.mock('@/store/prefs', () => ({ usePrefs: { getState: () => ({ notify: { marketing: false } }) } }));

import TermsUpdateScreen from '@/screens/me/TermsUpdateScreen';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const changed = [
  { type: 'SERVICE', agreedVersion: 'v1', latestVersion: 'v2', agreed: true, decidedAt: '' },
  { type: 'MARKETING', agreedVersion: 'v1', latestVersion: 'v3', agreed: false, decidedAt: '' },
];
function render() {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(TermsUpdateScreen as never, { route: { params: { changed } } })); });
  return r;
}
const button = (r: import('react-test-renderer').ReactTestRenderer, label: string) =>
  r.root.findAll((n: Node) => ['PrimaryButton', 'SecondaryButton'].includes(n.type as unknown as string) && n.props.label === label)[0];

beforeEach(() => { jest.clearAllMocks(); });

const toggle = (r: import('react-test-renderer').ReactTestRenderer) =>
  r.root.findAll((n: Node) => n.props.label === '혜택·소식 알림' && typeof n.props.onChange === 'function')[0];

test('토글을 그대로 두고 확인하면 동의 기록을 건드리지 않고 모두 본 것으로 닫는다 (예전 동의자도 푸시는 꺼진 채)', async () => {
  const r = render();
  expect(toggle(r).props.value).toBe(false);
  await act(async () => { await button(r, '확인').props.onPress(); });
  expect(mockConsent).not.toHaveBeenCalled();
  expect(mockKvSet.mock.calls.map(c => c[0])).toEqual(['termsSeen:SERVICE:v2', 'termsSeen:MARKETING:v3']);
  expect(mockClose).toHaveBeenCalledTimes(1);
});

test('켜고 확인했는데 저장이 실패하면 시트는 남되, 나중에 하기로 닫을 수 있다 (혜택·소식은 다음에 다시 묻도록 본 것으로 남기지 않음)', async () => {
  mockConsent.mockResolvedValueOnce(false);
  const r = render();
  act(() => { toggle(r).props.onChange(true); });
  expect(button(r, '나중에 하기')).toBeUndefined();
  await act(async () => { await button(r, '확인').props.onPress(); });
  expect(mockConsent).toHaveBeenCalledWith(true);
  expect(mockClose).not.toHaveBeenCalled();
  expect(mockKvSet).not.toHaveBeenCalled();

  act(() => { button(r, '나중에 하기').props.onPress(); });
  expect(mockKvSet.mock.calls.map(c => c[0])).toEqual(['termsSeen:SERVICE:v2']);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['agreements'] });
});

test('실패 뒤 다시 시도해 성공하면 모두 본 것으로 하고 닫는다', async () => {
  mockConsent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const r = render();
  act(() => { toggle(r).props.onChange(true); });
  await act(async () => { await button(r, '확인').props.onPress(); });
  await act(async () => { await button(r, '다시 시도').props.onPress(); });
  expect(mockConsent).toHaveBeenCalledTimes(2);
  expect(mockKvSet.mock.calls.map(c => c[0])).toEqual(['termsSeen:SERVICE:v2', 'termsSeen:MARKETING:v3']);
  expect(mockClose).toHaveBeenCalledTimes(1);
});
