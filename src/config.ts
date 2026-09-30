import Config from 'react-native-config';

/** .env 값 (react-native-config). 키가 비면 해당 기능은 안내만 하고 앱은 계속 동작한다. */
export const env = {
  apiBaseUrl: Config.API_BASE_URL || 'https://d3o34y31tdp6bd.cloudfront.net/api/v1',
  useMock: (Config.USE_MOCK || '').toLowerCase() === 'true',
  googleMapsKey: Config.GOOGLE_MAPS_API_KEY || '',
  kakaoAppKey: Config.KAKAO_NATIVE_APP_KEY || '',
  google: {
    webClientId: Config.GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: Config.GOOGLE_IOS_CLIENT_ID || '',
  },
} as const;

/** 주변 드랍 검색 반경(km). 디자인 카피 "반경 1km" 기준 */
export const NEARBY_RADIUS_KM = 1;
