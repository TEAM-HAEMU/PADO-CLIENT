/**
 * Play 인앱 업데이트 (sp-react-native-in-app-updates, 새 아키텍처 TurboModule).
 * 필수·선택 모두 IMMEDIATE — 사용자가 '업데이트'를 직접 누른 뒤라 Play 전체 화면이 받기·설치·다시 시작까지 맡는다.
 * (FLEXIBLE은 뒤에서 받은 뒤 '다시 시작해 설치' 안내를 앱이 따로 띄워야 하고, 그 사이 앱 상태를 챙겨야 한다)
 * Play가 없거나(사이드로드·CI APK 포함 — 이 설치를 Play가 모름) 새 버전을 아직 모르면 실패 → false
 */
import SpInAppUpdates, { IAUUpdateKind } from 'sp-react-native-in-app-updates';

const TIMEOUT_MS = 8_000;
let updater: SpInAppUpdates | null = null;

export async function startInAppUpdate(): Promise<boolean> {
  try {
    updater ??= new SpInAppUpdates(false);
    const started = updater.startUpdate({ updateType: IAUUpdateKind.IMMEDIATE }).then(() => true);
    // Play 서비스가 응답하지 않으면 오래 기다리지 않고 스토어 주소로
    const timeout = new Promise<boolean>(r => setTimeout(() => r(false), TIMEOUT_MS));
    return await Promise.race([started, timeout]);
  } catch {
    return false;
  }
}
