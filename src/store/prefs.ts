import { create } from 'zustand';
import { kv } from './storage';

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
    const { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted } = get();
    kv.set('prefs', { service, rememberService, distanceMode, autoplayNearby, notify, locationPrompted });
  };
  return {
    service: saved.service ?? null,
    rememberService: saved.rememberService ?? true,
    distanceMode: saved.distanceMode ?? 'plain',
    autoplayNearby: saved.autoplayNearby ?? true,
    notify: saved.notify ?? { like: true, comment: true, nearby: false },
    locationPrompted: saved.locationPrompted ?? false,
    setService: (service, remember = true) => { set({ service: remember ? service : get().service, rememberService: remember }); persist(); },
    setDistanceMode: distanceMode => { set({ distanceMode }); persist(); },
    setAutoplayNearby: autoplayNearby => { set({ autoplayNearby }); persist(); },
    setNotify: (k, v) => { set({ notify: { ...get().notify, [k]: v } }); persist(); },
    setLocationPrompted: () => { set({ locationPrompted: true }); persist(); },
  };
});
