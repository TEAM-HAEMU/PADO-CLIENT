/**
 * 앱 자체 확인창·메뉴 — OS 기본 Alert 대신 (Android 기본 대화상자는 2014년 머티리얼 모양이라 앱과 안 맞음).
 *  - dialog.alert(title, message?, buttons?)  가운데 카드 (확인·삭제 같은 결정)
 *  - dialog.menu(title, buttons)               아래에서 올라오는 메뉴 (⋯ 메뉴)
 * Alert.alert와 같은 버튼 형식({ text, style: 'cancel' | 'destructive', onPress }).
 * RN Modal로 띄워서 네이티브 모달(댓글 시트 등) 위에서도 보인다. 버튼 동작은 창이 닫힌 뒤 실행 → 이어서 다른 창·화면을 열어도 안전.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { colors, dropShadow } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Press, T } from './index';

export interface DialogButton { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }
interface DialogReq {
  id: number;
  kind: 'alert' | 'menu';
  title: string;
  message?: string;
  buttons: DialogButton[];
  icon?: IconName;
  /** 배경 탭·뒤로가기로 닫기 (취소 버튼이 있으면 기본 허용) */
  dismissible: boolean;
}

let seq = 0;
const useDialogStore = create<{ current: DialogReq | null; queue: DialogReq[] }>(() => ({ current: null, queue: [] }));

function push(req: Omit<DialogReq, 'id'>) {
  const r = { ...req, id: ++seq };
  const st = useDialogStore.getState();
  if (st.current) useDialogStore.setState({ queue: [...st.queue, r] });
  else useDialogStore.setState({ current: r });
}

export const dialog = {
  alert(title: string, message?: string, buttons: DialogButton[] = [{ text: '확인' }], opts: { icon?: IconName; dismissible?: boolean } = {}) {
    const destructive = buttons.some(b => b.style === 'destructive');
    push({ kind: 'alert', title, message, buttons, icon: opts.icon ?? (destructive ? 'alert' : undefined), dismissible: opts.dismissible ?? buttons.some(b => b.style === 'cancel') });
  },
  menu(title: string, buttons: DialogButton[], opts: { message?: string } = {}) {
    push({ kind: 'menu', title, message: opts.message, buttons, dismissible: true });
  },
};

const OPEN = { duration: 220, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 170, easing: Easing.in(Easing.cubic) };

export function DialogHost() {
  const current = useDialogStore(s => s.current);
  const [shown, setShown] = useState<DialogReq | null>(null);
  const progress = useSharedValue(0);
  const closing = useRef(false);
  const pending = useRef<(() => void) | undefined>(undefined); // 닫힌 뒤 실행할 버튼 동작 (워클릿으로 넘기지 않게 ref에 보관)
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    closing.current = false;
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

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.96 + progress.value * 0.04 }] }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 420 }] }));

  if (!shown) return null;
  const tap = (b: DialogButton) => close(b.onPress);
  const cancelBtn = shown.buttons.find(b => b.style === 'cancel');
  const actions = shown.buttons.filter(b => b.style !== 'cancel');

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={cancel}>
      <View style={{ flex: 1, justifyContent: shown.kind === 'alert' ? 'center' : 'flex-end', alignItems: shown.kind === 'alert' ? 'center' : 'stretch' }} accessibilityViewIsModal>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(5,9,22,0.62)' }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={cancel} accessible={shown.dismissible} accessibilityLabel="닫기" />
        </Animated.View>

        {shown.kind === 'alert' ? (
          <Animated.View style={[{ width: 330, maxWidth: '88%', borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 22, paddingTop: shown.icon ? 26 : 24, paddingBottom: 20, alignItems: 'center', gap: 16 }, dropShadow, card]}>
            {shown.icon ? (
              <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: colors.caution, opacity: 0.16 }} />
                <Icon name={shown.icon} size={28} color={colors.caution} />
              </View>
            ) : null}
            <View style={{ alignItems: 'center', gap: 8, alignSelf: 'stretch' }}>
              <T v="title" style={{ textAlign: 'center' }} accessibilityRole="header">{shown.title}</T>
              {shown.message ? <T v="body" c="ink2" style={{ textAlign: 'center' }}>{shown.message}</T> : null}
            </View>
            <View style={{ flexDirection: shown.buttons.length === 2 ? 'row' : 'column', gap: 10, alignSelf: 'stretch' }}>
              {(shown.buttons.length === 2 ? [...(cancelBtn ? [cancelBtn] : []), ...actions] : [...actions, ...(cancelBtn ? [cancelBtn] : [])]).map(b => {
                const cancelStyle = b.style === 'cancel';
                const bg = cancelStyle ? colors.card2 : b.style === 'destructive' ? colors.caution : colors.primary;
                return (
                  <Press key={b.text} testID={`dialog-${b.text}`} onPress={() => tap(b)} accessibilityLabel={b.text} style={{ flex: shown.buttons.length === 2 ? 1 : undefined, height: 50, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                    <T v="bodyStrong" c={cancelStyle ? 'ink' : 'onPrimary'}>{b.text}</T>
                  </Press>
                );
              })}
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[{ backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 12 }, sheet]}>
            <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.ink3, opacity: 0.5, marginBottom: 14 }} />
            <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 12 }}>
              <T v="title" numberOfLines={1} accessibilityRole="header">{shown.title}</T>
              {shown.message ? <T v="caption" c="ink2">{shown.message}</T> : null}
            </View>
            <View style={{ borderRadius: 20, backgroundColor: colors.page, overflow: 'hidden' }}>
              {actions.map((b, i) => (
                <Press key={b.text} testID={`dialog-${b.text}`} onPress={() => tap(b)} accessibilityLabel={b.text} style={{ paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: i < actions.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
                  <T v="body" c={b.style === 'destructive' ? 'caution' : 'ink'}>{b.text}</T>
                </Press>
              ))}
            </View>
            {cancelBtn ? (
              <Press testID={`dialog-${cancelBtn.text}`} onPress={() => tap(cancelBtn)} accessibilityLabel={cancelBtn.text} style={{ marginTop: 12, height: 52, borderRadius: 20, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
                <T v="bodyStrong">{cancelBtn.text}</T>
              </Press>
            ) : null}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
