/**
 * 지도에서 고른 음악 드랍 — 고른 곡이 나온 뒤 재생 곡이 다른 곡으로 바뀌면 onRelease (규칙: utils/mapSelect.ts watchPick).
 * 주변 곡 자동 재생·미니 디스크 길게 누르기(다음 곡) 등 계기는 가리지 않는다. 일시정지·같은 곡 다시 재생은 그대로.
 * 재생 곡은 구독(subscribe)으로만 본다 — 곡이 바뀔 때마다 지도 화면 전체가 다시 그려지지 않게.
 * pick: 고른 드랍과 그 곡. 투표·플리·잠긴 드랍처럼 곡을 틀지 않는 고르기는 null
 */
import { useEffect, useRef } from 'react';
import { usePreviewStore } from '@/services/preview';
import { watchPick, type PickWatch } from '@/utils/mapSelect';

export function useReleasePickOnSongChange(dropId: string | null, songId: string | null, onRelease: () => void) {
  const watch = useRef<PickWatch>(null);
  const release = useRef(onRelease);
  release.current = onRelease;
  useEffect(() => {
    const pick = dropId && songId ? { dropId, songId } : null;
    const check = (key: string | null) => {
      const r = watchPick(watch.current, pick, key);
      watch.current = r.watch;
      if (r.release) release.current();
    };
    check(usePreviewStore.getState().key);
    return usePreviewStore.subscribe((st, prev) => { if (st.key !== prev.key) check(st.key); });
  }, [dropId, songId]);
}
