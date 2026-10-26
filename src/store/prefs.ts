import { create } from 'zustand';
import { kv } from './storage';
import { initAnalytics, setAnalyticsOptOut, setUserProps, track } from '@/services/analytics';

export type ServiceId = 'spotify' | 'youtubeMusic' | 'appleMusic';
export type DistanceMode = 'plain' | 'radius' | 'gradient';

interface Prefs {
  /** 전체 듣기에 쓸 앱. null이면 처음 재생할 때 선택 시트를 띄움 */
  service: ServiceId | null;
  rememberService: boolean;
  distanceMode: DistanceMode;
  /** 지도에 들어오면 가까운 음악 드랍 미리듣기를 순서대로 자동 재생 */
  autoplayNearby: boolean;
  /** 알림 설정 — 서버에 개별 설정 API가 없어 기기 로컬 (인앱 SSE 표시 여부) */
  notify: { like: boolean; comment: boolean; nearby: boolean };
  locationPrompted: boolean;
  /** 설정 › 이용 데이터 분석 (Amplitude). 선택 동의 — 동의한 경우에만 켜짐 (기본 꺼짐) */
  analytics: boolean;
  /** 분석 동의를 한 번이라도 물어봤는지 (첫 실행 안내 1회) */
  analyticsAsked: boolean;
  setAnalytics: (v: boolean) => void;
  /** null = 매번 선택 */
  setService: (s: ServiceId | null, remember?: boolean) => void;
  setDistanceMode: (m: DistanceMode) => void;
  setAutoplayNearby: (v: boolean) => void;
  setNotify: (k: keyof Prefs['notify'], v: boolean) => void;
  setLocationPrompted: () => void;
}

const saved = kv.get<Partial<Prefs>>('prefs', {});

/** 분석을 켠 직후 할 일 (로그인돼 있으면 사용자 식별) — auth 스토어가 등록 (순환 import 방지) */
let onAnalyticsEnabled: (() => void) | undefined;
export const setOnAnalyticsEnabled = (fn: () => void) => { onAnalyticsEnabled = fn; };

export const usePrefs = create<Prefs>((set, get) => {
  const persist = () => {
    const { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted, analytics, analyticsAsked } = get();
    kv.set('prefs', { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted, analytics, analyticsAsked });
  };
  const changed = (key: string, value: string | boolean | null) => {
    track('setting_changed', { key, value });
    if (value !== null) setUserProps({ [`pref_${key}`]: value });
  };
  return {
    service: saved.service ?? null,
    rememberService: saved.rememberService ?? true,
    distanceMode: saved.distanceMode ?? 'plain',
    autoplayNearby: saved.autoplayNearby ?? true,
    notify: saved.notify ?? { like: true, comment: true, nearby: false },
    locationPrompted: saved.locationPrompted ?? false,
    // 예전 버전은 기본 켜짐이었음 → 직접 고른 적이 없으면(analyticsAsked 없음) 꺼진 것으로 본다 (설정에서 직접 켜야 수집)
    analytics: saved.analyticsAsked ? saved.analytics ?? false : false,
    analyticsAsked: saved.analyticsAsked ?? false,
    setService: (service, remember = true) => { set({ service: remember ? service : get().service, rememberService: remember }); persist(); changed('service', service); },
    setDistanceMode: distanceMode => { set({ distanceMode }); persist(); changed('distance_mode', distanceMode); },
    setAutoplayNearby: autoplayNearby => { set({ autoplayNearby }); persist(); changed('autoplay_nearby', autoplayNearby); },
    setNotify: (k, v) => { set({ notify: { ...get().notify, [k]: v } }); persist(); changed(`notify_${k}`, v); },
    setAnalytics: analytics => {
      set({ analytics, analyticsAsked: true }); persist();
      if (!analytics) { changed('analytics', false); setAnalyticsOptOut(true); return; }  // 끄기 직전 한 번 기록하고 끈다
      // 동의한 뒤에야 SDK를 시작한다 (동의 전엔 아무것도 보내지 않음)
      initAnalytics({ optOut: false }).then(() => { setAnalyticsOptOut(false); changed('analytics', true); onAnalyticsEnabled?.(); });
    },
    setLocationPrompted: () => { set({ locationPrompted: true }); persist(); },
  };
});
