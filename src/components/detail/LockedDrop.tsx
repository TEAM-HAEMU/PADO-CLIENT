/**
 * 잠긴 드랍 안내 — 링크·푸시로 재생 반경 밖 드랍을 열었을 때 (hooks/useOpenedDropLock).
 * 지도에서 잠긴 핀을 고를 때의 말풍선과 같은 규칙: 곡·커버·작성자는 숨기고, 첫 줄은 한마디(없으면 '잠긴 드랍'), 둘째 줄은 잠금 안내(lockMessage — 남은 거리).
 * 재생·투표·좋아요 버튼은 없다. 닫기만.
 */
import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, SecondaryButton, TopBar } from '@/components/ui';
import { Sheet } from '@/components/ui/Sheet';
import { useDropRadius } from '@/hooks/useDropRadius';
import { colors } from '@/theme/tokens';
import { quoteNote } from '@/utils/dropBubble';
import { lockMessage } from '@/utils/dropLock';
import type { LockedDropLock } from '@/utils/openedDropLock';

function LockedBody({ lock, note, onClose }: { lock: LockedDropLock; note?: string | null; onClose: () => void }) {
  const radius = useDropRadius();
  const text = note?.trim();
  return (
    <Empty
      icon="lock"
      title={text ? quoteNote(text) : '잠긴 드랍'}
      desc={lockMessage(lock, radius)}
      action={<SecondaryButton label="닫기" onPress={onClose} style={{ marginTop: 8, alignSelf: 'stretch' }} />}
    />
  );
}

/** 바텀시트 화면(핀 미리보기)용 */
export function LockedDropSheet({ lock, note }: { lock: LockedDropLock; note?: string | null }) {
  const nav = useNavigation();
  return (
    <Sheet>
      <View accessibilityLabel="잠긴 드랍" style={{ minHeight: 320, justifyContent: 'center' }}>
        <LockedBody lock={lock} note={note} onClose={() => nav.goBack()} />
      </View>
    </Sheet>
  );
}

/** 전체 화면(투표·플리·재생)용 — 앱을 링크로 처음 열었으면 뒤에 화면이 없을 수 있어 지도로 */
export function LockedDropScreen({ lock, note, title }: { lock: LockedDropLock; note?: string | null; title?: string }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const back = () => (nav.canGoBack() ? nav.goBack() : nav.reset({ index: 0, routes: [{ name: 'Tabs' as never }] }));
  return (
    <View style={{ flex: 1, backgroundColor: colors.page, paddingTop: insets.top }}>
      <TopBar title={title} onBack={back} />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <LockedBody lock={lock} note={note} onClose={back} />
      </View>
    </View>
  );
}
