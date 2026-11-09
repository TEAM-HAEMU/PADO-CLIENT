/** PADO 새 디자인 토큰 (Figma '파도' 파일 Y6FDFNT2O43nQJRXyjQXxj › 오른쪽 열 새 디자인) — tailwind.config.js와 같은 값 (JS에서 직접 필요한 곳용: SVG, 그림자, 지도) */
export const colors = {
  page: '#FFFFFF',
  card: '#FBFBFB', // 설정·목록 카드
  card2: '#F5F5F5', // 선택 타일, 비활성 바탕
  ink: '#03101F', // 제목·본문 (color/on-primary)
  ink2: '#7482AE', // 보조 글자·섹션 라벨 (color/ink-3)
  ink3: '#8D9BC4', // 더 옅은 보조 (color/ink-2)
  faint: '#C7C7C7', // 안내 문구·설명 한 줄
  line: '#F4F4F4', // 목록 구분선
  lineStrong: '#BDC7DC', // 입력칸 테두리·플레이스홀더
  field: '#FDFDFF', // 입력칸 바탕
  deep: '#F0FCFF',
  primary: '#2B9CFF', // 버튼·활성
  primaryDeep: '#004586', // 포커스 테두리·링크
  primarySoft: '#F0FCFF',
  onPrimary: '#EAF1FF', // 파란 버튼 위 글자 (color/ink)
  accent: '#4FD1FF', // 시안 — 선택 표시·하단 바 활성
  accent2: '#C8E8FF', // 하늘 — 재생 화면 물결·배경
  iconTint: '#D0F4FF', // 아이콘 바탕 칩
  positive: '#12A37A',
  warning: '#FBBF24',
  caution: '#FF5C43',
  like: '#FF3B7C',
  kakao: '#FEE500',
} as const;

export const fonts = {
  light: 'Pretendard-Light',
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  grotesk: 'SpaceGrotesk-Regular',
  groteskMedium: 'SpaceGrotesk-Medium',
  groteskBold: 'SpaceGrotesk-Bold',
  note: 'GowunBatang-Regular',
} as const;

/** 하늘빛 글로우 — 흰 바탕에선 은은하게 (iOS shadow; Android는 elevation 대체) */
export const glow = (opacity = 0.5, radius = 16) => ({
  shadowColor: colors.accent,
  shadowOpacity: opacity * 0.45,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: 4,
});

export const dropShadow = {
  shadowColor: '#12214A',
  shadowOpacity: 0.15,
  shadowRadius: 40,
  shadowOffset: { width: 0, height: 0 },
  elevation: 6,
};
