/** 5.4 설정 — 프로필 카드 · 재생 앱 · 거리 표시 · 알림 · 마케팅 동의 · 차단 · 계정 */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Avatar, Icon, type IconName, IconButton, Press, T, Toggle } from '@/components/ui';
import { env } from '@/config';
import { useAgreements, useMe } from '@/hooks/api';
import type { UserAgreement } from '@/api/types';
import type { RootScreen } from '@/navigation/types';
import { SERVICES } from '@/services/musicLinks';
import { useAuth } from '@/store/auth';
import { type DistanceMode, usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, glow } from '@/theme/tokens';

function Squircle({ icon, tone }: { icon: IconName; tone: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 34, height: 34, borderRadius: 11, backgroundColor: tone, opacity: 0.16 }} />
      <Icon name={icon} size={18} color={tone} />
    </View>
  );
}
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ gap: 8 }}>
    <T v="captionStrong" c="ink3" style={{ paddingLeft: 6 }}>{title}</T>
    <View style={{ borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>{children}</View>
  </View>
);
const Row = ({ icon, tone, title, sub, right, onPress, last }: { icon: IconName; tone: string; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean }) => (
  <Press onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
    <Squircle icon={icon} tone={tone} />
    <View style={{ flex: 1, gap: 1 }}>
      <T v="bodyStrong">{title}</T>
      {sub ? <T v="micro" c="ink3">{sub}</T> : null}
    </View>
    {right}
  </Press>
);

const MODES: { k: DistanceMode; label: string }[] = [{ k: 'plain', label: '기본' }, { k: 'radius', label: '반경' }, { k: 'gradient', label: '그라데이션' }];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const APP_VERSION: string = require('../../../package.json').version;

export default function SettingsScreen({ navigation }: RootScreen<'Settings'>) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useMe().data;
  const prefs = usePrefs();
  const agreementsQ = useAgreements();
  const agreementsLoaded = !!agreementsQ.data;
  const serverMarketing = agreementsQ.data?.find(a => a.type === 'MARKETING')?.agreed ?? false;
  const signOut = useAuth(s => s.signOut);

  const chooseService = () => navigation.navigate('ServicePicker', {});
  // 마케팅 동의: 누르는 즉시 반영하고, 요청 중엔 잠그고, 실패하면 되돌린다
  const [marketingOverride, setMarketingOverride] = React.useState<boolean | null>(null);
  const [marketingBusy, setMarketingBusy] = React.useState(false);
  const marketing = marketingOverride ?? serverMarketing;
  const setMarketing = async (v: boolean) => {
    if (marketingBusy || !agreementsLoaded) return;
    setMarketingOverride(v);
    setMarketingBusy(true);
    try {
      await userApi.setMarketing(v);
      qc.setQueryData<UserAgreement[]>(['agreements'], old => old?.map(a => (a.type === 'MARKETING' ? { ...a, agreed: v } : a)));
      qc.invalidateQueries({ queryKey: ['agreements'] }); toast(v ? '마케팅 정보 수신에 동의했어요.' : '마케팅 정보 수신을 철회했어요.'); }
    catch (e) { toast(errorMessage(e), 'error'); }
    finally { setMarketingOverride(null); setMarketingBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton name="chevronLeft" size={40} onPress={navigation.goBack} accessibilityLabel="뒤로" />
        <T v="titleLarge">설정</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        <Press onPress={() => navigation.navigate('ProfileEdit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }}>
          <Avatar uri={me?.profileImageUrl} name={me?.username} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="headline">{me?.username ?? ' '}</T>
            <T v="caption" c="ink2">프로필 편집</T>
          </View>
          <Icon name="chevronRight" size={18} color={colors.ink3} />
        </Press>

        <Group title="재생">
          <Row icon="wave" tone={colors.primary} title="주변 곡 자동 재생" sub="지도에서 가까운 드랍의 미리듣기를 차례로 들려줘요" right={<Toggle label="주변 곡 자동 재생" value={prefs.autoplayNearby} onChange={prefs.setAutoplayNearby} />} />
          <Row icon="play" tone={colors.primary} title="기본 재생 앱" sub="전체 듣기를 누르면 이 앱으로 열려요" onPress={chooseService} last right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {prefs.service ? <ServiceGlyph service={prefs.service} size={18} /> : null}
              <T v="captionStrong" c="ink2">{prefs.service ? SERVICES[prefs.service].label : '매번 선택'}</T>
              <Icon name="chevronRight" size={16} color={colors.ink3} />
            </View>
          } />
        </Group>

        <Group title="지도">
          <View style={{ padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Squircle icon="map" tone={colors.accent2} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">거리 표시 방식</T>
                <T v="micro" c="ink3">핀까지의 거리를 지도에 어떻게 보여줄지 골라요</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {MODES.map(m => {
                const on = prefs.distanceMode === m.k;
                return (
                  <Press key={m.k} onPress={() => prefs.setDistanceMode(m.k)} style={[{ flex: 1, alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 10, borderRadius: 16, backgroundColor: colors.page, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }, on ? glow(0.3, 12) : {}]}>
                    <View style={{ width: 92, height: 50, borderRadius: 10, backgroundColor: colors.card2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {m.k === 'radius' ? <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: 'rgba(79,209,255,0.1)' }} /> : null}
                      {m.k === 'gradient' ? <View style={{ position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(79,209,255,0.18)' }} /> : null}
                      {[[-28, -12, 1], [22, 12, m.k === 'gradient' ? 0.35 : 1], [26, -14, m.k === 'gradient' ? 0.35 : 1], [-20, 14, 1]].map(([x, y, o], i) => <View key={i} style={{ position: 'absolute', left: 46 + x - 3, top: 25 + y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, opacity: o }} />)}
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink }} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {on ? <Icon name="check" size={12} color={colors.primary} strokeWidth={2.6} /> : null}
                      <T v="captionStrong" c={on ? 'primary' : 'ink2'}>{m.label}</T>
                    </View>
                  </Press>
                );
              })}
            </View>
          </View>
        </Group>

        <Group title="알림">
          <Row icon="heart" tone={colors.accent} title="좋아요" sub="내 드랍을 누가 좋아하면" right={<Toggle label="좋아요 알림" value={prefs.notify.like} onChange={v => prefs.setNotify('like', v)} />} />
          <Row icon="comment" tone={colors.primary} title="댓글" sub="내 드랍에 댓글이 달리면" right={<Toggle label="댓글 알림" value={prefs.notify.comment} onChange={v => prefs.setNotify('comment', v)} />} />
          <Row icon="pin" tone={colors.positive} title="주변 새 드랍" sub="지금 근처에 새 곡이 떨어지면" right={<Toggle label="주변 새 드랍 알림" value={prefs.notify.nearby} onChange={v => prefs.setNotify('nearby', v)} />} />
          <Row icon="mail" tone={colors.warning} title="마케팅 정보 수신" sub="이벤트·새 기능 소식" last right={<Toggle label="마케팅 정보 수신" value={marketing} onChange={setMarketing} />} />
        </Group>

        <Group title="안전 · 개인정보">
          <Row icon="eye" tone={colors.ink2} title="이용 데이터 분석" sub="사용 기록·위치로 서비스를 개선해요 (Amplitude)" right={<Toggle label="이용 데이터 분석" value={prefs.analytics} onChange={prefs.setAnalytics} />} />
          <Row icon="block" tone={colors.ink2} title="차단한 사용자" onPress={() => navigation.navigate('BlockedUsers')} last right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
        </Group>

        <Group title="약관 및 정보">
          <Row icon="link" tone={colors.ink2} title="서비스 이용약관" onPress={() => navigation.navigate('TermsView', { type: 'SERVICE' })} right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
          <Row icon="link" tone={colors.ink2} title="개인정보 처리방침" onPress={() => navigation.navigate('TermsView', { type: 'PRIVACY' })} right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
          <Row icon="link" tone={colors.ink2} title="위치기반서비스 이용약관" last onPress={() => navigation.navigate('TermsView', { type: 'LOCATION' })} right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
        </Group>

        <Group title="계정">
          <Row icon="external" tone={colors.ink2} title="로그아웃" onPress={() => dialog.alert('로그아웃할까요?', undefined, [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: () => signOut() }])} right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
          <Row icon="trash" tone={colors.caution} title="회원 탈퇴" last onPress={() => navigation.navigate('ConfirmWithdraw')} right={<Icon name="chevronRight" size={16} color={colors.ink3} />} />
        </Group>

        <View style={{ alignItems: 'center', gap: 6, paddingTop: 4 }}>
          <T v="micro" c="ink3">PADO {APP_VERSION}{env.useMock ? ' · 목 서버' : ''}</T>
          <T v="micro" c="ink3">지도 © Google · 곡 정보·앨범 아트 © Spotify · 미리듣기 © Apple</T>
        </View>
      </ScrollView>
    </View>
  );
}
