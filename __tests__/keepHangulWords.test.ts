import { keepHangulWords, WORD_JOINER as J } from '@/utils/text';

const strip = (s: string) => s.split(J).join('');

describe('keepHangulWords — Android 한글 어절 줄바꿈 (Z-05)', () => {
  it('어절 안 한글 사이에만 줄바꿈 금지 문자를 넣는다', () => {
    expect(keepHangulWords('들어요.')).toBe(`들${J}어${J}요${J}.`);
    expect(keepHangulWords('음악을 들어요')).toBe(`음${J}악${J}을 들${J}어${J}요`);
  });

  it('공백·줄바꿈은 그대로라 어절 사이에서는 줄이 바뀐다', () => {
    const out = keepHangulWords('바다에 남겨진 흔적을 주워,\n그 안에');
    expect(out.split(/\s/).map(strip)).toEqual(['바다에', '남겨진', '흔적을', '주워,', '그', '안에']);
    expect(out).toContain(' 남');
    expect(out).toContain(`,\n그`);
  });

  it('글자를 바꾸거나 빼지 않는다 (금지 문자를 빼면 원문)', () => {
    for (const s of ['PADO에서 만나요', '😀 좋아요 👨‍👩‍👧', '플리 3곡', '', 'abc def']) expect(strip(keepHangulWords(s))).toBe(s);
  });

  it('한글이 없는 부분·이모지 묶음은 건드리지 않는다', () => {
    expect(keepHangulWords('abc def')).toBe('abc def');
    expect(keepHangulWords('👨‍👩‍👧')).toBe('👨‍👩‍👧');
  });

  it('한 글자 덩어리(첫가끝 조합) 안에는 끼우지 않는다', () => {
    const jamo = '각'; // ᄀ+ᅡ+ᆨ = 각
    expect(keepHangulWords(jamo)).toBe(jamo);
  });

  it('두 번 적용해도 같다', () => {
    const once = keepHangulWords('숨겨진 음악들을 발견해요.');
    expect(keepHangulWords(once)).toBe(once);
  });
});
