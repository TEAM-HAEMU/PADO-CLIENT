import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

/** 토스트 끝의 글자 버튼 하나 (예: 되돌리기). 누르면 토스트를 닫고 onPress를 부른다 */
export interface ToastAction { label: string; onPress: () => void }
export interface ToastMsg { id: number; text: string; tone: 'default' | 'error' | 'success'; art?: string | null; action?: ToastAction }
interface ToastState { current: ToastMsg | null; show: (text: string, tone?: ToastMsg['tone'], art?: string | null, action?: ToastAction) => void; hide: () => void }

/** 동작 버튼이 있으면 누를 틈을 조금 더 준다 */
export const toastDuration = (tone: ToastMsg['tone'], action?: ToastAction) => (action ? 5000 : tone === 'error' ? 3600 : 2600);

let n = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>(set => ({
  current: null,
  show: (text, tone = 'default', art = null, action) => {
    clearTimeout(timer);
    set({ current: { id: ++n, text, tone, art, action } });
    AccessibilityInfo.announceForAccessibility(action ? `${text} ${action.label}할 수 있어요.` : text); // 화면 낭독기 사용자에게도 알림
    timer = setTimeout(() => set({ current: null }), toastDuration(tone, action));
  },
  hide: () => { clearTimeout(timer); set({ current: null }); },
}));
export const toast = (text: string, tone?: ToastMsg['tone'], action?: ToastAction) => useToast.getState().show(text, tone, null, action);
/** 토스트의 동작 버튼을 눌렀을 때 — 같은 토스트가 아직 떠 있을 때만 한 번 실행한다 (연타·늦은 탭 막기) */
export const runToastAction = (id: number) => {
  const t = useToast.getState().current;
  if (!t || t.id !== id || !t.action) return;
  useToast.getState().hide();
  t.action.onPress();
};
