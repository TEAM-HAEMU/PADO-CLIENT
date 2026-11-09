/**
 * 드랍 만들기 화면 전용 부품 — Figma '3 드랍 만들기' 섹션 (곡 검색 · 한마디 · 투표 · 플리 · 완료).
 *  · DropTopBar : 가운데 제목 + 회색 뒤로 · 오른쪽 '다음' 꺾쇠 (공용 TopBar에 오른쪽만 채움)
 *  · DiscArt    : 동그란 앨범 아트(검정 바탕 위 80%) + 가운데 재생 삼각형 — 누르면 미리듣기
 *  · AddLink    : '노래 추가 +' 같은 가운데 정렬 하늘색 글자 링크
 *  · PlacePill  : 시안 알약 안 작은 핀 + 주소
 */
import React from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { Art, IconButton, Press, T, TopBar } from '@/components/ui';
import { fonts } from '@/theme/tokens';
import { PauseGlyph, PinGlyph, PlayGlyph, PlusGlyph } from './glyphs';

const GREY = '#C5C5C5'; // 공용 TopBar 뒤로 꺾쇠와 같은 회색
const SKY = '#73BEFF'; // Figma '노래 추가' 글자색

export function DropTopBar({ title, onBack, onNext, nextEnabled = true }: { title: string; onBack: () => void; onNext?: () => void; nextEnabled?: boolean }) {
  return (
    <TopBar
      title={title}
      onBack={onBack}
      right={onNext ? <IconButton name="chevronRight" onPress={nextEnabled ? onNext : undefined} color={GREY} style={{ opacity: nextEnabled ? 1 : 0.4 }} accessibilityLabel="다음 단계" /> : undefined}
    />
  );
}

/**
 * 동그란 아트 + 재생 표시. onToggle이 있으면 눌러서 미리듣기 재생/일시정지 (접근성 라벨 '미리듣기 재생'/'미리듣기 일시정지').
 * mark=false면 재생 표시 없이 아트만 (한마디 화면처럼 디자인에 삼각형이 없는 곳).
 */
export function DiscArt({ uri, size = 60, playing = false, loading, onToggle, mark = true, style }: { uri?: string | null; size?: number; playing?: boolean; loading?: boolean; onToggle?: () => void; mark?: boolean; style?: ViewStyle }) {
  const body = (
    <>
      <Art uri={uri} size={size} round />
      {mark ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: size / 2, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : playing ? <PauseGlyph /> : <PlayGlyph />}
        </View>
      ) : null}
    </>
  );
  if (!onToggle) return <View style={style}>{body}</View>;
  return (
    <Press onPress={onToggle} hitSlop={4} accessibilityLabel={playing ? '미리듣기 일시정지' : '미리듣기 재생'} style={style}>
      {body}
    </Press>
  );
}

export function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} hitSlop={10} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingVertical: 9, paddingHorizontal: 12 }}>
      <T v="caption" style={{ fontFamily: fonts.medium, color: SKY, lineHeight: 17 }}>{label}</T>
      <PlusGlyph />
    </Press>
  );
}

/** 주소 알약 (Figma: #22C2FB 바탕 · 흰 핀 · 흰 8px 글자 · 높이 15) */
export function PlacePill({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 15, paddingHorizontal: 6, borderRadius: 999, backgroundColor: '#22C2FB', maxWidth: 300 }}>
      <PinGlyph small />
      <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 8, lineHeight: 10.6, letterSpacing: -0.16, color: '#FFFFFF' }}>{label}</T>
    </View>
  );
}
