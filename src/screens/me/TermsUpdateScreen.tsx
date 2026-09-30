/**
 * 약관 개정 안내 (시트) — /users/agreements에서 agreedVersion ≠ latestVersion인 약관이 있을 때 한 번 띄운다.
 * 명세상 재동의를 기록하는 API는 마케팅(PUT /users/agreements/marketing)뿐이라, 필수 약관은 안내만 하고
 * 본 버전을 기기에 기억한다.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { PrimaryButton, T, Toggle } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { kv } from '@/store/storage';
import { termsSeenKey } from '@/store/terms';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';


export default function TermsUpdateScreen({ route }: RootScreen<'TermsUpdate'>) {
  const { changed } = route.params;
  const qc = useQueryClient();
  const titles = useQuery({ queryKey: ['terms'], queryFn: authApi.terms }).data ?? [];
  const marketing = changed.find(c => c.type === 'MARKETING');
  const [agreeMarketing, setAgreeMarketing] = useState(!!marketing?.agreed);
  const [busy, setBusy] = useState(false);
  const closeRef = React.useRef<(() => void) | null>(null);
  const title = (type: string) => titles.find(t => t.type === type)?.title ?? type;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (marketing) await userApi.setMarketing(agreeMarketing); // 현재 버전으로 새 이력 저장
      changed.forEach(c => kv.set(termsSeenKey(c.type, c.latestVersion), true));
      qc.invalidateQueries({ queryKey: ['agreements'] });
      closeRef.current?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet dismissible={false} closeRef={closeRef}>
      <View style={{ gap: 16, paddingHorizontal: 4 }}>
        <View style={{ gap: 6 }}>
          <T v="title">약관이 개정됐어요</T>
          <T v="caption" c="ink2">서비스를 계속 이용하시면 개정된 약관에 동의한 것으로 봐요.</T>
        </View>
        <View style={{ gap: 10 }}>
          {changed.filter(c => c.type !== 'MARKETING').map(c => (
            <View key={c.type} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line }}>
              <T v="bodyStrong">{title(c.type)}</T>
              <T v="number" c="ink3">{c.latestVersion}</T>
            </View>
          ))}
          {marketing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong">{title('MARKETING')} (선택)</T>
                <T v="caption" c="ink3">이벤트·새 기능 소식을 받아볼래요</T>
              </View>
              <Toggle label="마케팅 정보 수신 동의" value={agreeMarketing} onChange={setAgreeMarketing} />
            </View>
          ) : null}
        </View>
        <PrimaryButton label="확인" onPress={confirm} loading={busy} />
      </View>
    </Sheet>
  );
}
