/**
 * 전체 재생·셔플 대기열 — 재생 화면이 아니라 앱 전체에서 진행한다.
 * 예전엔 다음 곡으로 넘기는 일을 PlayerScreen이 했다(mounted 조건) → 플레이어를 닫으면 30초 미리듣기가 끝난 뒤 멈췄다 (QA 2026-11-20 B-04).
 *
 * - 곡이 잘 나오면 다음 곡의 미리듣기 주소를 미리 찾아 preview 스토어 upNext에 넣는다 → 끝나는 순간 플레이어가 주소만 바꿔 끼운다
 *   (백그라운드에서 소리가 끊기지 않게 — 끊기면 iOS가 앱을 재워 다음 곡을 못 튼다)
 * - upNext를 못 채웠으면 끝난 뒤(endedKey) 다음 곡을 직접 튼다
 * - 미리듣기가 없는 곡은 건너뛰고, 조회 불가·재생 오류는 알린 뒤 넘긴다. 연속 QUEUE_MAX_FAILS곡을 못 틀면 멈춘다(망이 끊김 등)
 * - 사용자가 대기열 밖의 곡을 틀면(주변 곡·다른 드랍) 대기열을 놓는다
 * preview.tsx는 고치지 않는다 — 스토어의 공개 동작(startPreview·setUpNext·endedKey·lastError)만 쓴다
 */
import { create } from 'zustand';
import { songApi } from '@/api/endpoints';
import type { Song, UUID } from '@/api/types';
import { queryClient } from '@/hooks/queryClient';
import { toast } from '@/store/toast';
import { startPreview, usePreviewStore } from './preview';
import { findPreview } from './previewSource';

/** 연속으로 이만큼 못 틀면 다음 곡으로 넘기지 않고 멈춘다 */
export const QUEUE_MAX_FAILS = 3;
/** 못 튼 곡을 잠깐 보여 준 뒤 넘긴다 */
export const QUEUE_SKIP_MS = 1200;

interface QueueState {
  /** 대기열 곡 id (없으면 대기열 없음) */
  ids: UUID[];
  dropId?: UUID;
  /** 지금 대기열에서 틀고 있는(또는 틀려는) 곡 */
  current: UUID | null;
}
export const usePlayQueue = create<QueueState>(() => ({ ids: [], current: null }));

let fails = 0;
let skipTimer: ReturnType<typeof setTimeout> | undefined;
/** upNext로 미리 넣어 둔 다음 곡 — 끝나서 플레이어가 그 곡으로 바꿔 끼우면 current를 따라 옮긴다 */
let queuedNext: UUID | null = null;

const songKey = (id: UUID) => ['song', id] as const; // hooks/api qk.song과 같은 키 — 재생 화면이 받아 둔 곡을 다시 받지 않는다
const getSong = (id: UUID) => queryClient.fetchQuery({ queryKey: songKey(id), queryFn: () => songApi.get(id), staleTime: Infinity });
const nextOf = (id: UUID) => { const { ids } = usePlayQueue.getState(); const i = ids.indexOf(id); return i >= 0 ? ids[i + 1] : undefined; };
const isCurrent = (id: UUID) => usePlayQueue.getState().current === id;

function clearUpNext() {
  const st = usePreviewStore.getState();
  if (queuedNext && st.upNext?.key === queuedNext) st.setUpNext(null);
  queuedNext = null;
}

/** 다음 곡을 upNext로 — 지금 곡이 아직 그 곡일 때만 */
async function prefetchNext(from: UUID) {
  const next = nextOf(from);
  if (!next) return;
  try {
    const song = await getSong(next);
    const r = await findPreview(song);
    if (!isCurrent(from) || usePreviewStore.getState().key !== from || !r.previewUrl) return;
    queuedNext = next;
    usePreviewStore.getState().setUpNext({ key: next, url: r.previewUrl, meta: { title: song.title, artist: song.artist, image: song.albumImagePath, dropId: usePlayQueue.getState().dropId } });
  } catch { /* 못 채우면 끝난 뒤 직접 튼다 */ }
}

/** from 곡을 못 틀었거나 미리듣기가 없을 때 잠시 뒤 다음 곡으로 — 그 사이 다른 곡으로 넘어갔으면 무시 */
function skipFrom(from: UUID, failed: boolean) {
  const next = nextOf(from);
  if (!next) return;
  if (failed && ++fails >= QUEUE_MAX_FAILS) return;
  clearTimeout(skipTimer);
  skipTimer = setTimeout(() => { if (isCurrent(from)) playAt(next); }, QUEUE_SKIP_MS);
}

async function playAt(id: UUID) {
  clearTimeout(skipTimer);
  clearUpNext();
  usePlayQueue.setState({ current: id });
  let song: Song;
  try { song = await getSong(id); } catch {
    if (!isCurrent(id)) return;
    toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error');
    return skipFrom(id, true);
  }
  if (!isCurrent(id)) return;
  const r = await startPreview({ ...song, dropId: usePlayQueue.getState().dropId }).catch(() => 'unavailable' as const);
  if (!isCurrent(id)) return;
  if (r === 'ok') return void prefetchNext(id);
  if (r === 'none' || r === 'adult') return skipFrom(id, false);
  if (r === 'unavailable') { toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error'); skipFrom(id, true); }
}

/** 대기열 재생 시작 — 같은 대기열이 이미 그 곡에 있으면(재생 화면을 다시 엶) 그대로 둔다 */
export function playQueue(ids: UUID[], startId: UUID, dropId?: UUID) {
  const st = usePlayQueue.getState();
  if (st.current === startId && st.ids.length === ids.length && st.ids.every((x, i) => x === ids[i])) return;
  fails = 0;
  usePlayQueue.setState({ ids, dropId, current: null });
  ensureSubscribed();
  playAt(startId);
}

/** 사용자가 대기열의 이전·다음 곡을 직접 고름 — 연속 실패로 멈춘 대기열도 다시 이어진다 */
export function jumpTo(id: UUID) {
  if (!usePlayQueue.getState().ids.includes(id)) return;
  fails = 0;
  playAt(id);
}

/** 사용자가 직접 재생·일시정지를 누름 — 연속 실패로 멈춘 대기열도 다시 이어진다 */
export function resetQueueFails() { fails = 0; }

export function clearQueue() {
  clearTimeout(skipTimer);
  clearUpNext();
  fails = 0;
  usePlayQueue.setState({ ids: [], dropId: undefined, current: null });
}

let unsub: (() => void) | null = null;
function ensureSubscribed() {
  if (unsub) return;
  unsub = usePreviewStore.subscribe((s, prev) => {
    const { current, ids } = usePlayQueue.getState();
    if (!current) return;
    // 끝까지 나옴 — upNext로 이미 다음 곡이 이어졌으면 따라가고, 아니면 직접 튼다
    if (s.endedKey !== prev.endedKey && s.endedKey === current) {
      fails = 0;
      if (queuedNext && s.key === queuedNext) {
        const now = queuedNext;
        queuedNext = null;
        usePlayQueue.setState({ current: now });
        prefetchNext(now);
        return;
      }
      const next = nextOf(current);
      if (next) playAt(next);
      else usePlayQueue.setState({ current: null }); // 마지막 곡까지 들음
      return;
    }
    // 재생 중 오류(주소 만료 등 — 토스트는 플레이어가 띄운다) → 다음 곡으로
    if (s.lastError !== prev.lastError && s.lastError?.key === current) return skipFrom(current, true);
    // 대기열 밖의 곡을 틀었다 — 대기열을 놓는다
    if (s.key !== prev.key && s.key && !ids.includes(s.key)) clearQueue();
  });
}

/** 테스트용 — 모듈 상태 초기화 */
export function _resetQueueForTest() {
  clearQueue();
  unsub?.();
  unsub = null;
}
