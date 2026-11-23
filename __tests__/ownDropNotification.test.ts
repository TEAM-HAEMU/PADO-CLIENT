/*
 * '주변 새 드랍' 알림을 꺼도 알림이 생긴다는 제보 (2026-11-23)
 * 예전 서버는 드랍을 남긴 사람 본인의 알림함에 dropping-created를 저장했고, 앱은 그걸 '근처에 새 드랍이 생겼어요'로 보여 줬다.
 *  - 알림 목록·안 읽음 점·토스트에서 뺀다 (예전 서버가 남긴 기록은 지우거나 읽음으로 바꾸지 않고 거르기만)
 *  - 지도 새로고침 신호(dropping-created · 새 서버의 my-dropping-created)는 그대로 쓴다
 */
import { AppState } from 'react-native';

const mockListeners: Record<string, (e: { data?: string | null }) => void> = {};
jest.mock('react-native-sse', () => jest.fn().mockImplementation(() => ({
  addEventListener: (name: string, fn: (e: { data?: string | null }) => void) => { mockListeners[name] = fn; },
  removeAllEventListeners: jest.fn(),
  close: jest.fn(),
})));
jest.mock('@/config', () => ({ env: { useMock: false, apiBaseUrl: 'https://api.test' } }));
jest.mock('@/api/endpoints', () => ({
  notificationApi: { list: jest.fn(), unreadCount: jest.fn(), read: jest.fn(async () => undefined), readAll: jest.fn() },
}));
jest.mock('@/hooks/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/store/auth', () => ({ useAuth: jest.requireActual('zustand').create(() => ({ status: 'authed', accessToken: 'tok' })) }));
jest.mock('@/store/prefs', () => ({ usePrefs: jest.requireActual('zustand').create(() => ({ notify: { like: true, comment: true, nearby: true, notice: true, marketing: false } })) }));
jest.mock('@/store/toast', () => ({ toast: jest.fn() }));
jest.mock('@/hooks/useDropRadius', () => ({ useDropRadius: () => ({ mode: 'distance' }) }));
jest.mock('@/services/push', () => ({ pushActive: () => false }));
const mockQc = { invalidateQueries: jest.fn() };
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: (options: unknown) => options,
  useQueryClient: () => mockQc,
}));

import type { AppNotification } from '@/api/types';
import { useNotifications, useUnreadCount } from '@/hooks/api';
import { startNotificationStream, stopNotificationStream } from '@/services/notificationsStream';
import { hiddenNotifications, splitNotifications, visibleUnreadCount } from '@/utils/notifications';

const { notificationApi } = jest.requireMock('@/api/endpoints') as { notificationApi: Record<string, jest.Mock> };
const { queryClient } = jest.requireMock('@/hooks/queryClient') as { queryClient: { invalidateQueries: jest.Mock } };
const { toast } = jest.requireMock('@/store/toast') as { toast: jest.Mock };
const { usePrefs } = jest.requireMock('@/store/prefs');

Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
const flush = () => new Promise<void>(r => setImmediate(r));
const n = (id: string, eventName: string, readAt: string | null = null): AppNotification =>
  ({ id, eventName, data: {}, readAt, createdAt: '2026-11-23T00:00:00Z' });
type QueryOptions<T> = { queryFn: () => Promise<T> };
// useQuery를 옵션 그대로 돌려주게 바꿔 queryFn만 부른다
const useUnreadQuery = () => (useUnreadCount() as unknown as QueryOptions<number>).queryFn();
const useListQuery = () => (useNotifications() as unknown as QueryOptions<AppNotification[]>).queryFn();

beforeEach(() => {
  jest.clearAllMocks();
  hiddenNotifications.mayExist = true;
});

describe('목록·안 읽음 수에서 뺀다', () => {
  test('본인 드랍 생성 기록(dropping-created)만 빼고, 안 읽은 것은 따로 센다', () => {
    const { visible, hiddenUnread } = splitNotifications([
      n('a', 'like-created'), n('b', 'dropping-created'), n('c', 'dropping-created', '2026-11-22T00:00:00Z'), n('d', 'comment-created'),
    ]);
    expect(visible.map(x => x.id)).toEqual(['a', 'd']);
    expect(hiddenUnread.map(x => x.id)).toEqual(['b']);
    expect(visibleUnreadCount(3, 1)).toBe(2);
    expect(visibleUnreadCount(1, 3)).toBe(0);
  });

  test('알림 목록에는 좋아요·댓글만 보이고, 숨긴 기록은 건드리지 않는다', async () => {
    notificationApi.list.mockResolvedValue([n('a', 'like-created'), n('b', 'dropping-created'), n('c', 'comment-created')]);

    const list = await useListQuery();
    await flush();

    expect(list.map(x => x.eventName)).toEqual(['like-created', 'comment-created']);
    expect(notificationApi.read).not.toHaveBeenCalled();
  });

  test('예전 서버가 남긴 기록만 안 읽었으면 빨간 점이 뜨지 않는다 (서버 데이터는 그대로)', async () => {
    notificationApi.unreadCount.mockResolvedValue(2);
    notificationApi.list.mockResolvedValue([n('b1', 'dropping-created'), n('b2', 'dropping-created'), n('a', 'like-created', '2026-11-22T00:00:00Z')]);

    await expect(useUnreadQuery()).resolves.toBe(0);
    expect(notificationApi.read).not.toHaveBeenCalled();
  });

  test('진짜 안 읽은 알림은 그대로 센다', async () => {
    notificationApi.unreadCount.mockResolvedValue(2);
    notificationApi.list.mockResolvedValue([n('a', 'like-created'), n('b', 'dropping-created')]);

    await expect(useUnreadQuery()).resolves.toBe(1);
  });

  test('한 번 봐서 숨길 기록이 없으면(새 서버) 다음부터는 목록을 더 받지 않는다', async () => {
    notificationApi.unreadCount.mockResolvedValue(1);
    notificationApi.list.mockResolvedValue([n('a', 'like-created')]);

    await expect(useUnreadQuery()).resolves.toBe(1);
    await expect(useUnreadQuery()).resolves.toBe(1);
    expect(notificationApi.list).toHaveBeenCalledTimes(1);
    expect(notificationApi.read).not.toHaveBeenCalled();
  });

  test('안 읽은 게 없으면 목록을 받지 않는다', async () => {
    notificationApi.unreadCount.mockResolvedValue(0);
    await expect(useUnreadQuery()).resolves.toBe(0);
    expect(notificationApi.list).not.toHaveBeenCalled();
  });
});

describe('실시간(SSE)', () => {
  beforeEach(() => { startNotificationStream(); });
  afterEach(() => { stopNotificationStream(); });
  const send = (name: string, data: Record<string, unknown> = {}) => mockListeners[name]({ data: JSON.stringify({ data }) });

  test('예전 서버의 dropping-created는 주변 새 드랍을 켰어도 토스트 없이 지도만 새로 받고, 안 읽음 수를 다시 거른다', () => {
    hiddenNotifications.mayExist = false;
    send('dropping-created', { userId: 'me', songId: 's1' });

    expect(toast).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['nearby'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread'] });
    expect(hiddenNotifications.mayExist).toBe(true);
  });

  test('새 서버의 my-dropping-created는 지도 새로고침 신호로만 쓴다 (알림 목록은 그대로)', () => {
    send('my-dropping-created', { droppingId: 'd1' });

    expect(toast).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['nearby'] });
  });

  test('좋아요·댓글은 각자의 토글대로 토스트를 띄운다', () => {
    send('like-created', { likerUsername: '둘째' });
    expect(toast).toHaveBeenLastCalledWith('둘째님이 내 드랍을 좋아해요');

    usePrefs.setState({ notify: { ...usePrefs.getState().notify, comment: false } });
    toast.mockClear();
    send('comment-created', { commenterUsername: '셋째' });
    expect(toast).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });
});
