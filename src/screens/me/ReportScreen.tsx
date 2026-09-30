/** 신고 (시트) — POST /reports (+ 선택 시 POST /blocks) */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { safetyApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { ReportReason } from '@/api/types';
import { Icon, Press, PrimaryButton, Radio, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';

const REASONS: [ReportReason, string][] = [['SPAM', '스팸·광고'], ['ABUSE', '욕설·괴롭힘'], ['SEXUAL', '음란물'], ['HATE', '혐오 표현'], ['PRIVACY', '개인정보 노출'], ['ETC', '기타']];

export default function ReportScreen({ navigation, route }: RootScreen<'Report'>) {
  const { targetType, targetId, userId, label } = route.params;
  const qc = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      // 이미 신고한 대상(R3)이어도 차단은 따로 할 수 있게
      let alreadyReported = false;
      try { await safetyApi.report(targetType, targetId, reason, detail.trim() || undefined); }
      catch (e) { if ((e as { code?: string }).code === 'R3' && block) alreadyReported = true; else throw e; }
      if (block && userId) { await safetyApi.block(userId); qc.invalidateQueries({ queryKey: ['nearby'] }); qc.invalidateQueries({ queryKey: ['comments'] }); qc.invalidateQueries({ queryKey: ['commentCount'] }); qc.invalidateQueries({ queryKey: ['blocks'] }); }
      toast(block ? (alreadyReported ? '이미 신고한 대상이라 차단만 했어요.' : '신고하고 차단했어요.') : '신고가 접수됐어요. 운영자가 확인할게요.', 'success');
      navigation.goBack();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet>
      <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 12 }}>
        <T v="title">{label ?? '이 콘텐츠'}를 신고할까요?</T>
        <T v="caption" c="ink2">신고 내용은 운영자만 확인해요. 같은 대상은 한 번만 신고할 수 있어요.</T>
      </View>
      <View style={{ borderRadius: 20, backgroundColor: colors.page, overflow: 'hidden' }}>
        {REASONS.map(([k, l], i) => (
          <Press key={k} onPress={() => setReason(k)} accessibilityRole="radio" accessibilityState={{ checked: reason === k }} accessibilityLabel={l} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: i < REASONS.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
            <T v="body">{l}</T>
            <Radio on={reason === k} />
          </Press>
        ))}
      </View>
      <TextInput value={detail} onChangeText={t => setDetail(t.slice(0, 500))} placeholder="자세한 내용 (선택, 500자)" placeholderTextColor={colors.ink3} multiline selectionColor={colors.primary} style={{ marginTop: 12, minHeight: 64, borderRadius: 16, padding: 14, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.line, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 }} />
      {userId ? (
        <Press onPress={() => setBlock(b => !b)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 14 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: block ? colors.primary : 'transparent', borderWidth: block ? 0 : 1.5, borderColor: colors.line }}>
            {block ? <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.4} /> : null}
          </View>
          <T v="captionStrong" c="ink2">이 사용자도 차단하기 (드랍·댓글이 더 이상 보이지 않아요)</T>
        </Press>
      ) : <View style={{ height: 14 }} />}
      <PrimaryButton label="신고하기" onPress={submit} loading={busy} disabled={!reason} />
    </Sheet>
  );
}
