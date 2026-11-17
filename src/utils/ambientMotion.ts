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

/** 핀 하나에 미리 만들어 두는 물결 고리 수 — 크게 그린 핀(고른·가장 가까운 핀)만 다 쓰고, 나머지는 RING_COUNT.normal개 */
export const RING_COUNT = { active: 3, normal: 2 } as const;

/**
 * 고리 i의 지금 진행(0→1, 1이면 다 퍼져 사라짐). 시계 하나(clock 0→1 반복)를 고리마다 1/rings씩 어긋나게 쓴다
 * → 고리 수가 바뀌어도(고른 핀이 바뀜) 고리를 새로 만들거나 애니메이션을 다시 걸지 않는다. i가 고리 수 이상이면 -1(그리지 않음)
 */
export function ringProgress(clock: number, i: number, rings: number) {
  'worklet';
  if (i >= rings) return -1;
  return (clock + i / rings) % 1;
}
