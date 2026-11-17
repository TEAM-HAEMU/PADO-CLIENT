import { create } from 'zustand';
import { kv } from './storage';
import { migrateAnalyticsMode, setAnalyticsMode as applyAnalyticsMode, setUserProps, track, type AnalyticsMode, type SavedAnalyticsPrefs } from '@/services/analytics';
import { reportError, setMonitoringMode } from '@/services/monitoring';
import type { PushSettings } from '@/api/types';

export { migrateAnalyticsMode };

export type ServiceId = 'spotify' | 'youtubeMusic' | 'appleMusic';

interface Prefs {
  /** 전체 듣기에 쓸 앱. null이면 처음 재생할 때 선택 시트를 띄움 */
  service: ServiceId | null;
  rememberService: boolean;
  /** 지도에 들어오면 가까운 음악 드랍 미리듣기를 순서대로 자동 재생 */
  autoplayNearby: boolean;
  /**
   * 알림 설정 — 서버(GET·PUT /push/settings)가 원본이고 여기는 마지막으로 받은 값 (설정 화면 첫 표시·인앱 SSE 토스트 거르기).
   * 바꾸기는 services/pushSettings (서버 저장 · 실패하면 되돌림)
   */
  notify: PushSettings;
  locationPrompted: boolean;
  /** 막 가입했다 — 알림 권한 안내(온보딩 한 장)를 아직 안 보여 줌. 보여 주면 끈다 */
  pushPromptPending: boolean;
  /** 처음 실행 소개 3장(온보딩)을 봤는지 — 본 뒤엔 로그인 화면부터 */
  onboardingSeen: boolean;
  /**
   * 설정 › 이용 분석 (Amplitude). basic = 기기 단위 익명 분석(기본 켜짐), detailed = 상세 분석(직접 켠 사람만), off = 끔.
   * 동의창은 띄우지 않는다 (iOS 5.1.2(i))
   * off면 오류 진단(Sentry)도 멈춘다. basic·detailed는 오류 진단에 차이가 없다 (services/monitoring)
   */
  analyticsMode: AnalyticsMode;
  setAnalyticsMode: (m: AnalyticsMode) => void;
  /** null = 매번 선택 */
  setService: (s: ServiceId | null, remember?: boolean) => void;
  setAutoplayNearby: (v: boolean) => void;
  /** 사용자가 바꿈 (분석 setting_changed) */
  setNotify: (k: keyof PushSettings, v: boolean) => void;
  /** 서버 값으로 맞춤 (분석 안 함) */
  applyNotify: (next: Partial<PushSettings>) => void;
  setLocationPrompted: () => void;
  setPushPromptPending: (v: boolean) => void;
  setOnboardingSeen: () => void;
}

const saved = kv.get<Partial<Prefs> & SavedAnalyticsPrefs>('prefs', {});

/** 상세 분석을 켠 직후 할 일 (로그인돼 있으면 사용자 식별) — auth 스토어가 등록 (순환 import 방지) */
let onDetailedEnabled: (() => void) | undefined;
export const setOnDetailedAnalyticsEnabled = (fn: () => void) => { onDetailedEnabled = fn; };

export const usePrefs = create<Prefs>((set, get) => {
  const persist = () => {
    const { service, rememberService, autoplayNearby, notify, locationPrompted, pushPromptPending, onboardingSeen, analyticsMode } = get();
    kv.set('prefs', { service, rememberService, autoplayNearby, notify, locationPrompted, pushPromptPending, onboardingSeen, analyticsMode });
  };
  const changed = (key: string, value: string | boolean | null) => {
    track('setting_changed', { key, value });
    if (value !== null) setUserProps({ [`pref_${key}`]: value });
  };
  return {
    service: saved.service ?? null,
    rememberService: saved.rememberService ?? true,
    autoplayNearby: saved.autoplayNearby ?? true,
    // 서버 기본값과 같게 (공지는 예전 저장값에 없음)
    notify: { like: true, comment: true, nearby: false, notice: true, ...saved.notify },
    locationPrompted: saved.locationPrompted ?? false,
    pushPromptPending: saved.pushPromptPending ?? false,
    onboardingSeen: saved.onboardingSeen ?? false,
    analyticsMode: migrateAnalyticsMode(saved),
    setService: (service, remember = true) => { set({ service: remember ? service : get().service, rememberService: remember }); persist(); changed('service', service); },
    setAutoplayNearby: autoplayNearby => { set({ autoplayNearby }); persist(); changed('autoplay_nearby', autoplayNearby); },
    setNotify: (k, v) => { set({ notify: { ...get().notify, [k]: v } }); persist(); changed(`notify_${k}`, v); },
    applyNotify: next => {
      const cur = get().notify;
      const merged = { ...cur, ...next };
      if ((Object.keys(merged) as (keyof PushSettings)[]).every(k => merged[k] === cur[k])) return;
      set({ notify: merged }); persist();
    },
    setAnalyticsMode: next => {
      const prev = get().analyticsMode;
      if (prev === next) return;
      set({ analyticsMode: next }); persist();
      // 끄기 직전 한 번 기록하고 끈다 / 켠 뒤에 기록한다
      if (next === 'off') changed('analytics_mode', next);
      setMonitoringMode(next);
      // SDK 시작이 실패해도 고른 값은 그대로 둔다 (분석 모듈의 모드도 이미 바뀌어 있어 둘이 어긋나지 않음 — 시작 못 한 동안은 보내지 않고, 다음 적용 때 다시 시작)
      applyAnalyticsMode(next)
        .then(() => {
          if (next === 'off') return;
          changed('analytics_mode', next);
          if (next === 'detailed') onDetailedEnabled?.();
        })
        .catch(e => reportError(e, 'analytics_mode'));
    },
    setLocationPrompted: () => { set({ locationPrompted: true }); persist(); },
    setPushPromptPending: v => { if (get().pushPromptPending !== v) { set({ pushPromptPending: v }); persist(); } },
    setOnboardingSeen: () => { if (!get().onboardingSeen) { set({ onboardingSeen: true }); persist(); } },
  };
});
