/* 한마디 화면 제출 — 제출 중에 화면을 떠나도 성공 처리(초안 초기화·성공 화면)가 빠지지 않고, 연타해도 한 번만 만든다, 위치 오차가 크면 막는다 */
import './setup/screenEnv';

const mockCreate = jest.fn();
const mockReset = jest.fn();
const mockToast = jest.fn();
const mockAlert = jest.fn();
const mockLoc = { coords: { latitude: 37.5, longitude: 127 } as { latitude: number; longitude: number } | null, accuracy: null as number | null, stale: false, address: '서울 중구', label: '' };
jest.mock('@/components/ui', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/drop/glyphs', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/components/drop/parts', () => require('./setup/screenEnv').mockHostModule());
jest.mock('@/hooks/useFocusedInputScroll', () => ({ useFocusedInputScroll: () => ({ ref: { current: null }, onFocus: () => {} }) }));
jest.mock('@/hooks/api', () => {
  const { useMutation } = jest.requireActual('@tanstack/react-query');
  return { useCreateDrop: () => useMutation({ mutationFn: (b: unknown) => mockCreate(b) }), useMyDrops: () => ({ data: [] }) };
});
jest.mock('@/services/location', () => ({
  useLocation: Object.assign((sel: (s: typeof mockLoc) => unknown) => sel(mockLoc), { getState: () => mockLoc }),
  currentCoords: (s: typeof mockLoc) => (s.stale ? null : s.coords),
  tooImpreciseToDrop: (s: typeof mockLoc) => s.accuracy != null && s.accuracy > 100,
  PRECISE_DROP_TITLE: '정확한 위치를 켜야 드랍을 남길 수 있어요',
  preciseDropHint: () => '',
}));
jest.mock('@/components/ui/Dialog', () => ({ dialog: { alert: (...a: unknown[]) => mockAlert(...a) } }));
jest.mock('@/services/preview', () => {
  const state = { key: null, paused: true, toggle: () => {} };
  return { usePreviewStore: Object.assign((sel: (s: typeof state) => unknown) => sel(state), { getState: () => state }) };
});
jest.mock('@/navigation/ref', () => ({ navigationRef: { isReady: () => true, reset: (...a: unknown[]) => mockReset(...a) } }));
jest.mock('@/store/auth', () => ({ useAuth: { getState: () => ({ status: 'authed' }) } }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NoteScreen from '@/screens/drop/NoteScreen';
import { useDraft } from '@/store/draft';
const React = require('react') as typeof import('react');
const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer');
const { act } = TestRenderer;
type Node = import('react-test-renderer').ReactTestInstance;

const SONG = { id: 'song-1', title: '곡', artist: '가수', albumImagePath: null };
const navigation = { goBack: jest.fn(), reset: jest.fn() };

const newClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } } });
function render(qc = newClient()) {
  let r!: import('react-test-renderer').ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(React.createElement(QueryClientProvider, { client: qc }, React.createElement(NoteScreen as never, { navigation, route: { params: undefined } })));
  });
  return r;
}
const submitButton = (r: import('react-test-renderer').ReactTestRenderer) => r.root.findAll((n: Node) => (n.type as unknown) === 'PrimaryButton')[0];
const deferred = () => { let resolve!: (v: unknown) => void, reject!: (e: unknown) => void; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>(res => setTimeout(res, 0)); });

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockLoc, { coords: { latitude: 37.5, longitude: 127 }, accuracy: null, stale: false });
  act(() => { useDraft.getState().start('MUSIC'); useDraft.getState().set({ song: SONG as never, content: '여기 좋아요' }); });
});

test('제출 중에 뒤로 가서 화면이 닫혀도 — 드랍이 만들어지면 초안을 비우고 성공 화면으로', async () => {
  const d = deferred();
  mockCreate.mockReturnValueOnce(d.promise);
  const r = render();
  act(() => { submitButton(r).props.onPress(); });
  act(() => { r.unmount(); }); // 곧바로 뒤로 가기
  await flush();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  d.resolve({ droppingId: 'new' });
  await flush();
  expect(useDraft.getState().song).toBeNull();
  expect(useDraft.getState().content).toBe('');
  expect(mockReset).toHaveBeenCalledWith(expect.objectContaining({ index: 1, routes: [{ name: 'Tabs' }, expect.objectContaining({ name: 'DropSuccess' })] }));
});

test('연타해도 한 번만 만든다 (렌더 전 두 번째 누름도 막힘)', async () => {
  const d = deferred();
  mockCreate.mockReturnValueOnce(d.promise);
  const r = render();
  const onPress = submitButton(r).props.onPress;
  act(() => { onPress(); onPress(); });
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  d.resolve({});
  await flush();
  act(() => { r.unmount(); });
});

test('실패하면 오류를 알리고 초안은 그대로, 다시 제출할 수 있다', async () => {
  mockCreate.mockRejectedValueOnce(new Error('D1')).mockResolvedValueOnce({});
  const r = render();
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
  expect(useDraft.getState().song?.id).toBe('song-1');
  expect(mockReset).not.toHaveBeenCalled();
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockReset).toHaveBeenCalledTimes(1);
  act(() => { r.unmount(); });
});

test('위치 오차가 100m를 넘으면 정확한 위치 안내를 띄우고 제출하지 않는다 (모르면 그대로 제출)', async () => {
  mockLoc.accuracy = 2000;
  mockCreate.mockResolvedValue({});
  const r = render();
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockAlert).toHaveBeenCalledWith('정확한 위치를 켜야 드랍을 남길 수 있어요', expect.any(String), expect.arrayContaining([expect.objectContaining({ text: '설정 열기' })]));
  mockLoc.accuracy = null;
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  act(() => { r.unmount(); });
});

test('낡은 좌표면 제출하지 않는다', async () => {
  mockLoc.stale = true;
  const r = render();
  act(() => { submitButton(r).props.onPress(); });
  await flush();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('위치'), 'error');
  act(() => { r.unmount(); });
});
