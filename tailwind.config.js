/** PADO · B Deep 디자인 토큰 (Figma MVP 페이지 B 섹션 기준) */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        page: '#050916',
        card: '#0B1330',
        'card-2': '#111B3F',
        ink: '#EAF1FF',
        'ink-2': '#8D9BC4',
        'ink-3': '#7482AE',
        line: '#19234D',
        deep: '#02050F',
        primary: '#4FD1FF',
        'primary-soft': '#0E2A4A',
        'on-primary': '#03101F',
        accent: '#3B6BFF',
        'accent-2': '#9BE7FF',
        positive: '#34D399',
        warning: '#FBBF24',
        caution: '#FB923C',
        kakao: '#FEE500',
      },
      fontFamily: {
        suit: ['SUIT-Regular'],
        'suit-medium': ['SUIT-Medium'],
        'suit-semibold': ['SUIT-SemiBold'],
        'suit-bold': ['SUIT-Bold'],
        grotesk: ['SpaceGrotesk-Regular'],
        'grotesk-medium': ['SpaceGrotesk-Medium'],
        'grotesk-bold': ['SpaceGrotesk-Bold'],
        note: ['GowunBatang-Regular'],
      },
      borderRadius: { sm: '10px', md: '14px', lg: '22px', xl: '28px' },
    },
  },
  plugins: [],
};
