/**
 * 키보드가 올라오면 '지금 입력 중인 칸'이 키보드 위에 통째로 보이게 스크롤한다.
 * 버튼을 키보드 위에 붙여 띄우면 입력칸을 가리므로, 버튼은 내용 흐름에 두고 이 훅으로 입력칸에 초점을 맞춘다.
 * ScrollView에는 ref와 함께 automaticallyAdjustKeyboardInsets(iOS)를 주고, 입력칸 onFocus에 onFocus를 넘긴다.
 * 버튼을 스크롤 밖 하단에 고정하고 키보드 위로 올리는 화면(NoteScreen)은 그 버튼 영역 높이를 aboveKeyboard로 넘긴다 —
 * 입력칸이 키보드가 아니라 그 버튼 위에 보이게.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, type ScrollViewInstance, TextInput } from 'react-native';

/** 입력칸 아래로 남길 여백 (오류 문구·글자 수 표시가 함께 보이게) */
const GAP = 28;
const NONE = { current: 0 };

export function useFocusedInputScroll(aboveKeyboard: { current: number } = NONE) {
  const ref = useRef<ScrollViewInstance>(null);
  const keyboardUp = useRef(false);

  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const sv = ref.current;
    if (!input || !sv) return;
    // RN 계산은 스크롤 영역이 화면 맨 위에서 시작한다고 가정한다 → 상단 바 아래에서 시작하는 만큼(화면상 y)을 더해 준다.
    // 레이아웃·키보드 높이 반영이 끝난 다음 프레임에 맞춘다
    requestAnimationFrame(() => {
      sv.getNativeScrollRef()?.measureInWindow((_x, y) => {
        ref.current?.scrollResponderScrollNativeHandleToKeyboard(input as never, GAP + y + aboveKeyboard.current, true);
      });
    });
  }, [aboveKeyboard]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { keyboardUp.current = true; reveal(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardUp.current = false; });
    return () => { show.remove(); hide.remove(); };
  }, [reveal]);

  // 키보드가 이미 떠 있는 채로 다른 칸으로 옮겨 가면 keyboardDidShow가 다시 오지 않으므로 직접 맞춘다
  const onFocus = useCallback(() => { if (keyboardUp.current) reveal(); }, [reveal]);

  return { ref, onFocus };
}
