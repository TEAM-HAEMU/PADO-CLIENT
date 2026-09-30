/**
 * iTunes Search (공개 API, 키 불필요) — 백엔드 곡 정보에 없는 두 가지를 보완한다.
 *  1) 30초 미리듣기 previewUrl   2) Apple Music 곡 링크 trackViewUrl
 * KR 스토어는 검색 API가 비어 있는 경우가 있어 US → KR 순으로 조회한다.
 */
import { kv } from '@/store/storage';

export interface ItunesMatch {
  previewUrl: string | null;
  appleMusicUrl: string | null;
  /** 네트워크 오류·요청 한도 초과로 확인하지 못함 (캐시하지 않음) */
  unavailable?: boolean;
}

const mem = new Map<string, ItunesMatch>();
const inflight = new Map<string, Promise<ItunesMatch>>();
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

type Row = { trackName: string; artistName: string; previewUrl?: string; trackViewUrl?: string };

// iTunes Search는 IP당 분당 약 20회 제한 — 요청 간격을 두고, 403(한도 초과)이면 잠시 쉰다
const MIN_GAP_MS = 1_200;
const COOLDOWN_MS = 60_000;
const MAX_QUEUE_MS = 8_000;
let nextSlot = 0;
let blockedUntil = 0;
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** 결과 목록 또는 null(네트워크 오류·한도 초과 — 캐시하지 않음) */
async function query(term: string, country: string): Promise<Row[] | null> {
  if (Date.now() < blockedUntil) return null;
  const slot = Math.max(Date.now(), nextSlot);
  if (slot - Date.now() > MAX_QUEUE_MS) return null; // 대기열이 너무 길면 이번엔 포기 (사용자가 오래 기다리지 않게)
  nextSlot = slot + MIN_GAP_MS;
  if (slot > Date.now()) await wait(slot - Date.now());
  if (Date.now() < blockedUntil) return null; // 기다리는 사이 차단됐으면 보내지 않는다 (차단 연장 방지)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=${country}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 403 || res.status === 429) { blockedUntil = Date.now() + COOLDOWN_MS; return null; }
    if (!res.ok) return null;
    const json = await res.json();
    return (json.results ?? []) as Row[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 제목·가수가 모두 대충 맞는 곡만 — 엉뚱한 곡을 틀지 않게 */
function pick(list: Row[], title: string, artist: string, allowFuzzy = true) {
  const t = norm(title);
  const a = norm(artist.split(/,|&| feat\.?| x /i)[0] ?? artist);
  const titleOk = (r: Row) => { const n = norm(r.trackName); return !!n && (n.includes(t) || t.includes(n)); };
  const artistOk = (r: Row) => { const n = norm(r.artistName); return !!a && (n.includes(a) || a.includes(n)); };
  const exact = list.find(r => titleOk(r) && artistOk(r)) ?? list.find(titleOk);
  if (exact) return exact;
  // 한글 제목/가수는 iTunes에 영문 음역으로 올라가 있는 경우가 많다 (난춘 → Nan Chun).
  // 검색 자체가 음역을 고려하므로, 한글이 섞였으면 검색 1순위 결과를 믿는다
  return allowFuzzy && /[\u3131-\u318E\uAC00-\uD7A3]/.test(title + artist) ? list[0] ?? null : null;
}

/** 기기 캐시는 최근 500곡까지만 (오래된 것부터 지움) */
const MAX_CACHED = 500;
function persist(key: string, value: ItunesMatch) {
  kv.set(key, value);
  const index = kv.get<string[]>('itunes:index', []).filter(k => k !== key);
  index.push(key);
  while (index.length > MAX_CACHED) kv.remove(index.shift()!);
  kv.set('itunes:index', index);
}

async function lookup(key: string, title: string, artist: string): Promise<ItunesMatch> {
  let result: ItunesMatch = { previewUrl: null, appleMusicUrl: null };
  let failed = false;
  let fuzzy: Row | null = null;
  for (const country of ['us', 'kr']) {
    const list = await query(`${title} ${artist}`, country);
    if (list === null) { failed = true; continue; }
    const best = pick(list, title, artist, false);
    if (best) { result = { previewUrl: best.previewUrl ?? null, appleMusicUrl: best.trackViewUrl ?? null }; break; }
    fuzzy ??= pick(list, title, artist, true); // 한글 제목: 정확한 매칭이 두 스토어 모두 없을 때만 1순위를 쓴다
  }
  if (result.previewUrl || result.appleMusicUrl) { mem.set(key, result); persist(key, result); return result; }
  if (fuzzy) {
    result = { previewUrl: fuzzy.previewUrl ?? null, appleMusicUrl: fuzzy.trackViewUrl ?? null };
    mem.set(key, result); // 추정 매칭은 기기에 영구 저장하지 않는다
    return result;
  }
  if (!failed) { mem.set(key, result); return result; } // 확실히 없는 곡만 이번 실행 동안 기억
  return { ...result, unavailable: true }; // 네트워크 실패·한도 초과는 다음에 다시 시도
}

/** 테스트용 */
export const pickForTest = pick;

export async function findItunes(title: string, artist: string): Promise<ItunesMatch> {
  const key = `itunes:${norm(title)}:${norm(artist)}`;
  const hit = mem.get(key) ?? kv.get<ItunesMatch | null>(key, null);
  if (hit) { mem.set(key, hit); return hit; }
  // 같은 곡을 여러 행이 동시에 물어도 요청은 한 번 (iTunes 분당 요청 제한)
  let p = inflight.get(key);
  if (!p) {
    p = lookup(key, title, artist).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
