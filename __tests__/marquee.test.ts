/* 흐르는 한 줄 — 폭 안이면 그대로, 넘치면 (글 폭 + 간격)만큼 일정한 속도로, 동작 줄이기면 흐르지 않는다 */
import { marqueeLoop } from '@/utils/marquee';

describe('marqueeLoop', () => {
  it('폭 안에 들어가면 흐르지 않는다', () => {
    expect(marqueeLoop(200, 180)).toBeNull();
    expect(marqueeLoop(200, 201)).toBeNull(); // 반올림 차이 1px은 들어간 것으로
  });
  it('넘치면 글 폭 + 간격만큼, 속도에 맞춰 흐른다', () => {
    expect(marqueeLoop(200, 320, { gap: 40, speed: 32 })).toEqual({ dist: 360, duration: 11250 });
  });
  it('긴 글일수록 한 바퀴가 길다 (속도는 같다)', () => {
    const a = marqueeLoop(200, 300)!;
    const b = marqueeLoop(200, 600)!;
    expect(b.duration / b.dist).toBeCloseTo(a.duration / a.dist, 1);
    expect(b.duration).toBeGreaterThan(a.duration);
  });
  it('동작 줄이기가 켜져 있으면 흐르지 않는다', () => expect(marqueeLoop(200, 320, { reduced: true })).toBeNull());
  it('폭을 아직 모르면(0) 흐르지 않는다', () => expect(marqueeLoop(0, 320)).toBeNull());
});
