/**
 * 필수 업데이트 — 지금 버전이 서버의 minVersion보다 낮으면 App이 내비게이션 대신 이 화면 한 장만 그린다 (닫기 없음).
 * '업데이트': iOS App Store / Android Play 인앱 업데이트(안 되면 스토어) — services/appUpdate
 */
import React, { useEffect } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, T } from '@/components/ui';
import { markPromptShown, openAppUpdate } from '@/services/appUpdate';
import { usePreviewStore } from '@/services/preview';
import { clearQueue } from '@/services/playQueue';
import { colors } from '@/theme/tokens';

const otter = require('@/assets/otter/otter.webp');

export default function UpdateRequiredScreen() {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    markPromptShown('required');
    // 앱을 쓸 수 없는 동안 재생을 멈춘다 (멈출 방법이 없어지므로)
    clearQueue(); // 대기열이 건너뛰기 대기 중이면 업데이트 화면 뒤에서 다음 곡을 틀지 않게
    usePreviewStore.getState().stop();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Image source={otter} style={{ width: 168, height: 168, marginBottom: 8 }} accessibilityIgnoresInvertColors />
        <T v="titleLarge" style={{ textAlign: 'center' }} accessibilityRole="header">새 버전으로 업데이트해 주세요</T>
        <T v="body" c="ink2" style={{ textAlign: 'center' }}>지금 버전으로는 파도를 쓸 수 없어요.</T>
      </View>
      <PrimaryButton label="업데이트" onPress={() => openAppUpdate('required')} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
