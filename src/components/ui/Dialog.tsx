/**
 * 앱 자체 확인창·메뉴 — OS 기본 Alert 대신 (Android 기본 대화상자는 2014년 머티리얼 모양이라 앱과 안 맞음).
 *  - dialog.alert(title, message?, buttons?)  가운데 작은 카드, 버튼은 아래 가로 칸 (iOS 알림처럼 간결)
 *  - dialog.menu(title, buttons)               누른 자리(⋯ 버튼) 옆에 펼쳐지는 메뉴. 위험한 동작은 아래 따로 묶음
 * Alert.alert와 같은 버튼 형식({ text, style: 'cancel' | 'destructive', onPress }) + 메뉴용 icon.
 * RN Modal로 띄워서 네이티브 모달(댓글 시트 등) 위에서도 보인다. 버튼 동작은 창이 닫힌 뒤 실행 → 이어서 다른 창·화면을 열어도 안전.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { colors } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Press, T } from './index';

export interface DialogButton { text: string; style?: 'default' | 'cancel' | 'destructive'; icon?: IconName; onPress?: () => void }
interface DialogReq {
  id: number;
  kind: 'alert' | 'menu';
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** 배경 탭·뒤로가기로 닫기 (취소 버튼이 있으면 기본 허용) */
  dismissible: boolean;
  /** 메뉴를 펼칠 기준점 (화면 좌표) */
  at?: { x: number; y: number };
}

/** 카드 안 칸막이 — card2 위에서 보이는 선 */
const DIVIDER = '#22306A';

// ── 마지막 터치 위치 — 메뉴를 누른 자리 옆에 펼치기 위해 앱 루트에서 기록 (터치를 가로채지 않음)
let lastTouch: { x: number; y: number } | undefined;
export const touchTracker = {
  onStartShouldSetResponderCapture: (e: GestureResponderEvent) => {
    lastTouch = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    return false;
  },
};

let seq = 0;
const useDialogStore = create<{ current: DialogReq | null; queue: DialogReq[] }>(() => ({ current: null, queue: [] }));

function push(req: Omit<DialogReq, 'id'>) {
  const r = { ...req, id: ++seq };
  const st = useDialogStore.getState();
  if (st.current) useDialogStore.setState({ queue: [...st.queue, r] });
  else useDialogStore.setState({ current: r });
}

export const dialog = {
  alert(title: string, message?: string, buttons: DialogButton[] = [{ text: '확인' }], opts: { dismissible?: boolean } = {}) {
    push({ kind: 'alert', title, message, buttons, dismissible: opts.dismissible ?? buttons.some(b => b.style === 'cancel') });
  },
  /** at을 안 주면 마지막으로 누른 자리 옆에 펼친다 */
  menu(title: string, buttons: DialogButton[], opts: { at?: { x: number; y: number } } = {}) {
    push({ kind: 'menu', title, buttons, dismissible: true, at: opts.at ?? lastTouch });
  },
};

const OPEN = { duration: 180, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 140, easing: Easing.in(Easing.cubic) };
const MENU_W = 220;

export function DialogHost() {
  const current = useDialogStore(s => s.current);
  const [shown, setShown] = useState<DialogReq | null>(null);
  const [menuH, setMenuH] = useState(0);
  const progress = useSharedValue(0);
  const closing = useRef(false);
  const pending = useRef<(() => void) | undefined>(undefined); // 닫힌 뒤 실행할 버튼 동작 (워클릿으로 넘기지 않게 ref에 보관)
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  useEffect(() => {
    if (!current) return;
    closing.current = false;
    setMenuH(0);
    setShown(current);
    progress.value = 0;
    progress.value = withTiming(1, OPEN);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    const after = pending.current;
    pending.current = undefined;
    setShown(null);
    const { queue } = useDialogStore.getState();
    useDialogStore.setState({ current: queue[0] ?? null, queue: queue.slice(1) });
    // Modal이 완전히 내려간 뒤 실행 (iOS에서 닫히는 모달 위로 새 화면을 띄우면 무시됨)
    if (after) setTimeout(after, Platform.OS === 'ios' ? 60 : 0);
  };
  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    pending.current = after;
    progress.value = withTiming(0, CLOSE, done => { if (done) scheduleOnRN(finish); });
  };
  const cancel = () => {
    if (!shown?.dismissible) return;
    close(shown.buttons.find(b => b.style === 'cancel')?.onPress);
  };

  // 메뉴 위치: 누른 자리가 화면 오른쪽이면 오른쪽 끝을 맞추고, 아래 공간이 모자라면 위로 펼친다
  const at = shown?.at ?? { x: win.width - 20, y: insets.top + 56 };
  const alignRight = at.x > win.width / 2;
  const menuLeft = Math.min(Math.max(12, alignRight ? at.x - MENU_W + 18 : at.x - 18), win.width - MENU_W - 12);
  const below = at.y + 18;
  const fitsBelow = below + menuH < win.height - insets.bottom - 12;
  const menuTop = fitsBelow ? below : Math.max(insets.top + 12, at.y - 18 - menuH);
  const dir = fitsBelow ? -8 : 8;

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.95 + progress.value * 0.05 }] }));
  const menu = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * dir }, { scale: 0.96 + progress.value * 0.04 }] }));

  if (!shown) return null;
  const tap = (b: DialogButton) => close(b.onPress);
  const cancelBtn = shown.buttons.find(b => b.style === 'cancel');
  const actions = shown.buttons.filter(b => b.style !== 'cancel');
  const two = shown.buttons.length === 2;
  const alertButtons = two ? [...(cancelBtn ? [cancelBtn] : []), ...actions] : [...actions, ...(cancelBtn ? [cancelBtn] : [])];
  const plain = actions.filter(b => b.style !== 'destructive');
  const danger = actions.filter(b => b.style === 'destructive');

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={cancel}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} accessibilityViewIsModal>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: shown.kind === 'alert' ? 'rgba(3,6,16,0.62)' : 'rgba(3,6,16,0.35)' }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={cancel} accessible={shown.dismissible} accessibilityLabel="닫기" />
        </Animated.View>

        {shown.kind === 'alert' ? (
          <Animated.View style={[{ width: 300, maxWidth: '84%', borderRadius: 22, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }, card]}>
            <View style={{ paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, alignItems: 'center', gap: 6 }}>
              <T v="headline" style={{ textAlign: 'center' }} accessibilityRole="header">{shown.title}</T>
              {shown.message ? <T v="caption" c="ink2" style={{ textAlign: 'center' }}>{shown.message}</T> : null}
            </View>
            {/* 버튼 2개는 가로 칸(취소 왼쪽), 그 외는 세로 줄 */}
            <View style={{ flexDirection: two ? 'row' : 'column', borderTopWidth: 1, borderTopColor: DIVIDER }}>
              {alertButtons.map((b, i) => (
                <Press
                  key={b.text}
                  testID={`dialog-${b.text}`}
                  onPress={() => tap(b)}
                  accessibilityLabel={b.text}
                  style={[
                    { flex: two ? 1 : undefined, height: 50, alignItems: 'center', justifyContent: 'center' },
                    i > 0 ? (two ? { borderLeftWidth: 1, borderLeftColor: DIVIDER } : { borderTopWidth: 1, borderTopColor: DIVIDER }) : null,
                  ]}
                >
                  <T v={b.style === 'cancel' ? 'body' : 'bodyStrong'} c={b.style === 'destructive' ? 'caution' : b.style === 'cancel' ? 'ink' : 'primary'}>{b.text}</T>
                </Press>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            onLayout={e => { if (!menuH) setMenuH(e.nativeEvent.layout.height); }}
            accessibilityLabel={shown.title}
            style={[
              { position: 'absolute', left: menuLeft, top: menuTop, width: MENU_W, borderRadius: 18, backgroundColor: colors.card2, borderWidth: 1, borderColor: DIVIDER, overflow: 'hidden' },
              menu,
              menuH ? null : { opacity: 0 }, // 높이를 재기 전엔 숨김 (위·아래 방향 결정 후 보여줌)
            ]}
          >
            {[...plain, ...danger].map((b, i) => (
              <Press
                key={b.text}
                testID={`dialog-${b.text}`}
                onPress={() => tap(b)}
                accessibilityLabel={b.text}
                style={[
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, height: 50 },
                  // 일반 동작과 위험한 동작 사이는 두꺼운 칸막이, 나머지는 얇은 선
                  i === 0 ? null : plain.length && i === plain.length ? { borderTopWidth: 6, borderTopColor: colors.card } : { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <T v="body" c={b.style === 'destructive' ? 'caution' : 'ink'} numberOfLines={1} style={{ flexShrink: 1 }}>{b.text}</T>
                {b.icon ? <Icon name={b.icon} size={18} color={b.style === 'destructive' ? colors.caution : colors.ink2} /> : null}
              </Press>
            ))}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
