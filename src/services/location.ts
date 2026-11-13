import Geolocation from '@react-native-community/geolocation';
import { Platform } from 'react-native';
import { check, PERMISSIONS, request, requestMultiple, RESULTS } from 'react-native-permissions';
import { create } from 'zustand';
import { setAnalyticsLocation, track } from '@/services/analytics';
import { kv } from '@/store/storage';

export interface Coords { latitude: number; longitude: number }

/** 위치를 아직 모를 때 지도 카메라만 두는 기준 좌표 — 드랍 생성·주변 검색에는 절대 쓰지 않는다 */
export const FALLBACK: Coords = { latitude: 35.1889, longitude: 128.9038 };

/** 지난번 실행 때 마지막 위치 — 앱을 켜자마자 지도 카메라를 그 근처에 두는 데만 쓴다 (드랍·주변 검색엔 쓰지 않음) */
const LAST_KEY = 'location:last';
export const lastKnown = (): Coords | null => kv.get<Coords | null>(LAST_KEY, null);

const PERM = Platform.select({ ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, default: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION });

type PermState = 'unknown' | 'granted' | 'denied';
type FixState = 'locating' | 'ok' | 'unavailable';
/** 위치를 못 받은 이유 — denied: 권한 꺼짐 / off: 기기 위치 서비스(GPS) 꺼짐 / timeout: 신호 약함(실내 등) */
export type FixReason = 'denied' | 'off' | 'timeout';

// 권한 요청은 react-native-permissions가 맡는다.
// Android는 Google Play 위치(와이파이·기지국 포함 fused)로 — 'auto'는 기본 LocationManager(GPS만)라 도심·실내에선 이동이 거의 안 들어왔다
Geolocation.setRNConfiguration({ skipPermissionRequests: true, authorizationLevel: 'whenInUse', locationProvider: 'playServices' });

/** 첫 위치를 이 시간 안에 못 받으면 '신호 약함'으로 알린다 (감시는 계속 — 나중에 받으면 바로 ok로) */
export const FIX_TIMEOUT_MS = 15_000;
/** 빠른 첫 위치(캐시) 대기 — Android Play 위치 단발 요청엔 타임아웃이 없어 JS에서 끊는다 */
const QUICK_MS = 3000;
// 걸으면서 바로 따라오게 — 5m 움직이면, 최대 4초(빠르면 2초) 간격으로 (기본값은 10초·100m라 이동이 늦게 반영됐다)
const WATCH_OPTS = { enableHighAccuracy: true, distanceFilter: 5, interval: 4000, fastestInterval: 2000 };

type PosError = { code?: number; message?: string };
/**
 * 오류 코드 → 이유. 코드 2(POSITION_UNAVAILABLE)는 Android에선 위치 서비스 꺼짐일 때만 'off'
 * (Play 위치는 '아직 못 잡음'도 코드 2로 오므로 설정 확인 실패·제공자 없음 메시지일 때만), iOS에선 '지금은 못 잡음'(신호 약함).
 * iOS는 위치 서비스를 끄면 권한 거부(코드 1)로 오므로 권한 상태(UNAVAILABLE)를 한 번 더 확인한다.
 */
async function reasonOf(e: PosError | undefined): Promise<FixReason> {
  if (e?.code === 1) {
    if (Platform.OS === 'ios' && (await check(PERM).catch(() => null)) === RESULTS.UNAVAILABLE) return 'off';
    return 'denied';
  }
  if (e?.code === 2 && Platform.OS === 'android' && /settings|provider available/i.test(e.message ?? '')) return 'off';
  return 'timeout';
}
/** 기다려 봐야 소용없는 오류 — 권한 거부·위치 서비스 꺼짐 */
const definitive = (e: PosError | undefined) => e?.code === 1 || (e?.code === 2 && Platform.OS === 'android' && /settings|provider available/i.test(e.message ?? ''));

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
  /** 위치 감시를 붙잡는다 (앱 전체에 감시는 하나). 돌려받은 함수로 놓고, 모두 놓으면 감시를 멈춘다. 이미 감시 중이면 그대로 둔다 */
  start: () => () => void;
  /** 권한·GPS를 켠 뒤 등 — 감시를 처음부터 다시 (붙잡은 곳이 없으면 아무것도 안 함) */
  restart: () => void;
}

// ── 앱 전체 위치 감시 하나 (붙잡은 수만큼 유지)
let holders = 0;
let watchId: number | null = null;
/** 다시 시작할 때마다 올린다 — 지난 회차의 늦은 콜백은 버린다 */
let session = 0;
let timers: ReturnType<typeof setTimeout>[] = [];

function stopWatch() {
  session++;
  timers.forEach(clearTimeout);
  timers = [];
  if (watchId !== null) Geolocation.clearWatch(watchId);
  watchId = null;
}

export const useLocation = create<LocationState>((set, get) => {
  const got = (pos: { coords: Coords }) => {
    const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setAnalyticsLocation(c.latitude, c.longitude);
    set({ coords: c, fix: 'ok', reason: null });
    kv.set(LAST_KEY, c);
  };
  const giveUp = async (s: number, e?: PosError) => {
    if (get().coords) return;
    const reason = await reasonOf(e);
    if (s === session && !get().coords) { set({ fix: 'unavailable', reason }); track('location_unavailable', { reason }); }
  };
  /**
   * 1) 기기가 최근(2분 안)에 잡아 둔 위치를 바로 한 번 (보통 즉시 옴) → 2) 정밀 감시 하나.
   * 감시 중엔 단발 요청(getCurrentPosition)을 절대 부르지 않는다 — iOS 라이브러리가 단발 요청 때 감시를 멈췄다가
   * 다시 켜지 못해(빈 startObserving) 첫 위치 뒤로 이동이 전혀 안 들어왔다.
   */
  const begin = () => {
    stopWatch();
    const s = session;
    let lastErr: PosError | undefined;
    if (!get().coords) set({ fix: 'locating', reason: null });
    const watch = () => {
      if (s !== session || watchId !== null) return;
      watchId = Geolocation.watchPosition(got, e => {
        if (s !== session) return;
        lastErr = e;
        if (definitive(e)) giveUp(s, e);
      }, WATCH_OPTS);
    };
    Geolocation.getCurrentPosition(
      p => { if (s === session) { got(p); watch(); } },
      e => {
        if (s !== session) return;
        lastErr = e;
        if (definitive(e)) giveUp(s, e);
        watch();
      },
      { enableHighAccuracy: false, timeout: QUICK_MS, maximumAge: 120_000 },
    );
    timers.push(setTimeout(watch, QUICK_MS + 1000));
    timers.push(setTimeout(() => { if (s === session && !get().coords) giveUp(s, lastErr); }, FIX_TIMEOUT_MS));
  };

  return {
    coords: null,
    fix: 'locating',
    reason: null,
    permission: 'unknown',
    label: '',
    address: '',
    setPlace: (label, address) => set({ label, address: address.slice(0, 200) }),
    refreshPermission: async () => {
      // Android에서 '대략적인 위치'만 허용했으면 정밀 위치는 거부로 나오므로 대략 위치도 본다
      const coarse = Platform.OS === 'android' ? await check(PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION) : null;
      const r = coarse === RESULTS.GRANTED ? RESULTS.GRANTED : await check(PERM);
      const p: PermState = r === RESULTS.GRANTED || r === RESULTS.LIMITED ? 'granted' : r === RESULTS.DENIED ? 'unknown' : 'denied';
      set({ permission: p });
      return p;
    },
    requestPermission: async () => {
      const ok = (r: string) => r === RESULTS.GRANTED || r === RESULTS.LIMITED;
      let granted: boolean;
      if (Platform.OS === 'android') {
        // Android 12+는 정밀·대략 위치를 함께 요청해야 '대략적인 위치'만 고를 수도 있다 (정밀만 요청하면 정책 위반 소지)
        const rs = await requestMultiple([PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]);
        granted = ok(rs[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION]) || ok(rs[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]);
      } else {
        granted = ok(await request(PERM));
      }
      const p: PermState = granted ? 'granted' : 'denied';
      set({ permission: p });
      return p;
    },
    start: () => {
      holders++;
      if (holders === 1) begin();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders--;
        if (holders === 0) stopWatch();
      };
    },
    restart: () => { if (holders > 0) begin(); },
  };
});

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
