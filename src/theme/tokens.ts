/** PADO · B Deep 토큰 — tailwind.config.js와 같은 값 (JS에서 직접 필요한 곳용: SVG, 그림자, 지도) */
export const colors = {
  page: '#050916',
  card: '#0B1330',
  card2: '#111B3F',
  ink: '#EAF1FF',
  ink2: '#8D9BC4',
  ink3: '#7482AE', // 4.5:1 이상 (배경 #050916 대비) — 보조 텍스트도 읽히게
  line: '#19234D',
  deep: '#02050F',
  primary: '#4FD1FF',
  primarySoft: '#0E2A4A',
  onPrimary: '#03101F',
  accent: '#3B6BFF',
  accent2: '#9BE7FF',
  positive: '#34D399',
  warning: '#FBBF24',
  caution: '#FB923C',
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

/** 시안 글로우 (iOS shadow; Android는 elevation 대체) */
export const glow = (opacity = 0.5, radius = 16) => ({
  shadowColor: colors.primary,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
});

export const dropShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.5,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 12,
};
