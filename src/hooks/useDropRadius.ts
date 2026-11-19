/**
 * 드랍 보기 설정 (운영자가 어드민에서 관리) — 보기 모드(거리 / 같은 지역)·표시 반경·재생 반경·내가 있는 지역.
 * 받은 값은 kv에 저장. 서버에 아직 없거나 못 받으면 지난번 값, 그것도 없으면 기본값(거리 5km / 500m)으로 — 절대 막히지 않게.
 * 다시 묻는 때: 10분마다(모드가 바뀌었을 수 있음), 보기나 재생 기준이 같은 지역이면 300m 넘게 움직였을 때도(지역이 바뀌었을 수 있음).
 * 위치는 주소가 아니라 좌표로 보낸다(서버가 행정구역을 판정).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { settingsApi } from '@/api/endpoints';
import type { DropRadius } from '@/api/types';
import { useLocation } from '@/services/location';
import { kv } from '@/store/storage';
import { DEFAULT_RADIUS, needsCoords, nextAnchor, sanitizeRadius } from '@/utils/dropScope';
import { readSig, scopeSig, scopeTip, type ScopeSig, type ScopeTipText } from '@/utils/scopeTip';
import type { Coords } from '@/utils/geo';

export { DEFAULT_RADIUS, sanitizeRadius } from '@/utils/dropScope';

const KEY = 'settings:dropRadius';

/**
 * 저장해 둔 값 — 이 훅은 지도 화면에서 GPS가 갱신될 때마다(렌더마다 여러 번) 불리므로 저장소 읽기·JSON 파싱은 앱 실행마다 한 번만.
 * 이 키는 아래 fetchRadius만 쓰므로, 쓸 때 기억도 같이 바꾼다.
 */
let saved: { value: DropRadius | null } | null = null;
export const cachedRadius = () => (saved ??= { value: sanitizeRadius(kv.get<unknown>(KEY, null)) }).value;

/** 지난번에 사용자에게 알려 준(또는 처음 받은) 보기·재생 규칙 */
const SEEN_KEY = 'settings:scopeSeen';

/** 설정이 바뀌어 지도에 한 번 띄울 안내 — 지도 화면이 띄운 뒤 markScopeTipSeen으로 지운다 */
export const useScopeTip = create<{ tip: { text: ScopeTipText; sig: ScopeSig } | null }>(() => ({ tip: null }));

export function markScopeTipSeen(sig: ScopeSig) {
  kv.set(SEEN_KEY, sig);
  useScopeTip.setState({ tip: null });
}

/**
 * 서버에서 새 설정을 받았을 때 — 지난번에 알려 준 규칙과 다르면 안내를 걸어 둔다.
 * 처음 쓰는 기기(저장값 없음)는 알릴 게 없으니 지금 값을 기준으로 삼는다. 예전 앱에서 올라온 기기는 그때 받아 둔 설정이 기준
 */
function noteScopeChange(prev: DropRadius | null, r: DropRadius) {
  let seen = readSig(kv.get<unknown>(SEEN_KEY, null));
  if (!seen) {
    seen = prev ? scopeSig(prev) : scopeSig(r);
    kv.set(SEEN_KEY, seen);
  }
  const text = scopeTip(seen, r);
  useScopeTip.setState({ tip: text ? { text, sig: scopeSig(r) } : null });
}

async function fetchRadius(at: Coords | null) {
  const r = sanitizeRadius(await settingsApi.dropRadius(at));
  if (!r) throw new Error('bad drop radius');
  noteScopeChange(cachedRadius(), r);
  kv.set(KEY, r);
  saved = { value: r };
  return r;
}

/** 앱 전체가 같이 쓰는 기준 좌표 — 위치가 300m 넘게 바뀔 때만 새 객체 */
let anchor: Coords | null = null;
const anchorOf = (c: Coords | null) => (anchor = nextAnchor(anchor, c));

export function useDropRadius(): DropRadius {
  const at = useLocation(s => anchorOf(s.coords));
  const known = cachedRadius();
  // 보기·재생 모두 거리 기준이면 좌표가 결과를 바꾸지 않으니 위치가 바뀌어도 다시 묻지 않는다 (좌표는 있으면 같이 보낸다)
  const regionMode = needsCoords(known);
  const q = useQuery({
    queryKey: ['dropRadius', regionMode && at ? `${at.latitude.toFixed(3)},${at.longitude.toFixed(3)}` : 'any'],
    queryFn: () => fetchRadius(at),
    // 저장해 둔 값으로 바로 시작하되 (initialDataUpdatedAt 0 → 곧바로 새로 받음) 받기 실패해도 그 값을 그대로 쓴다
    initialData: () => cachedRadius() ?? undefined,
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
    // 이 훅은 여러 화면이 같이 쓴다 — 새로 마운트될 때는 아직 한 번도 묻지 않았을 때만 받는다.
    // 받기에 실패한 뒤(서버 장애·오프라인)에도 화면을 열 때마다 다시 묻지 않게: 다음 시도는 10분 주기·좌표 변경·오래 있다 돌아올 때
    refetchOnMount: query => query.state.dataUpdateCount === 0 && query.state.errorUpdateCount === 0,
    retryOnMount: false,
    refetchInterval: 10 * 60_000,
    gcTime: Infinity,
    // 재시도는 기본 정책(4xx는 안 함, 네트워크·5xx는 한 번 — hooks/queryClient)
  });
  return q.data ?? DEFAULT_RADIUS;
}
