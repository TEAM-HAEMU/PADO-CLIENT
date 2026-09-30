/** 약관 개정 확인 — 개정된 약관이 있고 이 버전을 아직 안내하지 않았으면 안내 시트를 한 번 띄운다 */
import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { termsSeenKey } from '@/store/terms';
import { kv } from '@/store/storage';
import { useAgreements } from './api';

export function useTermsUpdateCheck() {
  const navigation = useNavigation();
  const { data } = useAgreements();
  const shown = useRef(false);
  useEffect(() => {
    if (!data || shown.current) return;
    const changed = data.filter(a => a.agreedVersion !== a.latestVersion && !kv.get(termsSeenKey(a.type, a.latestVersion), false));
    if (!changed.length) return;
    shown.current = true;
    navigation.navigate('TermsUpdate', { changed });
  }, [data, navigation]);
}
