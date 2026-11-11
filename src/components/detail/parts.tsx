/**
 * 드랍 상세·플리 화면 공용 부품 — Figma '4 드랍 상세 · 플리' 섹션
 *  · AddressPill : 시안 알약 주소 (#22C2FB · 흰 글자 8)
 *  · CommentBar  : 화면 아래 한마디 줄 (#F7F7F7 알약 + 좋아요 + 남색 보내기 버튼) — 투표 드랍
 *  · PlaylistHero: 플리 커버(첫 4곡 콜라주 170) + 제목 24 + 메타 + '셔플로 듣기'·'전체 재생' 알약
 *  · DiscRow     : 흰 카드(r12) 곡 한 줄 — 원형 앨범(60, 재생 표시) · 제목 12 · 아티스트 8 · 오른쪽 요소. song을 주면 앨범을 눌러 미리듣기
 *  · DiscArt     : 원형 앨범 아트 + 가운데 재생 삼각형 (재생 중이면 레코드처럼 돌고 일시정지 두 줄, 찾는 중이면 도는 표시)
 *  · SheetTitle  : 시트 제목 20 SemiBold + 회색 설명 13
 *  · BgWave      : 화면 아래쪽에 깔리는 Figma 'wave' 인스턴스 자리
 */
import React from 'react';
import { ActivityIndicator, Image, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Wave } from '@/components/ui/Wave';
import { Collage } from '@/components/music/Collage';
import { Spin } from '@/components/anim';
import { PauseGlyph } from '@/components/drop/glyphs';
import { usePreview, usePreviewStore } from '@/services/preview';
import { usePrefs } from '@/store/prefs';
import { colors, fonts } from '@/theme/tokens';
import { artUrl } from '@/utils/artUrl';
import { Glyph, Shuffle } from './glyphs';

/** 지금 재생 중인 곡 카드 바탕 / 투표 선택 바탕 */
export const ROW_ON = '#F6FDFF';

export const BgWave = () => <Wave scale={1.2} style={{ position: 'absolute', left: -90, right: -90, bottom: -34 }} />;

export function AddressPill({ address, style }: { address: string; style?: ViewStyle }) {
  return (
    <View style={[{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 15, paddingHorizontal: 6, borderRadius: 999, backgroundColor: '#22C2FB' }, style]}>
      <Glyph name="tinyPin" size={5.6} />
      <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.medium, fontSize: 10, lineHeight: 13, letterSpacing: -0.2, color: '#FFFFFF' }}>{address}</T>
    </View>
  );
}

/** 입력칸·보내기 버튼을 누르면 댓글 시트(onComment). 좋아요는 수와 함께 */
export function CommentBar({ placeholder, onComment, liked, likeCount, onLike }: { placeholder: string; onComment: () => void; liked: boolean; likeCount?: number; onLike: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 36, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: colors.page }}>
      <Press onPress={onComment} style={{ flex: 1, height: 33, borderRadius: 99, backgroundColor: '#F7F7F7', justifyContent: 'center', paddingHorizontal: 18 }}>
        <T style={{ fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, letterSpacing: -0.055, color: '#BABABA' }}>{placeholder}</T>
      </Press>
      <Press accessibilityLabel="좋아요" accessibilityState={{ selected: liked }} onPress={onLike} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Glyph name="heart" size={20} color={liked ? '#EA383B' : '#E3E3E3'} />
        {likeCount ? <T style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, color: '#969696' }}>{likeCount}</T> : null}
      </Press>
      <Press onPress={onComment} accessibilityLabel="댓글" style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#12214A', alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name="send" size={16.36} />
      </Press>
    </View>
  );
}

/** Figma 'tag' 30px 알약 — on: 파란 바탕 + 옅은 글자 / off: 옅은 하늘 바탕 + 파란 글자 */
function TagButton({ label, on, icon, onPress, accessibilityLabel }: { label?: string; on?: boolean; icon: React.ReactNode; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Press onPress={onPress} accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 30, paddingHorizontal: label ? 14 : 8, minWidth: 30, borderRadius: 999, backgroundColor: on ? 'rgba(43,156,255,0.8)' : 'rgba(240,252,255,0.8)' }}>
      {icon}
      {label ? <T style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: on ? '#F0FCFF' : colors.primary }}>{label}</T> : null}
    </Press>
  );
}

export function PlaylistHero({ images, title, meta, onPlay, onShuffle, onService }: { images: (string | null)[]; title: string; meta: string; onPlay: () => void; onShuffle: () => void; onService?: () => void }) {
  const service = usePrefs(s => s.service) ?? 'spotify';
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <Collage images={images} size={170} radius={18.9} />
      <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
        <T numberOfLines={2} style={{ fontFamily: fonts.semibold, fontSize: 24, lineHeight: 34, letterSpacing: -0.48, color: '#090909', textAlign: 'center' }}>{title}</T>
        <T style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.065, color: colors.ink3, textAlign: 'center' }}>{meta}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TagButton label="셔플로 듣기" icon={<Shuffle />} onPress={onShuffle} />
        <TagButton label="전체 재생" on icon={<Glyph name="playSmall" size={16} color="#F0FCFF" />} onPress={onPlay} />
        {onService ? <TagButton icon={<ServiceGlyph service={service} size={16} />} onPress={onService} accessibilityLabel="재생 앱" /> : null}
      </View>
    </View>
  );
}

export function DiscArt({ uri, size = 60, playing, loading, onPress, accessibilityLabel }: { uri?: string | null; size?: number; playing?: boolean; loading?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const inner = (
    <>
      {uri ? (
        <View style={{ position: 'absolute', width: size + 2, height: size + 2, left: -1, top: -1 }}>
          <Spin paused={!playing}>
            <Image source={{ uri: artUrl(uri, size + 2)! }} style={{ width: size + 2, height: size + 2, opacity: 0.8 }} />
          </Spin>
        </View>
      ) : null}
      {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : playing ? <PauseGlyph /> : <Glyph name="play" size={20} />}
    </>
  );
  const style: ViewStyle = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' };
  return onPress ? <Press onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!playing, busy: !!loading }} hitSlop={4} style={style}>{inner}</Press> : <View style={style}>{inner}</View>;
}

export type DiscSong = { id: string; title: string; artist: string; albumImagePath?: string | null };

/** 누르면 그 곡 미리듣기 켜고 끄기 — 다른 곳(미니 CD 등)에서 듣던 곡이어도 같은 상태로 보인다. 주소는 누를 때 찾는다(lazy) */
function PreviewDisc({ song }: { song: DiscSong }) {
  const p = usePreview(song, { lazy: true });
  const waiting = usePreviewStore(st => st.pending?.key === song.id || (st.key === song.id && st.buffering));
  return <DiscArt uri={song.albumImagePath} playing={p.playing} loading={p.loading || waiting} onPress={p.toggle} accessibilityLabel={p.playing ? `${song.title} 일시정지` : `${song.title} 미리듣기`} />;
}

/** 오른쪽 요소: duration(있으면 3:12) + right. height 79(목록) / 67(시트). song을 주면 앨범 = 미리듣기 버튼, 나머지 = onPress */
export function DiscRow({ art, song, title, artist, duration, right, onPress, onLongPress, onArt, artLabel, active, dim, height = 79, accessibilityLabel, style, children }: { art?: string | null; song?: DiscSong; title: string; artist: string; duration?: string; right?: React.ReactNode; onPress?: () => void; onLongPress?: () => void; onArt?: () => void; artLabel?: string; active?: boolean; dim?: boolean; height?: number; accessibilityLabel?: string; style?: ViewStyle; children?: React.ReactNode }) {
  return (
    <Press onPress={onPress} onLongPress={onLongPress} accessibilityLabel={accessibilityLabel} accessibilityState={active ? { selected: true } : undefined} style={[{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: active ? ROW_ON : colors.page, opacity: dim ? 0.5 : 1, justifyContent: 'center' }, style]}>
      {children}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 15, paddingRight: 16 }}>
        {song ? <PreviewDisc song={song} /> : <DiscArt uri={art} onPress={onArt} accessibilityLabel={artLabel} />}
        <View style={{ flex: 1, gap: 4 }}>
          <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: '#090909' }}>{title}</T>
          <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 13, letterSpacing: -0.2, color: '#8D8D8D' /* Figma 8pt — 읽히게 10 */ }}>{artist}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {duration ? <T style={{ fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, letterSpacing: -0.2, color: '#969696' }}>{duration}</T> : null}
          {right}
        </View>
      </View>
    </Press>
  );
}

export function SheetTitle({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, color: '#090909' }}>{title}</T>
        {desc ? <T numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.065, color: '#B0B0B2' }}>{desc}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** '곡 추가 +' 줄 (플리 상세 목록 끝) */
export function AddSongRow({ onPress }: { onPress: () => void }) {
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.page }}>
      <T style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, letterSpacing: -0.24, color: '#73BEFF' }}>곡 추가</T>
      <Glyph name="plus" size={16} color="#73BEFF" />
    </Press>
  );
}
