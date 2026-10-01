/** 5.5 회원 탈퇴 확인 — POST /users/withdrawal (90일 안에 다시 로그인하면 복구) */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { userApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { Icon, Press, T } from '@/components/ui';
import { useMyDrops } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/toast';
import { colors, dropShadow } from '@/theme/tokens';
import { track } from '@/services/analytics';

export default function ConfirmWithdrawScreen({ navigation }: RootScreen<'ConfirmWithdraw'>) {
  const n = useMyDrops().data?.length ?? 0;
  const signOut = useAuth(s => s.signOut);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await userApi.withdraw(); track('account_withdrawn', { drops: n }); await signOut({ callServer: false }); toast('탈퇴했어요. 90일 안에 다시 로그인하면 계정이 복구돼요.'); }
    catch (e) { toast(errorMessage(e), 'error'); setBusy(false); }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,9,22,0.62)' }}>
      <Pressable style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} onPress={navigation.goBack} accessibilityLabel="닫기" />
      <View style={[{ width: 330, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20, alignItems: 'center', gap: 16 }, dropShadow]}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: colors.caution, opacity: 0.16 }} />
          <Icon name="alert" size={28} color={colors.caution} />
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <T v="title">정말 탈퇴할까요?</T>
          <T v="body" c="ink2" style={{ textAlign: 'center' }}>모든 기기에서 로그아웃되고, 90일 안에 다시 로그인하면 복구할 수 있어요.</T>
          <T v="caption" c="ink3" style={{ textAlign: 'center' }}>{`90일이 지나면 개인정보·플레이리스트·알림·차단 목록이 삭제되고, ${n ? `남긴 드랍 ${n}개와 ` : ''}댓글·좋아요는 '탈퇴한 사용자'로 남아요.`}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <Press onPress={navigation.goBack} style={{ flex: 1, height: 50, borderRadius: 20, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}><T v="bodyStrong">취소</T></Press>
          <Press onPress={go} disabled={busy} style={{ flex: 1, height: 50, borderRadius: 20, backgroundColor: colors.caution, alignItems: 'center', justifyContent: 'center' }}><T v="bodyStrong" c="onPrimary">{busy ? '처리 중' : '탈퇴하기'}</T></Press>
        </View>
      </View>
    </View>
  );
}
