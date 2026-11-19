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

/** 이미 그린 핀을 남겨 두는 범위(pad) — 고르는 범위(0.5)보다 넓게. 조금 끌거나 확대했다 되돌려도 마커를 지웠다 다시 만들지 않게 */
export const KEEP_PAD = 1.5;

/**
 * 그릴 핀 — 거리순 목록에서 보이는 영역(넉넉히) 안의 것만, 앞에서부터(= 가까운 순) limit개.
 * 영역을 아직 모르면(지도가 처음 자리 잡기 전) 상한만 적용. rank는 거리순 목록에서의 순번(가까운 핀 몇 개만 파동을 그리는 데 쓴다).
 * kept(이미 그린 핀인가)를 주면 상한이 남을 때 이미 그린 핀 중 KEEP_PAD 안의 것도 남긴다 — 고르는 범위를 막 벗어난 핀이
 * 지워졌다가 지도를 되돌리면 다시 만들어지지 않게. 결과는 거리순(rank 오름차순).
 */
export function pickPins<T extends { d: Coords }>(sorted: readonly T[], region: MapRegion | null, limit = MAX_PINS, kept?: (item: T) => boolean): { item: T; rank: number }[] {
  const out: { item: T; rank: number }[] = [];
  const taken = new Set<number>();
  for (let i = 0; i < sorted.length && out.length < limit; i++) {
    if (!region || inRegion(sorted[i].d, region)) { out.push({ item: sorted[i], rank: i }); taken.add(i); }
  }
  if (!region || !kept || out.length >= limit) return out;
  let added = false;
  for (let i = 0; i < sorted.length && out.length < limit; i++) {
    if (!taken.has(i) && kept(sorted[i]) && inRegion(sorted[i].d, region, KEEP_PAD)) { out.push({ item: sorted[i], rank: i }); added = true; }
  }
  return added ? out.sort((a, b) => a.rank - b.rank) : out;
}

/** outer를 사방으로 pad만큼 넓힌 범위가 inner 화면을 다 덮는가 */
export function covers(outer: MapRegion, inner: MapRegion, pad = 0.5) {
  return (
    Math.abs(inner.latitude - outer.latitude) + inner.latitudeDelta / 2 <= outer.latitudeDelta * (0.5 + pad) &&
    Math.abs(inner.longitude - outer.longitude) + inner.longitudeDelta / 2 <= outer.longitudeDelta * (0.5 + pad)
  );
}

/**
 * 지도를 움직이는 중에 그릴 핀·묶음을 다시 골라야 하는가 — drawn은 지금 그려 둔 핀·묶음을 고른 영역, drawnClustered는 그때 묶음이었는가.
 * 핀↔묶음이 바뀌거나(경계 여유 포함 — shouldCluster), 지금 화면이 고른 범위(pad 0.5 — 화면의 2배) 밖으로 나가 빈 곳이 보이기 시작하면 다시.
 * 화면이 고른 범위 안이면(확대·조금 끌기) 그대로 둔다 — 묶음 칸 크기만 달라진 것도 기다린다.
 * 다시 고를 때마다 마커를 만들고 지우는 값이 커서(특히 Android 마커 스냅샷) 빈 곳이 보일 때만 하고, 멈추면 어차피 다시 고른다.
 */
export function needsRepick(drawn: MapRegion | null, next: MapRegion, drawnClustered = shouldCluster(drawn)) {
  if (!drawn) return true;
  if (shouldCluster(next, drawnClustered) !== drawnClustered) return true;
  return !covers(drawn, next);
}

/**
 * 이보다 넓게(경도 폭, 도) 보이면 핀 대신 묶음을 그린다. 0.04도 ≈ 국내 위도에서 가로 3.6km
 * (처음 지도 폭 0.012도의 3배쯤 — 핀 하나(55pt)가 500m 가까이 덮어 몇백 m 안의 핀끼리 겹치기 시작하는 줌)
 */
export const CLUSTER_LNG_DELTA = 0.04;
/**
 * 묶음에서 핀으로 돌아오는 폭 — 묶음으로 갈 때(CLUSTER_LNG_DELTA)보다 좁게 여유를 둔다.
 * 경계 근처에서 조금씩 확대·축소하면 핀 최대 100개 ↔ 묶음 최대 60개를 매번 통째로 지우고 새로 만들었다 → 0.032~0.04 사이에서는 지금 모드를 그대로 둔다
 * (그 구간에서는 들어온 방향에 따라 핀이거나 묶음)
 */
export const UNCLUSTER_LNG_DELTA = 0.032;
/** 묶음 격자 — 화면 가로를 몇 칸으로 나누는가 (칸 하나 ≈ 화면 폭/5 ≈ 80pt, 가장 큰 묶음 48pt보다 넉넉히) */
export const CLUSTER_COLUMNS = 5;
/** 묶음을 눌러 여유 구간에 떨어질 때 맞추는 폭 — UNCLUSTER_LNG_DELTA보다 5% 좁게(지도가 영역을 조금 바꿔 맞춰도 핀 쪽에 떨어지게) */
export const ZOOM_INTO_PINS = 0.95;
/** 묶음을 눌렀을 때 가장 많이 확대하는 폭 — 처음 지도 폭과 같게 (한 점에 몰린 묶음도 이 줌에선 핀으로 보인다) */
export const CLUSTER_MIN_ZOOM_DELTA = 0.012;
/**
 * 묶음 마커 수 상한 — 영역을 사방으로 넓혀 묶으므로 화면 밖 묶음도 마커가 된다.
 * 넘치면 화면 가운데서 먼 묶음부터 뺀다 — 화면 밖 묶음이 먼저 빠진다 (화면 안 묶음은 드랍 500개를 고르게 뿌려도 40여 개).
 */
export const MAX_CLUSTERS = 60;

/** 핀 대신 묶음을 그릴 줌인가 (영역을 아직 모르면 아니다). was: 지금 묶음을 그리고 있는가 — 그러면 UNCLUSTER_LNG_DELTA까지는 묶음을 유지 */
export const shouldCluster = (r: MapRegion | null, was = false): boolean => !!r && r.longitudeDelta > (was ? UNCLUSTER_LNG_DELTA : CLUSTER_LNG_DELTA);

export interface DropCluster<T extends Coords = Coords> {
  /**
   * 묶음 마커 키 — 묶인 드랍 중 id가 가장 작은 드랍(대표)의 id. 줌 단계·칸과 무관해서
   * 지도를 끌어도, 확대·축소로 칸 크기가 바뀌어도 대표가 같은 묶음은 같은 키다 (마커를 다시 만들지 않고 위치·숫자만 바꾼다).
   * 묶음이 합쳐지면 합친 묶음의 대표는 합쳐진 묶음들의 대표 중 가장 작은 것, 나뉘면 대표가 든 쪽이 키를 이어받는다.
   */
  key: string;
  /** 묶인 드랍들의 평균 좌표 — 묶음을 그리는 자리 */
  latitude: number;
  longitude: number;
  count: number;
  /** 묶인 드랍을 모두 담는 범위 — 눌렀을 때 이만큼 확대 */
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** 1개짜리 묶음이면 그 드랍 — 묶음 원 대신 보통 핀으로 그린다 */
  single: T | null;
}

/** 격자 칸 크기(경도, 도) — 화면 폭/columns를 2의 거듭제곱으로 맞춘다 (조금 확대·축소해서는 칸이 그대로라 묶음이 흔들리지 않게) */
export function clusterCell(lngDelta: number, columns = CLUSTER_COLUMNS) {
  return 2 ** Math.round(Math.log2(lngDelta / columns));
}

/** 좌표로 만든 id — id가 없는 점(테스트·좌표만 있는 목록)의 묶음 대표를 고를 때 */
const coordId = (p: Coords) => `${p.latitude},${p.longitude}`;

/** 묶을 때 칸을 세는 범위(pad) — 그리는 범위(0.5)보다 넓게. 가장자리 칸도 칸 안의 드랍을 다 세어, 지도를 끌어도 묶음의 수·대표가 바뀌지 않게 */
const CLUSTER_COUNT_PAD = 1.5;

/**
 * 보이는 영역(넉넉히) 안의 드랍을 격자 칸마다 하나로 묶는다. 잠긴 드랍도 그대로 센다(묶음엔 수만 있고 곡·커버는 없다).
 * 칸은 경도 0·위도 0을 기준으로 고정이라 같은 줌에서 지도를 끌어도 같은 드랍은 같은 묶음에 남는다.
 * 칸 높이(위도)는 화면에서 정사각형에 가깝게 경도 칸 × cos(위도) — cos는 0.1 단위로 맞춰 위아래로 끌어도 칸이 바뀌지 않게.
 * 칸은 그리는 범위보다 넓게(CLUSTER_COUNT_PAD) 세고, 묶음 중심이 그리는 범위(pad 0.5) 안인 것만 낸다 — 가장자리 묶음의 수가 끄는 방향에 따라 달라지지 않게.
 * 묶음끼리 한 칸보다 가까우면(칸 경계에 걸쳐 갈라진 무리) 큰 쪽으로 합친다.
 * 키는 묶인 드랍 중 idOf가 가장 작은 드랍의 id (DropCluster.key) — 줌 단계가 바뀌어도 이어진다.
 * 묶음이 limit개를 넘으면 화면 가운데서 먼 것부터 뺀다 — 다 묶고 합친 뒤에 빼므로 남은 묶음의 수는 그대로 맞다. 남은 것의 순서는 바꾸지 않는다.
 */
export function clusterPoints<T extends Coords>(points: readonly T[], region: MapRegion, columns = CLUSTER_COLUMNS, limit = MAX_CLUSTERS, idOf: (p: T) => string = coordId): DropCluster<T>[] {
  const cellLng = clusterCell(region.longitudeDelta, columns);
  const cos = Math.max(0.1, Math.round(Math.cos((region.latitude * Math.PI) / 180) * 10) / 10);
  const cellLat = cellLng * cos;
  const cells = new Map<string, { n: number; first: T; rep: string; lat: number; lng: number; minLat: number; maxLat: number; minLng: number; maxLng: number }>();
  for (const p of points) {
    if (!inRegion(p, region, CLUSTER_COUNT_PAD)) continue;
    const cell = `${Math.floor(p.longitude / cellLng)}:${Math.floor(p.latitude / cellLat)}`;
    const id = idOf(p);
    const c = cells.get(cell);
    if (!c) {
      cells.set(cell, { n: 1, first: p, rep: id, lat: p.latitude, lng: p.longitude, minLat: p.latitude, maxLat: p.latitude, minLng: p.longitude, maxLng: p.longitude });
      continue;
    }
    c.n++;
    if (id < c.rep) c.rep = id;
    c.lat += p.latitude;
    c.lng += p.longitude;
    c.minLat = Math.min(c.minLat, p.latitude);
    c.maxLat = Math.max(c.maxLat, p.latitude);
    c.minLng = Math.min(c.minLng, p.longitude);
    c.maxLng = Math.max(c.maxLng, p.longitude);
  }
  // 칸 경계에 걸친 무리는 이웃 칸으로 갈라져 묶음끼리 겹친다 → 큰 묶음부터 두고, 그 한 칸 거리 안의 작은 묶음은 큰 쪽에 합친다
  // (같은 수끼리는 대표 id 순 — 칸 번호 순으로 하면 줌 단계마다 합치는 쪽이 달라질 수 있다)
  const list = [...cells.values()].sort((a, b) => b.n - a.n || (a.rep < b.rep ? -1 : a.rep > b.rep ? 1 : 0));
  const kept: typeof list = [];
  for (const c of list) {
    const lat = c.lat / c.n;
    const lng = c.lng / c.n;
    const into = kept.find(k => Math.hypot((k.lng / k.n - lng) / cellLng, (k.lat / k.n - lat) / cellLat) < 1);
    if (!into) { kept.push({ ...c }); continue; }
    into.n += c.n;
    if (c.rep < into.rep) into.rep = c.rep;
    into.lat += c.lat;
    into.lng += c.lng;
    into.minLat = Math.min(into.minLat, c.minLat);
    into.maxLat = Math.max(into.maxLat, c.maxLat);
    into.minLng = Math.min(into.minLng, c.minLng);
    into.maxLng = Math.max(into.maxLng, c.maxLng);
  }
  const out = kept
    .map(c => ({
      key: c.rep, latitude: c.lat / c.n, longitude: c.lng / c.n, count: c.n,
      minLat: c.minLat, maxLat: c.maxLat, minLng: c.minLng, maxLng: c.maxLng, single: c.n === 1 ? c.first : null,
    }))
    .filter(c => inRegion(c, region));
  if (out.length <= limit) return out;
  // 화면 가운데서 먼 정도 — 영역 크기로 나눈 가로·세로 중 큰 쪽 (0.5 이하면 화면 안이라 화면 밖 묶음보다 늘 앞선다)
  const far = (c: DropCluster<T>) => Math.max(Math.abs(c.longitude - region.longitude) / region.longitudeDelta, Math.abs(c.latitude - region.latitude) / region.latitudeDelta);
  const keep = new Set([...out].sort((a, b) => far(a) - far(b)).slice(0, limit));
  return out.filter(c => keep.has(c));
}

/**
 * 묶음 모드에서 보통 핀으로 그릴 것 — 1개짜리 묶음의 드랍을 거리순 목록에서 찾아 pickPins와 같은 모양·순서로 (rank도 같은 뜻).
 * 묶음은 드랍 목록 그대로를 묶고 거리순 목록의 d도 같은 객체라 객체로 찾는다.
 */
export function singlePins<T extends { d: Coords }>(sorted: readonly T[], clusters: readonly DropCluster<T['d']>[]): { item: T; rank: number }[] {
  const singles = new Set<Coords>();
  for (const c of clusters) if (c.single) singles.add(c.single);
  const out: { item: T; rank: number }[] = [];
  if (!singles.size) return out;
  sorted.forEach((item, rank) => { if (singles.has(item.d)) out.push({ item, rank }); });
  return out;
}

/**
 * 묶음을 눌렀을 때 옮겨 갈 영역 — 묶인 드랍이 다 보이게(1.6배 여유) 확대하되, 적어도 지금의 절반으로는 확대하고
 * CLUSTER_MIN_ZOOM_DELTA보다 더 들어가지는 않는다. 화면 가로세로 비율은 지금 그대로.
 * 아래쪽은 가까운 드랍 줄이 가리므로 가운데를 화면 위쪽으로 조금 올려 둔다(카메라는 아래로).
 */
export function clusterZoomRegion(c: Pick<DropCluster, 'minLat' | 'maxLat' | 'minLng' | 'maxLng'>, current: MapRegion): MapRegion {
  const aspect = current.latitudeDelta / current.longitudeDelta;
  const fit = Math.max((c.maxLng - c.minLng) * 1.6, ((c.maxLat - c.minLat) * 1.6) / aspect);
  let longitudeDelta = Math.max(CLUSTER_MIN_ZOOM_DELTA, Math.min(fit, current.longitudeDelta / 2));
  // 경계 여유 구간(UNCLUSTER~CLUSTER)에 떨어지면 묶음 모드가 그대로라 묶음이 한 번 더 나뉘기만 한다 → 핀이 보이게 조금 더 들어간다 (1.6배 여유가 1.2배까지 줄 뿐 묶인 드랍은 다 보인다)
  if (longitudeDelta > UNCLUSTER_LNG_DELTA && longitudeDelta <= CLUSTER_LNG_DELTA) longitudeDelta = UNCLUSTER_LNG_DELTA * ZOOM_INTO_PINS;
  const latitudeDelta = longitudeDelta * aspect;
  return { latitude: (c.minLat + c.maxLat) / 2 - latitudeDelta * 0.1, longitude: (c.minLng + c.maxLng) / 2, latitudeDelta, longitudeDelta };
}

/** 묶음 숫자 — 1,000부터 쉼표 (Hermes Intl 차이 없이) */
export const clusterLabel = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 묶음 지름(pt) — 어드민 지도 묶음과 같은 단계 (10개 미만 36 · 50개 미만 42 · 그 이상 48) */
export const clusterSize = (n: number) => (n < 10 ? 36 : n < 50 ? 42 : 48);

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
 * urgent면 줄 맨 앞에 — 이미 줄 서 있던 주소도 앞으로 (지도에 막 그린 핀의 아트가 미리 받기 줄 뒤에서 기다리지 않게).
 */
export function createPrefetcher(load: (url: string) => Promise<unknown>, concurrency = 6, limit = 1000) {
  const seen = new Map<string, Promise<boolean>>();
  const ready = new Set<string>();
  const queue: { url: string; run: () => void }[] = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) queue.shift()!.run();
  };
  const prefetch = (url: string, urgent = false): Promise<boolean> => {
    const hit = seen.get(url);
    if (hit) {
      if (urgent) {
        const i = queue.findIndex(q => q.url === url);
        if (i > 0) queue.unshift(...queue.splice(i, 1));
      }
      return hit;
    }
    if (seen.size >= limit) { seen.clear(); ready.clear(); }
    const p = new Promise<boolean>(resolve => {
      const run = () => {
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
      };
      if (urgent) queue.unshift({ url, run });
      else queue.push({ url, run });
    });
    seen.set(url, p);
    pump();
    return p;
  };
  /** 이미 받아 둔 주소인가 (동기) */
  const isReady = (url: string) => ready.has(url);
  return { prefetch, isReady };
}
