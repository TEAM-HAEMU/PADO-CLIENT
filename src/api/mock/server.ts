/**
 * 내장 목 서버 (USE_MOCK=true).
 * 명세의 경로·상태 코드·응답 모양·오류 코드를 그대로 흉내 내서, 실서버 계정 없이
 * 전 화면을 시뮬레이터에서 확인할 수 있게 한다. 상태는 앱 실행 동안 메모리에만 있다.
 */
import type {
  AppNotification, BlockedUser, Comment, DropSummary, MusicDropSummary, PlaylistDropSummary, Song, UUID, VoteDropSummary,
} from '../types';
import { env } from '@/config';
import { HOME, seedSongs, songByTitle, uid } from './data';
import type { RawResponse } from '../client';

type Json = Record<string, unknown>;
interface User { id: UUID; username: string; email: string; password: string; profileImageUrl: string | null; gender: boolean; birth: string }

const ME: User = { id: '0199a5e0-1111-7abc-8def-000000000001', username: '정현', email: 'hello@pado.fm', password: 'pado1234', profileImageUrl: null, gender: true, birth: '2000-01-01' };
const others = ['하윤', '도윤', '서아', '민재', '지우'].map((n, i) => ({ id: `0199a5e0-1111-7abc-8def-00000000001${i}`, username: n }));
const users: User[] = [ME];

// 미터 오프셋 → 좌표
const at = (north: number, east: number) => ({
  latitude: HOME.latitude + north / 111_320,
  longitude: HOME.longitude + east / (111_320 * Math.cos((HOME.latitude * Math.PI) / 180)),
});
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 19);
const agoHours = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString().slice(0, 19);

interface DropRow { summary: DropSummary; username: string; createdAt: string; expiryDate: string; votes: Record<UUID, UUID> }
const drops: DropRow[] = [];
const addMusic = (who: { id: UUID; username: string }, title: string, content: string, n: number, e: number, address: string, h = 3) => {
  const s = songByTitle(title);
  const summary: MusicDropSummary = { type: 'MUSIC', droppingId: uid('0199a5e0'), userId: who.id, songId: s.id, title: s.title, artist: s.artist, content, ...at(n, e), address, albumImageUrl: s.albumImagePath, isMyDropping: who.id === ME.id };
  drops.push({ summary, username: who.username, createdAt: agoHours(h), expiryDate: inDays(3), votes: {} });
  return summary;
};
const [hayun, doyun, seoa, minjae, jiwoo] = others;
addMusic(hayun, '난춘', '퇴근길 버스 기다리면서 듣기 좋은 노래. 강바람이랑 진짜 잘 어울려요.', 150, -120, '부산 강서구 가락대로 1397번길', 2);
addMusic(doyun, '사건의 지평선', '여기서 노을 보면서 들으면 끝나요', 280, 160, '부산 강서구 봉림동', 5);
addMusic(seoa, 'Everything', '강변 산책로 따라 걷다가', -330, 250, '부산 강서구 서낙동로', 8);
addMusic(minjae, 'Bubble Gum', '아침 산책 BGM', 520, -60, '부산 강서구 상덕로', 20);
addMusic(ME, '파도', '강 보면서 들으면 제목 그대로', -120, -260, '부산 강서구 서낙동강 둑길', 30);
addMusic(ME, '자유', '', 640, 300, '부산 강서구 봉림동', 50);
{
  const opts = ['난춘', 'Everything', 'Let It Happen', '밤편지'].map(t => songByTitle(t).id);
  const summary: VoteDropSummary = { type: 'VOTE', droppingId: uid(), userId: hayun.id, topic: '퇴근길 강변에 가장 어울리는 곡은?', options: opts, content: '다들 뭐 들어요?', ...at(-60, 90), address: '부산 강서구 가락대로 정류장 앞', firstAlbumImageUrl: songByTitle('난춘').albumImagePath, isMyDropping: false };
  const votes: Record<UUID, UUID> = {};
  const counts = [11, 7, 5, 3];
  counts.forEach((c, i) => { for (let k = 0; k < c; k++) votes[`voter-${i}-${k}`] = opts[i]; });
  drops.push({ summary, username: hayun.username, createdAt: agoHours(4), expiryDate: inDays(2), votes });
}
{
  const ids = ['난춘', 'Everything', '사건의 지평선', '밤편지', 'TOMBOY', 'Pink + White', 'Let It Happen', '파도'].map(t => songByTitle(t).id);
  const summary: PlaylistDropSummary = { type: 'PLAYLIST', droppingId: uid(), userId: jiwoo.id, playlistName: '봉림동 퇴근길', songIds: ids, content: '퇴근길에 한 바퀴 돌면서 들어요', ...at(-240, -200), address: '부산 강서구 봉죽길', firstAlbumImageUrl: songByTitle('난춘').albumImagePath, isMyDropping: false };
  drops.push({ summary, username: jiwoo.username, createdAt: agoHours(6), expiryDate: inDays(1), votes: {} });
}

const likes = new Map<UUID, Set<UUID>>(); // droppingId → userIds
drops.forEach((d, i) => likes.set(d.summary.droppingId, new Set(Array.from({ length: [18, 9, 24, 4, 12, 3, 6, 15][i] ?? 2 }, (_, k) => `liker-${k}`))));
const comments: (Comment & { userId: UUID })[] = [];
const addComment = (drop: DropRow, who: { id: UUID; username: string }, content: string) =>
  comments.push({ id: uid(), content, droppingId: drop.summary.droppingId, username: who.username, userId: who.id });
addComment(drops[0], doyun, '여기서 들으니까 더 좋네요. 강바람이랑 진짜 잘 맞아요');
addComment(drops[0], seoa, '퇴근길마다 이 핀 보러 와요');
addComment(drops[0], ME, '남겨줘서 고마워요 🌊');
addComment(drops[0], minjae, '난춘은 봄에 들어도 가을에 들어도 좋음');
addComment(drops[6], doyun, 'Everything도 좋은데 여기선 난춘이지');
addComment(drops[6], seoa, 'Let It Happen 들으면서 강 따라 걸으면 끝나요');

const notifications: AppNotification[] = [
  { id: uid(), eventName: 'like-created', data: { likerUserId: hayun.id, likerUsername: hayun.username, droppingOwnerUserId: ME.id, droppingId: drops[4].summary.droppingId }, createdAt: new Date(Date.now() - 600_000).toISOString(), readAt: null },
  { id: uid(), eventName: 'comment-created', data: { commenterUserId: doyun.id, commenterUsername: doyun.username, droppingId: drops[4].summary.droppingId, content: '여기서 들으니까 더 좋네요' }, createdAt: new Date(Date.now() - 2_520_000).toISOString(), readAt: null },
  { id: uid(), eventName: 'dropping-created', data: { droppingId: drops[3].summary.droppingId, username: minjae.username }, createdAt: new Date(Date.now() - 3_600_000).toISOString(), readAt: null },
  { id: uid(), eventName: 'like-created', data: { likerUserId: jiwoo.id, likerUsername: jiwoo.username, droppingOwnerUserId: ME.id, droppingId: drops[5].summary.droppingId }, createdAt: new Date(Date.now() - 86_400_000 * 3).toISOString(), readAt: new Date().toISOString() },
];

interface PlaylistRow { id: UUID; name: string; ownerId: UUID; songIds: UUID[] }
const playlists: PlaylistRow[] = [
  { id: uid(), name: '봉림동 퇴근길', ownerId: ME.id, songIds: ['난춘', 'Everything', '사건의 지평선', '밤편지', 'TOMBOY', 'Pink + White', 'Let It Happen', '파도'].map(t => songByTitle(t).id) },
  { id: uid(), name: '새벽 드라이브', ownerId: ME.id, songIds: ['Let It Happen', 'Pink + White', 'Robbers', 'TOMBOY'].map(t => songByTitle(t).id) },
  { id: uid(), name: '비 오는 날', ownerId: ME.id, songIds: ['Square', '긴 꿈', '주저하는 연인들을 위해', '파도'].map(t => songByTitle(t).id) },
];
const blocks: BlockedUser[] = [];
const reports = new Set<string>();
let marketing = false;
const sessions = new Map<string, UUID>(); // accessToken → userId
const refreshTokens = new Map<string, UUID>();

// ── helpers
const ok = (body?: unknown, status = 200): RawResponse => ({ status, text: body === undefined ? '' : JSON.stringify(body) });
const err = (status: number, code: string, message: string): RawResponse => ({ status, text: JSON.stringify({ code, message }) });
const issue = (userId: UUID) => {
  const accessToken = `mock.access.${uid()}`; const refreshToken = `mock.refresh.${uid()}`;
  sessions.set(accessToken, userId); refreshTokens.set(refreshToken, userId);
  return { accessToken, refreshToken, accessTokenExpiresIn: 604800, refreshTokenExpiresIn: 7776000 };
};
const haversine = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371, dLat = ((b.latitude - a.latitude) * Math.PI) / 180, dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
// 곡 검색/조회는 로그인이 필요 없는 공개 API라, 목 모드에서도 실서버 결과를 그대로 쓴다 (테스트에선 끔)
declare const process: { env?: Record<string, string | undefined> } | undefined;
const USE_REMOTE_SONGS = !(typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID);
const remoteSongs = new Map<UUID, Song>();
const song = (id: UUID) => seedSongs.find(s => s.id === id) ?? remoteSongs.get(id);
async function remote(path: string): Promise<RawResponse | null> {
  if (!USE_REMOTE_SONGS) return null;
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`, { headers: { Accept: 'application/json' } });
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}
const blockedIds = () => new Set(blocks.map(b => b.userId));
const withMine = (s: DropSummary, me: UUID | null): DropSummary => ({ ...s, isMyDropping: s.userId === me });

const latency = () => new Promise<void>(r => setTimeout(r, 180 + Math.random() * 220));

export async function mockFetch(method: string, url: string, headers: Record<string, string>, body?: string | FormData): Promise<RawResponse> {
  await latency();
  // RN의 URL 폴리필은 searchParams를 지원하지 않아 직접 파싱
  const [pathPart, queryPart = ''] = url.split('?');
  const path = pathPart.replace(/^.*\/api\/v1/, '');
  const q: Record<string, string> = {};
  for (const kv of queryPart.split('&').filter(Boolean)) {
    const [k, v = ''] = kv.split('=');
    q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const b: Json = typeof body === 'string' ? JSON.parse(body) : {};
  const token = headers.Authorization?.replace('Bearer ', '') ?? null;
  // 앱을 다시 켜면 메모리 세션이 사라지므로, 키체인에 남은 목 토큰은 기본 계정으로 본다
  const me = token ? sessions.get(token) ?? (token.startsWith('mock.access.') && !token.includes('expired') ? ME.id : null) : null;
  const need = () => (me ? null : err(401, token ? 'U3' : 'U10', token ? '유효하지 않은 액세스 토큰' : '인증이 필요합니다'));
  const m = (re: RegExp) => path.match(re);
  let mm: RegExpMatchArray | null;

  // 인증
  if (method === 'POST' && path === '/auth/login') {
    const user = users.find(x => x.email === b.email);
    if (!user) return err(404, 'U1', '사용자 없음');
    if (user.password !== b.password) return err(401, 'U5', '비밀번호 불일치');
    return ok(issue(user.id));
  }
  if (method === 'POST' && path === '/auth/register') {
    if (users.some(x => x.email === b.email)) return err(409, 'U4', '이미 존재하는 로컬 사용자');
    const ag = b.agreements as Record<string, boolean> | undefined;
    if (!ag) return err(400, 'S1', '약관 동의 정보는 필수입니다.');
    // 실서버와 같은 검증: 비밀번호 8~20자, 이메일 형식
    if (String(b.password ?? '').length < 8 || String(b.password).length > 20) return err(400, 'S1', '비밀번호는 최소 8자 이상, 최대 20자 이하여야 합니다.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email ?? ''))) return err(400, 'S1', '이메일 형식이 올바르지 않습니다.');
    if (!ag.SERVICE || !ag.PRIVACY || !ag.LOCATION) return err(400, 'U20', '필수 약관 미동의');
    users.push({ id: uid(), username: String(b.username), email: String(b.email), password: String(b.password), profileImageUrl: null, gender: !!b.gender, birth: String(b.birthDate) });
    return ok(undefined, 201);
  }
  if (method === 'POST' && path === '/auth/refresh') {
    const uidOf = refreshTokens.get(String(b.refreshToken));
    if (!uidOf) return err(401, 'U9', '유효하지 않거나 만료된 리프레시 토큰');
    refreshTokens.delete(String(b.refreshToken));
    return ok(issue(uidOf));
  }
  if (method === 'POST' && path === '/auth/logout') { refreshTokens.delete(String(b.refreshToken)); return ok(undefined, 204); }
  if (method === 'POST' && (mm = m(/^\/oauth2\/(kakao|naver|google)$/))) {
    if (!b.accessToken) return err(400, 'S1', 'accessToken 누락');
    // 실서버: 제공자가 거절한 토큰 → U17 (목에선 'invalid'가 들어간 토큰을 거절로 흉내)
    if (String(b.accessToken).includes('invalid')) return err(401, 'U17', '유효하지 않거나 만료된 소셜 로그인 토큰입니다.');
    return ok({ signupRequired: true, accessToken: null, refreshToken: null, accessTokenExpiresIn: null, refreshTokenExpiresIn: null, signupToken: `mock.signup.${mm[1]}`, profile: { username: '파도타기', email: mm[1] === 'kakao' ? null : `wave@${mm[1]}.com`, profileImageUrl: null, birthDate: mm[1] === 'google' ? null : '2000-01-01', gender: mm[1] === 'google' ? null : true } });
  }
  if (method === 'POST' && path === '/oauth2/signup') {
    if (!String(b.signupToken ?? '').startsWith('mock.signup.')) return err(401, 'U13', '유효하지 않거나 만료된 가입 토큰입니다.');
    const user: User = { id: uid(), username: String(b.username), email: String(b.email ?? 'social@pado.fm'), password: '', profileImageUrl: null, gender: !!b.gender, birth: String(b.birthDate) };
    users.push(user);
    return ok(issue(user.id), 201);
  }
  if (method === 'GET' && path === '/terms') {
    return ok([
      { type: 'SERVICE', title: '서비스 이용약관', version: '2026-09-26', required: true },
      { type: 'PRIVACY', title: '개인정보 수집·이용 동의', version: '2026-09-26', required: true },
      { type: 'LOCATION', title: '위치기반서비스 이용약관', version: '2026-09-26', required: true },
      { type: 'MARKETING', title: '마케팅 정보 수신 동의', version: '2026-09-26', required: false },
    ]);
  }

  // 회원
  if (path === '/users' && method === 'GET') { const e = need(); if (e) return e; const u2 = users.find(x => x.id === me)!; return ok({ username: u2.username, profileImageUrl: u2.profileImageUrl, gender: u2.gender, birth: u2.birth }); }
  if (path === '/users' && method === 'PATCH') { const e = need(); if (e) return e; const u2 = users.find(x => x.id === me)!; if (b.username) u2.username = String(b.username); if (b.gender !== undefined) u2.gender = !!b.gender; if (b.birthDate) u2.birth = String(b.birthDate); return ok(undefined); }
  if (path === '/users/profile-image' && method === 'PUT') { const e = need(); if (e) return e; return err(500, 'F1', '파일 업로드 실패'); }
  if (path === '/users/withdrawal' && method === 'POST') { const e = need(); if (e) return e; sessions.delete(token!); return ok(undefined); }
  if (path === '/users/my-drop') { const e = need(); if (e) return e; return ok({ droppings: drops.filter(d => d.summary.userId === me).map(d => withMine(d.summary, me)) }); }
  if (path === '/users/my-like') {
    const e = need(); if (e) return e;
    const liked = drops.filter(d => likes.get(d.summary.droppingId)?.has(me!));
    return ok({ droppings: liked.map(({ summary: s }) => s.type === 'MUSIC'
      ? { droppingId: s.droppingId, droppingType: 'MUSIC', title: s.title, artist: s.artist, imageUrl: s.albumImageUrl, address: s.address }
      : s.type === 'VOTE' ? { droppingId: s.droppingId, droppingType: 'VOTE', topic: s.topic, imageUrl: s.firstAlbumImageUrl, address: s.address }
      : { droppingId: s.droppingId, droppingType: 'PLAYLIST', playlistName: s.playlistName, imageUrl: s.firstAlbumImageUrl, address: s.address }) });
  }
  if (path === '/users/agreements') { const e = need(); if (e) return e; return ok([{ type: 'MARKETING', agreedVersion: '2026-09-26', latestVersion: '2026-09-26', agreed: marketing, decidedAt: new Date().toISOString() }]); }
  if (path === '/users/agreements/marketing') { const e = need(); if (e) return e; marketing = !!b.agreed; return ok(undefined, 204); }

  // 음악
  if (path === '/songs/search') {
    const query = (q.query ?? '').trim().toLowerCase();
    if (!query) return err(400, 'S1', 'query는 필수');
    const r = await remote(`/songs/search?query=${encodeURIComponent(q.query ?? '')}&limit=${Number(q.limit ?? 10)}`);
    if (r && r.status === 200) {
      try { (JSON.parse(r.text).songs as Song[]).forEach(x => remoteSongs.set(x.id, x)); } catch {}
      return r;
    }
    const list = seedSongs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(query));
    return ok({ songs: list.slice(0, Number(q.limit ?? 10)) });
  }
  if ((mm = m(/^\/songs\/([^/]+)$/))) {
    const s = song(mm[1]);
    if (s) return ok(s);
    const r = await remote(`/songs/${mm[1]}`);
    if (r && r.status === 200) { try { const x = JSON.parse(r.text) as Song; remoteSongs.set(x.id, x); } catch {} return r; }
    return err(404, 'D3', '노래 없음');
  }

  // 드랍
  if (path === '/droppings' && method === 'GET') {
    const center = { latitude: Number(q.latitude), longitude: Number(q.longitude) };
    const dist = Number(q.distance);
    if (!isFinite(center.latitude) || !isFinite(dist) || dist < 0.001 || dist > 50) return err(400, 'S1', '좌표·거리 형식 또는 범위 오류');
    const hidden = me ? blockedIds() : new Set<string>();
    return ok({ droppings: drops.filter(d => !hidden.has(d.summary.userId) && haversine(center, d.summary) <= dist).map(d => withMine(d.summary, me)) });
  }
  if (path === '/droppings' && method === 'POST') {
    const e = need(); if (e) return e;
    const pos = { latitude: Number(b.latitude), longitude: Number(b.longitude) };
    if (drops.some(d => haversine(pos, d.summary) < 0.001)) return err(409, 'D1', '반경 1미터 내 기존 드랍 존재');
    const base = { droppingId: uid(), userId: me!, content: String(b.content ?? ''), ...pos, address: String(b.address ?? ''), isMyDropping: true };
    const meUser = users.find(x => x.id === me)!;
    let summary: DropSummary;
    if (b.type === 'MUSIC') { const s = song(String(b.songId)); if (!s) return err(404, 'D3', '노래 없음'); summary = { ...base, type: 'MUSIC', songId: s.id, title: s.title, artist: s.artist, albumImageUrl: s.albumImagePath }; }
    else if (b.type === 'VOTE') { const o = (b.options as string[]) ?? []; if (o.length < 2 || o.length > 5 || new Set(o).size !== o.length || o.some(id => !song(id))) return err(400, 'S1', 'VOTE options는 2~5개, 중복·없는 곡 불가'); summary = { ...base, type: 'VOTE', topic: String(b.topic), options: o, firstAlbumImageUrl: song(o[0])?.albumImagePath ?? null }; }
    else {
      let name = String(b.playlistName ?? ''); let ids = (b.songIds as string[]) ?? [];
      if (b.playlistId) { const p = playlists.find(x => x.id === b.playlistId); if (!p) return err(404, 'P1', '플레이리스트 없음'); if (p.ownerId !== me) return err(403, 'D10', '다른 사용자의 플레이리스트'); name = p.name; ids = [...p.songIds]; }
      summary = { ...base, type: 'PLAYLIST', playlistName: name, songIds: ids, firstAlbumImageUrl: song(ids[0])?.albumImagePath ?? null };
    }
    drops.push({ summary, username: meUser.username, createdAt: new Date().toISOString().slice(0, 19), expiryDate: inDays(3), votes: {} });
    likes.set(summary.droppingId, new Set());
    return ok(undefined, 201);
  }
  if ((mm = m(/^\/droppings\/([^/]+)\/vote$/))) {
    const e = need(); if (e) return e;
    const d = drops.find(x => x.summary.droppingId === mm![1]); if (!d) return err(404, 'D2', '드랍 없음');
    if (d.summary.type !== 'VOTE') return err(400, 'D7', '투표 드랍이 아님');
    if (method === 'POST') { if (!d.summary.options.includes(String(b.songId))) return err(400, 'D6', '유효하지 않은 투표 옵션'); d.votes[me!] = String(b.songId); return ok(undefined); }
    delete d.votes[me!]; return ok(undefined, 204);
  }
  if ((mm = m(/^\/droppings\/([^/]+)$/))) {
    const d = drops.find(x => x.summary.droppingId === mm![1]);
    if (!d || (me && blockedIds().has(d.summary.userId))) return err(404, 'D2', '드랍 없음');
    if (method === 'DELETE') { const e = need(); if (e) return e; if (d.summary.userId !== me) return err(403, 'D5', '본인이 만든 드랍이 아님'); drops.splice(drops.indexOf(d), 1); return ok(undefined, 204); }
    const s = d.summary;
    if (s.type === 'MUSIC') return ok({ droppingId: s.droppingId, songId: s.songId, userId: s.userId, username: d.username, content: s.content, expiryDate: d.expiryDate, createdAt: d.createdAt, albumImageUrl: s.albumImageUrl });
    const common = { droppingId: s.droppingId, userId: s.userId, content: s.content, latitude: s.latitude, longitude: s.longitude, address: s.address, expiryDate: d.expiryDate, createdAt: d.createdAt };
    if (s.type === 'VOTE') {
      const counts: Record<string, number> = {}; Object.values(d.votes).forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
      return ok({ ...common, topic: s.topic, options: s.options.map(id => { const so = song(id)!; return { songId: id, albumImagePath: so.albumImagePath, title: so.title, artist: so.artist, voteCount: counts[id] ?? 0 }; }), totalVotes: Object.keys(d.votes).length, userVotedOption: me ? d.votes[me] ?? null : null });
    }
    return ok({ ...common, playlistName: s.playlistName, songs: s.songIds.map(id => { const so = song(id)!; return { songId: id, title: so.title, artist: so.artist, albumImagePath: so.albumImagePath }; }) });
  }

  // 좋아요
  if (path === '/likes' && method === 'POST') { const e = need(); if (e) return e; const set = likes.get(String(b.droppingId)); if (!set) return err(404, 'D2', '드랍 없음'); const liked = !set.has(me!); if (liked) set.add(me!); else set.delete(me!); return ok({ liked }); }
  if ((mm = m(/^\/likes\/count\/dropping\/([^/]+)$/))) { const e = need(); if (e) return e; const set = likes.get(mm[1]); return set ? ok({ likeCount: set.size }) : err(404, 'D2', '드랍 없음'); }
  if (path === '/likes/count/user') { const e = need(); if (e) return e; let n = 0; likes.forEach(s => { if (s.has(me!)) n++; }); return ok({ likeCount: n }); }

  // 댓글
  if ((mm = m(/^\/comments\/droppings\/([^/]+)$/))) { const e = need(); if (e) return e; const hidden = blockedIds(); return ok(comments.filter(c => c.droppingId === mm![1] && !hidden.has(c.userId)).map(({ userId: _u, ...c }) => c)); }
  if ((mm = m(/^\/comments\/count\/([^/]+)$/))) { const e = need(); if (e) return e; const hidden = blockedIds(); return ok(comments.filter(c => c.droppingId === mm![1] && !hidden.has(c.userId)).length); }
  if (path === '/comments' && method === 'POST') {
    const e = need(); if (e) return e;
    const content = String(b.content ?? '').trim(); if (!content || content.length > 100) return err(400, 'S1', '댓글은 1~100자');
    if (!drops.some(d => d.summary.droppingId === b.droppingId)) return err(404, 'D2', '드랍 없음');
    comments.push({ id: uid(), content, droppingId: String(b.droppingId), username: users.find(x => x.id === me)!.username, userId: me! });
    return ok(undefined, 201);
  }
  if ((mm = m(/^\/comments\/([^/]+)$/))) {
    const e = need(); if (e) return e;
    const c = comments.find(x => x.id === mm![1]); if (!c) return err(404, 'C1', '댓글 없음'); if (c.userId !== me) return err(403, 'C2', '본인 댓글이 아님');
    if (method === 'DELETE') { comments.splice(comments.indexOf(c), 1); return ok(undefined); }
    c.content = String(b.content ?? c.content); return ok(undefined);
  }

  // 알림
  if (path === '/notifications') { const e = need(); if (e) return e; return ok({ notifications: notifications.slice(0, Number(q.limit ?? 20)) }); }
  if (path === '/notifications/unread-count') { const e = need(); if (e) return e; return ok({ count: notifications.filter(n => !n.readAt).length }); }
  if (path === '/notifications/read-all') { const e = need(); if (e) return e; notifications.forEach(n => { n.readAt ??= new Date().toISOString(); }); return ok(undefined, 204); }
  if ((mm = m(/^\/notifications\/([^/]+)\/read$/))) { const e = need(); if (e) return e; const n = notifications.find(x => x.id === mm![1]); if (!n) return err(404, 'N1', '해당 사용자의 알림이 없음'); n.readAt ??= new Date().toISOString(); return ok(undefined, 204); }

  // 플레이리스트
  if (path === '/playlists/my') { const e = need(); if (e) return e; return ok({ playlists: playlists.filter(p => p.ownerId === me).map(p => ({ id: p.id, name: p.name, albumImageUrl: song(p.songIds[0])?.albumImagePath ?? null })) }); }
  if (path === '/playlists' && method === 'POST') { const e = need(); if (e) return e; if (!String(b.name ?? '').trim()) return err(400, 'S1', 'name은 공백일 수 없음'); playlists.unshift({ id: uid(), name: String(b.name), ownerId: me!, songIds: [] }); return ok(undefined, 201); }
  if ((mm = m(/^\/playlists\/([^/]+)\/songs\/([^/]+)$/))) { const e = need(); if (e) return e; const p = playlists.find(x => x.id === mm![1]); if (!p) return err(404, 'P1', '플레이리스트 없음'); if (p.ownerId !== me) return err(403, 'P2', '본인 플레이리스트가 아님'); if (!p.songIds.includes(mm[2])) return err(404, 'P4', '플레이리스트에 노래가 없음'); p.songIds = p.songIds.filter(x => x !== mm![2]); return ok(undefined, 204); }
  if ((mm = m(/^\/playlists\/([^/]+)\/songs$/))) { const e = need(); if (e) return e; const p = playlists.find(x => x.id === mm![1]); if (!p) return err(404, 'P1', '플레이리스트 없음'); const ids = (b.songIds as string[]) ?? []; if (!ids.length) return err(400, 'S1', 'songIds는 비어 있을 수 없음'); if (ids.some(i => p.songIds.includes(i))) return err(409, 'P3', '이미 포함된 노래'); p.songIds.push(...ids); return ok(undefined, 201); }
  if ((mm = m(/^\/playlists\/([^/]+)$/))) {
    const e = need(); if (e) return e;
    const p = playlists.find(x => x.id === mm![1]); if (!p) return err(404, 'P1', '플레이리스트 없음');
    if (method === 'GET') return ok({ id: p.id, name: p.name, songs: p.songIds.map(song).filter(Boolean) });
    if (p.ownerId !== me) return err(403, 'P2', '본인 플레이리스트가 아님');
    if (method === 'PUT') { if (!String(b.name ?? '').trim()) return err(400, 'S1', 'name은 공백일 수 없음'); p.name = String(b.name); return ok(undefined); }
    playlists.splice(playlists.indexOf(p), 1); return ok(undefined, 204);
  }

  // 신고·차단
  if (path === '/reports') {
    const e0 = need(); if (e0) return e0;
    const own = b.targetType === 'DROPPING' ? drops.find(d => d.summary.droppingId === b.targetId)?.summary.userId === me
      : b.targetType === 'COMMENT' ? comments.find(c => c.id === b.targetId)?.userId === me
      : b.targetType === 'USER' ? b.targetId === me : false;
    if (own) return err(400, 'R2', '자기 자신 신고');
  }
  if (path === '/reports') { const e = need(); if (e) return e; const key = `${b.targetType}:${b.targetId}`; if (reports.has(key)) return err(409, 'R3', '이미 신고한 대상'); reports.add(key); return ok(undefined, 201); }
  if (path === '/blocks' && method === 'POST') { const e = need(); if (e) return e; if (b.userId === me) return err(400, 'B1', '자기 자신 차단'); const o = others.find(x => x.id === b.userId); if (!o) return err(404, 'U1', '없는 사용자'); if (!blocks.some(x => x.userId === o.id)) blocks.unshift({ userId: o.id, username: o.username, profileImageUrl: null, blockedAt: new Date().toISOString() }); return ok(undefined, 204); }
  if (path === '/blocks' && method === 'GET') { const e = need(); if (e) return e; return ok(blocks); }
  if ((mm = m(/^\/blocks\/([^/]+)$/))) { const e = need(); if (e) return e; const i = blocks.findIndex(x => x.userId === mm![1]); if (i >= 0) blocks.splice(i, 1); return ok(undefined, 204); }

  if (path === '/health') return ok(undefined);
  return err(404, 'MOCK404', `목 서버에 없는 경로: ${method} ${path}`);
}

/** 개발 편의: 목 모드 기본 계정 */
export const MOCK_ACCOUNT = { email: ME.email, password: ME.password };
