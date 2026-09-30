/** 약관 보기 — 본문은 src/content/terms.ts (명세: 약관 본문은 앱에서 관리) */
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import { Empty, T, TopBar } from '@/components/ui';
import { TERMS } from '@/content/terms';
import type { RootScreen } from '@/navigation/types';
import { colors } from '@/theme/tokens';

/** 조항 제목 — "제N조 …", "■ …", "부칙", "# …"(#은 떼고 표시) */
const HEADING = /^(제\d+조|■ |부칙$|# )/;

export default function TermsViewScreen({ navigation, route }: RootScreen<'TermsView'>) {
  const insets = useSafeAreaInsets();
  const { type } = route.params;
  const server = useQuery({ queryKey: ['terms'], queryFn: authApi.terms }).data?.find(t => t.type === type);
  const doc = TERMS[type];
  const title = server?.title ?? doc?.title ?? '약관';
  const version = server?.version ?? doc?.version;
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <TopBar title={title} onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {version ? <T v="caption" c="ink3">시행일 {version}</T> : null}
        {doc?.body ? (
          <View style={{ gap: 4 }}>
            {doc.body.split('\n').map((line, i) =>
              !line.trim() ? <View key={i} style={{ height: 10 }} />
              : HEADING.test(line) ? <T key={i} v="bodyStrong" selectable style={{ marginTop: 4 }}>{line.replace(/^# /, '')}</T>
              : <T key={i} v="body" c="ink2" selectable>{line}</T>,
            )}
          </View>
        ) : (
          <Empty icon="alert" title="약관 본문을 준비하고 있어요" desc="정식 출시 전에 이곳에 전문이 게시돼요." />
        )}
      </ScrollView>
    </View>
  );
}
