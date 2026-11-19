/**
 * 2.3 재생 · 30초 미리듣기 — Figma 새 디자인 B 2.3(50:5548): 큰 원형 디스크 + 제목 + 막대 파형 진행 바 + 좋아요·재생·전체 듣기 + 댓글 말풍선 + 아래 물결.
 * 미리듣기가 마음에 들면 헤드폰(전체 듣기)으로 고른 음악 앱에 딥링크 (길게 누르면 재생 앱 바꾸기).
 */
import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarProgress, Spin } from '@/components/anim';
import { PreviewCredit } from '@/components/music/PreviewRow';
import { BackGlyph, HeadphonesGlyph, HeartGlyph, MoreGlyph, PlayCircleGlyph } from '@/components/player/glyphs';
import { Art, Icon, Press, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useDropMenu } from '@/hooks/useDropMenu';
import { useOpenedDropLock } from '@/hooks/useOpenedDropLock';
import { LockedDropScreen } from '@/components/detail/LockedDrop';
import { useComments, useDrop, useDropPlace, useLikeCount, useSong, useToggleLike, useIsLiked } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { listenFull, listenLabel } from '@/services/listen';
import { startPreview, usePreview, usePreviewProgress, usePreviewStore } from '@/services/preview';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

const SUB = '#BAB7B7'; // Figma 아티스트·시간 글자색
/** 전체 재생 대기열에서 연속으로 이만큼 못 틀면 다음 곡으로 넘기지 않고 멈춘다 */
const QUEUE_MAX_FAILS = 3;

export default function PlayerScreen({ navigation, route }: RootScreen<'Player'>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 760; // iPhone SE·mini 등 작은 화면
  const contentW = Math.min(width - 54, 400); // Figma 좌우 27
  const disc = Math.round(Math.min(contentW, height * (compact ? 0.33 : 0.4)));
  const { songId, dropId, queue, autoplay } = route.params;
  const qIndex = queue ? queue.indexOf(songId) : -1;
  const nextId = queue && qIndex >= 0 ? queue[qIndex + 1] : undefined;
  const songQ = useSong(songId, { keepPrevious: !!queue });
  const song = songQ.data;
  const dropQ = useDrop(dropId);
  const drop = dropQ.data;
  // 드랍의 곡이면 재생 반경 잠금 — 링크(song/…?dropId=)로 바로 열어도 지도와 같은 규칙. 드랍 없이 곡만 열면 잠그지 않는다.
  // 드랍 상세를 못 받으면(삭제·만료된 드랍, 네트워크) 판정 없이 곡만 보여 준다 — 곡은 드랍 없이도 들을 수 있어 잠금이 지키는 게 없고, 로딩에 머물지 않게
  const lock = useOpenedDropLock(dropId, drop, undefined, dropQ.isError);
  const open = !dropId || lock.status === 'open' || lock.status === 'unavailable';
  const preview = usePreview(open ? song : null);
  const menu = useDropMenu(dropId, drop?.userId, '드랍', drop && 'username' in drop ? drop.username : undefined, song);
  const likeCount = useLikeCount(dropId).data;
  const comments = useComments(dropId).data;
  const liked = useIsLiked(dropId);
  const toggleLike = useToggleLike(dropId ?? '');
  const authed = useAuth(s => s.status === 'authed');
  const service = usePrefs(s => s.service);
  const address = useDropPlace(dropId, drop);

  // 화면을 닫아도 듣던 곡은 계속 (다른 곡을 틀 때만 바뀜 — 지도 미니 디스크·잠금화면에서 제어)

  // 전체 재생/셔플: 열리면 미리듣기 시작, 끝나면(또는 미리듣기가 없거나 이 곡을 틀지 못하면) 다음 곡으로
  // 틀지 못함 = 미리듣기 조회 불가(iTunes 막힘·오프라인)·재생 오류(주소 만료 등). 알림 뒤 다음 곡으로 넘기되,
  // 연속으로 QUEUE_MAX_FAILS곡을 못 틀면(망이 끊김 등) 대기열 전체에 토스트를 뿌리며 넘기지 않게 멈춘다
  const startedFor = React.useRef<string | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const failStreak = React.useRef(0);
  const skipTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(skipTimer.current), []);
  /** 이 곡(from)을 못 틀었거나 미리듣기가 없을 때 잠시 뒤 다음 곡으로 — 그 사이 다른 곡으로 넘어갔으면 무시 */
  const skipFrom = (from: string, failed: boolean) => {
    const next = queue && queue[queue.indexOf(from) + 1];
    if (!next || !mounted.current) return;
    if (failed && ++failStreak.current >= QUEUE_MAX_FAILS) return;
    clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => { if (mounted.current && latestSong.current === from) navigation.setParams({ songId: next }); }, 1200);
  };
  const latestSong = React.useRef(songId);
  latestSong.current = songId;
  React.useEffect(() => {
    // 다음 곡을 불러오는 동안엔 이전 곡이 자리만 지키고 있으므로 기다린다
    if (!open || !(autoplay || queue) || startedFor.current === songId || preview.loading || songQ.isPlaceholderData || !song || song.id !== songId) return;
    startedFor.current = songId;
    if (!preview.available) return skipFrom(songId, false); // 미리듣기가 없는 곡
    if (preview.playing) return;
    if (!queue) { preview.toggle(); return; }
    // 대기열은 결과를 알아야 다음 곡으로 넘길 수 있어 startPreview로 (이미 올라 있는 곡이면 이어서 재생)
    const from = songId;
    startPreview(song).catch(() => 'unavailable' as const).then(r => {
      if (!mounted.current || latestSong.current !== from) return;
      if (r === 'none' || r === 'adult') skipFrom(from, false);
      else if (r === 'unavailable') { toast('지금은 미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요.', 'error'); skipFrom(from, true); }
    });
  }, [songId, song?.id, preview.loading, preview.available, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const endedKey = usePreviewStore(st => st.endedKey);
  const loaded = usePreviewStore(st => st.key === songId);
  const endedAtMount = React.useRef(usePreviewStore.getState().endedKey);
  React.useEffect(() => {
    if (endedKey === endedAtMount.current) return; // 이 화면에 오기 전에 끝난 곡은 무시
    endedAtMount.current = null;
    if (endedKey !== songId) return;
    failStreak.current = 0;
    if (nextId) navigation.setParams({ songId: nextId });
  }, [endedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 대기열 곡이 재생 중 오류를 내면(토스트는 플레이어가 띄운다) 다음 곡으로
  const lastError = usePreviewStore(st => st.lastError);
  const errorAtMount = React.useRef(usePreviewStore.getState().lastError);
  React.useEffect(() => {
    if (!lastError || lastError === errorAtMount.current || lastError.key !== songId) return;
    skipFrom(songId, true);
  }, [lastError]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dropId && drop && lock.status === 'locked') return <LockedDropScreen lock={lock.lock} note={drop.content} />;
  if (!song || !open) return <ScreenState error={songQ.error} onRetry={() => songQ.refetch()} />;

  // 전체 듣기 — 고른 음악 앱으로 딥링크 (없으면 선택 시트)
  const listen = () => listenFull(usePrefs.getState().service, song);
  const pickService = () => navigation.navigate('ServicePicker', { song });
  // 사용자가 직접 누른 재생·일시정지 — 이후 자동 재생 효과가 덮어쓰지 않게 이 곡은 '시작됨'으로 표시
  // 미리듣기 주소를 아직 찾는 중이면 누름을 무시한다 (그동안 available이 false라 전체 듣기로 외부 앱이 열리던 문제)
  // — 미리듣기가 없다고 확정된 곡만 전체 듣기로 넘긴다
  // (이미 플레이어에 올라 있는 곡이면 주소 조회와 무관하게 재생·일시정지)
  const resolving = preview.loading && !loaded;
  const onMain = () => {
    if (resolving) return;
    startedFor.current = songId;
    failStreak.current = 0; // 사용자가 직접 누르면 연속 실패로 멈춘 대기열도 다시 이어진다
    return preview.available || loaded ? preview.toggle() : listen();
  };
  // 대기열 이전·다음 곡을 직접 고름 — 연속 실패로 멈춘 대기열도 다시 이어진다
  const pickQueued = (id: string) => { failStreak.current = 0; navigation.setParams({ songId: id }); };
  const like = () => (authed ? toggleLike.toggle() : toast('로그인이 필요해요.'));
  const hole = disc * 0.153; // Figma 가운데 흰 구멍 53.5 / 349
  const halo = disc * 0.249; // 반투명 링 87 / 349
  const bubbles = (comments ?? []).slice(0, compact ? 2 : 3);

  const headphones = (
    <Press onPress={listen} onLongPress={pickService} hitSlop={12} accessibilityLabel={listenLabel(service)} accessibilityHint="길게 누르면 재생 앱을 바꿔요" style={{ width: 20, height: 20 }}>
      <HeadphonesGlyph />
    </Press>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {/* Figma 배경: 위 민트 → 흰 → 아래 연노랑 아주 옅게 */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,255,234,0.06)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.1)', 'rgba(243,255,154,0.1)']} locations={[0.16, 0.31, 0.76, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Wave surge={preview.playing} style={{ position: 'absolute', left: (width - 592) / 2, bottom: -81, width: 592 }} />

      {/* top bar */}
      <View style={{ marginTop: insets.top + 4, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
        <Press onPress={navigation.goBack} hitSlop={8} accessibilityLabel="재생 화면 닫기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <BackGlyph />
        </Press>
        <View style={{ alignItems: 'center', gap: 2, flexShrink: 1 }}>
          {queue ? <T v="captionStrong" c="primary">{`${qIndex + 1} / ${queue.length}`}</T> : null}
          {address ? <T v="caption" c="ink3" numberOfLines={1}>{address}</T> : null}
        </View>
        {dropId ? (
          <Press onPress={menu.open} hitSlop={8} accessibilityLabel="더보기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <MoreGlyph size={22} color={colors.ink3} />
          </Press>
        ) : queue ? (
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{headphones}</View>
        ) : <View style={{ width: 44 }} />}
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: (width - contentW) / 2, gap: compact ? 20 : 40, paddingBottom: insets.bottom + 8 }}>
        <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: compact ? 18 : 28 }}>
          {/* disc — 앨범 아트 원 + 가운데 흰 구멍 (재생 중에만 돈다) */}
          <Spin paused={!preview.playing}>
            <View style={{ width: disc, height: disc, borderRadius: disc / 2, overflow: 'hidden' }}>
              <Art uri={song.albumImagePath} size={disc} round />
              <View style={{ position: 'absolute', left: (disc - halo) / 2, top: (disc - halo) / 2, width: halo, height: halo, borderRadius: halo / 2, backgroundColor: 'rgba(255,255,255,0.4)' }} />
              <View style={{ position: 'absolute', left: (disc - hole) / 2, top: (disc - hole) / 2, width: hole, height: hole, borderRadius: hole / 2, backgroundColor: '#FFFFFF' }} />
            </View>
          </Spin>

          <View style={{ alignItems: 'center', gap: 2, alignSelf: 'stretch' }}>
            <T v="title" numberOfLines={1} style={{ fontFamily: fonts.semibold, color: '#000000' }}>{song.title}</T>
            <T v="caption" numberOfLines={1} style={{ fontFamily: fonts.medium, color: SUB }}>{song.artist}</T>
          </View>

          <PlayerProgress songId={song.id} width={contentW} compact={compact} available={preview.available} fullDuration={song.duration} song={song} />

          {/* controls — 좋아요 · 재생 · 전체 듣기 (플리 대기열이면 이전 · 재생 · 다음) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
            {!queue ? (
              <Press accessibilityLabel={`좋아요 ${likeCount ?? 0}개`} accessibilityState={{ selected: liked }} disabled={!dropId} onPress={like} hitSlop={12} style={{ opacity: dropId ? 1 : 0.35 }}>
                <HeartGlyph color={liked ? colors.like : '#D9D9D9'} />
              </Press>
            ) : (
              <Press accessibilityLabel="이전 곡" disabled={qIndex <= 0} hitSlop={12} onPress={() => qIndex > 0 && pickQueued(queue[qIndex - 1])} style={{ opacity: qIndex > 0 ? 1 : 0.35 }}>
                <Icon name="prev" size={22} color={colors.ink3} />
              </Press>
            )}
            <Press onPress={onMain} disabled={resolving} accessibilityLabel={preview.playing ? '일시정지' : '재생'} accessibilityState={{ busy: resolving, disabled: resolving }} style={{ width: 50, height: 50, opacity: resolving ? 0.4 : 1 }}>
              <PlayCircleGlyph playing={preview.playing} />
            </Press>
            {!queue ? headphones : (
              <Press accessibilityLabel="다음 곡" disabled={!nextId} hitSlop={12} onPress={() => nextId && pickQueued(nextId)} style={{ opacity: nextId ? 1 : 0.35 }}>
                <Icon name="next" size={22} color={colors.ink3} />
              </Press>
            )}
          </View>
        </View>

        {/* 댓글 말풍선 — 최근 댓글 몇 개 (누르면 댓글 시트). 아직 없으면 한마디 남기기 안내 */}
        {dropId ? (
          <Press accessibilityLabel="댓글" onPress={() => navigation.navigate('Comments', { dropId })} style={{ alignItems: 'flex-end', gap: 8, maxWidth: contentW * 0.62 }}>
            {(bubbles.length ? bubbles.map(c => c.content) : ['이 곡에 한마디']).map((text, i) => (
              <View key={i} style={{ maxWidth: '100%', paddingHorizontal: 18, paddingVertical: 5, borderRadius: 99, backgroundColor: 'rgba(242,252,255,0.6)', shadowColor: '#FFFFFF', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }}>
                <T v="tiny" c="primary" numberOfLines={1}>{text}</T>
              </View>
            ))}
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/** 막대 파형 진행 바 + 시간 — 250ms마다 이 부분만 다시 그린다 (실제 미리듣기 위치/길이) */
function PlayerProgress({ songId, width, compact, available, fullDuration, song }: { songId: string; width: number; compact: boolean; available: boolean; fullDuration: number; song: { title: string; artist: string } }) {
  const { position, duration } = usePreviewProgress(songId);
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <BarProgress progress={duration ? position / duration : 0} width={width} height={compact ? 44 : 60} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="tiny" style={{ color: SUB }}>{formatDuration(position)}</T>
        {available ? <PreviewCredit song={song} /> : null}
        <T v="tiny" style={{ color: SUB }}>{available ? formatDuration(duration) : formatDuration(fullDuration)}</T>
      </View>
    </View>
  );
}
