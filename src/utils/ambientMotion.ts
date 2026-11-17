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
  /** 가장 가까운(고른) 핀 — 물결 세 겹 */
  active: boolean;
}

/**
 * 지도 위 물결 레이어가 화면 좌표를 잰 기준 — 핀(위치·크기)이나 지도가 멈춘 영역이 바뀌면 달라진다.
 * 잰 좌표의 기준이 지금과 다르면 그리지 않는다 (옛 자리에 물결이 한 프레임이라도 뜨지 않게)
 */
export function rippleToken(pins: readonly RipplePin[], view: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null) {
  const at = view ? `${view.latitude},${view.longitude},${view.latitudeDelta},${view.longitudeDelta}` : '-';
  return `${at}|${pins.map(p => `${p.id}:${p.latitude},${p.longitude}:${p.active ? 1 : 0}`).join(';')}`;
}
