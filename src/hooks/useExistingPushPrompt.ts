/**
 * 이미 가입한 사람에게 알림 권한 안내를 한 번 — 새 버전을 열고 지도에 들어온 직후.
 * 조건(utils/pushPrompt): 로그인 + OS 권한 결정 전 + 이 기기에서 안내를 본 적 없음 + 막 가입한 흐름이 아님.
 * 다른 안내와 겹치지 않게 지도가 맨 앞이고 앱이 active이며 지도 범위 말풍선(ScopeTip)이 없을 때만 (blocked)
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { usePush } from '@/services/push';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { needExistingPushPrompt } from '@/utils/pushPrompt';

const DELAY_MS = 700;

export function useExistingPushPrompt(blocked: boolean) {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const authed = useAuth(s => s.status === 'authed');
  const permission = usePush(s => s.permission);
  const checked = usePush(s => s.checked);
  const seen = usePrefs(s => s.pushPromptSeen);
  const signupPending = usePrefs(s => s.pushPromptPending);
  const due = needExistingPushPrompt({ authed, checked, permission, seen, signupPending });
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', s => setActive(s === 'active')); return () => sub.remove(); }, []);
  useEffect(() => {
    if (!due || !focused || !active || blocked) return;
    const t = setTimeout(() => {
      if (AppState.currentState === 'active') navigation.navigate('PushPrompt');
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [due, focused, active, blocked, navigation]);
}
