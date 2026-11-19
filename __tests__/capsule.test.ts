import { capsuleChord, capsuleLineWidth, capsulePillWidth } from '@/utils/capsule';

describe('capsuleChord — 위가 반원인 알약에서 높이별 보이는 폭', () => {
  it('맨 위는 0, 반지름 높이부터는 알약 폭 그대로', () => {
    expect(capsuleChord(200, 0)).toBe(0);
    expect(capsuleChord(200, 100)).toBe(200);
    expect(capsuleChord(200, 300)).toBe(200);
  });

  it('반원 안에서는 2·√(r² − (r−y)²)', () => {
    // r = 100, y = 20 → 2·√(10000 − 6400) = 120
    expect(capsuleChord(200, 20)).toBeCloseTo(120, 6);
    // r = 50, y = 10 → 2·√(2500 − 1600) = 60
    expect(capsuleChord(100, 10)).toBeCloseTo(60, 6);
  });

  it('아래로 갈수록 넓어진다 (위 끝이 가장 좁다)', () => {
    const ws = [5, 20, 44, 80, 140].map(y => capsuleChord(286, y));
    ws.slice(1).forEach((w, i) => expect(w).toBeGreaterThan(ws[i]));
  });

  it('폭·높이가 0 이하이거나 NaN이면 0', () => {
    expect(capsuleChord(0, 20)).toBe(0);
    expect(capsuleChord(-10, 20)).toBe(0);
    expect(capsuleChord(200, -5)).toBe(0);
    expect(capsuleChord(NaN, 20)).toBe(0);
  });
});

describe('capsuleLineWidth — 한 줄 최대 폭', () => {
  it('현에서 양옆 inset을 빼고 내림한다', () => {
    expect(capsuleLineWidth(200, 20)).toBe(96); // 120 − 24
    expect(capsuleLineWidth(200, 20, 0)).toBe(120);
    expect(capsuleLineWidth(200, 20, 20)).toBe(80);
  });

  it('너무 좁으면 0 (음수 폭 없음)', () => {
    expect(capsuleLineWidth(200, 0.5)).toBe(0); // 현 ≈ 20 < 양옆 24
  });

  it('핀 미리보기 알약 — iPhone SE(안쪽 162)와 iPhone 17(안쪽 286)에서 주소 줄 < 곡 줄 < 안쪽 폭', () => {
    for (const inner of [162, 286]) {
      const address = capsuleLineWidth(inner, 20);
      const song = capsuleLineWidth(inner, 44);
      expect(address).toBeGreaterThan(0);
      expect(song).toBeGreaterThan(address);
      expect(song).toBeLessThan(inner);
    }
    expect(capsuleLineWidth(162, 20)).toBe(82);
    expect(capsuleLineWidth(286, 44)).toBe(182);
  });
});

describe('capsulePillWidth — 양 끝 둥근 작은 알약(주소 칩)의 최대 폭', () => {
  it('끝 반원 중심이 큰 원 안쪽 (R − h/2 − margin) 안에 들어오는 폭', () => {
    // R = 81, 끝 반원 중심 y = 29 → 세로 52, 닿는 거리 81 − 9 − 6 = 66 → 2·(9 + √(66² − 52²)) ≈ 99.3
    expect(capsulePillWidth(162, 20, 18)).toBe(99);
    // R = 143 → 세로 114, 닿는 거리 128 → 2·(9 + √(128² − 114²)) ≈ 134.4
    expect(capsulePillWidth(286, 20, 18)).toBe(134);
  });

  it('구한 폭의 끝 반원은 실제로 큰 원 안쪽 margin 이상 떨어져 있다', () => {
    for (const inner of [162, 220, 286]) {
      const w = capsulePillWidth(inner, 20, 18);
      const R = inner / 2;
      const d = Math.hypot(w / 2 - 9, R - 29);
      expect(d + 9).toBeLessThanOrEqual(R - 6 + 1e-9);
    }
  });

  it('위 끝 현에서 양옆 12를 뺀 것보다 넓다 (둥근 모서리만큼 여유)', () => {
    expect(capsulePillWidth(162, 20, 18)).toBeGreaterThan(capsuleLineWidth(162, 20));
  });

  it('반원 아래면 양옆 margin만 빼고, 안 들어가거나 값이 이상하면 0', () => {
    expect(capsulePillWidth(200, 150, 18)).toBe(188);
    expect(capsulePillWidth(200, 0, 18, 95)).toBe(0);
    expect(capsulePillWidth(0, 20, 18)).toBe(0);
    expect(capsulePillWidth(200, 20, 0)).toBe(0);
    expect(capsulePillWidth(200, NaN, 18)).toBe(0);
  });
});
