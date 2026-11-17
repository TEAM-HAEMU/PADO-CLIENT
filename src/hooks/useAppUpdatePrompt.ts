/**
 * 선택 업데이트 시트를 지도 화면에서 띄운다 — 다른 안내와 동시에 겹치지 않게:
 *  - 지도가 맨 앞일 때만 (위치·알림 권한 안내 화면, 약관 개정 시트 등 다른 화면·시트가 위에 있으면 기다림)
 *  - 앱이 active일 때만 (OS 권한 창이 떠 있으면 inactive/background)
 *  - blocked: 지도 범위 말풍선(ScopeTip)이 떠 있는 동안 — 지도 화면이 넘긴다
 * 이 시트가 떠 있는 동안엔 지도가 맨 앞이 아니므로 ScopeTip·약관 시트가 기다렸다가 닫힌 뒤에 뜬다
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { optionalPromptDue, useAppUpdate } from '@/services/appUpdate';

const DELAY_MS = 1200;

export function useAppUpdatePrompt(blocked: boolean) {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const due = useAppUpdate(s => optionalPromptDue(s));
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', s => setActive(s === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    if (!due || !focused || !active || blocked) return;
    const t = setTimeout(() => {
      if (AppState.currentState === 'active' && optionalPromptDue()) navigation.navigate('AppUpdate');
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [due, focused, active, blocked, navigation]);
}
