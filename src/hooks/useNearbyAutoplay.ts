/**
 * 지도 주변 곡 자동 재생 — 가까운 음악 드랍부터 차례로 30초 미리듣기를 흘려준다.
 *  - 한 곡이 끝나면 다음 드랍으로, 목록 끝이면 처음부터 다시
 *  - 다른 곡(핀 미리보기·목록 미리듣기 등)이 재생 중이면 끼어들지 않고, 비면 이어서 시작
 *  - 지도 화면을 벗어나면 다음 곡으로 넘어가지 않음(지금 곡은 끝까지). 앱을 내려도(백그라운드) 다음 곡으로 계속 이어짐
 *  - 미리듣기가 없는 곡은 건너뛰고, iTunes 조회가 막히면 잠시 쉬었다가 다음 곡
 */
import { useEffect, useRef, useState } from 'react';
import type { MusicDropSummary } from '@/api/types';
import { findItunes } from '@/services/itunes';
import { startPreview, usePreviewStore } from '@/services/preview';
import { usePrefs } from '@/store/prefs';
import { track } from '@/services/analytics';

export function useNearbyAutoplay(drops: MusicDropSummary[], active: boolean) {
  const enabled = usePrefs(s => s.autoplayNearby);
  const [idx, setIdx] = useState(0);
  // 사용자가 지도에서 일시정지함 — 풀 때까지 다음 곡으로도 넘어가지 않음
  const [held, setHeld] = useState(false);
  // 자동 재생으로 튼 곡 id (다른 곳에서 튼 곡과 구분)
  const ours = useRef<string | null>(null);
  const key = usePreviewStore(s => s.key);
  const paused = usePreviewStore(s => s.paused);
  const endedKey = usePreviewStore(s => s.endedKey);

  const current = drops.length ? drops[idx % drops.length] : null;
  const run = enabled && active && !held && !!current;

  // 재생 중인 곡이 없을 때만 지금 차례 곡을 시작
  useEffect(() => {
    if (!run || !current) return;
    const st = usePreviewStore.getState();
    if (st.key) return; // 누군가 재생 중(자동 재생 곡 포함) — 끝나거나 멈출 때까지 기다림
    if (st.endedKey && st.endedKey === current.songId && st.endedKey === ours.current) return; // 방금 끝난 곡 — 다음 차례로 넘어가는 중
    let alive = true;
    let skip: ReturnType<typeof setTimeout> | undefined;
    ours.current = current.songId;
    track('nearby_autoplay_play', { drop_id: current.droppingId, song_id: current.songId, index: idx % drops.length, nearby_count: drops.length });
    startPreview({ id: current.songId, title: current.title, artist: current.artist, albumImagePath: current.albumImageUrl }).then(r => {
      if (!alive) return;
      if (r === 'none') skip = setTimeout(() => setIdx(i => i + 1), 800);
      else if (r === 'unavailable') skip = setTimeout(() => setIdx(i => i + 1), 15_000);
    });
    return () => { alive = false; if (skip) clearTimeout(skip); };
  }, [run, current?.songId, key, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지금 곡이 흐르는 동안 다음 곡 미리듣기 주소를 미리 찾아 둔다 — 곡이 끝나면 조회 없이 바로 이어서
  // (백그라운드에서 곡 사이에 소리가 끊기면 iOS가 앱을 잠시 멈춰 다음 곡으로 못 넘어가기 때문)
  useEffect(() => {
    if (!ours.current || key !== ours.current || drops.length < 2) return;
    const next = drops[(idx + 1) % drops.length];
    if (next && next.songId !== key) findItunes(next.title, next.artist).catch(() => {});
  }, [key, idx, drops]);

  // 자동 재생 곡이 끝까지 재생되면 다음 드랍
  useEffect(() => {
    if (endedKey && endedKey === ours.current) setIdx(i => i + 1);
  }, [endedKey]);

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
      setIdx(i => i + 1);
      const st = usePreviewStore.getState();
      if (st.key) st.stop();
    },
  };
}
