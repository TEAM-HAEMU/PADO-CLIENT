/** 5.5 회원 탈퇴 확인 — POST /users/withdrawal (90일 안에 다시 로그인하면 복구) */
import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Press, T } from '@/components/ui';
import { WithdrawWarning } from '@/components/me/MeIcons';
import { useMyDrops } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { colors } from '@/theme/tokens';
import { track } from '@/services/analytics';
import { syncPushToken, unregisterPushToken } from '@/services/push';

export default function ConfirmWithdrawScreen({ navigation }: RootScreen<'ConfirmWithdraw'>) {
  const n = useMyDrops().data?.length ?? 0;
  const signOut = useAuth(s => s.signOut);
  const [busy, setBusy] = useState(false);
  // 처리 중엔 닫지 못하게 (닫아도 탈퇴는 계속 진행되므로) — 취소·배경·Android 뒤로·쓸어내리기
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy });
    if (!busy) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [busy, navigation]);
  const close = () => { if (!busy) navigation.goBack(); };
  const go = async () => {
    if (busy) return;
    setBusy(true);
    // 탈퇴하면 이 기기로 푸시가 가지 않게 토큰부터 지운다 (로그인 토큰이 살아 있을 때 — 삭제가 실패해도 탈퇴는 계속)
    await unregisterPushToken();
    try {
      await userApi.withdraw();
    } catch (e) {
      // 탈퇴 실패 — 로그인은 그대로이므로 방금 지운 푸시 토큰을 다시 등록한다
      syncPushToken();
      toast(errorMessage(e), 'error');
      setBusy(false);
      return;
    }
    track('account_withdrawn', { drops: n });
    await signOut({ callServer: false });
    toast('탈퇴했어요. 90일 안에 다시 로그인하면 계정이 복구돼요.');
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 24 }}>
      <Pressable style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} onPress={close} disabled={busy} accessibilityLabel="닫기" />
      <View style={{ width: '100%', maxWidth: 330, borderRadius: 30, backgroundColor: colors.page, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20, alignItems: 'center', gap: 16, shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 24 }, elevation: 12 }}>
        <WithdrawWarning />
        <View style={{ alignItems: 'center', gap: 14 }}>
          <T v="title" style={{ color: '#000000' }}>정말 탈퇴할까요?</T>
          <T v="body" style={{ textAlign: 'center', color: GREY }}>모든 기기에서 로그아웃되고, 90일 안에 다시 로그인하면 복구할 수 있어요.</T>
          <T v="micro" style={{ textAlign: 'center', color: GREY }}>{`90일이 지나면 개인정보·플레이리스트·알림·차단 목록이 삭제되고, ${n ? `남긴 드랍 ${n}개와 ` : ''}댓글·좋아요는 '탈퇴한 사용자'로 남아요.`}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <Press onPress={close} disabled={busy} style={{ flex: 1, paddingVertical: 15, borderRadius: 20, backgroundColor: '#F3FDFF', alignItems: 'center' }}><T v="bodyStrong" c="primary">취소</T></Press>
          <Press onPress={go} disabled={busy} style={{ flex: 1, paddingVertical: 15, borderRadius: 20, backgroundColor: colors.caution, alignItems: 'center' }}><T v="bodyStrong" style={{ color: '#FFFFFF' }}>{busy ? '처리 중' : '탈퇴하기'}</T></Press>
        </View>
      </View>
    </View>
  );
}

/** Figma 안내 글자 회색 */
const GREY = '#B9B9B9';
