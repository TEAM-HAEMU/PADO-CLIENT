/** PADO · J 스카이 퓨어 토큰 (흰 바탕 + 하늘빛 블루, Figma '7 화이트 오션 시안' J) — tailwind.config.js와 같은 값 (JS에서 직접 필요한 곳용: SVG, 그림자, 지도) */
export const colors = {
  page: '#FFFFFF',
  card: '#F6FAFF',
  card2: '#EDF4FE',
  ink: '#1B2B4F',
  ink2: '#56688A',
  ink3: '#647493', // 4.5:1 이상 (흰 배경 대비) — 보조 텍스트도 읽히게
  line: '#E3EDF9',
  deep: '#EDF4FE',
  primary: '#4F97F2',
  primarySoft: '#E8F2FE',
  onPrimary: '#FFFFFF',
  accent: '#3A63B8',
  accent2: '#A9D1FB',
  positive: '#12A37A',
  warning: '#C58A12',
  caution: '#E2683A',
  kakao: '#FEE500',
} as const;

export const fonts = {
  regular: 'SUIT-Regular',
  medium: 'SUIT-Medium',
  semibold: 'SUIT-SemiBold',
  bold: 'SUIT-Bold',
  grotesk: 'SpaceGrotesk-Regular',
  groteskMedium: 'SpaceGrotesk-Medium',
  groteskBold: 'SpaceGrotesk-Bold',
  note: 'GowunBatang-Regular',
} as const;

/** 하늘빛 글로우 — 흰 바탕에선 은은하게 (iOS shadow; Android는 elevation 대체) */
export const glow = (opacity = 0.5, radius = 16) => ({
  shadowColor: colors.primary,
  shadowOpacity: opacity * 0.45,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
});

export const dropShadow = {
  shadowColor: colors.ink,
  shadowOpacity: 0.12,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};
