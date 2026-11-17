/**
 * 앱이 백그라운드·꺼져 있을 때 받은 푸시 (index.js가 앱 등록 전에 불러온다).
 * 알림 표시는 OS가 하므로 여기선 할 일이 없다 — 핸들러가 없으면 Firebase가 경고를 남겨 빈 핸들러를 둔다.
 * Android: 앱이 앞에 있을 때 notifee로 띄운 알림을 앱이 내려간 뒤 누르면 이쪽으로 온다
 */
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

export function registerPushBackground(onPress: (data: Record<string, unknown> | undefined) => void) {
  try {
    setBackgroundMessageHandler(getMessaging(getApp()), async () => {});
  } catch {
    // Firebase 설정 파일이 없는 빌드
  }
  if (Platform.OS !== 'android') return;
  try {
    const { default: notifee, EventType } = require('@notifee/react-native') as typeof import('@notifee/react-native');
    notifee.onBackgroundEvent(async ({ type, detail }) => { if (type === EventType.PRESS) onPress(detail.notification?.data); });
  } catch {}
}
