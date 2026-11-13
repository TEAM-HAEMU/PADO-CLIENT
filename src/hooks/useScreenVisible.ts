/**
 * 이 화면이 지금 눈에 보이는가 — 가려진 화면에서 반복 애니메이션을 멈추는 데 쓴다.
 * 보이지 않음 = 앱이 백그라운드 / 이 화면(또는 이 화면을 담은 상위 화면)이 다른 불투명 화면에 완전히 덮임 / 탭이면 다른 탭이 골라짐.
 * useIsFocused를 그대로 쓰지 않는 이유: 투명 모달(시트)이 위에 뜨면 포커스는 잃지만 뒤 화면은 그대로 비쳐 보인다.
 * native-stack은 덮이는 화면에 전환이 끝난 뒤 transitionEnd(closing) — 밀려나는 동안엔 계속 보인다 —, 다시 드러나기 전에 transitionStart를 보낸다.
 * 내비게이션 밖에서 쓰면 앱 상태만 본다.
 */
import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext, NavigationRouteContext, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NavigationProp<ParamListBase>;

/** 탭 화면인데 지금 고른 탭이 아닌가 */
const otherTab = (nav: Nav | undefined, routeKey: string | undefined) => {
  const st = nav?.getState();
  return !!routeKey && st?.type === 'tab' && st.routes[st.index]?.key !== routeKey;
};

export function useScreenVisible() {
  const navigation = useContext(NavigationContext);
  const routeKey = useContext(NavigationRouteContext)?.key;
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [covered, setCovered] = useState(false);
  const [inOtherTab, setInOtherTab] = useState(() => otherTab(navigation, routeKey));

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!navigation) return;
    const offs: (() => void)[] = [];
    // 몇 번째 단계(0 = 이 화면, 1 = 이 화면을 담은 상위 화면 …)가 덮였는지
    const hidden = new Set<number>();
    let level = 0;
    for (let n: Nav | undefined = navigation; n; n = n.getParent(), level++) {
      const lv = level;
      // 탭 내비게이터에는 이 이벤트가 없다 (오지 않을 뿐 해는 없음)
      const stack = n as unknown as NativeStackNavigationProp<ParamListBase>;
      offs.push(stack.addListener('transitionStart', e => { if (!e.data.closing) { hidden.delete(lv); setCovered(hidden.size > 0); } }));
      offs.push(stack.addListener('transitionEnd', e => { if (e.data.closing) { hidden.add(lv); setCovered(true); } }));
    }
    const check = () => setInOtherTab(otherTab(navigation, routeKey));
    offs.push(navigation.addListener('focus', check), navigation.addListener('blur', check));
    return () => offs.forEach(off => off());
  }, [navigation, routeKey]);

  return appActive && !covered && !inOtherTab;
}
