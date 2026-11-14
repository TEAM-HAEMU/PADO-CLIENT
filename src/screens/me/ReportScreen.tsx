/** 신고 (시트) — POST /reports (+ 선택 시 POST /blocks) */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { safetyApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { ReportReason } from '@/api/types';
import { Icon, Press, PrimaryButton, T } from '@/components/ui';
import { ReportRadio } from '@/components/me/MeIcons';
import { invalidateAfterBlock } from '@/hooks/api';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { track } from '@/services/analytics';

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
      if (block && userId) { await safetyApi.block(userId); invalidateAfterBlock(qc); }
      track('report_submitted', { target_type: targetType, reason, has_detail: !!detail.trim(), block: !!(block && userId) });
      toast(block ? (alreadyReported ? '이미 신고한 대상이라 차단만 했어요.' : '신고하고 차단했어요.') : '신고가 접수됐어요. 운영자가 확인할게요.', 'success');
      navigation.goBack();
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet>
      <View style={{ gap: 20 }}>
        <View style={{ gap: 2, paddingLeft: 4, paddingBottom: 6 }}>
          <T v="title" style={{ color: '#000000' }}>{withObjectParticle(label ?? '이 콘텐츠')} 신고할까요?</T>
          <T v="caption" style={{ fontSize: 13, color: GREY }}>신고 내용은 운영자만 확인해요. 같은 대상은 한 번만 신고할 수 있어요.</T>
        </View>
        <View>
          {REASONS.map(([k, l], i) => (
            <Press key={k} onPress={() => setReason(k)} accessibilityRole="radio" accessibilityState={{ checked: reason === k }} accessibilityLabel={l} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 14, borderBottomWidth: i < REASONS.length - 1 ? 1 : 0, borderBottomColor: colors.divider }}>
              <T v="body" style={{ color: '#000000' }}>{l}</T>
              <ReportRadio on={reason === k} />
            </Press>
          ))}
        </View>
        <TextInput value={detail} onChangeText={t => setDetail(t.slice(0, 500))} placeholder="자세한 내용 (선택, 500자)" placeholderTextColor={GREY} multiline maxFontSizeMultiplier={1.2} selectionColor={colors.primary} style={{ minHeight: 64, borderRadius: 16, padding: 14, paddingTop: 14, backgroundColor: colors.field, borderWidth: 1, borderColor: colors.lineStrong, color: colors.ink, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }} />
        {userId ? (
          <Press onPress={() => setBlock(b => !b)} accessibilityRole="checkbox" accessibilityState={{ checked: block }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
            <View style={{ width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: block ? colors.primary : 'transparent', borderWidth: block ? 0 : 1.5, borderColor: '#E7E7E7' }}>
              {block ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.6} /> : null}
            </View>
            <T v="captionStrong" style={{ flex: 1, color: GREY }}>이 사용자도 차단하기 (드랍·댓글이 더 이상 보이지 않아요)</T>
          </Press>
        ) : null}
        <PrimaryButton label="확인" accessibilityLabel="신고하기" onPress={submit} loading={busy} disabled={!reason} />
      </View>
    </Sheet>
  );
}

/** Figma 시트 안내·자리표시 회색 */
const GREY = '#A4A4A4';

/** 목적격 조사 — 받침이 있으면 '을', 없으면 '를' (예: 하윤님을, 이 드랍을, 이 댓글을) */
function withObjectParticle(word: string) {
  const c = word.charCodeAt(word.length - 1);
  const hasBatchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? '을' : '를');
}
