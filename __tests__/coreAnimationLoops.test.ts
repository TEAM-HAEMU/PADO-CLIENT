/**
 * iOS Core Animation 반복(PADOLoopView)이 Reanimated로 그리던 모습과 같은지 — 같은 시각에 같은 값.
 * 네이티브 쪽 계산을 그대로 흉내 낸다: 진행 u = (경과/주기 + phase) % 1, 곡선은 linear·outQuad(1-(1-u)²)·inOutSine,
 * autoreverse면 한 주기(duration) 갔다가 같은 시간에 돌아온다.
 */
import { type Loop, RING_COUNT, ringLoops, ringProgress, RIPPLE, spinLoops, WAVE_FLOW_MS, waveLoops } from '@/utils/ambientMotion';

const ease = {
  linear: (u: number) => u,
  outQuad: (u: number) => 1 - (1 - u) * (1 - u),
  inOutSine: (u: number) => -(Math.cos(Math.PI * u) - 1) / 2,
};
/** 시각 t(ms)의 값 — PADOLoopView.m과 같은 계산 */
function valueAt(l: Loop, t: number) {
  const cycle = l.duration * (l.autoreverse ? 2 : 1);
  const local = ((t + (l.phase ?? 0) * cycle) % cycle) / l.duration; // 0~1 (autoreverse면 0~2)
  const u = local <= 1 ? local : 2 - local;
  return l.from + (l.to - l.from) * ease[l.easing ?? 'linear'](u);
}
const get = (loops: Loop[], key: Loop['key']) => loops.find(l => l.key === key)!;

describe('핀 물결 고리 (ringLoops) — WaveRing과 같은 모습', () => {
  it('어느 시각이든 크기·투명도가 Reanimated 고리와 같다 (보통 2겹 · 고른 핀 3겹)', () => {
    for (const rings of [RING_COUNT.normal, RING_COUNT.active]) {
      for (let i = 0; i < rings; i++) {
        const loops = ringLoops(i, rings);
        for (let t = 0; t < RIPPLE.duration * 2; t += 97) {
          const p = ringProgress((t % RIPPLE.duration) / RIPPLE.duration, i, rings);
          const e = 1 - (1 - p) * (1 - p);
          const s = 0.15 + 0.85 * e;
          expect(valueAt(get(loops, 'scaleX'), t)).toBeCloseTo(s, 6);
          expect(valueAt(get(loops, 'scaleY'), t)).toBeCloseTo(s * (RIPPLE.h / RIPPLE.w), 6);
          expect(valueAt(get(loops, 'opacity'), t)).toBeCloseTo(0.85 * (1 - e), 6);
        }
      }
    }
  });
  it('고리들은 앱 전체 시계 하나를 함께 쓴다 (sync) — 고른 핀이 바뀌어 고리가 붙어도 서로 어긋난 채로', () => {
    for (const l of ringLoops(2, 3)) expect(l.sync).toBe(true);
  });
});

describe('도는 디스크 (spinLoops)', () => {
  it('duration마다 한 바퀴, 직선', () => {
    const [l] = spinLoops(8000);
    expect(valueAt(l, 0)).toBe(0);
    expect(valueAt(l, 2000)).toBeCloseTo(90);
    expect(valueAt(l, 8000 + 4000)).toBeCloseTo(180);
  });
});

describe('파도 배경 (waveLoops) — Wave(Reanimated)와 같은 모습', () => {
  const W = 486.247;
  // Wave.tsx: 흐름 v(8초 직선 0→1), 일렁임 b(sin 왕복)
  const flow = (t: number) => (t % WAVE_FLOW_MS) / WAVE_FLOW_MS;
  const bob = (t: number, d: number) => {
    const local = (t % (2 * d)) / d;
    return ease.inOutSine(local <= 1 ? local : 2 - local);
  };
  for (const surge of [false, true]) {
    it(`뒤 겹 · ${surge ? '출렁임' : '보통'}`, () => {
      const loops = waveLoops('back', W, surge);
      const d = surge ? 800 : 2000;
      for (let t = 0; t < 16000; t += 131) {
        expect(valueAt(get(loops, 'translateX'), t)).toBeCloseTo(-flow(t) * W * 2, 4);
        expect(valueAt(get(loops, 'translateY'), t)).toBeCloseTo((surge ? -18 : -7) + bob(t, d) * (surge ? 18 : 10), 4);
      }
    });
    it(`앞 겹 · ${surge ? '출렁임' : '보통'}`, () => {
      const loops = waveLoops('front', 504.781, surge);
      const d = surge ? 800 : 1333;
      for (let t = 0; t < 16000; t += 131) {
        expect(valueAt(get(loops, 'translateY'), t)).toBeCloseTo(2 - bob(t, d) * (surge ? 18 : 11), 4);
        expect(valueAt(get(loops, 'scaleY'), t)).toBeCloseTo(1 + bob(t, d) * (surge ? 0.1 : 0.07), 4);
      }
    });
  }
  it('흐름은 출렁임 세기와 상관없이 같은 설정 — 재생을 멈추고 틀어도 파도가 처음으로 돌아가지 않는다', () => {
    expect(get(waveLoops('back', W, true), 'translateX')).toEqual(get(waveLoops('back', W, false), 'translateX'));
  });
});
