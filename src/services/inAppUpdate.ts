/**
 * Play 인앱 업데이트 — Android 전용 (inAppUpdate.android.ts). iOS엔 이런 UI가 없어 App Store를 연다(services/appUpdate).
 * 띄웠으면 true, 못 띄웠으면 false (그때는 스토어 주소로 대신 연다)
 */
export async function startInAppUpdate(): Promise<boolean> {
  return false;
}
