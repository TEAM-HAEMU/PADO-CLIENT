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
