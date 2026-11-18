/**
 * 반복 장식 애니메이션(파도 배경·도는 디스크·핀 물결)을 언제 돌릴지 — 가만히 있어도 화면을 계속 다시 그리지 않게.
 *  · 화면이 보일 때만 (가려진 화면·다른 탭·앱 백그라운드에선 그 자리에서 멈춘 정지 프레임)
 *  · 미리듣기가 재생 중일 때만 — 소개·로그인처럼 재생과 무관한 화면(always)은 보일 때 계속
 */
export function ambientRunning({ visible, playing, always = false }: { visible: boolean; playing: boolean; always?: boolean }) {
  return visible && (always || playing);
}

/** 미리듣기가 재생 중인가 (일시정지·정지면 false, 곡을 불러오는 중은 재생으로 본다) */
export const isPlaying = (s: { key: string | null; paused: boolean }) => !!s.key && !s.paused;

export interface RipplePin {
  id: string;
  latitude: number;
  longitude: number;
}

/**
 * 지도 위 물결 레이어가 화면 좌표를 잰 기준 — 물결을 그릴 핀(위치)이나 지도가 멈춘 영역이 바뀌면 달라진다.
 * 잰 좌표의 기준이 지금과 다르면 그리지 않는다 (옛 자리에 물결이 한 프레임이라도 뜨지 않게).
 * 어느 핀이 크게(고른·가장 가까운 핀) 그려지는지는 넣지 않는다 — 드랍을 고를 때마다 다시 재고 물결을 다시 만들지 않게 (고리 수만 바꾼다)
 */
export function rippleToken(pins: readonly RipplePin[], view: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null) {
  const at = view ? `${view.latitude},${view.longitude},${view.latitudeDelta},${view.longitudeDelta}` : '-';
  return `${at}|${pins.map(p => `${p.id}:${p.latitude},${p.longitude}`).join(';')}`;
}

/** 핀 하나의 물결 고리 수 — 크게 그린 핀(고른·가장 가까운 핀)은 3겹, 나머지는 2겹 */
export const RING_COUNT = { active: 3, normal: 2 } as const;

/**
 * 고리 i의 지금 진행(0→1, 1이면 다 퍼져 사라짐). 시계 하나(clock 0→1 반복)를 고리마다 1/rings씩 어긋나게 쓴다
 * → 고리를 새로 붙이거나 고리 수가 바뀌어도(고른 핀이 바뀜) 애니메이션을 다시 걸지 않는다. i가 고리 수 이상이면 -1(그리지 않음)
 */
export function ringProgress(clock: number, i: number, rings: number) {
  'worklet';
  if (i >= rings) return -1;
  return (clock + i / rings) % 1;
}

/**
 * Core Animation 반복 하나 (iOS PADOLoopView) — key 값을 from→to로 duration(ms)마다 되풀이.
 *  · easing: linear · outQuad(1-(1-t)²) · inOutSine(-(cos πt - 1)/2) — Reanimated 쪽 곡선과 같다
 *  · autoreverse: to에 닿으면 같은 시간에 거슬러 돌아온다 (Reanimated withRepeat(…, -1, true))
 *  · phase: 처음부터 이만큼(0~1) 앞서 시작 · sync: 앱 전체 시계 하나를 함께 쓴다 (물결 고리들이 서로 어긋난 채로 맞물리게)
 */
export interface Loop {
  key: 'rotate' | 'translateX' | 'translateY' | 'scaleX' | 'scaleY' | 'opacity';
  from: number;
  to: number;
  duration: number;
  easing?: 'linear' | 'outQuad' | 'inOutSine';
  autoreverse?: boolean;
  phase?: number;
  sync?: boolean;
}

/** 도는 디스크 — duration마다 한 바퀴 */
export const spinLoops = (duration: number): Loop[] => [{ key: 'rotate', from: 0, to: 360, duration }];

/** 핀 물결 한 겹 (81×29 납작한 타원, 2.6초) */
export const RIPPLE = { w: 81, h: 29, duration: 2600 } as const;

/**
 * 핀 물결 고리 i의 Core Animation — WaveRing(Reanimated)과 같은 모습: 진행 t = ringProgress(시계, i, rings),
 * e = outQuad(t) → 크기 0.15+0.85e (세로는 29/81배), 투명도 0.85(1-e). 고리들은 시계 하나를 i/rings씩 어긋나게 쓴다
 */
export function ringLoops(i: number, rings: number): Loop[] {
  const phase = i / rings;
  const k = RIPPLE.h / RIPPLE.w;
  const base = { duration: RIPPLE.duration, easing: 'outQuad' as const, phase, sync: true };
  return [
    { key: 'scaleX', from: 0.15, to: 1, ...base },
    { key: 'scaleY', from: 0.15 * k, to: k, ...base },
    { key: 'opacity', from: 0.85, to: 0, ...base },
  ];
}

/** 파도 배경이 한 번 흘러가는 시간 — 두 폭만큼 흘러 처음 그림으로 돌아온다 */
export const WAVE_FLOW_MS = 8000;

/**
 * 파도 배경 한 겹의 Core Animation — Wave(Reanimated)와 같은 모습.
 *  · 흐름: translateX 0 → -2·폭, 8초 직선 반복
 *  · 뒤 겹: translateY (출렁임 -18 / 보통 -7) + 일렁임 × (18 / 10), 일렁임은 sin 곡선 왕복 (0.8 / 2초)
 *  · 앞 겹: translateY 2 - 일렁임 × (18 / 11), scaleY 1 + 일렁임 × (0.1 / 0.07), 왕복 (0.8 / 1.333초)
 */
export function waveLoops(layer: 'back' | 'front', width: number, surge: boolean): Loop[] {
  const flow: Loop = { key: 'translateX', from: 0, to: -width * 2, duration: WAVE_FLOW_MS };
  const bob = { easing: 'inOutSine' as const, autoreverse: true, duration: surge ? 800 : layer === 'back' ? 2000 : 1333 };
  if (layer === 'back') return [flow, { key: 'translateY', from: surge ? -18 : -7, to: surge ? 0 : 3, ...bob }];
  return [flow, { key: 'translateY', from: 2, to: 2 - (surge ? 18 : 11), ...bob }, { key: 'scaleY', from: 1, to: 1 + (surge ? 0.1 : 0.07), ...bob }];
}
