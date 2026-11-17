/** 약관 개정 확인 — 개정된 약관이 있고 이 버전을 아직 안내하지 않았으면 안내 시트를 한 번 띄운다 (지도가 맨 앞일 때) */
import { useEffect, useRef } from 'react';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { termsSeenKey } from '@/store/terms';
import { kv } from '@/store/storage';
import { useAgreements } from './api';

export function useTermsUpdateCheck() {
  const navigation = useNavigation();
  const { data } = useAgreements();
  const shown = useRef(false);
  // 지도가 맨 앞일 때만 — 다른 시트(업데이트 안내 등)가 떠 있으면 닫힌 뒤에 (시트가 겹쳐 뜨지 않게)
  const focused = useIsFocused();
  useEffect(() => {
    if (!data || shown.current || !focused) return;
    const changed = data.filter(a => a.agreedVersion !== a.latestVersion && !kv.get(termsSeenKey(a.type, a.latestVersion), false));
    if (!changed.length) return;
    shown.current = true;
    navigation.navigate('TermsUpdate', { changed });
  }, [data, navigation, focused]);
}
