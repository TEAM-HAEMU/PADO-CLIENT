/**
 * iTunes Search (공개 API, 키 불필요) — 백엔드 곡 정보에 없는 두 가지를 보완한다.
 *  1) 30초 미리듣기 previewUrl   2) Apple Music 곡 링크 trackViewUrl
 * KR 스토어는 검색 API가 비어 있는 경우가 있어 US·KR 둘 다 조회한다 (US 결과 우선).
 * priority: 사용자가 방금 누른 곡 — 요청 간격 대기 없이 두 스토어를 동시에 묻는다 (처음 듣는 곡의 몇 초 지연을 줄임).
 * 미리 받아 두기(prefetch)는 priority 없이 간격을 지켜 분당 한도를 아낀다.
 */
import { kv } from '@/store/storage';

export interface ItunesMatch {
  previewUrl: string | null;
  appleMusicUrl: string | null;
  /** 네트워크 오류·요청 한도 초과로 확인하지 못함 (캐시하지 않음) */
  unavailable?: boolean;
  /** 19세 이상 곡이라 미리듣기를 제공하지 않음 */
  adult?: boolean;
}

const mem = new Map<string, ItunesMatch>();
const inflight = new Map<string, Promise<ItunesMatch>>();
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

type Row = { trackName: string; artistName: string; previewUrl?: string; trackViewUrl?: string; trackTimeMillis?: number };

// iTunes Search는 IP당 분당 약 20회 제한 — 요청 간격을 두고, 403(한도 초과)이면 잠시 쉰다
const MIN_GAP_MS = 1_200;
const COOLDOWN_MS = 60_000;
const MAX_QUEUE_MS = 8_000;
let nextSlot = 0;
let blockedUntil = 0;
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** 결과 목록 또는 null(네트워크 오류·한도 초과 — 캐시하지 않음) */
async function query(term: string, country: string, priority = false): Promise<Row[] | null> {
  if (Date.now() < blockedUntil) return null;
  if (priority) {
    nextSlot = Math.max(Date.now(), nextSlot) + MIN_GAP_MS; // 바로 보내되, 뒤따르는 미리 받기는 그만큼 미룬다
  } else {
    const slot = Math.max(Date.now(), nextSlot);
    if (slot - Date.now() > MAX_QUEUE_MS) return null; // 대기열이 너무 길면 이번엔 포기 (사용자가 오래 기다리지 않게)
    nextSlot = slot + MIN_GAP_MS;
    if (slot > Date.now()) await wait(slot - Date.now());
  }
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

/** 곡 길이가 맞는지 (초) — 길이를 모르면 판단하지 않는다 */
const sameLength = (r: Row, duration?: number, tolerance = 3) => !!duration && !!r.trackTimeMillis && Math.abs(r.trackTimeMillis / 1000 - duration) <= tolerance;

/** 제목·가수가 모두 대충 맞는 곡만 — 엉뚱한 곡을 틀지 않게. duration(초)을 알면 길이로 한 번 더 확인한다 */
function pick(list: Row[], title: string, artist: string, allowFuzzy = true, duration?: number) {
  const t = norm(title);
  const a = norm(artist.split(/,|&| feat\.?| x /i)[0] ?? artist);
  const titleOk = (r: Row) => { const n = norm(r.trackName); return !!n && (n.includes(t) || t.includes(n)); };
  const artistOk = (r: Row) => { const n = norm(r.artistName); return !!a && (n.includes(a) || a.includes(n)); };
  // 제목·가수가 다 맞으면 그중 길이가 맞는 판본을 먼저 (라이브·리마스터 구분)
  const both = list.filter(r => titleOk(r) && artistOk(r));
  const exact = both.find(r => sameLength(r, duration)) ?? both[0];
  if (exact) return exact;
  // 제목만 맞는 곡은 같은 제목의 다른 가수 곡일 수 있다 → 길이를 알면 길이까지 맞아야 쓴다
  const titleOnly = list.find(r => titleOk(r) && (!duration || sameLength(r, duration)));
  if (titleOnly) return titleOnly;
  // 한글 제목/가수는 iTunes에 영문 표기로 올라가 있는 경우가 많다 (좋은 밤 좋은 꿈 → Good Night Good Dream).
  // 예전엔 검색 1순위를 그대로 믿었다가 전혀 다른 곡을 틀었다 → 길이가 2초 안으로 맞을 때만 쓴다
  if (!allowFuzzy || !/[\u3131-\u318E\uAC00-\uD7A3]/.test(title + artist)) return null;
  return list.find(r => sameLength(r, duration, 2)) ?? null;
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

async function lookup(key: string, title: string, artist: string, priority: boolean, duration?: number): Promise<ItunesMatch> {
  let result: ItunesMatch = { previewUrl: null, appleMusicUrl: null };
  let failed = false;
  let fuzzy: Row | null = null;
  const term = `${title} ${artist}`;
  // priority면 두 스토어를 동시에 (기다리는 시간이 한 번으로), 아니면 US에서 찾으면 KR은 묻지 않는다
  const both = priority ? [query(term, 'us', true), query(term, 'kr', true)] : null;
  for (const [i, country] of ['us', 'kr'].entries()) {
    const list = both ? await both[i] : await query(term, country);
    if (list === null) { failed = true; continue; }
    const best = pick(list, title, artist, false, duration);
    if (best) { result = { previewUrl: best.previewUrl ?? null, appleMusicUrl: best.trackViewUrl ?? null }; break; }
    fuzzy ??= pick(list, title, artist, true, duration); // 한글 제목: 정확한 매칭이 두 스토어 모두 없을 때만, 길이가 맞는 곡을 쓴다
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

export async function findItunes(title: string, artist: string, opts: { priority?: boolean; duration?: number } = {}): Promise<ItunesMatch> {
  const key = `itunes:${norm(title)}:${norm(artist)}`;
  const hit = mem.get(key) ?? kv.get<ItunesMatch | null>(key, null);
  if (hit) { mem.set(key, hit); return hit; }
  // 같은 곡을 여러 행이 동시에 물어도 요청은 한 번 (iTunes 분당 요청 제한)
  let p = inflight.get(key);
  if (!p) {
    p = lookup(key, title, artist, !!opts.priority, opts.duration).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
