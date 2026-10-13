/** PADO · J 스카이 퓨어 디자인 토큰 (Figma 'UI · 최신' 페이지 › 7 화이트 오션 시안 J) */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        page: '#FFFFFF',
        card: '#F6FAFF',
        'card-2': '#EDF4FE',
        ink: '#1B2B4F',
        'ink-2': '#56688A',
        'ink-3': '#647493',
        line: '#E3EDF9',
        deep: '#EDF4FE',
        primary: '#4F97F2',
        'primary-soft': '#E8F2FE',
        'on-primary': '#FFFFFF',
        accent: '#3A63B8',
        'accent-2': '#A9D1FB',
        positive: '#12A37A',
        warning: '#C58A12',
        caution: '#E2683A',
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
