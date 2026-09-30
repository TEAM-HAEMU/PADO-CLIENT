/**
 * 2.3 재생 · 30초 미리듣기 — 도는 디스크 + 파티클 파도 + 점 진행 바.
 * 미리듣기가 마음에 들면 하단의 작은 필('전체 듣기')로 고른 음악 앱에 딥링크 (음악을 가리지 않게).
 */
import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { isMusicDetail } from '@/api/types';
import { BreathingRing, DotProgress, ParticleWave, Spin } from '@/components/anim';
import { ServiceGlyph } from '@/components/ui/Brand';
import { Art, Avatar, Icon, IconButton, Press, T } from '@/components/ui';
import { useDropMenu } from '@/hooks/useDropMenu';
import { useCommentCount, useDrop, useDropAddress, useLikeCount, useMyLikes, useSong, useToggleLike } from '@/hooks/api';
import { ScreenState } from '@/components/ui/ScreenState';
import type { RootScreen } from '@/navigation/types';
import { listenFull, listenLabel } from '@/services/listen';
import { usePreview, usePreviewProgress, usePreviewStore } from '@/services/preview';
import { useAuth } from '@/store/auth';
import { usePrefs } from '@/store/prefs';
import { toast } from '@/store/toast';
import { colors, glow } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

export default function PlayerScreen({ navigation, route }: RootScreen<'Player'>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 740; // iPhone SE 등 작은 화면
  const disc = compact ? 176 : 232;
  const half = disc / 2;
  const { songId, dropId, queue, autoplay } = route.params;
  const qIndex = queue ? queue.indexOf(songId) : -1;
  const nextId = queue && qIndex >= 0 ? queue[qIndex + 1] : undefined;
  const qc = useQueryClient();
  const songQ = useSong(songId, { keepPrevious: !!queue });
  const song = songQ.data;
  const drop = useDrop(dropId).data;
  const music = drop && isMusicDetail(drop) ? drop : null;
  const preview = usePreview(song);
  const menu = useDropMenu(dropId, drop?.userId, '드랍');
  const likeCount = useLikeCount(dropId).data;
  const commentCount = useCommentCount(dropId).data;
  const myLikes = useMyLikes().data;
  const liked = dropId ? qc.getQueryData<boolean>(['liked', dropId]) ?? !!myLikes?.some(x => x.droppingId === dropId) : false;
  const toggleLike = useToggleLike(dropId ?? '');
  const authed = useAuth(s => s.status === 'authed');
  const service = usePrefs(s => s.service) ?? 'spotify';
  const address = useDropAddress(dropId, drop && 'address' in drop ? (drop as { address?: string }).address : null);

  // 화면을 닫아도 듣던 곡은 계속 (다른 곡을 틀 때만 바뀜 — 지도 미니 디스크·잠금화면에서 제어)

  // 전체 재생/셔플: 열리면 미리듣기 시작, 끝나면(또는 미리듣기가 없으면) 다음 곡으로
  const startedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    // 다음 곡을 불러오는 동안엔 이전 곡이 자리만 지키고 있으므로 기다린다
    if (!(autoplay || queue) || startedFor.current === songId || preview.loading || songQ.isPlaceholderData || song?.id !== songId) return;
    if (preview.available) { startedFor.current = songId; if (!preview.playing) preview.toggle(); }
    else if (nextId) { startedFor.current = songId; const t = setTimeout(() => navigation.setParams({ songId: nextId }), 1200); return () => clearTimeout(t); }
  }, [songId, song?.id, preview.loading, preview.available]); // eslint-disable-line react-hooks/exhaustive-deps
  const endedKey = usePreviewStore(st => st.endedKey);
  const endedAtMount = React.useRef(usePreviewStore.getState().endedKey);
  React.useEffect(() => {
    if (endedKey === endedAtMount.current) return; // 이 화면에 오기 전에 끝난 곡은 무시
    endedAtMount.current = null;
    if (endedKey === songId && nextId) navigation.setParams({ songId: nextId });
  }, [endedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!song) return <ScreenState error={songQ.error} onRetry={() => songQ.refetch()} />;

  // 전체 듣기 — 고른 음악 앱으로 딥링크 (없으면 선택 시트)
  const listen = () => listenFull(usePrefs.getState().service, song);
  // 사용자가 직접 누른 재생·일시정지 — 이후 자동 재생 효과가 덮어쓰지 않게 이 곡은 '시작됨'으로 표시
  const onMain = () => {
    startedFor.current = songId;
    return preview.available ? preview.toggle() : listen();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Svg width="100%" height={460} style={{ position: 'absolute', top: 60 }}>
        <Defs>
          <RadialGradient id="pg" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#0E3A7A" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#050916" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="230" rx="260" ry="210" fill="url(#pg)" />
      </Svg>
      <ParticleWave style={{ position: 'absolute', top: insets.top + 64 }} animate={preview.playing || !preview.available} />

      {/* top bar */}
      <View style={{ marginTop: insets.top + 6, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <IconButton name="chevronDown" onPress={navigation.goBack} accessibilityLabel="재생 화면 닫기" />
        <View style={{ alignItems: 'center', gap: 2, flexShrink: 1 }}>
          {queue ? <T v="label" c="primary">{`${qIndex + 1} / ${queue.length}`}</T> : null}
          {address ? <T v="caption" c="ink2" numberOfLines={1}>{address}</T> : null}
        </View>
        {dropId ? <IconButton name="more" onPress={menu.open} accessibilityLabel="더보기" /> : <View style={{ width: 44 }} />}
      </View>

      {/* disc */}
      <View style={{ alignItems: 'center', justifyContent: 'center', height: disc + 78 }}>
        <BreathingRing size={disc + 60} opacity={0.18} />
        <BreathingRing size={disc + 30} opacity={0.35} scaleTo={0.96} />
        <View style={[{ borderRadius: half, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.page }, glow(0.55, 40)]}>
          <Spin paused={!preview.playing}>
            <View style={{ width: disc, height: disc, borderRadius: half, overflow: 'hidden' }}>
              <Art uri={song.albumImagePath} size={disc} round />
              {[0.86, 0.69, 0.52].map(f => { const r = disc * f; return <View key={f} style={{ position: 'absolute', left: half - r / 2, top: half - r / 2, width: r, height: r, borderRadius: r / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />; })}
              <View style={{ position: 'absolute', left: half - 13, top: half - 13, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.page, borderWidth: 2, borderColor: colors.primary }} />
            </View>
          </Spin>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 2, marginTop: 8, paddingHorizontal: 24 }}>
        <T v={compact ? 'title' : 'display'} numberOfLines={1}>{song.title}</T>
        <T v="body" c="ink2" numberOfLines={1}>{song.artist}</T>
      </View>
      {music?.content ? (
        <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: compact ? 8 : 14, paddingLeft: 10, paddingRight: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.8)', borderWidth: 1, borderColor: colors.line, maxWidth: width - 48 }}>
          <Avatar name={music.username} size={22} />
          <T v="caption" c="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>{music.username} · {music.content}</T>
        </View>
      ) : null}

      {/* progress */}
      <View style={{ marginTop: compact ? 14 : 22, paddingHorizontal: 28, gap: 8 }}>
        <PlayerProgress songId={song.id} width={width - 56} dots={compact ? 36 : 44} available={preview.available} fullDuration={song.duration} />
      </View>

      {/* controls */}
      <View style={{ marginTop: compact ? 10 : 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
        {!queue ? (
          <Press accessibilityLabel={`좋아요 ${likeCount ?? 0}개`} accessibilityState={{ selected: liked }} disabled={!dropId} onPress={() => (authed ? toggleLike.mutate(undefined, { onError: e => toast(errorMessage(e), 'error') }) : toast('로그인이 필요해요.'))} style={{ alignItems: 'center', gap: 4, opacity: dropId ? 1 : 0.35 }}>
            <Icon name={liked ? 'heartFill' : 'heart'} size={24} color={liked ? colors.primary : colors.ink} />
            <T v="micro" c="ink3">{likeCount ?? 0}</T>
          </Press>
        ) : (
          <Press accessibilityLabel="이전 곡" disabled={qIndex <= 0} onPress={() => qIndex > 0 && navigation.setParams({ songId: queue[qIndex - 1] })} style={{ alignItems: 'center', width: 40, opacity: qIndex > 0 ? 1 : 0.35 }}>
            <Icon name="prev" size={26} />
          </Press>
        )}
        <Press onPress={onMain} accessibilityLabel={preview.playing ? '일시정지' : '재생'} style={[{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.6, 30)]}>
          <Icon name={preview.playing ? 'pause' : 'play'} size={30} color={colors.onPrimary} />
        </Press>
        {!queue ? (
          <Press accessibilityLabel="댓글" disabled={!dropId} onPress={() => dropId && navigation.navigate('Comments', { dropId })} style={{ alignItems: 'center', gap: 4, opacity: dropId ? 1 : 0.35 }}>
            <Icon name="comment" size={24} />
            <T v="micro" c="ink3">{commentCount ?? 0}</T>
          </Press>
        ) : (
          <Press accessibilityLabel="다음 곡" disabled={!nextId} onPress={() => nextId && navigation.setParams({ songId: nextId })} style={{ alignItems: 'center', width: 40, opacity: nextId ? 1 : 0.35 }}>
            <Icon name="next" size={26} />
          </Press>
        )}
      </View>

      {/* handoff pill */}
      <View style={{ flex: 1, minHeight: 12 }} />
      <View style={{ marginBottom: insets.bottom + (compact ? 10 : 18), alignSelf: 'center', flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.6)', borderWidth: 1, borderColor: colors.line }}>
        <Press onPress={listen} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 10, paddingVertical: 9 }}>
          <ServiceGlyph service={service} size={16} />
          <T v="captionStrong" c="ink2">{listenLabel(service)}</T>
          <Icon name="external" size={14} color={colors.ink3} />
        </Press>
        <View style={{ width: 1, height: 14, backgroundColor: colors.line }} />
        <Press onPress={() => navigation.navigate('ServicePicker', { song })} accessibilityLabel="재생 앱 바꾸기" hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
          <Icon name="chevronDown" size={14} color={colors.ink3} />
        </Press>
      </View>
    </View>
  );
}

/** 진행 바 + 시간 — 250ms마다 이 부분만 다시 그린다 */
function PlayerProgress({ songId, width, dots, available, fullDuration }: { songId: string; width: number; dots: number; available: boolean; fullDuration: number }) {
  const { position, duration } = usePreviewProgress(songId);
  return (
    <>
      <DotProgress progress={duration ? position / duration : 0} width={width} dots={dots} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="number" c="primary">{formatDuration(position)}</T>
        <T v="number" c="ink3">{available ? formatDuration(duration) : formatDuration(fullDuration)}</T>
      </View>
    </>
  );
}
