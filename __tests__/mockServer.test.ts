import { MOCK_ACCOUNT, mockFetch } from '@/api/mock/server';
import { HOME } from '@/api/mock/data';

jest.setTimeout(20000);
const base = 'https://api.test/api/v1';
const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await mockFetch(method, base + path, headers, body === undefined ? undefined : JSON.stringify(body));
  return { status: r.status, data: r.text ? JSON.parse(r.text) : undefined };
};

let token = '';
beforeAll(async () => {
  const r = await call('POST', '/auth/login', MOCK_ACCOUNT);
  expect(r.status).toBe(200);
  token = r.data.accessToken;
});

test('로그인 오류 코드', async () => {
  expect((await call('POST', '/auth/login', { email: 'no@x.y', password: 'a' })).data.code).toBe('U1');
  expect((await call('POST', '/auth/login', { ...MOCK_ACCOUNT, password: 'wrong' })).data.code).toBe('U5');
});

test('리프레시 토큰은 1회용', async () => {
  const { data } = await call('POST', '/auth/login', MOCK_ACCOUNT);
  expect((await call('POST', '/auth/refresh', { refreshToken: data.refreshToken })).status).toBe(200);
  expect((await call('POST', '/auth/refresh', { refreshToken: data.refreshToken })).data.code).toBe('U9');
});

test('인증 필요 엔드포인트는 토큰 없으면 401', async () => {
  expect((await call('GET', '/users')).status).toBe(401);
});

test('주변 드랍 — 반경 안의 드랍만, 타입별 모양', async () => {
  const r = await call('GET', `/droppings?latitude=${HOME.latitude}&longitude=${HOME.longitude}&distance=1`, undefined, token);
  expect(r.status).toBe(200);
  const list = r.data.droppings ?? r.data;
  expect(list.length).toBeGreaterThan(3);
  expect(new Set(list.map((d: { type: string }) => d.type))).toEqual(new Set(['MUSIC', 'VOTE', 'PLAYLIST']));
});

test('드랍 만들기 — 같은 자리(1m) 중복은 D1', async () => {
  const song = (await call('GET', '/songs/search?query=' + encodeURIComponent('밤편지'))).data;
  const songId = (Array.isArray(song) ? song : song.songs ?? song.content)[0].id;
  const at = { latitude: HOME.latitude + 0.01, longitude: HOME.longitude + 0.01 };
  const body = { type: 'MUSIC', songId, content: '테스트', address: '테스트 주소', ...at };
  expect((await call('POST', '/droppings', body, token)).status).toBe(201);
  expect((await call('POST', '/droppings', body, token)).data.code).toBe('D1');
});

test('플레이리스트 — 같은 곡 두 번 담으면 P3', async () => {
  const pls = (await call('GET', '/playlists/my', undefined, token)).data.playlists;
  const detail = (await call('GET', `/playlists/${pls[0].id}`, undefined, token)).data;
  const first = (detail.songs ?? detail.songIds)[0];
  const id = typeof first === 'string' ? first : first.id;
  expect((await call('POST', `/playlists/${pls[0].id}/songs`, { songIds: [id] }, token)).data.code).toBe('P3');
});

declare const process: { env: Record<string, string | undefined> };

test('(개발용) 시드 드랍 ID 출력', async () => {
  const r = await call('GET', `/droppings?latitude=${HOME.latitude}&longitude=${HOME.longitude}&distance=5`, undefined, token);
  if (process.env.PRINT_IDS) console.log(r.data.droppings.map((d: { type: string; droppingId: string; songId?: string }) => `${d.type} ${d.droppingId} ${d.songId ?? ''}`).join('\n'));
  const pls = (await call('GET', '/playlists/my', undefined, token)).data.playlists;
  if (process.env.PRINT_IDS) console.log(pls.map((p: { id: string; name: string }) => `PL ${p.id} ${p.name}`).join('\n'));
});

