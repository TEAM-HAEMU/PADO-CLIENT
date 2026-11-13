/**
 * 앱 최상단 오류 경계(Sentry.ErrorBoundary)의 대체 화면 — 화면을 그리다 오류가 나면 흰 화면 대신 이걸 보여준다.
 * 내비게이션 밖에서 그려지므로 내비게이션 훅을 쓰지 않는다. '다시 불러오기'는 경계 안쪽을 처음부터 다시 그린다.
 */
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, SecondaryButton } from '@/components/ui';
import { colors } from '@/theme/tokens';

export function AppErrorFallback({ onReset }: { onReset: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Empty
          icon="alert"
          title="잠시 문제가 생겼어요"
          desc="다시 불러오면 이어서 쓸 수 있어요."
          action={<SecondaryButton label="다시 불러오기" onPress={onReset} style={{ marginTop: 8 }} />}
        />
      </View>
    </View>
  );
}
