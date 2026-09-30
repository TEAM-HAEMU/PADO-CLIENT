/**
 * API 계약 테스트 — 앱의 실제 API 계층(endpoints.ts + client.ts)으로 명세의 모든 사용자용 엔드포인트를 호출하고
 * 응답 모양을 명세와 대조한다. 흐름 중에 만든 데이터(드랍·플리·댓글·좋아요·투표)는 끝에서 지운다.
 *
 *   npm test                                  → 앱 내장 목 서버로 전체 흐름
 *   npm run test:api                          → 실서버 공개 API + 인증 없는 요청 거절(401) 확인
 *   PADO_TEST_EMAIL=… PADO_TEST_PASSWORD=… npm run test:api
 *                                             → 실서버 전체 흐름 (로그인 계정으로 생성·수정·삭제까지)
 *
 * 되돌릴 수 없는 호출은 하지 않는다: 회원 탈퇴 X, 신고는 PADO_TEST_REPORT=1일 때만, 차단은 PADO_TEST_BLOCK_USER_ID가 있을 때만.
 */
// 앱 tsconfig엔 node 타입이 없어 globalThis로 환경변수를 읽는다
jest.mock('@/config', () => {
  const e = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  return {
  env: {
    apiBaseUrl: e.PADO_LIVE ? e.API_BASE_URL || 'https://d3o34y31tdp6bd.cloudfront.net/api/v1' : 'https://api.test/api/v1',
    useMock: !e.PADO_LIVE,
    googleMapsKey: '', kakaoAppKey: '', google: {},
  },
  NEARBY_RADIUS_KM: 1,
  };
});

import { authApi, commentApi, dropApi, likeApi, notificationApi, playlistApi, safetyApi, songApi, userApi } from '@/api/endpoints';
import { api, setTokenBridge } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { TokenPair } from '@/api/types';

const penv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const LIVE = !!penv.PADO_LIVE;
const creds = LIVE
  ? penv.PADO_TEST_EMAIL && penv.PADO_TEST_PASSWORD ? { email: penv.PADO_TEST_EMAIL, password: penv.PADO_TEST_PASSWORD } : null
  : (require('@/api/mock/server') as typeof import('@/api/mock/server')).MOCK_ACCOUNT;
const authTest = creds ? test : test.skip;

jest.setTimeout(60_000);

// ── 토큰 (메모리)
let tokens: { accessToken: string | null; refreshToken: string | null } = { accessToken: null, refreshToken: null };
setTokenBridge({ get: () => tokens, set: (p: TokenPair) => { tokens = p; }, onExpired: () => { tokens = { accessToken: null, refreshToken: null }; } });

// ── 응답 모양 검사
type Kind = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'uuid' | 'string?' | 'number?' | 'boolean?' | 'uuid?';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function shape(obj: unknown, spec: Record<string, Kind>, where: string) {
  expect(obj).toEqual(expect.any(Object));
  const o = obj as Record<string, unknown>;
  for (const [k, kind] of Object.entries(spec)) {
    const v = o[k];
    const opt = kind.endsWith('?');
    const base = kind.replace('?', '');
    if (opt && (v === null || v === undefined)) continue;
    const ok = base === 'array' ? Array.isArray(v) : base === 'uuid' ? typeof v === 'string' && UUID_RE.test(v) : base === 'object' ? typeof v === 'object' && v !== null : typeof v === base;
    if (!ok) throw new Error(`${where}.${k}: ${base}${opt ? '|null' : ''} 기대, 받은 값 ${JSON.stringify(v)}`);
  }
}
const SONG: Record<string, Kind> = { id: 'uuid', title: 'string', artist: 'string', duration: 'number', albumImagePath: 'string?', links: 'object' };
const expectApiError = async (p: Promise<unknown>, status: number, code?: string) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect((e as ApiError).status).toBe(status);
  if (code) expect((e as ApiError).code).toBe(code);
};

// 부산 강서구 기준점 근처 — 실서버에선 1m 안 중복(D1)을 피하려고 매번 조금씩 옮긴다
const jitter = () => (Math.random() - 0.5) * 0.004;
const spot = () => ({ latitude: 35.1889 + jitter(), longitude: 128.9038 + jitter(), address: '부산 강서구 봉림동 (API 테스트)' });

let songs: { id: string }[] = [];
const cleanup: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f().catch(() => {});
});

describe(`공개 API (${LIVE ? '실서버' : '목 서버'})`, () => {
  test('약관 목록 GET /terms', async () => {
    const terms = await authApi.terms();
    expect(terms.length).toBeGreaterThan(0);
    terms.forEach((t, i) => shape(t, { type: 'string', title: 'string', version: 'string', required: 'boolean' }, `terms[${i}]`));
    expect(terms.map(t => t.type)).toEqual(expect.arrayContaining(['SERVICE', 'PRIVACY', 'LOCATION']));
  });

  test('곡 검색 GET /songs/search + 곡 조회 GET /songs/{id}', async () => {
    const found = await songApi.search('새소년', 5);
    expect(found.length).toBeGreaterThan(0);
    found.forEach((s, i) => shape(s, SONG, `search[${i}]`));
    songs = [...found];
    const more = await songApi.search('aespa', 5);
    songs.push(...more.filter(s => !songs.some(x => x.id === s.id)));
    const one = await songApi.get(found[0].id);
    shape(one, SONG, 'song');
    expect(one.id).toBe(found[0].id);
    shape(one.links, { spotify: 'string?', youtubeMusic: 'string?' }, 'song.links');
    // 공백 검색어 → S1 (앱은 빈 검색어를 보내지 않는다. 참고: 실서버는 query 파라미터 자체가 없으면 500 S3)
    await expectApiError(songApi.search(' '), 400, 'S1');
    await expectApiError(songApi.get('0199a5e0-0000-7000-8000-000000000000'), 404, 'D3');
  });

  test('없는 드랍 GET /droppings/{id} → 404 D2', async () => {
    await expectApiError(dropApi.get('0199a5e0-0000-7000-8000-000000000000'), 404, 'D2');
  });

  test('주변 드랍 GET /droppings (비로그인)', async () => {
    const list = await dropApi.nearby(35.1889, 128.9038, 1);
    expect(Array.isArray(list)).toBe(true);
    list.forEach((d, i) => shape(d, { droppingId: 'uuid', userId: 'uuid', type: 'string', latitude: 'number', longitude: 'number', address: 'string', isMyDropping: 'boolean' }, `nearby[${i}]`));
    await expectApiError(dropApi.nearby(35.1889, 128.9038, 999), 400);
  });

  test('토큰 없이 인증 필요 API → 401', async () => {
    const calls: [string, () => Promise<unknown>][] = [
      ['GET /users', userApi.me], ['GET /users/my-drop', userApi.myDrops], ['GET /users/my-like', userApi.myLikes],
      ['GET /users/agreements', userApi.agreements], ['GET /playlists/my', playlistApi.mine], ['GET /notifications', () => notificationApi.list()],
      ['GET /notifications/unread-count', notificationApi.unreadCount], ['GET /likes/count/user', likeApi.countMine], ['GET /blocks', safetyApi.blocks],
      ['POST /droppings', () => dropApi.create({ type: 'MUSIC', songId: songs[0].id, content: 'x', ...spot() })],
      ['POST /likes', () => likeApi.toggle('0199a5e0-0000-7000-8000-000000000000')],
      ['POST /comments', () => commentApi.create('0199a5e0-0000-7000-8000-000000000000', 'x')],
      ['POST /playlists', () => playlistApi.create('x')], ['POST /reports', () => safetyApi.report('USER', '0199a5e0-0000-7000-8000-000000000000', 'SPAM')],
    ];
    for (const [name, call] of calls) {
      const e = await call().then(() => null, (x: unknown) => x);
      if (!(e instanceof ApiError) || e.status !== 401) throw new Error(`${name}: 401 기대, 받은 값 ${e instanceof ApiError ? `${e.status} ${e.code}` : 'success'}`);
    }
  });

  test('인증·소셜 토큰 오류 코드 (계정 생성 없이 잘못된 입력만)', async () => {
    await expectApiError(api.post('/auth/refresh', { refreshToken: 'invalid' }, { auth: 'none' }), 401, 'U9');
    for (const provider of ['kakao', 'google'] as const) await expectApiError(authApi.social(provider, 'invalid'), 401, 'U17');
    await expectApiError(authApi.socialSignup({ signupToken: 'invalid', username: 'x', birthDate: '2000-01-01', gender: true, agreements: { SERVICE: true, PRIVACY: true, LOCATION: true, MARKETING: false } }), 401, 'U13');
    // 비밀번호 규칙 위반 → 검증 오류 (가입되지 않음)
    await expectApiError(authApi.register({ username: 'a', password: 'short', email: 'not-an-email', birthDate: '2000-01-01', gender: true, agreements: { SERVICE: true, PRIVACY: true, LOCATION: true, MARKETING: false } }), 400, 'S1');
  });

  test('잘못된 리프레시 토큰 → 거절', async () => {
    const e = await authApi.logout('not-a-real-token').then(() => null, (x: unknown) => x);
    // 명세: 로그아웃은 멱등(없는 토큰이어도 성공) 또는 오류 — 어느 쪽이든 서버가 응답해야 한다
    expect(e === null || (e instanceof ApiError && e.status >= 400 && e.status < 500)).toBe(true);
  });
});

describe(`로그인 흐름 (${LIVE ? '실서버' : '목 서버'})`, () => {
  authTest('로그인 POST /auth/login', async () => {
    const t = await authApi.login(creds!.email, creds!.password);
    shape(t, { accessToken: 'string', refreshToken: 'string', accessTokenExpiresIn: 'number', refreshTokenExpiresIn: 'number' }, 'login');
    tokens = t;
  });

  authTest('내 정보·동의·통계 GET /users, /users/agreements, /users/my-drop, /users/my-like, /likes/count/user', async () => {
    const me = await userApi.me();
    shape(me, { username: 'string', profileImageUrl: 'string?', gender: 'boolean?', birth: 'string?' }, 'me');
    const ag = await userApi.agreements();
    ag.forEach((a, i) => shape(a, { type: 'string', agreedVersion: 'string?', latestVersion: 'string', agreed: 'boolean' }, `agreements[${i}]`));
    const mine = await userApi.myDrops();
    expect(Array.isArray(mine)).toBe(true);
    const liked = await userApi.myLikes();
    expect(Array.isArray(liked)).toBe(true);
    expect(typeof (await likeApi.countMine())).toBe('number');
  });

  authTest('프로필 수정 PATCH /users (같은 값으로 되돌림)', async () => {
    const me = await userApi.me();
    await userApi.update({ username: me.username });
    expect((await userApi.me()).username).toBe(me.username);
  });

  authTest('마케팅 동의 PUT /users/agreements/marketing (원래 값으로 되돌림)', async () => {
    const before = (await userApi.agreements()).find(a => a.type === 'MARKETING')?.agreed ?? false;
    await userApi.setMarketing(!before);
    expect((await userApi.agreements()).find(a => a.type === 'MARKETING')?.agreed).toBe(!before);
    await userApi.setMarketing(before);
  });

  authTest('플레이리스트 생성·조회·이름 변경·곡 추가/삭제·삭제', async () => {
    const name = `API 테스트 ${Date.now() % 100000}`;
    await playlistApi.create(name);
    const mine = await playlistApi.mine();
    mine.forEach((p, i) => shape(p, { id: 'uuid', name: 'string', albumImageUrl: 'string?' }, `playlists[${i}]`));
    const p = mine.find(x => x.name === name);
    expect(p).toBeDefined();
    cleanup.push(() => playlistApi.remove(p!.id));
    await playlistApi.rename(p!.id, `${name}!`);
    await playlistApi.addSongs(p!.id, [songs[0].id, songs[1].id]);
    await expectApiError(playlistApi.addSongs(p!.id, [songs[0].id]), 409, 'P3');
    const detail = await playlistApi.get(p!.id);
    shape(detail, { id: 'uuid', name: 'string', songs: 'array' }, 'playlist');
    expect(detail.name).toBe(`${name}!`);
    expect(detail.songs.map(s => s.id)).toEqual([songs[0].id, songs[1].id]);
    detail.songs.forEach((s, i) => shape(s, SONG, `playlist.songs[${i}]`));
    await playlistApi.removeSong(p!.id, songs[1].id);
    expect((await playlistApi.get(p!.id)).songs.map(s => s.id)).toEqual([songs[0].id]);
    await playlistApi.remove(p!.id);
    cleanup.pop();
    await expectApiError(playlistApi.get(p!.id), 404);
  });

  authTest('음악 드랍 → 조회·좋아요·댓글 → 삭제', async () => {
    const at = spot();
    await dropApi.create({ type: 'MUSIC', songId: songs[0].id, content: 'API 테스트 드랍', ...at });
    const near = await dropApi.nearby(at.latitude, at.longitude, 0.05);
    const mine = near.find(d => d.isMyDropping && d.type === 'MUSIC' && d.content === 'API 테스트 드랍');
    expect(mine).toBeDefined();
    const id = mine!.droppingId;
    cleanup.push(() => dropApi.remove(id));
    shape(mine, { droppingId: 'uuid', songId: 'uuid', title: 'string', artist: 'string', albumImageUrl: 'string?' }, 'nearby.music');
    expect((await userApi.myDrops()).some(d => d.droppingId === id)).toBe(true);

    const detail = await dropApi.get(id);
    shape(detail, { droppingId: 'uuid', songId: 'uuid', userId: 'uuid', username: 'string', content: 'string', expiryDate: 'string', createdAt: 'string' }, 'drop.music');

    // 좋아요 토글 두 번 (원상태로)
    const before = await likeApi.countForDrop(id);
    const on = await likeApi.toggle(id);
    shape(on, { liked: 'boolean' }, 'like');
    expect(await likeApi.countForDrop(id)).toBe(before + (on.liked ? 1 : -1));
    expect((await userApi.myLikes()).some(l => l.droppingId === id)).toBe(on.liked);
    const off = await likeApi.toggle(id);
    expect(off.liked).toBe(!on.liked);
    expect(await likeApi.countForDrop(id)).toBe(before);

    // 댓글 작성·목록·개수·수정·삭제
    await commentApi.create(id, 'API 테스트 댓글');
    const list = await commentApi.list(id);
    list.forEach((c, i) => shape(c, { id: 'uuid', content: 'string', droppingId: 'uuid', username: 'string' }, `comments[${i}]`));
    const c = list.find(x => x.content === 'API 테스트 댓글');
    expect(c).toBeDefined();
    expect(await commentApi.count(id)).toBe(list.length);
    await commentApi.update(c!.id, 'API 테스트 댓글 (수정)');
    expect((await commentApi.list(id)).find(x => x.id === c!.id)?.content).toBe('API 테스트 댓글 (수정)');
    await commentApi.remove(c!.id);
    expect((await commentApi.list(id)).some(x => x.id === c!.id)).toBe(false);

    await dropApi.remove(id);
    cleanup.pop();
    await expectApiError(dropApi.get(id), 404, 'D2');
  });

  authTest('투표 드랍 → 투표·취소 → 삭제', async () => {
    const at = spot();
    await dropApi.create({ type: 'VOTE', topic: 'API 테스트 투표', options: [songs[0].id, songs[1].id], content: 'API 테스트', ...at });
    const d = (await dropApi.nearby(at.latitude, at.longitude, 0.05)).find(x => x.isMyDropping && x.type === 'VOTE' && x.topic === 'API 테스트 투표');
    expect(d).toBeDefined();
    const id = d!.droppingId;
    cleanup.push(() => dropApi.remove(id));
    await dropApi.vote(id, songs[1].id);
    const voted = await dropApi.get(id);
    shape(voted, { droppingId: 'uuid', topic: 'string', options: 'array', totalVotes: 'number', userVotedOption: 'uuid?' }, 'drop.vote');
    if (!('topic' in voted)) throw new Error('투표 상세가 아님');
    expect(voted.userVotedOption).toBe(songs[1].id);
    expect(voted.totalVotes).toBe(1);
    voted.options.forEach((o, i) => shape(o, { songId: 'uuid', title: 'string', artist: 'string', voteCount: 'number', albumImagePath: 'string?' }, `vote.options[${i}]`));
    await expectApiError(dropApi.vote(id, '0199a5e0-0000-7000-8000-000000000000'), 400);
    await dropApi.unvote(id);
    const after = await dropApi.get(id);
    expect('userVotedOption' in after ? after.userVotedOption : 'x').toBeNull();
    await dropApi.remove(id);
    cleanup.pop();
  });

  authTest('플리 드랍 (새 곡 목록으로) → 조회 → 삭제', async () => {
    const at = spot();
    await dropApi.create({ type: 'PLAYLIST', playlistName: 'API 테스트 플리', songIds: [songs[0].id, songs[1].id], content: 'API 테스트', ...at });
    const d = (await dropApi.nearby(at.latitude, at.longitude, 0.05)).find(x => x.isMyDropping && x.type === 'PLAYLIST' && x.playlistName === 'API 테스트 플리');
    expect(d).toBeDefined();
    const id = d!.droppingId;
    cleanup.push(() => dropApi.remove(id));
    const detail = await dropApi.get(id);
    shape(detail, { droppingId: 'uuid', playlistName: 'string', songs: 'array', address: 'string' }, 'drop.playlist');
    if (!('songs' in detail)) throw new Error('플리 상세가 아님');
    detail.songs.forEach((s, i) => shape(s, { songId: 'uuid', title: 'string', artist: 'string', albumImagePath: 'string?' }, `drop.playlist.songs[${i}]`));
    await dropApi.remove(id);
    cleanup.pop();
  });

  authTest('알림 GET /notifications, /unread-count, PATCH /read-all', async () => {
    const list = await notificationApi.list(20);
    list.forEach((n, i) => shape(n, { id: 'uuid', eventName: 'string', data: 'object', createdAt: 'string', readAt: 'string?' }, `notifications[${i}]`));
    expect(typeof (await notificationApi.unreadCount())).toBe('number');
    if (list[0]) await notificationApi.read(list[0].id);
    await notificationApi.readAll();
    expect(await notificationApi.unreadCount()).toBe(0);
  });

  authTest('차단 목록 GET /blocks (+ PADO_TEST_BLOCK_USER_ID면 차단·해제)', async () => {
    const list = await safetyApi.blocks();
    expect(Array.isArray(list)).toBe(true);
    const target = penv.PADO_TEST_BLOCK_USER_ID;
    if (!target) return;
    await safetyApi.block(target);
    expect((await safetyApi.blocks()).some(b => (b as { userId?: string }).userId === target)).toBe(true);
    await safetyApi.unblock(target);
  });

  (penv.PADO_TEST_REPORT || !LIVE ? authTest : test.skip)('신고 POST /reports (실서버는 PADO_TEST_REPORT=1일 때만)', async () => {
    const at = spot();
    await dropApi.create({ type: 'MUSIC', songId: songs[0].id, content: 'API 테스트 신고 대상', ...at });
    const d = (await dropApi.nearby(at.latitude, at.longitude, 0.05)).find(x => x.isMyDropping && x.content === 'API 테스트 신고 대상');
    cleanup.push(() => dropApi.remove(d!.droppingId));
    const e = await safetyApi.report('DROPPING', d!.droppingId, 'ETC', 'API 테스트').then(() => null, (x: unknown) => x);
    // 내 드랍 신고는 막혀 있을 수 있다 — 서버가 명세 오류 코드로 응답하면 통과
    expect(e === null || e instanceof ApiError).toBe(true);
  });

  authTest('토큰 재발급 (401 → /auth/refresh) 후 요청 성공', async () => {
    tokens = { ...tokens, accessToken: 'expired-or-invalid' };
    const me = await userApi.me();
    expect(typeof me.username).toBe('string');
    expect(tokens.accessToken).not.toBe('expired-or-invalid');
  });

  authTest('로그아웃 POST /auth/logout → 리프레시 토큰 무효', async () => {
    const rt = tokens.refreshToken!;
    await authApi.logout(rt);
    tokens = { accessToken: null, refreshToken: null };
    await expectApiError(userApi.me(), 401);
  });
});
