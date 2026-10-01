import { create } from 'zustand';
import { kv } from './storage';
import { setAnalyticsOptOut, setUserProps, track } from '@/services/analytics';

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
  /** 설정 › 이용 데이터 분석 (Amplitude). 끄면 이벤트를 보내지 않음 */
  analytics: boolean;
  setAnalytics: (v: boolean) => void;
  /** null = 매번 선택 */
  setService: (s: ServiceId | null, remember?: boolean) => void;
  setDistanceMode: (m: DistanceMode) => void;
  setAutoplayNearby: (v: boolean) => void;
  setNotify: (k: keyof Prefs['notify'], v: boolean) => void;
  setLocationPrompted: () => void;
}

const saved = kv.get<Partial<Prefs>>('prefs', {});

export const usePrefs = create<Prefs>((set, get) => {
  const persist = () => {
    const { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted, analytics } = get();
    kv.set('prefs', { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted, analytics });
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
    analytics: saved.analytics ?? true,
    setService: (service, remember = true) => { set({ service: remember ? service : get().service, rememberService: remember }); persist(); changed('service', service); },
    setDistanceMode: distanceMode => { set({ distanceMode }); persist(); changed('distance_mode', distanceMode); },
    setAutoplayNearby: autoplayNearby => { set({ autoplayNearby }); persist(); changed('autoplay_nearby', autoplayNearby); },
    setNotify: (k, v) => { set({ notify: { ...get().notify, [k]: v } }); persist(); changed(`notify_${k}`, v); },
    setAnalytics: analytics => {
      // 끄기 직전 한 번 기록하고 끈다 / 켤 때는 켠 뒤 기록
      if (!analytics) changed('analytics', false);
      setAnalyticsOptOut(!analytics);
      if (analytics) changed('analytics', true);
      set({ analytics }); persist();
    },
    setLocationPrompted: () => { set({ locationPrompted: true }); persist(); },
  };
});
