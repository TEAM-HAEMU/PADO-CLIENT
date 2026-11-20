/*
 * 짧은 화면 크기 계산 (QA 2026-11-20 Z-02 · Z-04 · Z-06)
 * 높이: 411dp(플립 커버·분할 화면) · 533dp(아주 작은 폰) · 667pt(iPhone SE) · 780dp(흔한 갤럭시) · 882dp(폴드 커버)
 */
import { overflows, pinCapsuleHeight, pinPlayTop, PIN_CAP_MAX, PIN_CAP_MIN, playerLayout, PLAYER_DISC_MIN, sheetMaxHeight } from '@/utils/shortScreen';

describe('sheetMaxHeight — 시트는 상단 안전영역 아래까지만', () => {
  it('화면 높이 − 안전영역 − 틈(8)', () => {
    expect(sheetMaxHeight(411, 24)).toBe(379);
    expect(sheetMaxHeight(533, 24)).toBe(501);
  });
  it('화면이 준 %는 화면 기준 숫자로, 숫자는 그대로 — 안전영역보다 크면 안전영역까지', () => {
    expect(sheetMaxHeight(800, 24, '70%')).toBe(560);
    expect(sheetMaxHeight(411, 24, '98%')).toBe(379);
    expect(sheetMaxHeight(800, 24, 300)).toBe(300);
    expect(sheetMaxHeight(411, 24, 900)).toBe(379);
  });
  it('화면 높이를 아직 모르면 화면이 준 값 그대로', () => {
    expect(sheetMaxHeight(0, 24)).toBeUndefined();
    expect(sheetMaxHeight(0, 24, '78%')).toBe('78%');
  });
  it('키보드로 창이 줄어 안전영역보다 작아져도 음수가 되지 않는다', () => {
    expect(sheetMaxHeight(20, 24)).toBe(0);
  });
});

describe('overflows', () => {
  it('보이는 높이를 모르거나 1 이하 차이는 넘치지 않은 것으로', () => {
    expect(overflows(500, 0)).toBe(false);
    expect(overflows(300.5, 300)).toBe(false);
    expect(overflows(320, 300)).toBe(true);
  });
});

describe('pinCapsuleHeight — 핀 미리보기 알약', () => {
  it('큰 화면은 Figma 421, 중간은 화면에 맞춰 줄인다 (예전과 같음)', () => {
    expect(pinCapsuleHeight(882, 24)).toBe(PIN_CAP_MAX);
    expect(pinCapsuleHeight(667, 20)).toBe(237); // iPhone SE
  });
  it('짧은 화면에서도 최소 200 — 예전엔 411dp에서 −23(사라짐), 533dp에서 99', () => {
    expect(pinCapsuleHeight(411, 24)).toBe(PIN_CAP_MIN);
    expect(pinCapsuleHeight(533, 24)).toBe(PIN_CAP_MIN);
    expect(pinCapsuleHeight(300, 24)).toBe(PIN_CAP_MIN);
  });
});

describe('pinPlayTop — 알약 안 재생 버튼', () => {
  it('넉넉하면 가운데', () => {
    expect(pinPlayTop(405, 58, 62)).toBe(173.5); // 예전 계산 (capH − 16 − 58) / 2 그대로
  });
  it('작은 알약에선 곡명 줄 아래로 내려 글자와 겹치지 않는다', () => {
    const top = pinPlayTop(PIN_CAP_MIN - 16, 58, 62);
    expect(top).toBeGreaterThanOrEqual(62 + 6);
    expect(top + 58).toBeLessThanOrEqual(PIN_CAP_MIN - 16);
  });
});

describe('playerLayout — 재생 화면 세로 배치', () => {
  const sum = (l: ReturnType<typeof playerLayout>, bubbles: number) =>
    l.disc + l.innerGap * 3 + 50 + l.waveH + 22 + 50 + l.gap + bubbles * 24 + (bubbles - 1) * 8;

  it('흔한 화면은 예전 값 그대로 (iPhone SE · 갤럭시 360×780 · 폴드 커버)', () => {
    expect(playerLayout(375, 667, 20, 0, 2)).toMatchObject({ compact: true, tight: false, disc: 220, gap: 20, innerGap: 18, waveH: 44, bubbles: 2 });
    expect(playerLayout(360, 780, 24, 24, 3)).toMatchObject({ compact: false, tight: false, disc: 306, gap: 40, waveH: 60, bubbles: 3 });
    expect(playerLayout(344, 882, 24, 24, 0)).toMatchObject({ compact: false, tight: false, disc: 290 });
  });

  it('411dp처럼 아주 짧으면 디스크를 남은 높이에 맞추고 말풍선은 하나 — 전부 화면 안에', () => {
    const l = playerLayout(411, 411, 24, 24, 0);
    expect(l.tight).toBe(true);
    expect(l.bubbles).toBe(1);
    expect(l.disc).toBeGreaterThanOrEqual(PLAYER_DISC_MIN);
    const avail = 411 - (24 + 4 + 44) - (24 + 8);
    expect(sum(l, 1)).toBeLessThanOrEqual(avail + 10); // 남는 몇 dp는 화면 스크롤로
  });

  it('533dp 작은 폰도 넘치지 않는다', () => {
    const l = playerLayout(320, 533, 24, 24, 2);
    const avail = 533 - (24 + 4 + 44) - (24 + 8);
    expect(sum(l, l.bubbles)).toBeLessThanOrEqual(avail);
  });
});
