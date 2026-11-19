/**
 * 1.5 알림 권한 안내 — 위치 권한 화면과 같은 모양(흰 바탕 · 가운데 제목 · 파문 · 아래 파도).
 *  - PushPermission: 가입 직후 한 번 (온보딩, 마치면 지도로)
 *  - PushPrompt: 이미 가입한 사람이 새 버전에서 지도에 들어온 직후 한 번 (마치면 닫힘)
 * 건너뛰기 버튼은 두지 않는다 — 시스템 권한 창 앞 안내에 '나중에'를 두면 Apple 심사 5.1.1(iv)에 걸림. 거절은 시스템 창에서
 * 가입 직후(PushPermission)에만 혜택·소식(광고성) 알림 선택 체크 하나 — 기본 해제. 체크하고 권한을 허용하면 동의 저장 후 처리 결과를 알린다.
 * 가입 화면에서 이미 혜택·소식 알림에 동의했으면(푸시 설정 marketing 켜짐) 체크를 숨긴다 (중복)
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ripples } from '@/components/anim';
import { AuthTitle, CheckBox } from '@/components/auth/AuthChrome';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import type { RootScreen } from '@/navigation/types';
import { openNotificationSettings, usePush } from '@/services/push';
import { changeMarketingConsent } from '@/services/pushSettings';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, glow } from '@/theme/tokens';

const LATER_HINT = '설정 › 알림에서 언제든 켤 수 있어요.';

export default function PushPermissionScreen({ navigation, route }: RootScreen<'PushPermission' | 'PushPrompt'>) {
  const existing = route.name === 'PushPrompt';
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const alreadyAgreed = usePrefs(s => s.notify.marketing);
  const finish = () => {
    usePrefs.getState().setPushPromptSeen();
    if (existing) return navigation.goBack();
    usePrefs.getState().setPushPromptPending(false);
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };
  // '계속'은 늘 시스템 권한 창으로. 이미 막혀 있으면 창이 안 뜨니 휴대폰 설정을 연다
  const allow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const before = await usePush.getState().refreshPermission();
      const after = before === 'denied' ? before : await usePush.getState().requestPermission(existing ? 'prompt' : 'onboarding');
      if (before === 'denied') openNotificationSettings();
      else if (after !== 'granted') toast(LATER_HINT);
      // 처리 결과는 지도로 넘어간 뒤 토스트로 (기다리지 않는다)
      else if (marketing && !existing && !usePrefs.getState().notify.marketing) changeMarketingConsent(true);
    } catch {} finally {
      finish();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Wave always style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      <AuthTitle
        title={'내 드랍에 생긴 소식을\n알림으로 알려 드릴게요'}
        desc={'댓글이나 좋아요가 달리면 바로 알 수 있어요.\n광고 알림은 동의한 경우에만 보내요.'}
        style={{ marginTop: insets.top + 80 }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ripples size={240} count={4} duration={4800} />
        <View style={[{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.iconTint, alignItems: 'center', justifyContent: 'center' }, glow(0.6, 16)]}>
          <Icon name="bell" size={28} color={colors.primary} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
        {existing || alreadyAgreed ? null : (
          <Press onPress={() => setMarketing(v => !v)} trackAs="혜택·소식 알림 체크" accessibilityRole="checkbox" accessibilityState={{ checked: marketing }} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckBox on={marketing} small />
            <T v="captionStrong" c="ink2">혜택·소식 알림도 받을게요 (선택)</T>
          </Press>
        )}
        <PrimaryButton label="계속" style={{ alignSelf: 'stretch' }} onPress={allow} loading={busy} />
      </View>
    </View>
  );
}
