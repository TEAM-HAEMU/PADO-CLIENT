/**
 * 바텀시트 레이아웃 — transparentModal 라우트에서 사용 (배경 탭 → 닫기). Figma 새 디자인: 흰 카드 · 위 모서리 32 · 손잡이 #7482AE · 검정 20% 배경.
 * 열림: 배경 페이드 + 시트가 아래에서 부드럽게 올라옴 / 닫힘: 반대로 내려감.
 * goBack·배경 탭·제스처 등 어떤 경로로 닫혀도 beforeRemove에서 닫힘 애니메이션을 먼저 재생한다.
 * 시트를 아래로 쓸어내려도 닫힌다 (충분히 내리거나 빠르게 튕기면 닫고, 아니면 제자리로).
 * 키보드(iOS): 시트를 통째로 들어 올리면 키보드 둥근 모서리 뒤로 어두운 배경이 비치고 흰 카드가 칼같이 끊긴다
 *  → 카드의 흰 바탕을 화면 바닥까지 그대로 두고, 키보드 높이만큼 안쪽 여백만 키보드와 같은 박자로 늘린다 (반투명 키보드가 흰 바탕 위에 얹힘).
 *  Android는 창이 키보드만큼 줄어드는(adjustResize) 방식이라 따로 할 일이 없다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, View, type ViewStyle } from 'react-native';
import { CommonActions, type NavigationState, useNavigation, useRoute } from '@react-navigation/native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '@/theme/tokens';
import { DialogHost } from './Dialog';

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
  const [kb, setKb] = useState(false); // (Android) 키보드가 떠 있으면 하단 안전영역 여백은 필요 없다
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  // (iOS) 키보드 높이를 키보드 애니메이션과 같은 박자로 — 카드 바닥 여백(안전영역)을 넘는 만큼만 더 띄운다
  const keyboard = useAnimatedKeyboard();
  const baseBottom = Math.max(insets.bottom, 16) + 12;
  const kbSpacer = useAnimatedStyle(() => ({ height: Platform.OS === 'ios' ? Math.max(0, keyboard.height.value - baseBottom + 12) : 0 }));
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
  // 쓸어내리기 — 위로 끌거나 옆으로 밀면 무시 (안쪽 가로 스크롤·버튼 탭은 그대로)
  const drag = useSharedValue(0);
  const pan = usePanGesture({
    enabled: dismissible,
    activeOffsetY: 12,
    failOffsetY: -10,
    failOffsetX: [-20, 20],
    onUpdate: e => { 'worklet'; drag.value = Math.max(0, e.translationY); },
    onDeactivate: e => {
      'worklet';
      if (e.translationY > 110 || e.velocityY > 900) scheduleOnRN(close);
      else drag.value = withTiming(0, OPEN);
    },
  });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * height + drag.value }] }));

  return (
    <View pointerEvents={closingNow ? 'none' : 'auto'} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${dim * 0.4})` }, backdrop]}>
        <Pressable style={{ flex: 1 }} onPress={dismissible ? close : undefined} accessible={dismissible} accessibilityLabel="닫기" />
      </Animated.View>
      {/* maxHeight 같은 %값은 화면 기준이어야 하므로 래퍼에, 카드는 그 안에서 줄어든다 */}
      <GestureDetector gesture={pan}>
      <Animated.View onLayout={e => setHeight(e.nativeEvent.layout.height + 40)} style={[{ maxHeight: style?.maxHeight, height: style?.height }, panel]}>
        {/* 헤더 줄은 화면 폭 전체라 카드 윗부분과 겹친다 → 헤더 요소 말고는 터치를 카드로 넘긴다 (예: 핀 미리보기 ⋯ 버튼) */}
        {header ? <View pointerEvents="box-none" style={{ alignItems: 'center', marginBottom: -headerOverlap, zIndex: 2, elevation: 2 }}>{header}</View> : null}
        <View style={[{ flexShrink: 1, backgroundColor: colors.page, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'android' && kb ? 12 : baseBottom }, style, { maxHeight: undefined, height: undefined }, style?.height ? { flex: 1 } : null]}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.ink2, marginBottom: 16 }} />
          {children}
          <Animated.View style={kbSpacer} />
        </View>
      </Animated.View>
      </GestureDetector>
      {/* 이 시트 위에서 여는 확인창·메뉴 (iOS는 시트 위에 루트 Modal을 띄울 수 없음) */}
      <DialogHost scope="sheet" />
    </View>
  );
}
