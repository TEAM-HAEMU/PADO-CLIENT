/**
 * 2.3 재생 · 30초 미리듣기 — Figma 새 디자인 B 2.3(50:5548): 큰 원형 디스크 + 제목 + 막대 파형 진행 바 + 좋아요·재생·전체 듣기 + 댓글 말풍선 + 아래 물결.
 * 미리듣기가 마음에 들면 헤드폰(전체 듣기)으로 고른 음악 앱에 딥링크 (길게 누르면 재생 앱 바꾸기).
 */
import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarProgress, Spin } from '@/components/anim';
import { PreviewCredit } from '@/components/music/PreviewRow';
import { BackGlyph, HeadphonesGlyph, HeartGlyph, MoreGlyph, PlayCircleGlyph } from '@/components/player/glyphs';
import { Art, Icon, Press, T } from '@/components/ui';
import { Wave } from '@/components/ui/Wave';
import { useDropMenu } from '@/hooks/useDropMenu';
import { useComments, useDrop, useDropPlace, useLikeCount, useSong, useToggleLike, useIsLiked } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { listenFull, listenLabel } from '@/services/listen';
import { usePreview, usePreviewProgress, usePreviewStore } from '@/services/preview';
import { jumpTo, playQueue, resetQueueFails, usePlayQueue } from '@/services/playQueue';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, fonts } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
import { overflows, playerLayout } from '@/utils/shortScreen';

const SUB = '#BAB7B7'; // Figma 아티스트·시간 글자색
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function PlayerScreen({ navigation, route }: RootScreen<'Player'>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentW = Math.min(width - 54, 400); // Figma 좌우 27
  const { songId, dropId, queue, autoplay } = route.params;
  const qIndex = queue ? queue.indexOf(songId) : -1;
  const nextId = queue && qIndex >= 0 ? queue[qIndex + 1] : undefined;
  const songQ = useSong(songId, { keepPrevious: !!queue });
  const song = songQ.data;
  const drop = useDrop(dropId).data;
  const preview = usePreview(song);
  const menu = useDropMenu(dropId, drop?.userId, '드랍', drop && 'username' in drop ? drop.username : undefined, song);
  const likeCount = useLikeCount(dropId).data;
  const comments = useComments(dropId).data;
  // 세로 배치 — iPhone SE·mini 등은 간격을 줄이고(compact), 분할 화면·플립 커버처럼 아주 짧으면 디스크를 남은 높이에 맞춘다(tight)
  const layout = playerLayout(width, height, insets.top, insets.bottom, comments?.length ?? 0);
  const { disc } = layout;
  // 그래도 넘치면(더 짧은 창) 잘라 버리지 않고 스크롤 — 들어가면 예전처럼 가운데 고정
  const [viewH, setViewH] = React.useState(0);
  const [contentH, setContentH] = React.useState(0);
  const liked = useIsLiked(dropId);
  const toggleLike = useToggleLike(dropId ?? '');
  const authed = useAuth(s => s.status === 'authed');
  const service = usePrefs(s => s.service);
  const address = useDropPlace(dropId, drop);

  // 화면을 닫아도 듣던 곡은 계속 (다른 곡을 틀 때만 바뀜 — 지도 미니 디스크·잠금화면에서 제어)

  // 전체 재생/셔플은 대기열 서비스(services/playQueue)가 진행한다 — 이 화면을 닫아도 다음 곡으로 계속 (예전엔 화면이 넘겨서 닫으면 멈췄다).
  // 화면은 대기열을 시작하고, 대기열이 지금 트는 곡을 따라 보여 준다
  React.useEffect(() => { if (queue) playQueue(queue, songId, dropId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const queueCurrent = usePlayQueue(st => (queue && sameIds(st.ids, queue) ? st.current : null));
  // 따라갈 곡은 렌더 때 값이 아니라 스토어의 지금 값으로 — 같은 순서의 전체 재생을 다시 누르면 마운트 렌더엔 지난번 곡(예: 3번)이 남아 있고,
  // 바로 위 effect가 1번으로 다시 시작한 뒤라 렌더 값으로 넘기면 화면은 3번·소리는 1번이 됐다 (QA 리뷰 반영)
  React.useEffect(() => {
    if (!queue) return;
    const st = usePlayQueue.getState();
    if (sameIds(st.ids, queue) && st.current && st.current !== songId) navigation.setParams({ songId: st.current });
  }, [queueCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  // 곡 하나 자동 재생(autoplay, 대기열 없음): 열리면 미리듣기 시작
  const startedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!autoplay || queue || startedFor.current === songId || preview.loading || !song || song.id !== songId) return;
    startedFor.current = songId;
    if (preview.available && !preview.playing) preview.toggle();
  }, [songId, song?.id, preview.loading, preview.available]); // eslint-disable-line react-hooks/exhaustive-deps
  const loaded = usePreviewStore(st => st.key === songId);

  if (!song) return <ScreenState error={songQ.error} onRetry={() => songQ.refetch()} />;

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
    resetQueueFails(); // 사용자가 직접 누르면 연속 실패로 멈춘 대기열도 다시 이어진다
    return preview.available || loaded ? preview.toggle() : listen();
  };
  // 대기열 이전·다음 곡을 직접 고름 — 연속 실패로 멈춘 대기열도 다시 이어진다
  const pickQueued = (id: string) => { jumpTo(id); navigation.setParams({ songId: id }); };
  const like = () => (authed ? toggleLike.toggle() : toast('로그인이 필요해요.'));
  const hole = disc * 0.153; // Figma 가운데 흰 구멍 53.5 / 349
  const halo = disc * 0.249; // 반투명 링 87 / 349
  const bubbles = (comments ?? []).slice(0, layout.bubbles);

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

      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={overflows(contentH, viewH)}
        showsVerticalScrollIndicator={false}
        onLayout={e => setViewH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentH(h)}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: (width - contentW) / 2, gap: layout.gap, paddingBottom: insets.bottom + 8 }}
      >
        <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: layout.innerGap }}>
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

          <PlayerProgress songId={song.id} width={contentW} waveH={layout.waveH} available={preview.available} fullDuration={song.duration} song={song} />

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
      </ScrollView>
    </View>
  );
}

/** 막대 파형 진행 바 + 시간 — 250ms마다 이 부분만 다시 그린다 (실제 미리듣기 위치/길이) */
function PlayerProgress({ songId, width, waveH, available, fullDuration, song }: { songId: string; width: number; waveH: number; available: boolean; fullDuration: number; song: { title: string; artist: string } }) {
  const { position, duration } = usePreviewProgress(songId);
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <BarProgress progress={duration ? position / duration : 0} width={width} height={waveH} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="tiny" style={{ color: SUB }}>{formatDuration(position)}</T>
        {available ? <PreviewCredit song={song} /> : null}
        <T v="tiny" style={{ color: SUB }}>{available ? formatDuration(duration) : formatDuration(fullDuration)}</T>
      </View>
    </View>
  );
}
