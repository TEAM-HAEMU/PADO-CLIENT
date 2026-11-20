import Geolocation from '@react-native-community/geolocation';
import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import { isLocationEnabled } from 'react-native-device-info';
import { check, PERMISSIONS, request, requestMultiple, RESULTS } from 'react-native-permissions';
import { create } from 'zustand';
import { clearAnalyticsLocation, setAnalyticsLocation, setAnalyticsRegion, track } from '@/services/analytics';
import { regionOf } from '@/utils/address';
import { kv } from '@/store/storage';
import type { Coords } from '@/utils/geo';
import { clampText } from '@/utils/text';

export type { Coords };

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
/** iOS 빠른 첫 위치(캐시) 대기 — 이 안에 안 오면 감시를 켠다 */
const QUICK_MS = 3000;
/** 기기가 잡아 둔 위치를 '지금 위치'로 믿는 최대 나이 — 더 오래된 건 지도 카메라·동네 이름에만 (stale) */
export const RECENT_FIX_MS = 120_000;
/** Android에서 지도 카메라·동네 이름용으로 받아 볼 기기의 마지막 위치 최대 나이 (하루) */
const HINT_MAX_AGE_MS = 86_400_000;
// 걸으면서 바로 따라오게 — 5m 움직이면, 최대 4초(빠르면 2초) 간격으로 (기본값은 10초·100m라 이동이 늦게 반영됐다)
const WATCH_OPTS = { enableHighAccuracy: true, distanceFilter: 5, interval: 4000, fastestInterval: 2000 };
// Android: 감시가 켜질 때 기기가 들고 있던 위치는 2분 안 것만 (기본값은 나이 제한이 없어 몇 시간 전 위치가 '지금 위치'로 들어올 수 있었다)
const ANDROID_WATCH_OPTS = { ...WATCH_OPTS, maximumAge: RECENT_FIX_MS };
/**
 * 감시가 이보다 오래 멈춰 있었으면(백그라운드 등) 들고 있던 좌표를 '지금 위치'로 믿지 않는다 — 새 위치를 받을 때까지 드랍 생성·잠금 판정에 안 씀.
 * 감시가 도는 동안엔 가만히 있어도(distanceFilter라 새 값이 안 옴) 낡은 게 아니다. 10분 — 잠깐 다른 앱에 다녀온 정도로는 잠그지 않게 느슨하게.
 * 알려진 한계: 감시가 도는 동안 신호만 끊기면(지하철·지하) 오류가 안 와 좌표가 계속 '지금 위치'로 남는다 (움직였어도 새 값이 올 때까지 그대로)
 */
export const STALE_MS = 600_000;
/** 드랍을 남길 수 있는 최대 위치 오차(m) — 이보다 크면(Android 대략적인 위치·iOS 정확한 위치 끔 등) 엉뚱한 자리에 남지 않게 막는다 */
export const DROP_MAX_ACCURACY_M = 100;

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

/** 위치를 못 받은 상태에서 다시 볼 때 할 일 — wait: 감시를 그대로 두고 기다림 / restart: 감시를 처음부터 / off: 위치 서비스가 꺼졌다고 알림 */
export type RecheckAction = 'wait' | 'restart' | 'off';
/**
 * 신호 약함(timeout)이면 감시를 끊지 않는다 — 끊었다 다시 켜면 GPS가 위성을 처음부터 다시 잡아야 해 약한 신호에선 끝내 못 잡았다.
 * 감시를 다시 켜는 건 위치 서비스 꺼짐(off)에서 다시 켜졌을 때·감시가 돌고 있지 않을 때만.
 * servicesOn: 기기 위치 서비스가 켜져 있는가 (확인 실패면 null — 예전처럼 off는 다시 시도, timeout은 기다림)
 */
export function recheckAction(reason: FixReason | null, servicesOn: boolean | null, watching: boolean): RecheckAction {
  if (servicesOn === false) return reason === 'off' ? 'wait' : 'off';
  if (reason === 'timeout' && watching) return 'wait';
  return 'restart';
}
/** 받은 위치가 '지금 위치'로 믿을 만큼 최근인가 (시각을 모르면 믿는다) */
export const isRecentFix = (timestamp: number | undefined, now: number) => !(typeof timestamp === 'number' && timestamp > 0 && now - timestamp > RECENT_FIX_MS);
/** 감시를 다시 시작한 계기 — location_first_fix 분석용 */
export type BeginTrigger = 'start' | 'foreground' | 'retry';

interface LocationState {
  /** 실제로 받은 위치만 (못 받으면 null, 권한·위치 서비스를 끄면 비움). 드랍 생성·잠금 판정엔 currentCoords()로 — stale이면 안 씀 */
  coords: Coords | null;
  /** coords의 오차 반경(m) — 모르면 null. Android '대략적인 위치'·iOS '정확한 위치' 끔이면 수 km */
  accuracy: number | null;
  /** coords를 잡은 시각(ms) */
  fixedAt: number | null;
  /** coords는 남아 있지만 지금 위치라고 믿을 수 없다 — 감시가 STALE_MS 넘게 멈췄다 다시 켜져 새 위치를 기다리는 중 (지도 카메라·주변 목록엔 그대로 씀) */
  stale: boolean;
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
  /** 마지막 권한 요청이 창 없이 막혔다 — iOS 거부, Android '다시 묻지 않음'. 이때는 설정 앱에서만 켤 수 있다 */
  permissionBlocked: boolean;
  /**
   * '위치 권한이 꺼져 있어요' 카드를 눌렀을 때 — 다시 물을 수 있으면 권한을 요청하고, 막혀 있으면(permissionBlocked) 설정 앱을 연다.
   * 허용되면 감시를 처음부터 다시. 반환: granted / denied(요청 창에서 거부) / settings(설정 앱을 엶)
   */
  askPermission: () => Promise<'granted' | 'denied' | 'settings'>;
  /** 위치 감시를 붙잡는다 (앱 전체에 감시는 하나). 돌려받은 함수로 놓고, 모두 놓으면 감시를 멈춘다. 이미 감시 중이면 그대로 둔다. 앱이 백그라운드인 동안은 멈췄다 돌아오면 다시 */
  start: () => () => void;
  /** 권한·GPS를 켠 뒤 등 — 감시를 처음부터 다시 (붙잡은 곳이 없거나 백그라운드면 아무것도 안 함) */
  restart: () => void;
  /**
   * 위치를 못 받은 상태(unavailable)에서 다시 보기 — 위치 서비스 상태만 확인하고, 신호 약함이면 감시는 그대로 둔다 (recheckAction).
   * manual: 사용자가 '다시 시도'를 누름 — 신호 약함이면 감시는 그대로 두고 '찾는 중'으로 돌려 시간 초과를 새로 잰다
   */
  recheck: (manual?: boolean) => Promise<void>;
}

/** 드랍 생성·잠금 판정에 써도 되는 위치 — 낡은 좌표(stale)면 null */
export const currentCoords = (s: Pick<LocationState, 'coords' | 'stale'>): Coords | null => (s.stale ? null : s.coords);
/** 위치 오차가 커서 드랍을 남길 수 없다 (오차를 모르면 허용) */
export const tooImpreciseToDrop = (s: Pick<LocationState, 'accuracy'>) => s.accuracy != null && s.accuracy > DROP_MAX_ACCURACY_M;
/** 오차가 커서 드랍을 막을 때 안내 — 제목과 설명 (설정 열기 버튼과 함께) */
export const PRECISE_DROP_TITLE = '정확한 위치를 켜야 드랍을 남길 수 있어요';
export const preciseDropHint = () =>
  Platform.OS === 'android'
    ? "설정 > 권한 > 위치에서 '정확한 위치 사용'을 켜주세요. 이미 켜져 있다면 실외에서 잠시 뒤 다시 시도해주세요."
    : "설정 > 위치에서 '정확한 위치'를 켜주세요. 이미 켜져 있다면 실외에서 잠시 뒤 다시 시도해주세요.";

type Position = { coords: Coords & { accuracy?: number | null }; timestamp?: number };

// ── 앱 전체 위치 감시 하나 (붙잡은 수만큼 유지, 앱이 백그라운드면 잠시 멈춤)
let holders = 0;
let watchId: number | null = null;
/** 다시 시작할 때마다 올린다 — 지난 회차의 늦은 콜백은 버린다 */
let session = 0;
let timers: ReturnType<typeof setTimeout>[] = [];
/** 이번 회차에 위치를 한 번이라도 받았는지 (빠른 첫 위치 포함) */
let sessionFixed = false;
/** 이번 회차에 감시가 직접 위치를 줬는지 — 빠른 첫 위치는 최대 2분 전 캐시라 '멈추는 순간까지 지금 위치'로 치지 않는다 */
let watchFixed = false;
/** 마지막으로 센 location_unavailable 이유 — 같은 이유를 거듭(포그라운드마다 다시 시작할 때 포함) 세지 않게. 위치를 받으면 비움 */
let loggedReason: FixReason | null = null;
/** coords가 '지금 위치'였다고 마지막으로 확인된 시각 — 위치를 받을 때, 위치를 받은 감시를 멈출 때 */
let confirmedAt = 0;
/** 앱이 백그라운드라 감시를 멈춰 둠 (앞으로 오면 다시 켬) */
let paused = false;
/** 믿을 만한 좌표 없이 시작한 회차 — 첫 위치까지 걸린 시간을 location_first_fix로 센다 (받으면 비움) */
let firstFixWait: { since: number; trigger: BeginTrigger } | null = null;
/** 이번 회차의 마지막 위치 오류 — 시간 초과 때 이유를 가린다 */
let lastErr: PosError | undefined;
let appSub: { remove: () => void } | null = null;

export const useLocation = create<LocationState>((set, get) => {
  const halt = () => {
    // 위치를 준 감시가 멈추는 순간까지는 그 좌표가 지금 위치였다 (빠른 첫 위치만 받았으면 그 위치를 잡은 시각 그대로)
    if (watchId !== null && watchFixed && get().coords && !get().stale) confirmedAt = Date.now();
    session++;
    sessionFixed = false;
    watchFixed = false;
    timers.forEach(clearTimeout);
    timers = [];
    if (watchId !== null) Geolocation.clearWatch(watchId);
    watchId = null;
  };
  /** 지금 위치로 믿을 수 있는 좌표가 있는가 — 이번 회차에 받았거나, 확인된 지 STALE_MS 안 */
  const fresh = () => !!get().coords && !get().stale && (sessionFixed || Date.now() - confirmedAt < STALE_MS);
  const got = (pos: Position, source: 'quick' | 'watch') => {
    const now = Date.now();
    const at = typeof pos.timestamp === 'number' && pos.timestamp > 0 ? Math.min(pos.timestamp, now) : now;
    const acc = pos.coords.accuracy;
    const accuracy = typeof acc === 'number' && acc > 0 ? acc : null;
    const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    sessionFixed = true;
    loggedReason = null;
    confirmedAt = at;
    setAnalyticsLocation(c.latitude, c.longitude);
    set({ coords: c, accuracy, fixedAt: at, stale: false, fix: 'ok', reason: null });
    kv.set(LAST_KEY, c);
    if (firstFixWait) {
      // 믿을 만한 좌표 없이 시작해 처음 '지금 위치'를 받기까지 — 감시를 다시 켜지 않고 기다린 시간 전부 (신호 약함을 띄운 뒤 받은 것도 포함)
      track('location_first_fix', { wait_ms: now - firstFixWait.since, accuracy_m: accuracy == null ? null : Math.round(accuracy), age_ms: now - at, source, trigger: firstFixWait.trigger });
      firstFixWait = null;
    }
  };
  /**
   * '지금 위치'로 믿기엔 오래된 위치(RECENT_FIX_MS 넘음) — 지도 카메라·동네 이름에만 쓰게 stale로 둔다 (드랍 생성·잠금 판정엔 안 씀).
   * 이미 믿을 만한 좌표나 더 최근 좌표가 있으면 덮지 않는다
   */
  const hint = (pos: Position) => {
    if (sessionFixed || fresh()) return;
    const at = typeof pos.timestamp === 'number' && pos.timestamp > 0 ? Math.min(pos.timestamp, Date.now()) : 0;
    const prev = get();
    if (prev.coords && (prev.fixedAt ?? 0) >= at) return;
    const acc = pos.coords.accuracy;
    const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    set({ coords: c, accuracy: typeof acc === 'number' && acc > 0 ? acc : null, fixedAt: at || null, stale: true });
    kv.set(LAST_KEY, c);
  };
  /** 위치 권한이 있는가 (확인 실패면 있다고 본다 — 예전처럼 감시 결과로 판단) */
  const permitted = async () => (await get().refreshPermission().catch(() => 'granted' as const)) === 'granted';
  /**
   * 감시를 켜면서 권한도 바로 본다 — 없으면 시간 초과(15초)를 기다리지 않고 바로 '권한 꺼짐'으로.
   * Android는 권한 없이 감시를 켜도 오류(코드 1)를 주지 않아, 예전엔 시간 초과 뒤 '위치 신호가 약해요'로 잘못 안내했다 (QA 2026-11-20 B-02).
   * 권한 꺼짐이면 감시도 멈춘다(설정에서 켜고 돌아오면 포그라운드에서 처음부터). iOS 위치 서비스 꺼짐(UNAVAILABLE)은 'off' — 감시는 그대로
   */
  const gate = async (s: number) => {
    if (await permitted()) return;
    const reason = await reasonOf({ code: 1 });
    if (s !== session || sessionFixed) return;
    if (reason === 'denied') halt();
    fail(reason, true);
  };
  /**
   * 위치를 못 받음. 권한 거부·위치 서비스 꺼짐(확정 오류)이면 갖고 있던 좌표도 버린다 — 그 좌표로 드랍을 만들거나 잠금을 풀지 않게.
   * 신호 약함이면 믿을 만한 좌표가 있을 땐 그대로 두고(감시는 계속), 없으면 unavailable (낡은 좌표는 stale로 남겨 지도 카메라에만)
   */
  const giveUp = async (s: number, e?: PosError) => {
    let hard = definitive(e);
    if (!hard && fresh()) return;
    const at = get().fixedAt;
    let reason = await reasonOf(e);
    // 오류 없이 시간만 지났는데 권한이 없다 — 신호 약함이 아니라 권한 꺼짐 (Android는 권한 없이 감시를 켜도 코드 1을 주지 않는다)
    if (reason === 'timeout' && !(await permitted())) { reason = await reasonOf({ code: 1 }); hard = true; }
    // 기다리는 사이 새 회차가 시작됐거나 새 위치가 왔으면 버린다
    if (s !== session || get().fixedAt !== at) return;
    if (!hard && fresh()) return;
    fail(reason, hard);
  };
  const fail = (reason: FixReason, hard: boolean) => {
    const was = get();
    if (hard) {
      set({ coords: null, accuracy: null, fixedAt: null, stale: false, fix: 'unavailable', reason });
      // 분석 공통 속성의 마지막 좌표·지역(시·군·구)도 더는 붙이지 않는다
      clearAnalyticsLocation();
      setAnalyticsRegion(null);
    } else {
      set({ stale: !!was.coords, fix: 'unavailable', reason });
    }
    // 감시가 같은 오류를 거듭 내도, 포그라운드로 와 다시 시작해 같은 이유로 또 못 받아도 한 번만 센다
    if (loggedReason !== reason) {
      loggedReason = reason;
      track('location_unavailable', { reason });
    }
  };
  /** 첫 위치를 waitMs 안에 못 받으면 '신호 약함' (감시는 계속) */
  const armTimeout = (s: number, waitMs: number) => {
    timers.push(setTimeout(() => { if (s === session && !fresh()) giveUp(s, lastErr); }, waitMs));
  };
  /**
   * 정밀 감시 하나 + 기기가 잡아 둔 위치 한 번.
   * iOS: 1) 최근(2분 안) 위치를 단발 요청으로 바로 받고 → 2) 감시. 감시 중엔 단발 요청(getCurrentPosition)을 절대 부르지 않는다 —
   *   iOS 라이브러리가 단발 요청 때 감시를 멈췄다가 다시 켜지 못해(빈 startObserving) 첫 위치 뒤로 이동이 전혀 안 들어왔다.
   * Android: 감시를 바로 켜고 단발 요청을 함께 — Play 위치 단발 요청은 timeout을 무시하고 기기에 최근 위치가 없으면
   *   저전력(PRIORITY_LOW_POWER) 요청으로 넘어가 답이 없어, 감시가 예비 타이머(4초) 뒤에야 켜졌다.
   *   단발 요청은 기기의 마지막 위치(하루 안)를 받는 용도 — 2분 안이면 지금 위치로, 더 오래됐으면 지도 카메라·동네 이름에만(hint).
   *   Android 라이브러리는 단발·감시 콜백이 따로라 함께 써도 감시가 멈추지 않는다.
   */
  const begin = (trigger: BeginTrigger) => {
    halt();
    const s = session;
    lastErr = undefined;
    const { coords } = get();
    const trusted = fresh();
    firstFixWait = trusted ? null : { since: Date.now(), trigger };
    if (!coords) set({ fix: 'locating', reason: null });
    else if (!trusted) set({ stale: true, fix: 'locating', reason: null });
    const android = Platform.OS === 'android';
    const watch = () => {
      if (s !== session || watchId !== null) return;
      watchId = Geolocation.watchPosition(p => {
        if (s !== session) return;
        watchFixed = true; // 감시가 위치를 줬으면 늦게 온 빠른 첫 위치(최대 2분 전 캐시)는 버린다 — 최신 위치를 덮지 않게
        got(p, 'watch');
      }, e => {
        if (s !== session) return;
        lastErr = e;
        if (definitive(e)) giveUp(s, e);
      }, android ? ANDROID_WATCH_OPTS : WATCH_OPTS);
    };
    if (android) watch();
    Geolocation.getCurrentPosition(
      p => {
        if (s !== session) return;
        if (!watchFixed) {
          if (!android || isRecentFix(p.timestamp, Date.now())) got(p, 'quick');
          else hint(p);
        }
        watch();
      },
      e => {
        if (s !== session) return;
        lastErr = e;
        if (definitive(e)) giveUp(s, e);
        watch();
      },
      android
        ? { enableHighAccuracy: false, maximumAge: HINT_MAX_AGE_MS }
        : { enableHighAccuracy: false, timeout: QUICK_MS, maximumAge: RECENT_FIX_MS },
    );
    if (!android) timers.push(setTimeout(watch, QUICK_MS + 1000));
    // 첫 위치를 FIX_TIMEOUT_MS 안에 못 받으면 '신호 약함'. 들고 있는 좌표가 아직 믿을 만하면 그 믿음이 끝날 때(STALE_MS)까지는 기다린다
    const trustLeft = get().coords && !get().stale ? confirmedAt + STALE_MS - Date.now() : 0;
    armTimeout(s, Math.max(FIX_TIMEOUT_MS, trustLeft));
    gate(s);
  };
  /** 백그라운드로 가면 고정밀 감시를 멈추고(배터리), 돌아오면 다시 — 붙잡은 곳이 있을 때만 */
  const onAppState = (st: AppStateStatus) => {
    if (st === 'background') {
      if (paused) return;
      paused = true;
      if (holders > 0) halt();
    } else if (st === 'active' && paused) {
      paused = false;
      // 설정에서 권한을 바꾸고 왔을 수 있다 — 화면 쪽 리스너 순서(begin이 fix를 locating으로 바꿈)와 상관없이 여기서 다시 읽는다
      get().refreshPermission().catch(() => {});
      if (holders > 0) begin('foreground');
    }
  };

  return {
    coords: null,
    accuracy: null,
    fixedAt: null,
    stale: false,
    fix: 'locating',
    reason: null,
    permission: 'unknown',
    permissionBlocked: false,
    label: '',
    address: '',
    setPlace: (label, address) => {
      set({ label, address: clampText(address, 200) });
      // 분석에는 시·군·구까지만 (동·번지는 보내지 않음)
      setAnalyticsRegion(regionOf(address));
    },
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
      let results: string[];
      if (Platform.OS === 'android') {
        // Android 12+는 정밀·대략 위치를 함께 요청해야 '대략적인 위치'만 고를 수도 있다 (정밀만 요청하면 정책 위반 소지)
        const rs = await requestMultiple([PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]);
        results = [rs[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION], rs[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]];
      } else {
        results = [await request(PERM)];
      }
      const granted = results.some(ok);
      const p: PermState = granted ? 'granted' : 'denied';
      track('location_permission_result', { result: p, was: get().permission });
      set({ permission: p, permissionBlocked: !granted && results.some(r => r === RESULTS.BLOCKED) });
      return p;
    },
    askPermission: async () => {
      if ((await get().refreshPermission()) !== 'granted' && (await get().requestPermission()) !== 'granted') {
        if (!get().permissionBlocked) return 'denied';
        await Linking.openSettings().catch(() => {});
        return 'settings';
      }
      get().restart();
      return 'granted';
    },
    start: () => {
      if (!appSub) {
        paused = AppState.currentState === 'background';
        appSub = AppState.addEventListener('change', onAppState);
      }
      holders++;
      if (holders === 1 && !paused) begin('start');
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders--;
        if (holders === 0) {
          halt();
          loggedReason = null;
        }
      };
    },
    restart: () => { if (holders > 0 && !paused) begin('retry'); },
    recheck: async (manual = false) => {
      if (holders === 0 || paused || get().fix !== 'unavailable') return;
      const s = session;
      const on = await isLocationEnabled().catch(() => null);
      // 확인하는 사이 새 회차가 시작됐거나 위치가 왔으면 그대로
      if (s !== session || paused || get().fix !== 'unavailable') return;
      const action = recheckAction(get().reason, on, watchId !== null);
      if (action === 'restart') return begin('retry');
      if (action === 'off') return fail('off', true);
      if (manual && get().reason === 'timeout') {
        // 감시는 그대로 — 다시 '찾는 중'으로 보이고 시간 초과를 새로 잰다
        set({ fix: 'locating', reason: null });
        armTimeout(s, FIX_TIMEOUT_MS);
      }
    },
  };
});

export { distanceM, formatDistance } from '@/utils/geo';
