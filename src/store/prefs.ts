import { create } from 'zustand';
import { kv } from './storage';
import { migrateAnalyticsMode, setAnalyticsMode as applyAnalyticsMode, setUserProps, track, type AnalyticsMode, type SavedAnalyticsPrefs } from '@/services/analytics';

export { migrateAnalyticsMode };

export type ServiceId = 'spotify' | 'youtubeMusic' | 'appleMusic';

interface Prefs {
  /** 전체 듣기에 쓸 앱. null이면 처음 재생할 때 선택 시트를 띄움 */
  service: ServiceId | null;
  rememberService: boolean;
  /** 지도에 들어오면 가까운 음악 드랍 미리듣기를 순서대로 자동 재생 */
  autoplayNearby: boolean;
  /** 알림 설정 — 서버에 개별 설정 API가 없어 기기 로컬 (인앱 SSE 표시 여부) */
  notify: { like: boolean; comment: boolean; nearby: boolean };
  locationPrompted: boolean;
  /** 처음 실행 소개 3장(온보딩)을 봤는지 — 본 뒤엔 로그인 화면부터 */
  onboardingSeen: boolean;
  /**
   * 설정 › 이용 분석 (Amplitude). basic = 기기 단위 익명 분석(기본 켜짐), detailed = 상세 분석(직접 켠 사람만), off = 끔.
   * 동의창은 띄우지 않는다 (iOS 5.1.2(i))
   */
  analyticsMode: AnalyticsMode;
  setAnalyticsMode: (m: AnalyticsMode) => void;
  /** null = 매번 선택 */
  setService: (s: ServiceId | null, remember?: boolean) => void;
  setAutoplayNearby: (v: boolean) => void;
  setNotify: (k: keyof Prefs['notify'], v: boolean) => void;
  setLocationPrompted: () => void;
  setOnboardingSeen: () => void;
}

const saved = kv.get<Partial<Prefs> & SavedAnalyticsPrefs>('prefs', {});

/** 상세 분석을 켠 직후 할 일 (로그인돼 있으면 사용자 식별) — auth 스토어가 등록 (순환 import 방지) */
let onDetailedEnabled: (() => void) | undefined;
export const setOnDetailedAnalyticsEnabled = (fn: () => void) => { onDetailedEnabled = fn; };

export const usePrefs = create<Prefs>((set, get) => {
  const persist = () => {
    const { service, rememberService, autoplayNearby, notify, locationPrompted, onboardingSeen, analyticsMode } = get();
    kv.set('prefs', { service, rememberService, autoplayNearby, notify, locationPrompted, onboardingSeen, analyticsMode });
  };
  const changed = (key: string, value: string | boolean | null) => {
    track('setting_changed', { key, value });
    if (value !== null) setUserProps({ [`pref_${key}`]: value });
  };
  return {
    service: saved.service ?? null,
    rememberService: saved.rememberService ?? true,
    autoplayNearby: saved.autoplayNearby ?? true,
    notify: saved.notify ?? { like: true, comment: true, nearby: false },
    locationPrompted: saved.locationPrompted ?? false,
    onboardingSeen: saved.onboardingSeen ?? false,
    analyticsMode: migrateAnalyticsMode(saved),
    setService: (service, remember = true) => { set({ service: remember ? service : get().service, rememberService: remember }); persist(); changed('service', service); },
    setAutoplayNearby: autoplayNearby => { set({ autoplayNearby }); persist(); changed('autoplay_nearby', autoplayNearby); },
    setNotify: (k, v) => { set({ notify: { ...get().notify, [k]: v } }); persist(); changed(`notify_${k}`, v); },
    setAnalyticsMode: next => {
      const prev = get().analyticsMode;
      if (prev === next) return;
      set({ analyticsMode: next }); persist();
      // 끄기 직전 한 번 기록하고 끈다 / 켠 뒤에 기록한다
      if (next === 'off') changed('analytics_mode', next);
      applyAnalyticsMode(next).then(() => {
        if (next === 'off') return;
        changed('analytics_mode', next);
        if (next === 'detailed') onDetailedEnabled?.();
      });
    },
    setLocationPrompted: () => { set({ locationPrompted: true }); persist(); },
    setOnboardingSeen: () => { if (!get().onboardingSeen) { set({ onboardingSeen: true }); persist(); } },
  };
});
