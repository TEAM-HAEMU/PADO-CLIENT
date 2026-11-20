/**
 * 입력 글자 수 한도 — 서버와 같은 기준(UTF-16 길이)으로 자르되, 글자(그래핌) 가운데서는 자르지 않는다.
 *
 * 서버(Jakarta @Size)는 String.length() = UTF-16 코드 유닛 수로 센다. 그래서 😀(2)·👨‍👩‍👧(8)도 그만큼 센다.
 * 예전엔 `.slice(0, N)`으로 잘라 한도에 걸린 이모지의 반쪽 서로게이트(�)가 남고 그대로 드랍됐다 (QA 2026-11-20 B-03).
 * 이제는 한도를 넘는 글자를 통째로 뺀다 → 결과는 항상 max 이하이고, 깨진 글자·반쪽 가족 이모지가 남지 않는다.
 * 카운터(`n/max`)도 같은 기준(textLength)으로 센다 — 한도에서 막히는 순간 카운터가 정확히 max/max가 되게.
 */

/** 서버와 같은 글자 수 (UTF-16 길이) */
export const textLength = (s: string): number => s.length;

type Seg = { segment(s: string): Iterable<{ segment: string }> };
let cached: Seg | null | undefined;
/** 그래핌 단위 나누기 — Intl.Segmenter가 없는 엔진(예전 Hermes)이면 null → 아래 간이 규칙으로 */
function segmenter(): Seg | null {
  if (cached !== undefined) return cached;
  try {
    const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => Seg }).Segmenter;
    cached = S ? new S(undefined, { granularity: 'grapheme' }) : null;
  } catch { cached = null; }
  return cached;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;
const ZWJ = 0x200d;
const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
/** 앞 글자에 붙는 코드 포인트 — 이게 경계 바로 뒤에 오면 앞 글자와 한 덩어리다 */
const isExtend = (cp: number) =>
  cp === ZWJ ||
  (cp >= 0xfe00 && cp <= 0xfe0f) || // 이모지/텍스트 표시 선택자
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || // 피부색
  (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe20 && cp <= 0xfe2f) || // 결합 부호 (키캡 20E3 포함)
  (cp >= 0x1160 && cp <= 0x11ff) || (cp >= 0xd7b0 && cp <= 0xd7ff) || // 한글 첫가끝 중성·종성
  (cp >= 0xe0020 && cp <= 0xe007f); // 태그 (지역 깃발)

/** i 위치에서 시작하는 코드 포인트 */
const cpAt = (s: string, i: number) => s.codePointAt(i) ?? 0;
/** end 바로 앞 코드 포인트와 그 시작 위치 */
function cpBefore(s: string, end: number): [number, number] {
  const c = s.charCodeAt(end - 1);
  if (isLow(c) && end >= 2 && isHigh(s.charCodeAt(end - 2))) return [cpAt(s, end - 2), end - 2];
  return [c, end - 1];
}

/** Intl.Segmenter 없이 — 서로게이트 쌍·ZWJ 묶음·피부색·결합 부호·국기 쌍을 가르지 않는 경계로 물린다 */
function boundaryAtOrBefore(s: string, max: number): number {
  let end = max;
  if (end > 0 && end < s.length && isHigh(s.charCodeAt(end - 1)) && isLow(s.charCodeAt(end))) end -= 1;
  for (;;) {
    if (end <= 0 || end >= s.length) return Math.max(end, 0);
    const next = cpAt(s, end);
    const [prev, prevStart] = cpBefore(s, end);
    if (isExtend(next) || prev === ZWJ) { end = prevStart; continue; }
    if (isRegional(next) && isRegional(prev)) {
      // 경계 앞의 국기 문자 개수가 홀수면 쌍의 가운데 → 하나 더 물린다
      let n = 0; let i = end;
      while (i > 0) { const [p, ps] = cpBefore(s, i); if (!isRegional(p)) break; n += 1; i = ps; }
      if (n % 2 === 1) { end = prevStart; continue; }
    }
    return end;
  }
}

/**
 * max(UTF-16 길이)를 넘지 않게 자른다. 한도에 걸린 글자는 통째로 뺀다.
 * useSegmenter=false: 간이 규칙만 (테스트용 — Intl.Segmenter가 없는 엔진과 같은 경로)
 */
export function clampText(s: string, max: number, useSegmenter = true): string {
  if (s.length <= max) return s;
  const seg = useSegmenter ? segmenter() : null;
  if (!seg) return s.slice(0, boundaryAtOrBefore(s, max));
  let end = 0;
  for (const { segment } of seg.segment(s)) {
    if (end + segment.length > max) break;
    end += segment.length;
  }
  return s.slice(0, end);
}
