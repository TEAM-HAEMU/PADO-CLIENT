/**
 * 지도 주변 곡 자동 재생 — 지금 위치에서 가장 가까운, 아직 안 들은 음악 드랍부터 30초 미리듣기를 흘려준다.
 *  - 한 곡이 끝나면 그때 위치 기준으로 가장 가까운 안 들은 드랍으로 (걸어가면 새로 가까워진 곡이 먼저). 다 들었으면 처음부터 다시
 *  - 다음 곡 미리듣기 주소를 미리 찾아 플레이어에 '이어 틀 곡'으로 넘겨 둔다 → 곡이 끝나면 플레이어가 끊김 없이 바로 이어 튼다
 *    (백그라운드에서 소리가 한 번 끊기면 iOS가 앱을 재워 다음 곡으로 못 넘어가기 때문)
 *  - 다른 곡(핀 미리보기·목록 미리듣기 등)이 재생 중이면 끼어들지 않고, 비면 이어서 시작
 *  - 지도 화면을 벗어나면 다음 곡으로 넘어가지 않음(지금 곡은 끝까지). 앱을 내려도(백그라운드) 계속 이어짐 (위치는 앱을 내리기 전 기준)
 *  - 미리듣기가 없는 곡은 건너뛰고, iTunes 조회가 막히거나 재생 오류가 나면 잠시 쉬었다가 다음 곡 (연속 실패가 쌓이면 대기를 늘리다 멈춤)
 *  - 틀 수 있는 곡이 없으면 멈추고, 주변 곡 목록이 바뀔 때 다시 본다 (규칙: utils/autoplayPlan.ts)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicDropSummary } from '@/api/types';
import { findPreview } from '@/services/previewSource';
import { startPreview, stopPreviewFor, usePreviewStore } from '@/services/preview';
import { usePrefs } from '@/store/prefs';
import { track } from '@/services/analytics';
import { decideAutoplay, emptyPlan, markHeard, markSkipped, recordOutcome, songSetKey, upNextCandidates, type AutoplayPlan } from '@/utils/autoplayPlan';

/** drops는 가까운 순으로 정렬돼 있어야 한다 */
export function useNearbyAutoplay(drops: MusicDropSummary[], active: boolean) {
  const enabled = usePrefs(s => s.autoplayNearby);
  // 곡별로 들은 곡·미리듣기 없는 곡·일시적 실패와 대기 시간 (결정 규칙은 utils/autoplayPlan.ts)
  const plan = useRef<AutoplayPlan>(emptyPlan());
  // plan이 바뀔 때·대기가 끝날 때 다음 차례를 다시 고르게 하는 신호
  const [turn, setTurn] = useState(0);
  const bump = () => setTurn(t => t + 1);
  // 사용자가 지도에서 일시정지함 — 풀 때까지 다음 곡으로도 넘어가지 않음
  const [held, setHeld] = useState(false);
  // 자동 재생으로 튼 곡 id (다른 곳에서 튼 곡과 구분)
  const ours = useRef<string | null>(null);
  // 미리듣기 주소를 찾는 중인 자동 재생 곡 — 그동안 같은 곡을 또 시작하지 않는다
  const starting = useRef<string | null>(null);
  // 플레이어에 '이어 틀 곡'으로 넘겨 둔 곡 id
  const queued = useRef<string | null>(null);
  const key = usePreviewStore(s => s.key);
  const paused = usePreviewStore(s => s.paused);
  const endedKey = usePreviewStore(s => s.endedKey);
  const lastError = usePreviewStore(s => s.lastError);
  // 곡 집합 (순서 무관) — 가까운 순서만 바뀐 GPS 갱신으로는 결정을 다시 하지 않는다
  const songs = useMemo(() => songSetKey(drops), [drops]);
  const run = enabled && active && !held && drops.length > 0;

  // ── 아래 두 효과는 다음 곡을 고르는 효과보다 먼저 선언해야 한다 (같은 렌더에서 효과는 선언 순서대로 실행) ──
  // 곡이 끝나거나 오류가 나면 key가 비는 같은 렌더에서 결정 효과도 돈다. 그 전에 결과를 plan에 넣어야 같은 곡을 다시 고르지 않는다

  // 자동 재생 곡이 끝나면 들은 곡으로 표시. 플레이어가 이어 틀 곡으로 넘어갔으면 그 곡을 자동 재생 곡으로 이어받는다
  useEffect(() => {
    if (!endedKey || endedKey !== ours.current) return;
    plan.current = markHeard(plan.current, endedKey);
    const now = usePreviewStore.getState().key;
    if (now && now === queued.current) {
      ours.current = now;
      plan.current = recordOutcome(plan.current, now, 'ok', Date.now());
      const d = drops.find(x => x.songId === now);
      track('nearby_autoplay_play', { drop_id: d?.droppingId, song_id: now, nearby_count: drops.length, handoff: true });
    }
    queued.current = null;
    bump();
  }, [endedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 재생 곡이 재생 중 오류를 내면 실패로 기록 → 쉬었다가 다음 곡 (같은 곡을 곧바로 다시 틀지 않게)
  useEffect(() => {
    if (!lastError || lastError.key !== ours.current) return;
    plan.current = recordOutcome(plan.current, lastError.key, 'error', Date.now());
    if (queued.current) queued.current = null;
    bump();
  }, [lastError]);

  // 재생 중인 곡이 없을 때만 지금 차례 곡을 시작
  useEffect(() => {
    if (!run || starting.current) return;
    if (usePreviewStore.getState().key) return; // 누군가 재생 중(자동 재생 곡 포함) — 끝나거나 멈출 때까지 기다림
    const d = decideAutoplay(drops, plan.current, Date.now());
    plan.current = d.plan;
    if (d.type === 'idle') return; // 틀 곡이 없다 — 곡 집합이 바뀔 때 다시 본다
    if (d.type === 'wait') {
      const t = setTimeout(bump, d.ms);
      return () => clearTimeout(t);
    }
    const drop = d.drop;
    ours.current = drop.songId;
    starting.current = drop.songId;
    startPreview({ id: drop.songId, title: drop.title, artist: drop.artist, albumImagePath: drop.albumImageUrl, previewUrl: drop.previewUrl, dropId: drop.droppingId, autoplay: true })
      .catch(() => 'unavailable' as const)
      .then(r => {
        starting.current = null;
        plan.current = recordOutcome(plan.current, drop.songId, r, Date.now());
        if (r === 'ok') track('nearby_autoplay_play', { drop_id: drop.droppingId, song_id: drop.songId, nearby_count: drops.length });
        bump();
      });
  }, [run, songs, key, turn]); // eslint-disable-line react-hooks/exhaustive-deps -- drops는 순서만 바뀌는 GPS 갱신마다 새 배열. 결정할 때 그 렌더의 최신 drops를 읽으면 충분

  // 자동 재생 곡이 흐르는 동안 다음 곡(지금 위치 기준)을 골라 미리듣기 주소를 찾아 '이어 틀 곡'으로 넘겨 둔다.
  // 앱을 켜 둔 채 걷다가 위치가 바뀌어 더 가까운 곡이 생기면 다시 고른다
  useEffect(() => {
    const st = usePreviewStore.getState();
    if (!run || !ours.current || key !== ours.current) { if (queued.current && st.upNext?.key === queued.current) st.setUpNext(null); queued.current = null; return; }
    // 미리듣기가 없는 곡은 건너뛰고 다음 후보로 — 이어 틀 곡을 못 정하면 곡이 끝날 때 백그라운드에서 끊긴다
    const candidates = upNextCandidates(drops, plan.current, key);
    if (!candidates.length || st.upNext?.key === candidates[0].songId) return;
    let alive = true;
    (async () => {
      for (const next of candidates) {
        const r = await findPreview({ id: next.songId, title: next.title, artist: next.artist, previewUrl: next.previewUrl }).catch(() => null);
        const now = usePreviewStore.getState();
        if (!alive || now.key !== ours.current) return;
        if (r?.previewUrl) {
          queued.current = next.songId;
          now.setUpNext({ key: next.songId, url: r.previewUrl, meta: { title: next.title, artist: next.artist, image: next.albumImageUrl, dropId: next.droppingId, autoplay: true } });
          return;
        }
        if (r && !r.unavailable) plan.current = markSkipped(plan.current, next.songId); // 미리듣기 없는 곡 — 다음부터 건너뜀
      }
    })();
    return () => { alive = false; };
  }, [run, key, drops, turn]); // turn: plan(ref)이 바뀌면 후보를 다시 고른다

  // 자동 재생을 끄면 자동 재생 곡은 멈춘다. 지도를 벗어나도 지금 곡은 계속(다음 곡으로만 안 넘어감) —
  // 드랍 만들기 창·핀을 열어도 같은 곡이면 끊기지 않게
  useEffect(() => {
    if (enabled) return;
    const st = usePreviewStore.getState();
    if (ours.current && st.key === ours.current) st.stop();
  }, [enabled]);

  const playingOurs = !!ours.current && key === ours.current;
  const nowDrop = playingOurs ? drops.find(d => d.songId === key) ?? null : null;

  return {
    enabled,
    /** 지금 자동 재생 중인(또는 지도에서 일시정지한) 드랍 */
    nowDrop,
    playing: playingOurs && !paused,
    /** 지도에서 일시정지해 둔 상태 (다른 화면에 다녀와도 유지 — 재생 버튼으로 다시 시작) */
    held,
    /** 지도에서 일시정지/재개 */
    toggle: () => {
      const st = usePreviewStore.getState();
      if (playingOurs) { setHeld(!st.paused); st.toggle(); return; }
      setHeld(false);
    },
    /** 다음 주변 곡 — 지금 무엇이 나오든 멈추고 다음 차례로 */
    next: () => {
      track('nearby_autoplay_next', { from_song_id: usePreviewStore.getState().key });
      setHeld(false);
      const st = usePreviewStore.getState();
      if (st.key) plan.current = markHeard(plan.current, st.key);
      else if (starting.current) {
        // 미리듣기 주소를 찾는 중인 곡을 넘김 — 찾은 뒤에 재생되지 않게 요청도 거둔다
        plan.current = markHeard(plan.current, starting.current);
        stopPreviewFor(starting.current);
      } else {
        // 쉬는 중이면 지금 차례였던 곡을 넘기고 곧바로 다음 곡으로 (대기도 풀림)
        const d = decideAutoplay(drops, { ...plan.current, resumeAt: 0 }, Date.now());
        plan.current = d.type === 'play' ? markHeard(d.plan, d.drop.songId) : d.plan;
      }
      bump();
      if (st.key) st.stop();
    },
  };
}
