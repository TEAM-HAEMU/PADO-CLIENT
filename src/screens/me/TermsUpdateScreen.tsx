/**
 * 약관 개정 안내 (시트) — /users/agreements에서 agreedVersion ≠ latestVersion인 약관이 있을 때 한 번 띄운다.
 * 명세상 재동의를 기록하는 API는 마케팅(PUT /users/agreements/marketing)뿐이라, 필수 약관은 안내만 하고
 * 본 버전을 기기에 기억한다.
 * 닫을 수 없는 시트라, 마케팅 동의 저장이 실패하면 '나중에 하기'를 보여 준다 — 필수 약관만 본 것으로 기록하고 닫으며,
 * 마케팅은 저장되지 않았으니 다음 실행 때 다시 묻는다 (설정에서도 바꿀 수 있다). 서버 오류가 이어져도 앱을 쓸 수 있게
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { PrimaryButton, SecondaryButton, T, Toggle } from '@/components/ui';
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
  const [failed, setFailed] = useState(false);
  const closeRef = React.useRef<(() => void) | null>(null);
  const title = (type: string) => titles.find(t => t.type === type)?.title ?? type;

  const finish = (seen: typeof changed) => {
    seen.forEach(c => kv.set(termsSeenKey(c.type, c.latestVersion), true));
    qc.invalidateQueries({ queryKey: ['agreements'] });
    closeRef.current?.();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (marketing) await userApi.setMarketing(agreeMarketing); // 현재 버전으로 새 이력 저장
      finish(changed);
    } catch (e) {
      setFailed(true);
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  // 마케팅 저장이 실패했을 때만 — 필수 약관 안내는 본 것으로, 마케팅은 다음에 다시
  const later = () => { if (!busy) finish(changed.filter(c => c.type !== 'MARKETING')); };

  return (
    <Sheet dismissible={false} closeRef={closeRef}>
      <View style={{ gap: 20 }}>
        <View style={{ gap: 2, paddingLeft: 4, paddingBottom: 6 }}>
          <T v="title" style={{ color: '#000000' }}>약관이 개정됐어요</T>
          <T v="caption" style={{ fontSize: 13, color: '#A4A4A4' }}>서비스를 계속 이용하시면 개정된 약관에 동의한 것으로 봐요.</T>
        </View>
        <View>
          {changed.filter(c => c.type !== 'MARKETING').map(c => (
            <View key={c.type} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <T v="bodyStrong" style={{ flex: 1, color: INK }} numberOfLines={1}>{title(c.type)}</T>
              <T v="captionStrong" style={{ lineHeight: 16, letterSpacing: 0, color: PALE }}>{c.latestVersion}</T>
            </View>
          ))}
          {marketing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 6 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyStrong" style={{ color: INK }}>{title('MARKETING')} (선택)</T>
                <T v="caption" style={{ fontSize: 13, color: PALE }}>이벤트·새 기능 소식을 받아볼래요</T>
              </View>
              <Toggle label="마케팅 정보 수신 동의" value={agreeMarketing} onChange={setAgreeMarketing} />
            </View>
          ) : null}
        </View>
        {failed ? <T v="caption" c="ink2" style={{ paddingHorizontal: 4 }}>마케팅 수신 동의를 저장하지 못했어요. 다시 시도하거나 나중에 설정에서 바꿀 수 있어요.</T> : null}
        <View style={{ gap: 10 }}>
          <PrimaryButton label={failed ? '다시 시도' : '확인'} onPress={confirm} loading={busy} />
          {failed ? <SecondaryButton label="나중에 하기" onPress={later} disabled={busy} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

/** Figma 약관 행 글자 · 버전 회색 */
const INK = '#020202';
const PALE = '#CCCCCC';
