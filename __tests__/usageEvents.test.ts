import { BATCH_MAX, createUsageQueue, isServerEvent, type ServerEvent } from '@/services/usageEvents';

const flushPromises = () => new Promise<void>(r => setImmediate(() => r()));

function setup(statuses: number[] = []) {
  const sent: ServerEvent[][] = [];
  const send = jest.fn(async (events: ServerEvent[]) => { sent.push(events); return statuses.shift() ?? 204; });
  return { q: createUsageQueue({ send, debounceMs: 1000, enabled: () => true }), send, sent };
}

beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
afterEach(() => jest.useRealTimers());

test('서버가 세는 이벤트만 허용 목록', () => {
  expect(isServerEvent('drop_opened')).toBe(true);
  expect(isServerEvent('screen_viewed')).toBe(false);
});

test('마지막 이벤트 뒤 잠깐 기다렸다 한 번에 보낸다', async () => {
  const { q, sent } = setup();
  q.enqueue('app_opened');
  jest.advanceTimersByTime(500);
  q.enqueue('drop_opened', 'd1');
  jest.advanceTimersByTime(999);
  expect(sent).toHaveLength(0);
  jest.advanceTimersByTime(1);
  await flushPromises();
  expect(sent).toEqual([[{ name: 'app_opened' }, { name: 'drop_opened', droppingId: 'd1' }]]);
  expect(q.size).toBe(0);
});

test('50개가 차면 바로, 넘치는 건 다음 요청으로 나눈다', async () => {
  const { q, sent } = setup();
  for (let i = 0; i < BATCH_MAX + 3; i++) q.enqueue('preview_started');
  await flushPromises();
  await q.flush();
  expect(sent.map(b => b.length)).toEqual([BATCH_MAX, 3]);
});

test('네트워크 오류·5xx면 남겨 두고 다음에 다시, 404(서버 배포 전)·400은 버린다', async () => {
  const { q, sent } = setup([0, 503, 204, 404]);
  q.enqueue('share_opened');
  await q.flush();
  expect(q.size).toBe(1);
  await q.flush();
  expect(q.size).toBe(1);
  await q.flush();
  expect(q.size).toBe(0);
  q.enqueue('drop_locked_tap', 'd2');
  await q.flush();
  expect(q.size).toBe(0);
  expect(sent).toHaveLength(4);
});

test('꺼져 있으면(목 모드·분석 끔) 모으지도 보내지도 않는다', async () => {
  const send = jest.fn(async () => 204);
  const q = createUsageQueue({ send, enabled: () => false });
  q.enqueue('app_opened');
  await q.flush();
  expect(q.size).toBe(0);
  expect(send).not.toHaveBeenCalled();
});

test('clear하면 안 보낸 것도 버린다', async () => {
  const { q, send } = setup();
  q.enqueue('app_opened');
  q.clear();
  jest.advanceTimersByTime(5000);
  await flushPromises();
  expect(send).not.toHaveBeenCalled();
});
