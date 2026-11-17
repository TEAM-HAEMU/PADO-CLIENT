/* 플레이리스트 순수 로직 — 새 플리 만들기(A6), 카드 커버(A10), 좋아요한 곡 찾기(A11) */
import type { PlaylistSummary } from '@/api/types';
import { createPlaylistAndFind, playlistCover, resolveLikedSongIds } from '@/utils/playlists';

const pl = (id: string, name = id): PlaylistSummary => ({ id, name, albumImageUrl: `art-${id}` });

describe('createPlaylistAndFind', () => {
  test('생성 전 목록에 없던 플리를 새 플리로 (같은 이름이 이미 있어도)', async () => {
    const lists = [[pl('a', '산책')], [pl('b', '산책'), pl('a', '산책')]];
    const api = { mine: jest.fn(async () => lists.shift()!), create: jest.fn(async () => undefined) };
    const r = await createPlaylistAndFind('산책', api);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(r.created?.id).toBe('b');
    expect(r.list?.map(p => p.id)).toEqual(['b', 'a']);
  });

  test('생성이 실패하면 throw — 아무것도 안 생겼으니 다시 시도해도 된다', async () => {
    const api = { mine: jest.fn(async () => []), create: jest.fn(async () => { throw new Error('S1'); }) };
    await expect(createPlaylistAndFind('x', api)).rejects.toThrow('S1');
  });

  test('생성 뒤 목록 조회가 한 번 실패하면 한 번 더 받아 새 플리를 찾는다', async () => {
    const calls: (() => Promise<PlaylistSummary[]>)[] = [
      async () => [],
      async () => { throw new Error('net'); },
      async () => [pl('n', '새 플리')],
    ];
    const api = { mine: jest.fn(() => calls.shift()!()), create: jest.fn(async () => undefined) };
    const r = await createPlaylistAndFind('새 플리', api);
    expect(r.created?.id).toBe('n');
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  test('생성 뒤 목록 조회가 계속 실패해도 throw하지 않는다 — 오류로 남겨 다시 누르면 중복 생성', async () => {
    let n = 0;
    const api = { mine: jest.fn(async () => { if (n++ === 0) return []; throw new Error('net'); }), create: jest.fn(async () => undefined) };
    await expect(createPlaylistAndFind('x', api)).resolves.toEqual({ list: null, created: null });
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  test('생성 전 목록을 못 받았으면 이름으로 찾는다', async () => {
    let n = 0;
    const api = { mine: jest.fn(async () => { if (n++ === 0) throw new Error('net'); return [pl('a', '다른'), pl('b', '내 플리')]; }), create: jest.fn(async () => undefined) };
    expect((await createPlaylistAndFind('내 플리', api)).created?.id).toBe('b');
  });
});

describe('playlistCover', () => {
  const summary = { albumImageUrl: 'first' };
  test('상세가 있으면 곡 아트들 (콜라주)', () => {
    expect(playlistCover(summary, { songs: [{ albumImagePath: 'a' }, { albumImagePath: null }] as never }, false)).toEqual(['a', null]);
  });
  test('받는 중이면 null — 첫 곡 아트를 그렸다가 4칸으로 바뀌며 튀지 않게', () => {
    expect(playlistCover(summary, undefined, false)).toBeNull();
  });
  test('상세를 못 받았으면 목록의 첫 곡 아트', () => {
    expect(playlistCover(summary, undefined, true)).toEqual(['first']);
  });
});

describe('resolveLikedSongIds', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);

  test('응답·캐시로 아는 곡은 요청하지 않는다', async () => {
    const fetchSongId = jest.fn(async (id: string) => `s-${id}`);
    const r = await resolveLikedSongIds(['d0', 'd1', 'd2'], id => (id === 'd1' ? 'known' : null), fetchSongId, { limit: 10, concurrency: 2 });
    expect(fetchSongId.mock.calls.map(c => c[0])).toEqual(['d0', 'd2']);
    expect([...r.songIds.entries()]).toEqual(expect.arrayContaining([['d0', 's-d0'], ['d1', 'known'], ['d2', 's-d2']]));
    expect(r).toMatchObject({ failed: 0, remaining: 0 });
  });

  test('모르는 드랍은 앞에서부터 limit개까지만 — 나머지는 remaining', async () => {
    const fetchSongId = jest.fn(async (id: string) => `s-${id}`);
    const r = await resolveLikedSongIds(ids(100), () => null, fetchSongId, { limit: 30, concurrency: 4 });
    expect(fetchSongId).toHaveBeenCalledTimes(30);
    expect(fetchSongId.mock.calls[0][0]).toBe('d0');
    expect(r.songIds.size).toBe(30);
    expect(r.remaining).toBe(70);
  });

  test('동시에 concurrency개를 넘지 않는다', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchSongId = async (id: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>(res => setTimeout(res, 1));
      inFlight--;
      return `s-${id}`;
    };
    const r = await resolveLikedSongIds(ids(20), () => null, fetchSongId, { limit: 20, concurrency: 4 });
    expect(peak).toBe(4);
    expect(r.songIds.size).toBe(20);
  });

  test('개별 실패는 세어서 돌려준다 (말없이 빠지지 않게) — 나머지는 계속 받는다', async () => {
    const fetchSongId = async (id: string) => { if (id === 'd1' || id === 'd3') throw new Error('x'); return `s-${id}`; };
    const r = await resolveLikedSongIds(ids(5), () => null, fetchSongId, { limit: 10, concurrency: 2 });
    expect(r.failed).toBe(2);
    expect([...r.songIds.keys()].sort()).toEqual(['d0', 'd2', 'd4']);
  });

  // 화면처럼 묶음마다 gone·deferred를 이어 간다
  const rounds = async (all: string[], fetchSongId: (id: string) => Promise<string | null>, isGone: (e: unknown) => boolean, n: number) => {
    const gone = new Set<string>();
    const deferred = new Set<string>();
    const found = new Map<string, string>();
    const results = [];
    for (let i = 0; i < n; i++) {
      const r = await resolveLikedSongIds(all, id => found.get(id), fetchSongId, { limit: 30, concurrency: 4, gone, deferred, isGone });
      r.goneIds.forEach(id => { gone.add(id); deferred.delete(id); });
      r.songIds.forEach((s, id) => { found.set(id, s); deferred.delete(id); });
      r.failedIds.forEach(id => deferred.add(id));
      results.push(r);
    }
    return { found, gone, deferred, results };
  };
  const status = (s: number) => Object.assign(new Error(`HTTP ${s}`), { status: s });
  const is4xx = (e: unknown) => (e as { status?: number }).status! >= 400 && (e as { status?: number }).status! < 500;

  test('앞쪽 35개가 4xx(지워진 드랍)여도 다음 묶음에서 빼서 뒤의 정상 드랍까지 간다', async () => {
    const all = ids(50); // d0~d34 404, d35~d49 정상
    const fetchSongId = jest.fn(async (id: string) => { if (Number(id.slice(1)) < 35) throw status(404); return `s-${id}`; });
    const { found, gone, results } = await rounds(all, fetchSongId, is4xx, 3);
    expect(gone.size).toBe(35);
    expect(found.size).toBe(15);
    expect(results[0].failed).toBe(0); // 없는 드랍은 '실패'로 세지 않는다
    expect(results[2].remaining).toBe(0);
    expect(fetchSongId).toHaveBeenCalledTimes(50); // 같은 드랍을 두 번 요청하지 않음
  });

  test('앞쪽 35개가 네트워크·5xx로 계속 실패해도 줄 뒤로 보내 뒤의 정상 드랍까지 간다', async () => {
    const all = ids(50);
    const fetchSongId = jest.fn(async (id: string) => { if (Number(id.slice(1)) < 35) throw status(503); return `s-${id}`; });
    const { found, deferred, results } = await rounds(all, fetchSongId, is4xx, 2);
    expect(results[0].failed).toBe(30);
    // 두 번째 묶음: 아직 안 본 d30~d49가 먼저, 실패했던 것은 그 뒤
    expect(fetchSongId.mock.calls.slice(30, 50).map(c => c[0])).toEqual(all.slice(30, 50));
    expect(found.size).toBe(15);
    expect(deferred.size).toBe(35); // 다시 시도 대상으로 남는다
  });

  test('곡이 아닌 상세(null)는 실패가 아니라 그냥 빠진다', async () => {
    const r = await resolveLikedSongIds(['d0'], () => null, async () => null, { limit: 10, concurrency: 2 });
    expect(r).toMatchObject({ failed: 0, remaining: 0 });
    expect(r.songIds.size).toBe(0);
  });
});
