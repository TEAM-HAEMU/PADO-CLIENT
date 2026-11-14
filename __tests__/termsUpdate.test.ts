/* 약관 개정 시트 (닫을 수 없는 시트) — 마케팅 동의 저장이 실패해도 갇히지 않는다 */
import './setup/screenEnv';

const mockClose = jest.fn();
const mockToast = jest.fn();
const mockSetMarketing = jest.fn();
const mockKvSet = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/ui/Sheet', () => ({
  Sheet: (p: { closeRef?: { current: unknown } }) => { if (p.closeRef) p.closeRef.current = mockClose; return require('./setup/screenEnv').mockHost('Sheet')(p); },
}));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/store/storage', () => ({ kv: { set: (...a: unknown[]) => mockKvSet(...a), get: () => undefined } }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@/api/endpoints', () => ({ authApi: { terms: jest.fn() }, userApi: { setMarketing: (...a: unknown[]) => mockSetMarketing(...a) } }));

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

test('저장이 실패하면 오류를 알리고 시트는 남되, 나중에 하기로 닫을 수 있다 (마케팅은 다음에 다시 묻도록 본 것으로 남기지 않음)', async () => {
  mockSetMarketing.mockRejectedValueOnce(new Error('서버 오류'));
  const r = render();
  expect(button(r, '나중에 하기')).toBeUndefined();
  await act(async () => { await button(r, '확인').props.onPress(); });
  expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
  expect(mockClose).not.toHaveBeenCalled();
  expect(mockKvSet).not.toHaveBeenCalled();

  act(() => { button(r, '나중에 하기').props.onPress(); });
  expect(mockKvSet.mock.calls.map(c => c[0])).toEqual(['termsSeen:SERVICE:v2']);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['agreements'] });
});

test('실패 뒤 다시 시도해 성공하면 모두 본 것으로 하고 닫는다', async () => {
  mockSetMarketing.mockRejectedValueOnce(new Error('서버 오류')).mockResolvedValueOnce({});
  const r = render();
  await act(async () => { await button(r, '확인').props.onPress(); });
  await act(async () => { await button(r, '다시 시도').props.onPress(); });
  expect(mockSetMarketing).toHaveBeenCalledTimes(2);
  expect(mockKvSet.mock.calls.map(c => c[0])).toEqual(['termsSeen:SERVICE:v2', 'termsSeen:MARKETING:v3']);
  expect(mockClose).toHaveBeenCalledTimes(1);
});

test('처음부터 성공하면 그대로 닫힌다 (나중에 하기는 보이지 않음)', async () => {
  mockSetMarketing.mockResolvedValueOnce({});
  const r = render();
  await act(async () => { await button(r, '확인').props.onPress(); });
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(button(r, '나중에 하기')).toBeUndefined();
});
