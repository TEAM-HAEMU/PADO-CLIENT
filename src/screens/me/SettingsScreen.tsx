/** 5.4 설정 — 프로필 카드 · 재생 앱 · 알림 · 마케팅 동의 · 차단 · 계정 */
import React from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVersion } from 'react-native-device-info';
import { userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Avatar, Press, T, Toggle, TopBar } from '@/components/ui';
import { Chevron, MeGlyph, type MeGlyphName } from '@/components/me/MeIcons';
import { Wave } from '@/components/ui/Wave';
import { env } from '@/config';
import { OPERATOR } from '@/content/terms';
import { useAgreements, useMe } from '@/hooks/api';
import type { UserAgreement } from '@/api/types';
import type { RootScreen } from '@/navigation/types';
import { SERVICES } from '@/services/musicLinks';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';

/** Figma 설정 행 아이콘 — 34px 둥근 사각(r11)에 같은 계열 색을 16%로 깔고 18px 채움 아이콘 */
function Squircle({ glyph, tint, size = 18 }: { glyph: MeGlyphName; tint: string; size?: number }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 34, height: 34, borderRadius: 11, backgroundColor: tint, opacity: 0.16 }} />
      <MeGlyph name={glyph} size={size} />
    </View>
  );
}
/** 묶음 제목 — 12 Medium #7482AE, 자간 6% */
const GroupLabel = ({ title }: { title: string }) => <T v="label" c="ink2" style={{ paddingLeft: 6 }}>{title}</T>;
/** 묶음 — 제목 + 흰 바탕 행, 행 사이 회색 구분선 (회색 카드 없음) */
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={{ gap: 8 }}>
    <GroupLabel title={title} />
    <View>{children}</View>
  </View>
);
/** 설명 한 줄 — 11 Medium 옅은 회색 */
const SUB = { color: '#CECECE' };
const Row = ({ glyph, tint, title, sub, right, onPress, last }: { glyph: MeGlyphName; tint: string; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; last?: boolean }) => (
  <Press onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingVertical: 10, minHeight: 54, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}>
    <Squircle glyph={glyph} tint={tint} />
    <View style={{ flex: 1, gap: 1 }}>
      <T v="bodyStrong" style={{ color: '#000000' }}>{title}</T>
      {sub ? <T v="micro" style={SUB}>{sub}</T> : null}
    </View>
    {right}
  </Press>
);
/** '재생' 묶음 행 — 아이콘은 #D0F4FF 바탕 r8 위 24px, 행 사이 회색 구분선 */
const PlayRow = ({ glyph, title, sub, right, onPress, last }: { glyph: MeGlyphName; title: string; sub: string; right: React.ReactNode; onPress?: () => void; last?: boolean }) => (
  <Press onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}>
    <View style={{ padding: 5, borderRadius: 8, backgroundColor: colors.iconTint }}><MeGlyph name={glyph} size={24} /></View>
    <View style={{ flex: 1, gap: 1 }}>
      <T v="bodyStrong" style={{ color: '#000000' }}>{title}</T>
      <T v="micro" style={{ color: '#D1D1D1' }}>{sub}</T>
    </View>
    {right}
  </Press>
);
/** Figma 약관·로그아웃 바탕색 (연보라) */
const LAVENDER = '#6F94FF';


/** 스토어에 올라간 실제 버전 (iOS MARKETING_VERSION · Android versionName) */
const APP_VERSION = getVersion();

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

  // 메일 앱이 없으면(시뮬레이터 등) 주소를 안내
  const contact = () => {
    Linking.openURL(`mailto:${OPERATOR.email}?subject=${encodeURIComponent('[PADO 문의]')}`)
      .catch(() => dialog.alert('문의하기', `${OPERATOR.email}로 메일을 보내주세요.`));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <TopBar title="설정" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, gap: 20, paddingBottom: insets.bottom + 32 }}>
        {/* Figma: 설정 가운데쯤(안전·약관 뒤)에 wave가 깔린다 */}
        <Wave scale={1.2} style={{ position: 'absolute', left: -78, right: 0, top: 770 }} />
        <Press onPress={() => navigation.navigate('ProfileEdit')} trackAs="프로필 편집" style={{ flexDirection: 'row', alignItems: 'center', gap: 18, height: 80, paddingHorizontal: 6 }}>
          <Avatar uri={me?.profileImageUrl} name={me?.username} size={62} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="bodyStrong" style={{ fontSize: 14, lineHeight: 20, letterSpacing: 0, color: '#000000' }}>{me?.username ?? ' '}</T>
            <T v="micro" c="ink2" style={{ fontFamily: fonts.regular }}>프로필 편집</T>
          </View>
          <MeGlyph name="arrow" size={20} rotate={180} />
        </Press>

        <View style={{ gap: 8 }}>
          <GroupLabel title="재생" />
          <View>
          <PlayRow glyph="autoplay" title="주변 곡 자동 재생" sub="지도에서 가까운 드랍의 미리듣기를 차례로 들려줘요" right={<Toggle label="주변 곡 자동 재생" value={prefs.autoplayNearby} onChange={prefs.setAutoplayNearby} />} />
          <PlayRow glyph="play" title="기본 재생 앱" sub="전체 듣기를 누르면 이 앱으로 열려요" last onPress={chooseService} right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {prefs.service ? <ServiceGlyph service={prefs.service} size={18} /> : null}
              <T v="captionStrong" c="ink3">{prefs.service ? SERVICES[prefs.service].label : '매번 선택'}</T>
              <Chevron />
            </View>
          } />
          </View>
        </View>

        <Group title="알림">
          <Row glyph="like" tint={colors.like} title="좋아요" sub="내 드랍을 누가 좋아하면" right={<Toggle label="좋아요 알림" value={prefs.notify.like} onChange={v => prefs.setNotify('like', v)} />} />
          <Row glyph="comment" tint="#8DF2CB" title="댓글" sub="내 드랍에 댓글이 달리면" right={<Toggle label="댓글 알림" value={prefs.notify.comment} onChange={v => prefs.setNotify('comment', v)} />} />
          <Row glyph="nearby" tint="#4BD0FF" title="주변 새 드랍" sub="지금 근처에 새 곡이 떨어지면" right={<Toggle label="주변 새 드랍 알림" value={prefs.notify.nearby} onChange={v => prefs.setNotify('nearby', v)} />} />
          <Row glyph="mail" tint={colors.warning} title="마케팅 정보 수신" sub="이벤트·새 기능 소식" last right={<Toggle label="마케팅 정보 수신" value={marketing} onChange={setMarketing} />} />
        </Group>

        {/* 디자인의 '안전' 묶음 — 이용 분석 두 단계도 여기 둔다 (동의창 없이 설정에서만, App Store 5.1.2) */}
        <Group title="안전 · 개인정보">
          <Row glyph="block" tint={colors.ink3} title="차단한 사용자" onPress={() => navigation.navigate('BlockedUsers')} right={<Chevron />} />
          <Row glyph="analytics" tint={colors.ink3} title="이용 분석" sub="화면·버튼 사용을 기기 단위로 익명 수집" right={<Toggle label="이용 분석" value={prefs.analyticsMode !== 'off'} onChange={v => prefs.setAnalyticsMode(v ? 'basic' : 'off')} />} />
          <Row glyph="analytics" tint={colors.ink3} title="상세 분석" sub="계정·정확한 위치·화면 기록 포함 (선택)" last right={<Toggle label="상세 분석" value={prefs.analyticsMode === 'detailed'} onChange={v => prefs.setAnalyticsMode(v ? 'detailed' : 'basic')} />} />
        </Group>

        <Group title="약관 및 정보">
          <Row glyph="link" tint={LAVENDER} title="서비스 이용약관" onPress={() => navigation.navigate('TermsView', { type: 'SERVICE' })} right={<Chevron />} />
          <Row glyph="link" tint={LAVENDER} title="개인정보 처리방침" onPress={() => navigation.navigate('TermsView', { type: 'PRIVACY' })} right={<Chevron />} />
          <Row glyph="link" tint={LAVENDER} title="위치기반서비스 이용약관" onPress={() => navigation.navigate('TermsView', { type: 'LOCATION' })} right={<Chevron />} />
          <Row glyph="mail" tint={LAVENDER} title="문의하기" sub={OPERATOR.email} last onPress={contact} right={<Chevron />} />
        </Group>

        <Group title="계정">
          <Row glyph="logout" tint={LAVENDER} title="로그아웃" onPress={() => dialog.alert('로그아웃할까요?', undefined, [{ text: '취소', style: 'cancel' }, { text: '로그아웃', onPress: () => signOut() }])} right={<Chevron />} />
          <Row glyph="trash" tint={colors.caution} title="회원 탈퇴" last onPress={() => navigation.navigate('ConfirmWithdraw')} right={<Chevron />} />
        </Group>

        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <T v="micro" style={FOOT}>PADO {APP_VERSION}{env.useMock ? ' · 목 서버' : ''}</T>
          <T v="micro" style={[FOOT, { textAlign: 'center' }]}>지도 © Google · 곡 정보·앨범 아트 © Spotify · 미리듣기 © Apple</T>
          <T v="micro" style={[FOOT, { textAlign: 'center' }]}>{OPERATOR.company} · 대표 {OPERATOR.representative} · 사업자등록번호 {OPERATOR.bizNo}</T>
        </View>
      </ScrollView>
    </View>
  );
}

/** Figma 하단 표기 — 11 Medium #DADADA */
const FOOT = { color: '#DADADA' };
