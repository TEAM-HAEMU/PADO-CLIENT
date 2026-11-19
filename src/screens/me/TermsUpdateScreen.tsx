/**
 * 약관 개정 안내 (시트) — /users/agreements에서 agreedVersion ≠ latestVersion인 약관이 있을 때 한 번 띄운다.
 * 명세상 재동의를 기록하는 API는 마케팅(PUT /users/agreements/marketing)뿐이라, 필수 약관은 안내만 하고
 * 본 버전을 기기에 기억한다.
 * 혜택·소식 알림(MARKETING, 이메일·앱 푸시 하나의 선택 동의) 토글은 지금 푸시 설정 marketing 값으로 시작한다.
 * 예전에 이메일 마케팅에만 동의한 사람도 꺼진 채로 보이며(앱 푸시는 새로 동의해야 함), 토글을 바꿨을 때만 두 동의를 함께 바꾼다 —
 * 그대로 '확인'하면 동의 기록을 건드리지 않는다
 * 닫을 수 없는 시트라, 마케팅 동의 저장이 실패하면 '나중에 하기'를 보여 준다 — 필수 약관만 본 것으로 기록하고 닫으며,
 * 마케팅은 저장되지 않았으니 다음 실행 때 다시 묻는다 (설정에서도 바꿀 수 있다). 서버 오류가 이어져도 앱을 쓸 수 있게
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { PrimaryButton, SecondaryButton, T, Toggle } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { kv } from '@/store/storage';
import { termsSeenKey } from '@/store/terms';
import { usePrefs } from '@/store/prefs';
import { changeMarketingConsent } from '@/services/pushSettings';
import { colors } from '@/theme/tokens';
import { termTitle } from '@/content/terms';

export default function TermsUpdateScreen({ route }: RootScreen<'TermsUpdate'>) {
  const { changed } = route.params;
  const qc = useQueryClient();
  const titles = useQuery({ queryKey: ['terms'], queryFn: authApi.terms }).data ?? [];
  const marketing = changed.find(c => c.type === 'MARKETING');
  const [initialMarketing] = useState(() => usePrefs.getState().notify.marketing);
  const [agreeMarketing, setAgreeMarketing] = useState(initialMarketing);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const closeRef = React.useRef<(() => void) | null>(null);
  const title = (type: string) => termTitle(type, titles.find(t => t.type === type)?.title);

  const finish = (seen: typeof changed) => {
    seen.forEach(c => kv.set(termsSeenKey(c.type, c.latestVersion), true));
    qc.invalidateQueries({ queryKey: ['agreements'] });
    closeRef.current?.();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 바꿨을 때만 — 푸시 설정과 동의 기록을 함께 (현재 버전으로 새 이력). 결과·오류 토스트는 changeMarketingConsent가
      if (marketing && agreeMarketing !== initialMarketing && !(await changeMarketingConsent(agreeMarketing))) return setFailed(true);
      finish(changed);
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
                <T v="bodyStrong" style={{ color: INK }}>{title('MARKETING')}</T>
                <T v="caption" style={{ fontSize: 13, color: PALE }}>이메일·앱 푸시로 이벤트 소식을 받아요</T>
              </View>
              <Toggle label="혜택·소식 알림" value={agreeMarketing} onChange={setAgreeMarketing} />
            </View>
          ) : null}
        </View>
        {failed ? <T v="caption" c="ink2" style={{ paddingHorizontal: 4 }}>혜택·소식 알림 동의를 저장하지 못했어요. 다시 시도하거나 나중에 설정에서 바꿀 수 있어요.</T> : null}
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
