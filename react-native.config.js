module.exports = {
  project: { ios: {}, android: {} },
  assets: ['./src/assets/fonts'],
  // notifee는 Android에서 앱이 앞에 있을 때 받은 푸시를 시스템 알림으로 띄우는 데만 쓴다.
  // iOS는 Firebase 설정(firebase.json의 foreground presentation)으로 띄우므로 연결하지 않는다 (알림 델리게이트 충돌 방지)
  dependencies: {
    '@notifee/react-native': { platforms: { ios: null } },
  },
};
