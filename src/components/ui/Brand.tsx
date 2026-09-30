/** 서비스·로그인 브랜드 글리프 + PADO 심볼 (Figma 공통 에셋과 동일) */
import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ServiceId } from '@/store/prefs';

export function ServiceGlyph({ service, size = 20 }: { service: ServiceId; size?: number }) {
  if (service === 'spotify')
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="12" fill="#1ED760" />
        <Path d="M6.3 9.2c3.9-1.1 8.2-.8 11.4 1.1" stroke="#0A0A0A" strokeWidth={1.9} strokeLinecap="round" fill="none" />
        <Path d="M7 12.4c3.2-.9 6.6-.6 9.3.9" stroke="#0A0A0A" strokeWidth={1.6} strokeLinecap="round" fill="none" />
        <Path d="M7.7 15.5c2.6-.6 5-.4 7.2.7" stroke="#0A0A0A" strokeWidth={1.35} strokeLinecap="round" fill="none" />
      </Svg>
    );
  if (service === 'appleMusic')
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="am" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FB5C74" />
            <Stop offset="1" stopColor="#FA233B" />
          </LinearGradient>
        </Defs>
        <Rect width="24" height="24" rx="6" fill="url(#am)" />
        <Path d="M16 5.8v8.9a2.1 2.1 0 1 1-1.4-2V8.3l-5.2 1.2v6.6a2.1 2.1 0 1 1-1.4-2V7.5z" fill="#fff" />
      </Svg>
    );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill="#FF0033" />
      <Circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff" strokeWidth={1.3} />
      <Path d="M10.4 9.3v5.4l4.5-2.7z" fill="#fff" />
    </Svg>
  );
}

export const KakaoSymbol = ({ size = 20, color = '#000' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill={color} d="M12 3.2c-5.3 0-9.6 3.35-9.6 7.48 0 2.67 1.78 5.01 4.46 6.33-.2.72-.72 2.62-.82 3.03-.13.5.18.5.39.36.16-.11 2.57-1.74 3.61-2.45.64.09 1.29.14 1.96.14 5.3 0 9.6-3.35 9.6-7.48S17.3 3.2 12 3.2z" />
  </Svg>
);

export const GoogleSymbol = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <Path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.4 24 12 24z" />
    <Path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4z" />
    <Path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </Svg>
);

/** B · Deep 심볼 — 원 안에서 흩어지는 파티클 파도 */
export function PadoSymbol({ size = 48 }: { size?: number }) {
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < 5; r++)
    for (let i = 0; i < 15; i++) {
      const x = 10 + i * 3.1;
      const y = 34 + r * 3.6 + 7 * Math.sin((i / 14) * Math.PI * 1.6 + r * 0.4) - r * 1.2;
      const o = Math.max(0.15, (1 - r * 0.17) * (0.55 + 0.45 * Math.sin(i * 0.9 + r)));
      dots.push(<Circle key={`${r}-${i}`} cx={x} cy={y} r={1.5 - r * 0.18} fill="#7FE3FF" opacity={o} />);
    }
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <RadialGradient id="ps" cx="0.5" cy="0.7" r="0.7">
          <Stop offset="0" stopColor="#0E2A5A" />
          <Stop offset="1" stopColor="#030816" />
        </RadialGradient>
      </Defs>
      <Circle cx="32" cy="32" r="32" fill="url(#ps)" />
      <Circle cx="32" cy="32" r="31.5" fill="none" stroke="#4FD1FF" strokeOpacity={0.35} />
      {dots}
    </Svg>
  );
}
