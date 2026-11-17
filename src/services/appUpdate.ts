/**
 * 앱 업데이트 안내 — GET /settings/app-version 기준과 지금 버전(react-native-device-info)을 비교한다 (판정: utils/appVersion).
 *  - 앱 시작 때 한 번, 백그라운드에서 돌아올 때는 1시간이 지났을 때만 다시 확인
 *  - 필수(required): App이 내비게이션 대신 UpdateRequiredScreen 한 장만 그린다 (닫기 없음)
 *  - 선택(optional): 지도 화면이 다른 안내와 겹치지 않을 때 AppUpdate 시트를 띄운다 (hooks/useAppUpdatePrompt).
 *    '나중에'(또는 시트를 닫음)를 누른 latestVersion은 기기에 저장해 다시 안 띄우고, '업데이트'를 눌렀으면 이번 실행 동안만 다시 안 띄운다
 *  - 확인이 실패하면(서버에 아직 없음·네트워크) 안내하지 않고 지난 판정을 유지, 5분 뒤 복귀 때 다시
 * 개발 빌드(__DEV__)는 버전이 '1.0'으로 고정이라 실서버 기준으로 막히지 않게 확인하지 않는다 (목 모드는 확인 — 미리 보기용 플래그는 api/mock/appInfo)
 */
import { AppState, Linking, Platform } from 'react-native';
import { getVersion } from 'react-native-device-info';
import { create } from 'zustand';
import { settingsApi } from '@/api/endpoints';
import { env } from '@/config';
import { track } from '@/services/analytics';
import { kv } from '@/store/storage';
import { decideUpdate, shouldPrompt, type UpdateDecision, type UpdateKind } from '@/utils/appVersion';
import { startInAppUpdate } from './inAppUpdate';

const CHECK_EVERY_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 5 * 60 * 1000;
const DISMISSED_KEY = 'appUpdate.dismissedLatest';

export const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6820077981';
export const APP_STORE_WEB_URL = 'https://apps.apple.com/app/id6820077981';
export const PLAY_MARKET_URL = 'market://details?id=com.paado.app';
export const PLAY_WEB_URL = 'https://play.google.com/store/apps/details?id=com.paado.app';

interface AppUpdateState {
  decision: UpdateDecision | null;
  /** 다음 확인은 이 시각 이후 (복귀 때) */
  nextCheckAt: number;
  /** 이번 실행에서 선택 안내를 이미 띄운 latestVersion — 같은 실행 안에선 다시 안 띄움 */
  promptedThisRun: string | null;
}
export const useAppUpdate = create<AppUpdateState>(() => ({ decision: null, nextCheckAt: 0, promptedThisRun: null }));

const platform = () => (Platform.OS === 'ios' ? 'IOS' : 'ANDROID');
const enabled = () => !__DEV__ || env.useMock;

let inflight: Promise<void> | null = null;
export function checkAppVersion(force = false): Promise<void> {
  if (!enabled()) return Promise.resolve();
  if (!force && Date.now() < useAppUpdate.getState().nextCheckAt) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const settings = await settingsApi.appVersion();
      useAppUpdate.setState({ decision: decideUpdate(getVersion(), settings, platform()), nextCheckAt: Date.now() + CHECK_EVERY_MS });
    } catch {
      useAppUpdate.setState({ nextCheckAt: Date.now() + RETRY_AFTER_MS });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

let started = false;
/** App 시작 때 한 번 — 바로 확인하고, 앞으로 돌아올 때마다(1시간 간격) 다시 */
export function startAppUpdateCheck() {
  if (started) return;
  started = true;
  checkAppVersion(true);
  AppState.addEventListener('change', s => { if (s === 'active') checkAppVersion(); });
}

export const dismissedLatest = () => kv.get<string | null>(DISMISSED_KEY, null);

/** 지금 선택 안내 시트를 띄울 만한지 (지도 화면이 다른 조건과 함께 본다) */
export function optionalPromptDue(s: AppUpdateState = useAppUpdate.getState()): boolean {
  return s.decision?.kind === 'optional' && s.promptedThisRun !== s.decision.latestVersion && shouldPrompt(s.decision, dismissedLatest());
}

export function markPromptShown(kind: UpdateKind) {
  const d = useAppUpdate.getState().decision;
  if (kind === 'optional' && d) useAppUpdate.setState({ promptedThisRun: d.latestVersion });
  track('app_update_prompt_shown', { kind, latest_version: d?.latestVersion, current_version: getVersion() });
}

/** '나중에' — 이 latestVersion은 다시 묻지 않는다 */
export function dismissOptionalUpdate() {
  const d = useAppUpdate.getState().decision;
  if (d) kv.set(DISMISSED_KEY, d.latestVersion);
  track('app_update_dismissed', { latest_version: d?.latestVersion });
}

const open = (url: string) => Linking.openURL(url).then(() => true, () => false);

/**
 * '업데이트' — iOS: App Store 앱 → 웹 / Android: Play 인앱 업데이트 → Play 스토어 앱 → 웹
 */
export async function openAppUpdate(kind: UpdateKind) {
  track('app_update_clicked', { kind, latest_version: useAppUpdate.getState().decision?.latestVersion });
  if (Platform.OS === 'android') {
    if (await startInAppUpdate()) return;
    if (await open(PLAY_MARKET_URL)) return;
    await open(PLAY_WEB_URL);
    return;
  }
  // App Store 앱이 없으면(시뮬레이터 등) openURL이 성공으로 끝나도 아무것도 안 뜰 수 있어 먼저 확인 (itms-apps는 Info.plist 조회 허용 목록에 있음)
  const canStore = await Linking.canOpenURL(APP_STORE_URL).catch(() => false);
  if (canStore && (await open(APP_STORE_URL))) return;
  await open(APP_STORE_WEB_URL);
}
