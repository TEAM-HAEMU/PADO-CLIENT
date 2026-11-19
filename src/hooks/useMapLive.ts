/**
 * 지도 화면이 지금 보이는가 (지도 홈의 '가려지면 쉬기' 조건을 한곳에) — 2026-11-20 QA R-05 · R-10.
 *  - 포커스가 있으면 보인다
 *  - 포커스는 없지만 투명 시트(핀 미리보기 등) 아래에서 비쳐 보이면 보인다 — 단, 한 번이라도 포커스를 가진 뒤에만
 *    (useScreenVisible은 처음부터 다른 화면 아래에 마운트되면 덮였다는 신호를 못 받는다. 드랍을 남기면 내비게이션을 새로 짜서(reset)
 *     지도가 완료 화면 아래에 새로 마운트되는데, 그때 보이는 것으로 잘못 치면 창에 붙지 않은 지도의 엉뚱한 영역 이벤트를 그대로 받았다)
 *  - 다른 탭·불투명한 상세 화면 뒤·앱 백그라운드면 보이지 않는다
 */
import { useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useScreenVisible } from '@/hooks/useScreenVisible';

export const mapLive = (focused: boolean, visible: boolean, everFocused: boolean) => focused || (visible && everFocused);

export function useMapLive() {
  const focused = useIsFocused();
  const visible = useScreenVisible();
  const everFocused = useRef(false);
  if (focused) everFocused.current = true;
  return { focused, live: mapLive(focused, visible, everFocused.current) };
}
