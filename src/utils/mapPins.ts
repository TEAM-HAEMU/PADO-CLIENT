/**
 * 지도 핀 계산 (네이티브 의존 없음) — 그릴 핀 고르기, 드랍 목록 키, 역지오코딩 간격.
 * 서버는 주변 드랍을 최대 500개 주는데, 커스텀 뷰 마커 500개는 GPS 갱신·스냅샷마다 비싸다 → 보이는 곳의 가까운 것만 그린다.
 */
import { distanceM, type Coords } from '@/utils/geo';

/** 지도에 한 번에 그리는 드랍 핀 수 상한 */
export const MAX_PINS = 100;

/** 지도 영역 (react-native-maps Region과 같은 모양) */
export interface MapRegion { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

/**
 * 드랍 id 집합 키 — 순서와 무관. 서버는 조회 중심에서 가까운 순으로 주므로 약 100m 격자를 넘어 다시 받으면
 * 구성이 같아도 순서가 바뀐다 → 그대로 이어 붙이면 '목록이 바뀌었다'로 잘못 본다.
 */
export function idSetKey(ids: readonly string[]) {
  return [...ids].sort().join(',');
}

/**
 * 영역을 사방으로 pad(영역 크기 대비 비율)만큼 넓혀서 그 안에 있는가.
 * 핀은 좌표 위로 솟아 있고 살짝 끌기만 해도 가장자리 핀이 비지 않게 넉넉히 본다. (경도 ±180 넘김은 다루지 않음 — 국내 서비스)
 */
export function inRegion(p: Coords, r: MapRegion, pad = 0.5) {
  return Math.abs(p.latitude - r.latitude) <= r.latitudeDelta * (0.5 + pad) && Math.abs(p.longitude - r.longitude) <= r.longitudeDelta * (0.5 + pad);
}

/**
 * 그릴 핀 — 거리순 목록에서 보이는 영역(넉넉히) 안의 것만, 앞에서부터(= 가까운 순) limit개.
 * 영역을 아직 모르면(지도가 처음 자리 잡기 전) 상한만 적용. rank는 거리순 목록에서의 순번(가까운 핀 몇 개만 파동을 그리는 데 쓴다).
 */
export function pickPins<T extends { d: Coords }>(sorted: readonly T[], region: MapRegion | null, limit = MAX_PINS): { item: T; rank: number }[] {
  const out: { item: T; rank: number }[] = [];
  for (let i = 0; i < sorted.length && out.length < limit; i++) {
    if (!region || inRegion(sorted[i].d, region)) out.push({ item: sorted[i], rank: i });
  }
  return out;
}

/** 역지오코딩을 다시 하는 거리 — 동 이름·드랍 주소가 바뀔 만한 이동 */
export const GEOCODE_MOVE_M = 100;
/** 이만큼 지났고 조금이라도(GEOCODE_DRIFT_M) 움직였으면 거리와 상관없이 다시 (걷는 중 주소가 너무 오래 낡지 않게) */
export const GEOCODE_EVERY_MS = 30_000;
export const GEOCODE_DRIFT_M = 15;

export interface GeocodeMark { at: Coords; time: number }

/** 지난번 역지오코딩(성공한 것) 이후 다시 할 때인가 — 처음이면 바로 */
export function geocodeDue(last: GeocodeMark | null, here: Coords, now: number) {
  if (!last) return true;
  const m = distanceM(last.at, here);
  return m >= GEOCODE_MOVE_M || (now - last.time >= GEOCODE_EVERY_MS && m >= GEOCODE_DRIFT_M);
}

/**
 * 같은 주소는 한 번만, 동시에 몇 개씩만 받는 프리패처 — 마커 수백 개가 한꺼번에 Image.prefetch를 걸지 않게.
 * 실패하면 기억에서 지워 다음에 다시 시도한다. 기억은 limit개를 넘으면 비운다(앱을 오래 켜 둬도 계속 쌓이지 않게).
 */
export function createPrefetcher(load: (url: string) => Promise<unknown>, concurrency = 6, limit = 1000) {
  const seen = new Map<string, Promise<boolean>>();
  const ready = new Set<string>();
  const queue: (() => void)[] = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) queue.shift()!();
  };
  const prefetch = (url: string): Promise<boolean> => {
    const hit = seen.get(url);
    if (hit) return hit;
    if (seen.size >= limit) { seen.clear(); ready.clear(); }
    const p = new Promise<boolean>(resolve => {
      queue.push(() => {
        active++;
        Promise.resolve()
          .then(() => load(url))
          .then(r => r !== false, () => false)
          .then(ok => {
            active--;
            if (ok) ready.add(url);
            else seen.delete(url);
            resolve(ok);
            pump();
          });
      });
    });
    seen.set(url, p);
    pump();
    return p;
  };
  /** 이미 받아 둔 주소인가 (동기) */
  const isReady = (url: string) => ready.has(url);
  return { prefetch, isReady };
}
