import Geolocation from '@react-native-community/geolocation';
import { Platform } from 'react-native';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';
import { create } from 'zustand';
import { setAnalyticsLocation, track } from '@/services/analytics';

export interface Coords { latitude: number; longitude: number }

/** 위치를 아직 모를 때 지도 카메라만 두는 기준 좌표 — 드랍 생성·주변 검색에는 절대 쓰지 않는다 */
export const FALLBACK: Coords = { latitude: 35.1889, longitude: 128.9038 };

const PERM = Platform.select({ ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, default: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION });

type PermState = 'unknown' | 'granted' | 'denied';
type FixState = 'locating' | 'ok' | 'unavailable';
/** 위치를 못 받은 이유 — denied: 권한 꺼짐 / off: 기기 위치 서비스(GPS) 꺼짐 / timeout: 신호 약함(실내 등) */
export type FixReason = 'denied' | 'off' | 'timeout';

// 권한 요청은 react-native-permissions가 맡는다. Android는 가능하면 Google Play 위치(와이파이·기지국 포함)로
Geolocation.setRNConfiguration({ skipPermissionRequests: true, authorizationLevel: 'whenInUse', locationProvider: 'auto' });

/**
 * 오류 코드 → 이유. 코드 2(POSITION_UNAVAILABLE)는 Android에선 위치 서비스 꺼짐, iOS에선 '지금은 못 잡음'(신호 약함).
 * iOS는 위치 서비스를 끄면 권한 거부(코드 1)로 오므로 권한 상태(UNAVAILABLE)를 한 번 더 확인한다.
 */
async function reasonOf(e: { code?: number } | undefined): Promise<FixReason> {
  if (e?.code === 1) {
    if (Platform.OS === 'ios' && (await check(PERM).catch(() => null)) === RESULTS.UNAVAILABLE) return 'off';
    return 'denied';
  }
  if (e?.code === 2) return Platform.OS === 'android' ? 'off' : 'timeout';
  return 'timeout';
}
interface LocationState {
  /** 실제로 받은 위치만 (못 받으면 null) */
  coords: Coords | null;
  fix: FixState;
  /** fix가 unavailable일 때 이유 */
  reason: FixReason | null;
  permission: PermState;
  /** 역지오코딩 결과 (지도 화면이 채움) */
  label: string; // 동 이름 — 헤더
  address: string; // 드랍 생성 address 필드 (최대 200자)
  setPlace: (label: string, address: string) => void;
  refreshPermission: () => Promise<PermState>;
  requestPermission: () => Promise<PermState>;
  start: () => () => void;
}

let watchId: number | null = null;

export const useLocation = create<LocationState>((set, get) => ({
  coords: null,
  fix: 'locating',
  reason: null,
  permission: 'unknown',
  label: '',
  address: '',
  setPlace: (label, address) => set({ label, address: address.slice(0, 200) }),
  refreshPermission: async () => {
    const r = await check(PERM);
    const p: PermState = r === RESULTS.GRANTED || r === RESULTS.LIMITED ? 'granted' : r === RESULTS.DENIED ? 'unknown' : 'denied';
    set({ permission: p });
    return p;
  },
  requestPermission: async () => {
    const r = await request(PERM);
    const p: PermState = r === RESULTS.GRANTED || r === RESULTS.LIMITED ? 'granted' : 'denied';
    set({ permission: p });
    return p;
  },
  start: () => {
    const got = (pos: { coords: Coords }) => {
      setAnalyticsLocation(pos.coords.latitude, pos.coords.longitude);
      set({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, fix: 'ok', reason: null });
    };
    const giveUp = async (e?: { code?: number }) => {
      if (get().coords) return;
      const reason = await reasonOf(e);
      if (!get().coords) { set({ fix: 'unavailable', reason }); track('location_unavailable', { reason }); }
    };
    // 1) 정밀 GPS (8초) → 2) 못 잡으면 대략 위치(와이파이·기지국, 최근 5분 이내 값도 허용)로 한 번 더 — 실내에서도 지도·주변 드랍은 보이게
    const coarse = (e?: { code?: number }) => {
      if (get().coords) return;
      if (e?.code === 1) return giveUp(e);
      Geolocation.getCurrentPosition(got, giveUp, { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 });
    };
    if (!get().coords) set({ fix: 'locating', reason: null });
    Geolocation.getCurrentPosition(got, coarse, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 });
    // 여러 곳에서 start()를 불러도 위치 감시는 하나만 유지 (감시 오류는 권한 거부만 반영 — 나머지는 위의 대략 위치 시도가 결론)
    if (watchId !== null) Geolocation.clearWatch(watchId);
    const id = Geolocation.watchPosition(got, e => { if (e?.code === 1) giveUp(e); }, { enableHighAccuracy: true, distanceFilter: 15 });
    watchId = id;
    return () => { Geolocation.clearWatch(id); if (watchId === id) watchId = null; };
  },
}));

/** 두 좌표 사이 거리(m) */
export function distanceM(a: Coords, b: Coords) {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function formatDistance(m: number) {
  if (m < 10) return '바로 여기';
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}
