/**
 * 드랍 반경 (운영자가 어드민에서 관리) — 표시 반경(지도에 보이는 범위)·재생 반경(열고 들을 수 있는 범위).
 * 앱을 켤 때 한 번 받아 kv에 저장. 서버에 아직 없거나 못 받으면 지난번 값, 그것도 없으면 기본값 5000/500으로 — 절대 막히지 않게.
 */
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/api/endpoints';
import type { DropRadius } from '@/api/types';
import { kv } from '@/store/storage';

export const DEFAULT_RADIUS: DropRadius = { displayMeters: 5000, playMeters: 500, updatedAt: null };
const KEY = 'settings:dropRadius';

/** 계약의 검증 범위(100 ≤ display ≤ 50000, 10 ≤ play ≤ display) 밖이거나 모양이 이상하면 null */
export function sanitizeRadius(r: unknown): DropRadius | null {
  const v = r as Partial<DropRadius> | null;
  const d = Number(v?.displayMeters), p = Number(v?.playMeters);
  if (!Number.isFinite(d) || !Number.isFinite(p) || d < 100 || d > 50_000 || p < 10 || p > d) return null;
  return { displayMeters: d, playMeters: p, updatedAt: typeof v?.updatedAt === 'string' ? v.updatedAt : null };
}

export const cachedRadius = () => sanitizeRadius(kv.get<unknown>(KEY, null));

async function fetchRadius() {
  const r = sanitizeRadius(await settingsApi.dropRadius());
  if (!r) throw new Error('bad drop radius');
  kv.set(KEY, r);
  return r;
}

export function useDropRadius(): DropRadius {
  const q = useQuery({
    queryKey: ['dropRadius'],
    queryFn: fetchRadius,
    // 저장해 둔 값으로 바로 시작하되 (initialDataUpdatedAt 0 → 곧바로 새로 받음) 받기 실패해도 그 값을 그대로 쓴다
    initialData: () => cachedRadius() ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 6 * 60 * 60_000,
    gcTime: Infinity,
    retry: 1,
  });
  return q.data ?? DEFAULT_RADIUS;
}
