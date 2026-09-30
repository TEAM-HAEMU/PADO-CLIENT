/* '전체 듣기' — 고른 음악 앱으로 딥링크, 미선택이면 선택 시트 */
const mockOpen = jest.fn(async (..._a: unknown[]) => true);
const mockNavigate = jest.fn();
const mockToast = jest.fn();
jest.mock('@/services/musicLinks', () => ({ openInService: (...a: unknown[]) => mockOpen(...a), SERVICES: { spotify: { label: 'Spotify' }, youtubeMusic: { label: 'YouTube Music' }, appleMusic: { label: 'Apple Music' } } }));
jest.mock('@/navigation/ref', () => ({ navigationRef: { isReady: () => true, navigate: (...a: unknown[]) => mockNavigate(...a) } }));
jest.mock('@/store/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

import { listenFull, listenLabel } from '@/services/listen';

const song = { id: 's1', title: 'T', artist: 'A' };
beforeEach(() => { mockOpen.mockClear(); mockNavigate.mockClear(); mockToast.mockClear(); });

test('Spotify·Apple Music·YouTube Music → 해당 앱으로 딥링크', async () => {
  for (const s of ['spotify', 'appleMusic', 'youtubeMusic'] as const) await listenFull(s, song);
  expect(mockOpen.mock.calls.map(c => c[0])).toEqual(['spotify', 'appleMusic', 'youtubeMusic']);
  expect(listenLabel('spotify')).toBe('Spotify에서 전체 듣기');
});

test('앱을 못 열면 안내', async () => {
  mockOpen.mockResolvedValueOnce(false);
  await listenFull('youtubeMusic', song);
  expect(mockToast).toHaveBeenCalledWith('YouTube Music을(를) 열 수 없어요.', 'error');
});

test('미선택 → 재생 앱 선택 시트', async () => {
  await listenFull(null, song);
  expect(mockNavigate).toHaveBeenCalledWith('ServicePicker', { song });
  expect(mockOpen).not.toHaveBeenCalled();
});
