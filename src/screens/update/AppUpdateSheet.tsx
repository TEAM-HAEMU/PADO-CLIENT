/**
 * 선택 업데이트 안내 (시트) — 지금 버전 < latestVersion. 지도 화면이 다른 안내와 겹치지 않을 때 띄운다 (hooks/useAppUpdatePrompt).
 * '나중에'·배경 탭·쓸어내리기·뒤로가기 어느 것으로 닫아도 이 latestVersion은 다시 묻지 않는다 (기기 저장).
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { PrimaryButton, SecondaryButton, T } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import type { RootScreen } from '@/navigation/types';
import { dismissOptionalUpdate, markPromptShown, openAppUpdate, useAppUpdate } from '@/services/appUpdate';

export default function AppUpdateSheet({ navigation }: RootScreen<'AppUpdate'>) {
  const latest = useAppUpdate(s => s.decision?.latestVersion);
  const updating = useRef(false);
  useEffect(() => {
    markPromptShown('optional');
    return () => { if (!updating.current) dismissOptionalUpdate(); };
  }, []);
  const update = () => {
    updating.current = true;
    navigation.goBack();
    openAppUpdate('optional');
  };
  return (
    <Sheet>
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4, paddingLeft: 4 }}>
          <T v="title" style={{ color: '#000000' }} accessibilityRole="header">새 버전이 나왔어요</T>
          <T v="caption" c="ink2" style={{ fontSize: 13 }}>{latest ? `${latest} 버전으로 업데이트할 수 있어요.` : '지금 업데이트할 수 있어요.'}</T>
        </View>
        <View style={{ gap: 10 }}>
          <PrimaryButton label="업데이트" onPress={update} />
          <SecondaryButton label="나중에" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </Sheet>
  );
}
