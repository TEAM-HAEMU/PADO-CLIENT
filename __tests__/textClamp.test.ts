/* 입력 글자 수 한도 — 서로게이트 쌍·이모지 묶음을 가르지 않고, 서버 기준(UTF-16 길이)을 넘지 않게 (QA 2026-11-20 B-03) */
import { clampText, textLength } from '@/utils/text';

const ga = (n: number) => '가'.repeat(n);
/** 짝 없는 서로게이트가 남았는지 */
const lone = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const FAMILY = '👨‍👩‍👧'; // 8 UTF-16 (👨 ZWJ 👩 ZWJ 👧)

describe.each([['Intl.Segmenter', true], ['간이 규칙 (Segmenter 없는 엔진)', false]])('%s', (_name, seg) => {
  const clamp = (s: string, max: number) => clampText(s, max, seg as boolean);

  test('한도 안이면 그대로', () => {
    expect(clamp('안녕 😀', 255)).toBe('안녕 😀');
    expect(clamp('', 10)).toBe('');
  });

  test('QA 재현 — 254자 + 😀👨‍👩‍👧 → 😀 앞 반쪽(�)이 남지 않는다', () => {
    const out = clamp(ga(254) + '😀' + FAMILY, 255);
    expect(out).toBe(ga(254));
    expect(lone(out)).toBe(false);
  });

  test('😀가 딱 들어가면 넣는다 (253 + 2 = 255)', () => {
    expect(clamp(ga(253) + '😀' + FAMILY, 255)).toBe(ga(253) + '😀');
  });

  test('가족 이모지는 가운데(ZWJ 앞뒤)에서 자르지 않는다', () => {
    for (let k = 1; k < 8; k++) {
      const out = clamp(ga(10) + FAMILY, 10 + k);
      expect(out).toBe(ga(10));
    }
    expect(clamp(ga(10) + FAMILY + '!', 18)).toBe(ga(10) + FAMILY);
  });

  test('피부색·표시 선택자·키캡·결합 부호도 앞 글자와 함께', () => {
    expect(clamp('ab👍🏽', 4)).toBe('ab'); // 👍(2)+🏽(2)
    expect(clamp('ab❤️', 3)).toBe('ab'); // ❤(1)+FE0F(1)
    expect(clamp('ab1️⃣', 4)).toBe('ab'); // 1 + FE0F + 20E3
    expect(clamp('abe\u0301', 3)).toBe('ab'); // e + 결합 악센트(U+0301)
  });

  test('국기(지역 문자 두 개)는 반만 남기지 않는다', () => {
    expect(clamp('🇰🇷🇯🇵', 6)).toBe('🇰🇷'); // 각 4
    expect(clamp('🇰🇷🇯🇵', 4)).toBe('🇰🇷');
    expect(clamp('a🇰🇷', 3)).toBe('a');
  });

  test('어떤 길이로 잘라도 결과는 max 이하이고 깨진 글자가 없다', () => {
    const s = `한마디 😀${FAMILY}👍🏽🇰🇷 끝 ❤️ e\u0301 1️⃣`;
    for (let max = 0; max <= s.length; max++) {
      const out = clamp(s, max);
      expect(textLength(out)).toBeLessThanOrEqual(max);
      expect(lone(out)).toBe(false);
      expect(s.startsWith(out)).toBe(true);
    }
  });
});

test('글자 수는 서버(@Size = String.length)와 같은 UTF-16 길이', () => {
  expect(textLength('가나다')).toBe(3);
  expect(textLength('😀')).toBe(2);
  expect(textLength(FAMILY)).toBe(8);
});

test('간이 규칙은 Intl.Segmenter와 같은 자리에서 자른다 (이모지·국기·결합 부호 섞인 글)', () => {
  const s = `파도 😀${FAMILY}👍🏽 🇰🇷🇯🇵 ❤️ é 1️⃣ 끝`;
  for (let max = 0; max <= s.length; max++) expect(clampText(s, max, false)).toBe(clampText(s, max, true));
});
