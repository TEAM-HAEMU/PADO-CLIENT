import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

export interface ToastMsg { id: number; text: string; tone: 'default' | 'error' | 'success'; art?: string | null }
interface ToastState { current: ToastMsg | null; show: (text: string, tone?: ToastMsg['tone'], art?: string | null) => void; hide: () => void }

let n = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>(set => ({
  current: null,
  show: (text, tone = 'default', art = null) => {
    clearTimeout(timer);
    set({ current: { id: ++n, text, tone, art } });
    AccessibilityInfo.announceForAccessibility(text); // 화면 낭독기 사용자에게도 알림
    timer = setTimeout(() => set({ current: null }), tone === 'error' ? 3600 : 2600);
  },
  hide: () => set({ current: null }),
}));
export const toast = (text: string, tone?: ToastMsg['tone']) => useToast.getState().show(text, tone);
