import Config from 'react-native-config';

/** 0~1 비율 값 — 비었거나 범위를 벗어나면 기본값 */
const rate = (v: string | undefined, fallback: number) => {
  const n = v === undefined || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
};

/** .env 값 (react-native-config). 키가 비면 해당 기능은 안내만 하고 앱은 계속 동작한다. */
export const env = {
  apiBaseUrl: Config.API_BASE_URL || 'https://api.paado.app/api/v1',
  useMock: (Config.USE_MOCK || '').toLowerCase() === 'true',
  googleMapsKey: Config.GOOGLE_MAPS_API_KEY || '',
  kakaoAppKey: Config.KAKAO_NATIVE_APP_KEY || '',
  /** Amplitude 프로젝트 API 키 — 비어 있으면 분석 이벤트를 보내지 않음 */
  amplitudeApiKey: Config.AMPLITUDE_API_KEY || '',
  /** 시연·검증용: 목 모드에서도 분석 전송 (이벤트에 app_env=mock 표시) */
  amplitudeInMock: (Config.AMPLITUDE_IN_MOCK || '').toLowerCase() === 'true',
  /** 세션 리플레이 샘플링 비율 (0~1). 기본 0.3 */
  replaySampleRate: Number(Config.AMPLITUDE_REPLAY_SAMPLE_RATE) || 0.3,
  /** Sentry 오류 진단 DSN — 비어 있으면 Sentry를 켜지 않음 */
  sentryDsn: Config.SENTRY_DSN || '',
  /** 개발 빌드(__DEV__)에서도 Sentry 전송 (검증용, environment=dev) */
  sentryInDev: (Config.SENTRY_IN_DEV || '').toLowerCase() === 'true',
  /** 목 모드에서도 Sentry 전송 (검증용, environment=mock) */
  sentryInMock: (Config.SENTRY_IN_MOCK || '').toLowerCase() === 'true',
  /** 성능 추적(앱 시작·화면 전환) 샘플링 비율 (0~1). 기본 0.1 */
  sentryTracesSampleRate: rate(Config.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  google: {
    webClientId: Config.GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: Config.GOOGLE_IOS_CLIENT_ID || '',
  },
} as const;

/** 인스타 스토리 공유에 쓰는 Facebook 앱 ID (공개 값 — 스토리 아래 '파도에서 공유' 표시용) */
export const FB_APP_ID = '1667301835060992';
