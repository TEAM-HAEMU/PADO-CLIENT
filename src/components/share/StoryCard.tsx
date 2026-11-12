/**
 * 인스타 스토리 공유 카드 (9:16) — 캔버스 시안 C · 지도 위 핀 / E · 해달이 건네는 노래 / H · 물 위에 뜬 노래.
 * 시안의 540×960 좌표를 그대로 쓰고 u(= 폭 / 540)를 곱해 어떤 크기로 그려도 같은 모양이 된다.
 * 스토리에는 링크를 붙일 수 없어 카드 아래에 paado.app을 글자로 적는다.
 */
import React, { useEffect, useRef } from 'react';
import { Image, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { fonts } from '@/theme/tokens';

export type CardStyle = 'C' | 'E' | 'H';

export interface ShareCardData {
  art: string | null;
  /** 곡명 (투표는 주제, 플리는 이름) */
  title: string;
  /** 아티스트 (투표·플리는 곡 수) */
  sub: string;
  place: string;
  note: string;
}

/** 인스타가 카드 밖(위·아래) 여백을 칠할 색 */
export const CARD_EDGE: Record<CardStyle, [string, string]> = {
  C: ['#E7F2FB', '#E7F2FB'],
  E: ['#CFEFFF', '#4FB4FF'],
  H: ['#9FDBFF', '#0F5FCC'],
};

const INK = '#03101F';
const SUB = '#7482AE';
const BLUE = '#2B9CFF';
const otter = require('@/assets/otter/otter.webp');

interface Props { data: ShareCardData; variant: CardStyle; width: number; onReady?: () => void }

export function StoryCard({ data, variant, width, onReady }: Props) {
  const u = width / 540;
  // 앨범 아트를 다 받은 뒤에 캡처해야 빈 원이 찍히지 않는다
  const ready = useRef(false);
  const done = () => { if (!ready.current) { ready.current = true; onReady?.(); } };
  useEffect(() => { if (!data.art) done(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const C = { data, u, onLoad: done };
  return (
    <View style={{ width, height: width * (16 / 9), overflow: 'hidden' }}>
      {variant === 'C' ? <MapCard {...C} /> : variant === 'E' ? <OtterCard {...C} /> : <WaterCard {...C} />}
    </View>
  );
}

interface CardProps { data: ShareCardData; u: number; onLoad: () => void }

const txt = (u: number, size: number, family: string, color: string, extra?: TextStyle): TextStyle => ({ fontFamily: family, fontSize: size * u, lineHeight: size * u * 1.4, color, letterSpacing: -0.02 * size * u, ...extra });
const abs = (s: ViewStyle): ViewStyle => ({ position: 'absolute', ...s });
const quote = (note: string) => `“${note}”`;

/** C · 지도 위 핀 — 앱 지도처럼 앨범 아트 핀이 꽂힌 장면 + 아래 흰 카드 */
function MapCard({ data, u, onLoad }: CardProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#E7F2FB' }}>
      <Svg width={540 * u} height={960 * u} viewBox="0 0 540 960" style={abs({ left: 0, top: 0 })}>
        <Path d="M-20 300 Q 200 260 300 420 T 600 520" stroke="#fff" strokeWidth={26} fill="none" />
        <Path d="M120 -20 L 180 1000" stroke="#fff" strokeWidth={16} />
        <Path d="M-20 700 L 600 640" stroke="#fff" strokeWidth={12} />
        <Path d="M380 -20 Q 330 400 460 1000" stroke="#C9E6FA" strokeWidth={40} fill="none" />
      </Svg>
      <View style={abs({ left: 150 * u, top: 230 * u, width: 240 * u, alignItems: 'center' })}>
        <View style={{ borderRadius: 36 * u, shadowColor: '#12214A', shadowOpacity: 0.25, shadowRadius: 20 * u, shadowOffset: { width: 0, height: 16 * u } }}>
          <View style={{ width: 212 * u, height: 212 * u, borderRadius: 36 * u, borderWidth: 6 * u, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#C8E8FF' }}>
            <ArtImage uri={data.art} size={200 * u} onLoad={onLoad} />
          </View>
        </View>
        <View style={{ width: 0, height: 0, borderLeftWidth: 16 * u, borderRightWidth: 16 * u, borderTopWidth: 20 * u, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff' }} />
        <View style={{ marginTop: 2 * u, width: 34 * u, height: 34 * u, borderRadius: 17 * u, backgroundColor: 'rgba(43,156,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 18 * u, height: 18 * u, borderRadius: 9 * u, backgroundColor: BLUE }} />
        </View>
      </View>
      <View style={abs({ left: 40 * u, right: 40 * u, bottom: 60 * u, backgroundColor: '#fff', borderRadius: 28 * u, paddingVertical: 24 * u, paddingHorizontal: 26 * u })}>
        {data.place ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={1} style={txt(u, 15, fonts.regular, SUB)}>{data.place}</Text> : null}
        <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={2} style={txt(u, 26, fonts.bold, INK, { marginTop: 6 * u })}>{data.sub ? `${data.title} · ${data.sub}` : data.title}</Text>
        {data.note ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={3} style={txt(u, 17, fonts.regular, INK, { marginTop: 10 * u })}>{quote(data.note)}</Text> : null}
        <Brand u={u} style={{ marginTop: 18 * u }} />
      </View>
    </View>
  );
}

/** E · 해달이 건네는 노래 — 하늘 배경, 말풍선 카드(CD · 곡 · 한마디) + 해달 */
function OtterCard({ data, u, onLoad }: CardProps) {
  return (
    <LinearGradient colors={CARD_EDGE.E} style={{ flex: 1 }}>
      <Waves u={u} color="#fff" opacity={0.55} />
      <View style={abs({ left: 50 * u, right: 50 * u, top: 150 * u, backgroundColor: '#fff', borderRadius: 28 * u, paddingVertical: 26 * u, paddingHorizontal: 28 * u, shadowColor: '#12214A', shadowOpacity: 0.15, shadowRadius: 20 * u, shadowOffset: { width: 0, height: 16 * u } })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 * u }}>
          <Disc uri={data.art} size={84 * u} onLoad={onLoad} />
          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={2} style={txt(u, 24, fonts.bold, INK)}>{data.title}</Text>
            {data.sub ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={1} style={txt(u, 16, fonts.regular, SUB)}>{data.sub}</Text> : null}
          </View>
        </View>
        {data.note ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={3} style={txt(u, 19, fonts.regular, INK, { marginTop: 18 * u })}>{quote(data.note)}</Text> : null}
        <View style={abs({ left: 120 * u, bottom: -18 * u, width: 0, height: 0, borderLeftWidth: 16 * u, borderRightWidth: 16 * u, borderTopWidth: 20 * u, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff' })} />
      </View>
      <Image source={otter} style={{ position: 'absolute', left: 40 * u, top: 470 * u, width: 300 * u, height: 300 * u }} />
      {data.place ? (
        <View style={abs({ right: 46 * u, top: 560 * u, width: 200 * u, alignItems: 'flex-end' })}>
          <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" style={txt(u, 15, fonts.regular, '#fff', { opacity: 0.9 })}>여기에 남겨 뒀어요</Text>
          <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={2} style={txt(u, 22, fonts.bold, '#fff', { textAlign: 'right' })}>{data.place}</Text>
        </View>
      ) : null}
      <View style={abs({ left: 0, right: 0, bottom: 56 * u, alignItems: 'center' })}><Brand u={u} /></View>
    </LinearGradient>
  );
}

/** H · 물 위에 뜬 노래 — 파란 물결 층 위에 큰 CD가 떠 있다 */
function WaterCard({ data, u, onLoad }: CardProps) {
  return (
    <LinearGradient colors={['#9FDBFF', BLUE, '#0F5FCC']} locations={[0, 0.55, 1]} style={{ flex: 1 }}>
      <Svg width={540 * u} height={960 * u + 2} viewBox="0 0 540 960" preserveAspectRatio="none" style={abs({ left: 0, top: 0 })}>
        <Path fill="#fff" opacity={0.18} d="M0 520q90-40 180 0t180 0 180 0V960H0z" />
        <Path fill="#fff" opacity={0.14} d="M0 600q90-40 180 0t180 0 180 0V960H0z" />
        <Path fill="#fff" opacity={0.1} d="M0 690q90-40 180 0t180 0 180 0V960H0z" />
      </Svg>
      {data.place ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={1} style={[abs({ left: 40 * u, right: 40 * u, top: 120 * u }), txt(u, 17, fonts.semibold, '#fff', { textAlign: 'center' })]}>{data.place}</Text> : null}
      <View style={abs({ left: 0, right: 0, top: 260 * u, alignItems: 'center' })}><Disc uri={data.art} size={280 * u} onLoad={onLoad} /></View>
      <View style={abs({ left: 40 * u, right: 40 * u, top: 640 * u, alignItems: 'center' })}>
        <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={2} style={txt(u, 34, fonts.bold, '#fff', { textAlign: 'center' })}>{data.title}</Text>
        {data.sub ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={1} style={txt(u, 18, fonts.regular, '#fff', { opacity: 0.9 })}>{data.sub}</Text> : null}
        {data.note ? <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" numberOfLines={2} style={txt(u, 18, fonts.regular, '#fff', { marginTop: 20 * u, textAlign: 'center', opacity: 0.95 })}>{quote(data.note)}</Text> : null}
      </View>
      <View style={abs({ left: 0, right: 0, bottom: 50 * u, alignItems: 'center' })}><Brand u={u} light /></View>
    </LinearGradient>
  );
}

function ArtImage({ uri, size, onLoad }: { uri: string | null; size: number; onLoad: () => void }) {
  if (!uri) return <LinearGradient colors={['#C8E8FF', '#F0FCFF']} style={{ width: size, height: size }} />;
  // 공유 이미지는 1080px로 뽑으니 원본(640px) 그대로
  return <Image source={{ uri }} onLoad={onLoad} onError={onLoad} style={{ width: size, height: size }} />;
}

/** 앨범 아트를 CD처럼 — 안쪽 홈 한 줄과 가운데 구멍 */
function Disc({ uri, size, onLoad }: { uri: string | null; size: number; onLoad: () => void }) {
  const hole = size * 0.16;
  const ring = size * 0.12;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, shadowColor: '#12214A', shadowOpacity: 0.18, shadowRadius: size * 0.1, shadowOffset: { width: 0, height: size * 0.035 } }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <ArtImage uri={uri} size={size} onLoad={onLoad} />
        <View style={abs({ left: ring, top: ring, right: ring, bottom: ring, borderRadius: size / 2, borderWidth: Math.max(1, size * 0.005), borderColor: 'rgba(255,255,255,0.35)' })} />
        <View style={abs({ left: (size - hole) / 2, top: (size - hole) / 2, width: hole, height: hole, borderRadius: hole / 2, backgroundColor: '#fff', borderWidth: hole * 0.28, borderColor: '#E9ECF0' })} />
      </View>
    </View>
  );
}

/** 파란 물결 로고 + 파도 + paado.app */
function Brand({ u, light, style }: { u: number; light?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 * u }, style]}>
      <Logo size={26 * u} />
      <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" style={txt(u, 16, fonts.bold, light ? '#fff' : INK, { letterSpacing: 0 })}>파도</Text>
      <Text allowFontScaling={false} lineBreakStrategyIOS="hangul-word" style={txt(u, 14, fonts.regular, light ? 'rgba(255,255,255,0.85)' : SUB, { letterSpacing: 0 })}>paado.app</Text>
    </View>
  );
}

function Logo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="mb" x1="0" y1="0" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D8F3FF" />
        </SvgGradient>
      </Defs>
      <Rect width="100" height="100" rx="26" fill={BLUE} />
      <Path fill="#FFFFFF" opacity={0.5} d="M8 56 Q 50 12 92 38 Q 52 40 8 56 Z" />
      <Path fill="url(#mb)" d="M8 84 Q 50 40 92 66 Q 52 68 8 84 Z" />
    </Svg>
  );
}

function Waves({ u, color, opacity }: { u: number; color: string; opacity: number }) {
  return (
    <Svg width={540 * u} height={300 * u} viewBox="0 0 540 300" style={abs({ left: 0, bottom: 0, opacity })}>
      <Path fill={color} opacity={0.5} d="M0 300V120q60-70 120-10t135 0 140-20 145 30v180z" />
      <Path fill={color} d="M0 300V180q70-50 135 0t135-10 135 10 135-20v140z" />
    </Svg>
  );
}
