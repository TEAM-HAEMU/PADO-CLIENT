/**
 * 흐르는 한 줄(Marquee)의 한 바퀴 — 글 폭이 보이는 폭보다 길 때만 흐른다.
 * 같은 글을 gap 간격으로 두 벌 붙여 dist(= 글 폭 + gap)만큼 가면 처음 모습과 같아져 이음매 없이 반복된다.
 * 네이티브 의존 없음 (jest에서 바로 시험)
 */
export function marqueeLoop(width: number, textW: number, opts: { reduced?: boolean; gap?: number; speed?: number } = {}) {
  const { reduced = false, gap = 40, speed = 32 } = opts;
  // 1px 여유 — 재는 값의 반올림 차이로 딱 맞는 글이 흐르지 않게
  if (reduced || !(width > 0) || !(textW > width + 1) || !(speed > 0)) return null;
  const dist = textW + gap;
  return { dist, duration: Math.round((dist / speed) * 1000) };
}
