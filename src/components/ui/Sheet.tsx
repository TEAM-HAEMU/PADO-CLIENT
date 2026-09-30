/**
 * 바텀시트 레이아웃 — transparentModal 라우트에서 사용 (배경 탭 → 닫기).
 * 열림: 배경 페이드 + 시트가 아래에서 부드럽게 올라옴 / 닫힘: 반대로 내려감.
 * goBack·배경 탭·제스처 등 어떤 경로로 닫혀도 beforeRemove에서 닫힘 애니메이션을 먼저 재생한다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, View, type ViewStyle } from 'react-native';
import { CommonActions, type NavigationState, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '@/theme/tokens';

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 220, easing: Easing.in(Easing.cubic) };

/**
 * header: 카드 위로 겹쳐 올라오는 요소(예: 앨범 디스크). 카드 밖에 absolute로 띄우면 Android는 부모 영역 밖 터치를
 * 받지 않으므로, 시트 안의 별도 영역에 두고 headerOverlap만큼 카드와 겹친다.
 */
/** dismissible=false: 배경 탭·뒤로가기로 닫히지 않음 (닫을 땐 close() 사용) — 반드시 확인이 필요한 안내용 */
export function Sheet({ children, style, onClose, dim = 0.6, header, headerOverlap = 0, dismissible = true, closeRef }: { children: React.ReactNode; style?: ViewStyle; onClose?: () => void; dim?: number; header?: React.ReactNode; headerOverlap?: number; dismissible?: boolean; closeRef?: React.MutableRefObject<(() => void) | null> }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const close = onClose ?? (() => nav.goBack());
  const progress = useSharedValue(0);
  const [height, setHeight] = useState(800);
  const route = useRoute();
  const closing = useRef(false);
  const [closingNow, setClosingNow] = useState(false);
  const [kb, setKb] = useState(false); // 키보드가 떠 있으면 하단 안전영역 여백은 필요 없다
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []); // 닫히는 동안 시트 안 버튼이 다시 눌리지 않게
  const allow = useRef(false); // 애니메이션 뒤 우리가 직접 보내는 제거 동작은 통과
  const unlocked = useRef(dismissible);
  if (closeRef) closeRef.current = () => { unlocked.current = true; nav.goBack(); };

  useEffect(() => { progress.value = withTiming(1, OPEN); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => nav.addListener('beforeRemove', e => {
    if (allow.current) return;
    e.preventDefault();
    // 닫을 수 없는 시트 (Android 뒤로가기 포함) — 단 앱이 직접 스택을 재구성(reset)하는 건 막지 않는다
    if (!unlocked.current && e.data.action.type !== 'RESET') return;
    if (closing.current) return; // 닫히는 중 두 번째 닫기(배경 연타·뒤로가기)는 무시
    closing.current = true;
    setClosingNow(true);
    const action = e.data.action;
    const finish = () => {
      allow.current = true;
      if (action.type === 'GO_BACK' || action.type === 'POP') {
        // '맨 위 화면 닫기'를 그대로 다시 보내면 그사이 새로 열린 화면이 닫힌다 → 이 시트만 정확히 뺀다
        nav.dispatch((state: NavigationState) => {
          const routes = state.routes.filter(r => r.key !== route.key);
          return CommonActions.reset({ ...state, routes, index: Math.max(0, routes.length - 1) } as never);
        });
      } else {
        nav.dispatch(action);
      }
    };
    progress.value = withTiming(0, CLOSE, done => { if (done) scheduleOnRN(finish); });
  }), [nav, progress, route.key]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height }] }));

  return (
    <KeyboardAvoidingView behavior="padding" pointerEvents={closingNow ? 'none' : 'auto'} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(5,9,22,${dim})` }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={dismissible ? close : undefined} accessible={dismissible} accessibilityLabel="닫기" />
      </Animated.View>
      {/* maxHeight 같은 %값은 화면 기준이어야 하므로 래퍼에, 카드는 그 안에서 줄어든다 */}
      <Animated.View onLayout={e => setHeight(e.nativeEvent.layout.height + 40)} style={[{ maxHeight: style?.maxHeight, height: style?.height }, panel]}>
        {/* 헤더 줄은 화면 폭 전체라 카드 윗부분과 겹친다 → 헤더 요소 말고는 터치를 카드로 넘긴다 (예: 핀 미리보기 ⋯ 버튼) */}
        {header ? <View pointerEvents="box-none" style={{ alignItems: 'center', marginBottom: -headerOverlap, zIndex: 2, elevation: 2 }}>{header}</View> : null}
        <View style={[{ flexShrink: 1, backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingTop: 10, paddingBottom: kb ? 12 : Math.max(insets.bottom, 16) + 12 }, style, { maxHeight: undefined, height: undefined }, style?.height ? { flex: 1 } : null]}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.ink3, opacity: 0.5, marginBottom: 14 }} />
          {children}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
