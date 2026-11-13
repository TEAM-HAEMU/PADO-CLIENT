/** 전체 화면 로딩/오류 — 어떤 경우에도 뒤로 갈 수 있고, 오류면 다시 시도할 수 있게 */
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { colors } from '@/theme/tokens';
import { Empty, Loading, SecondaryButton, TopBar } from './index';

export function ScreenState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: string }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] }));
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <TopBar title={title} onBack={back} />
      {error ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Empty icon="alert" title="불러오지 못했어요" desc={errorMessage(error)} action={onRetry ? <SecondaryButton label="다시 시도" onPress={onRetry} style={{ marginTop: 8 }} /> : undefined} />
        </View>
      ) : <Loading />}
    </View>
  );
}

type QueryLike = { data?: unknown; isFetching: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/**
 * 목록 칸 안의 불러오는 중·오류 — 아직 받은 데이터가 없을 때만 그린다(받은 게 있으면 null → 호출부가 목록이나 빈 상태를 그린다).
 * 실패를 '아직 없어요'로 보여 주지 않고, 다시 시도할 수 있게. 쓰는 법: `listStatus(q) ?? (목록 또는 빈 상태)`
 */
export function listStatus(q: QueryLike, errorTitle = '불러오지 못했어요'): React.ReactElement | null {
  if (q.data !== undefined) return null;
  if (q.isFetching) return <Loading style={{ flex: 0, height: 200 }} />;
  if (q.isError) return <Empty icon="alert" title={errorTitle} desc={errorMessage(q.error)} action={<SecondaryButton label="다시 시도" onPress={() => q.refetch()} style={{ marginTop: 8 }} />} />;
  return null;
}
