/**
 * 2.2 핀 미리보기 (바텀시트) — 음악 드랍. Figma 새 디자인 B 2.2(0:3820):
 * 흰 테두리 알약 모양 앨범 아트(주소 · 곡명, 가운데 재생) + 아래 반원 진행 링 · 겹친 한마디 카드 · 좋아요/댓글 · 음악 앱 바로가기.
 * 투표/플리 드랍은 지도에서 바로 상세 화면으로 간다.
 */
import React from 'react';
import { Image, useWindowDimensions, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { errorMessage } from '@/api/errors';
import { isMusicDetail, isPlaylistDetail, isVoteDetail } from '@/api/types';
import { Avatar, Loading, Press, T } from '@/components/ui';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Sheet } from '@/components/ui/Sheet';
import { PreviewCredit } from '@/components/music/PreviewRow';
import { CommentGlyph, HeartGlyph, MoreGlyph, PinGlyph, PlayCircleGlyph } from '@/components/player/glyphs';
import { useCommentCount, useDrop, useDropAddress, useLikeCount, useMyLikes, useSong, useToggleLike } from '@/hooks/api';
import type { RootScreen } from '@/navigation/types';
import { useAuth } from '@/store/auth';
import type { ServiceId } from '@/store/prefs';
import { toast } from '@/store/toast';
import { listenFull } from '@/services/listen';
import { SERVICES } from '@/services/musicLinks';
import { startPreview, usePreview, usePreviewProgress } from '@/services/preview';
import { useDropMenu } from '@/hooks/useDropMenu';
import { colors, fonts } from '@/theme/tokens';
import { artUrl } from '@/utils/artUrl';
import { formatRelative } from '@/utils/format';

const SERVICE_ORDER: ServiceId[] = ['spotify', 'appleMusic', 'youtubeMusic'];
// Figma 한마디 카드 뒤로 겹친 띠 (위에서부터)
const STACK = ['#00C9FF', '#5DDCFF', '#B4EFFF'];
const RING_GAP = 21; // 알약 바깥 → 링 (358 - 316) / 2
const RING_STROKE = 7;

export default function PinPreviewScreen({ navigation, route }: RootScreen<'PinPreview'>) {
  // 듣던 곡은 화면을 닫아도 계속 (다른 곡을 틀 때만 바뀜)
  const { dropId } = route.params;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const qc = useQueryClient();
  const drop = useDrop(dropId);
  const d = drop.data;
  const music = d && isMusicDetail(d) ? d : null;
  const song = useSong(music?.songId);
  const preview = usePreview(song.data);
  // 핀을 누르면 그 곡 미리듣기를 바로 (지도 자동 재생으로 듣던 곡이면 이어서)
  const autoStarted = React.useRef<string | null>(null);
  React.useEffect(() => {
    const s = song.data;
    if (!s || autoStarted.current === s.id) return;
    autoStarted.current = s.id;
    startPreview(s);
  }, [song.data]);
  const likeCount = useLikeCount(dropId).data;
  const commentCount = useCommentCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId);
  const toggleLike = useToggleLike(dropId);
  const authed = useAuth(s => s.status === 'authed');
  const menu = useDropMenu(dropId, d?.userId, '드랍', d && 'username' in d ? d.username : undefined, song.data);
  const address = useDropAddress(dropId);

  React.useEffect(() => {
    if (!d) return;
    if (isVoteDetail(d)) navigation.replace('VoteDrop', { dropId });
    else if (isPlaylistDetail(d)) navigation.replace('PlaylistDrop', { dropId });
  }, [d, dropId, navigation]);

  if (!music) {
    return <Sheet><View style={{ height: 320 }}>{drop.isError ? <T v="body" c="ink2" style={{ textAlign: 'center', marginTop: 60 }}>{errorMessage(drop.error)}</T> : <Loading />}</View></Sheet>;
  }

  // 알약 크기 — Figma 316×421, 시트 전체가 화면 위 지도 머리(동 이름)를 가리지 않게 줄인다
  const capH = Math.round(Math.min(421, height - insets.top - 410));
  const capW = Math.round(capH * (316 / 421));
  const ringW = capW + RING_GAP * 2;
  const overlap = capH + RING_GAP - 34; // 카드는 알약 꼭대기에서 34 아래부터 시작 (알약·링은 카드 위에 겹침)
  const art = music.albumImageUrl ?? song.data?.albumImagePath;
  const openPlayer = () => { if (song.data) navigation.replace('Player', { songId: song.data.id, dropId }); };
  // 전체 듣기 — 누른 음악 앱으로 바로 딥링크
  const listenIn = (s: ServiceId) => { if (song.data) listenFull(s, song.data); };
  const like = () => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'));

  return (
    <Sheet
      style={{ paddingHorizontal: 22, borderTopLeftRadius: 50, borderTopRightRadius: 50, shadowColor: '#12214A', shadowOpacity: 0.15, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 8 }}
      headerOverlap={overlap}
      header={
        <View style={{ width: ringW, height: capH + RING_GAP, alignItems: 'center' }}>
          {song.data ? <ProgressRing songId={song.data.id} width={ringW} height={ringW * (364 / 358)} top={capH + RING_GAP - ringW * (364 / 358)} /> : null}
          <View style={{ width: capW, height: capH, borderRadius: capW / 2, borderWidth: 8, borderColor: '#FFFFFF', overflow: 'hidden', backgroundColor: colors.card2 }}>
            {art ? <Image source={{ uri: artUrl(art, capH)! }} style={{ position: 'absolute', left: 0, top: 0, width: capW - 16, height: capH - 16 }} resizeMode="cover" /> : null}
            <LinearGradient pointerEvents="none" colors={['rgba(4,9,22,0.55)', 'rgba(4,9,22,0.25)', 'rgba(4,9,22,0)']} locations={[0, 0.55, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120 }} />
            {/* 알약 전체 탭 = 재생 화면 (가운데 재생 버튼은 따로) */}
            <Press accessibilityLabel="재생 화면 열기" onPress={openPlayer} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 20, alignItems: 'center', gap: 6, paddingHorizontal: 24 }}>
              {address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 18, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(18,33,74,0.8)', maxWidth: '100%' }}>
                  <PinGlyph size={7} color="#2BD1FF" />
                  <T v="tiny" numberOfLines={1} style={{ color: '#2BD1FF', flexShrink: 1 }}>{address}</T>
                </View>
              ) : null}
              <T v="captionStrong" numberOfLines={1} style={{ fontSize: 14, color: '#FFFFFF', textShadowColor: 'rgba(4,9,22,0.75)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }}>
                {song.data ? `${song.data.title} · ${song.data.artist}` : ' '}
              </T>
            </View>
            <Press
              onPress={preview.toggle}
              accessibilityLabel={preview.playing ? '미리듣기 일시정지' : '30초 미리듣기'}
              style={{ position: 'absolute', left: (capW - 16 - 58) / 2, top: (capH - 16 - 58) / 2, width: 58, height: 58, opacity: preview.available ? 1 : 0.5, shadowColor: '#FFFFFF', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }}
            >
              <PlayCircleGlyph size={58} playing={preview.playing} />
            </Press>
          </View>
        </View>
      }
    >
      <Press onPress={menu.open} hitSlop={10} style={{ position: 'absolute', top: 18, right: 22, zIndex: 10 }} accessibilityLabel="더보기">
        <MoreGlyph size={22} color={colors.ink3} />
      </Press>

      {/* 알약 · 링 아래에서 내용 시작 (카드 위 패딩 10 + 손잡이 21 은 Sheet가 이미 줌) */}
      <View style={{ height: Math.max(0, overlap - 31) }} />
      {song.data && preview.available ? <View style={{ alignItems: 'center', marginTop: 6 }}><PreviewCredit song={song.data} /></View> : null}

      {/* 한마디 — 뒤로 겹친 시안 띠 세 장 + 앞 카드 */}
      <View style={{ marginTop: 14 }}>
        {STACK.map((c, i) => <View key={c} style={{ height: 34, marginBottom: -12, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: c, zIndex: i }} />)}
        <View style={{ zIndex: 5, gap: 8, paddingLeft: 20, paddingRight: 16, paddingVertical: 18, borderRadius: 12, backgroundColor: '#FCFCFC' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={music.username} size={24} />
            <T v="caption" numberOfLines={1} style={{ fontFamily: fonts.medium, color: '#000000', flexShrink: 1 }}>{music.username}</T>
            <T v="tiny" style={{ color: '#BBBBBB' }}>{formatRelative(music.createdAt)}</T>
          </View>
          {music.content ? <T v="body" style={{ fontSize: 14, lineHeight: 22, color: '#1E1E1E' }}>{music.content}</T> : null}
        </View>
      </View>

      {/* 좋아요 · 댓글 / 음악 앱 바로가기 (전체 듣기) */}
      <View style={{ marginTop: 32, marginHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Press accessibilityLabel="좋아요" accessibilityState={{ selected: liked }} onPress={like} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <HeartGlyph color={liked ? colors.like : '#E3E3E3'} />
            {likeCount ? <T v="tiny" c="faint">{likeCount}</T> : null}
          </Press>
          <Press accessibilityLabel="댓글" onPress={() => navigation.navigate('Comments', { dropId })} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CommentGlyph />
            {commentCount ? <T v="tiny" c="faint">{commentCount}</T> : null}
          </Press>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {SERVICE_ORDER.map(s => (
            <Press key={s} onPress={() => listenIn(s)} disabled={!song.data} hitSlop={6} accessibilityLabel={`${SERVICES[s].label}에서 전체 듣기`}>
              <ServiceGlyph service={s} size={20} />
            </Press>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * 알약 아래쪽을 감싸는 반원 링 — 회색 길(#EDEDED) 위로 미리듣기 진행만큼 왼쪽 끝에서 아래로 파란 호 + 흰 손잡이.
 * 250ms마다 바뀌므로 이 부분만 다시 그린다.
 */
function ProgressRing({ songId, width, height, top }: { songId: string; width: number; height: number; top: number }) {
  const { position, duration } = usePreviewProgress(songId);
  const p = duration ? Math.min(1, position / duration) : 0;
  const rx = width / 2 - RING_STROKE / 2;
  const ry = height / 2 - RING_STROKE / 2;
  const cx = width / 2;
  const cy = height / 2;
  const t = Math.PI - p * Math.PI; // 왼쪽(π)에서 아래를 지나 오른쪽(0)으로
  const x = cx + rx * Math.cos(t);
  const y = cy + ry * Math.sin(t);
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', left: 0, top }}>
      <Defs>
        <SvgGradient id="pinRing" x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#3BBAFF" />
          <Stop offset="1" stopColor="#123D4A" />
        </SvgGradient>
      </Defs>
      <Path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`} stroke="#EDEDED" strokeWidth={RING_STROKE} strokeLinecap="round" fill="none" />
      {p > 0.005 ? <Path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${x} ${y}`} stroke="url(#pinRing)" strokeWidth={RING_STROKE} strokeLinecap="round" fill="none" /> : null}
      <Circle cx={x} cy={y} r={2.5} fill="#FFFFFF" stroke="#35A6E2" strokeWidth={3} />
    </Svg>
  );
}
