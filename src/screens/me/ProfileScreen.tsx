/** 5.1 프로필 — 내 드랍 지도 · 드랍 기록 · 좋아요 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View, Image } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import type { DropSummary } from '@/api/types';
import { Art, Avatar, Empty, Icon, IconButton, Press, T, PrimaryButton } from '@/components/ui';
import { env } from '@/config';
import { qk, useLikeCount, useMe, useMyDrops, useMyLikeCount, useMyLikes, useMyPlaylists } from '@/hooks/api';
import { likeApi } from '@/api/endpoints';
import { artUrl } from '@/utils/artUrl';
import { dropArt, dropSub, dropTitle } from '@/screens/map/MapHomeScreen';
import { toast } from '@/store/toast';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, glow } from '@/theme/tokens';

const useGoogle = !!env.googleMapsKey || Platform.OS === 'android';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const qc = useQueryClient();
  const me = useMe().data;
  const EMPTY: never[] = [];
  const myDrops = useMyDrops().data;
  const drops = useMemo(() => myDrops ?? EMPTY, [myDrops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 앨범 아트가 로드될 시간을 준 뒤 마커 스냅샷 고정 (Google 지도는 추적을 끄면 그 순간 모습으로 굳는다)
  const [tracks, setTracks] = useState(true);
  const [tab, setTab] = useState<'drops' | 'likes'>('drops');
  const [artEpoch, setArtEpoch] = useState(0);
  useEffect(() => {
    let alive = true;
    setTracks(true);
    let t: ReturnType<typeof setTimeout> = setTimeout(() => setTracks(false), 5000);
    // Android 마커 이미지는 미리 받아둔 뒤 다시 만들어야 보인다
    const urls = drops.map(d => artUrl(dropArt(d), 26)).filter((u): u is string => !!u);
    Promise.all(urls.map(u => Image.prefetch(u).catch(() => false))).then(() => {
      if (!alive) return;
      if (Platform.OS === 'android') setArtEpoch(e => e + 1);
      setTracks(true); clearTimeout(t); t = setTimeout(() => setTracks(false), 2500);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [drops, tab]);
  const likes = useMyLikes().data ?? [];
  const myLikeCount = useMyLikeCount().data;
  // 디자인: '받은 좋아요' = 내 드랍들이 받은 좋아요 합계 (드랍별 좋아요 수 캐시를 공유)
  const likeCounts = useQueries({ queries: drops.map(d => ({ queryKey: qk.likeCount(d.droppingId), queryFn: () => likeApi.countForDrop(d.droppingId) })) });
  const receivedLikes = likeCounts.reduce((a, q) => a + (q.data ?? 0), 0);
  const playlists = useMyPlaylists().data ?? [];

  const region = useMemo(() => {
    if (!drops.length) return null;
    const lats = drops.map(d => d.latitude), lngs = drops.map(d => d.longitude);
    const pad = 0.004;
    return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2, latitudeDelta: Math.max(0.01, Math.max(...lats) - Math.min(...lats) + pad), longitudeDelta: Math.max(0.01, Math.max(...lngs) - Math.min(...lngs) + pad) };
  }, [drops]);

  const openDrop = (d: DropSummary) => nav.navigate(d.type === 'VOTE' ? 'VoteDrop' : d.type === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: d.droppingId });
  const removeDrop = (d: DropSummary) => dialog.alert('드랍을 삭제할까요?', `'${dropTitle(d)}' 드랍이 지도에서 사라지고 되돌릴 수 없어요.`, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => dropApi.remove(d.droppingId).then(() => { qc.invalidateQueries({ queryKey: ['myDrops'] }); qc.invalidateQueries({ queryKey: ['nearby'] }); toast('드랍을 삭제했어요.'); }).catch(e => toast(errorMessage(e), 'error')) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 }}>
        <View style={{ alignItems: 'flex-end', paddingHorizontal: 20 }}>
          <IconButton name="settings" onPress={() => nav.navigate('Settings')} accessibilityLabel="설정" />
        </View>
        <View style={{ alignItems: 'center', gap: 12, marginTop: -8 }}>
          <View style={[{ width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, glow(0.35, 20)]}>
            <Avatar uri={me?.profileImageUrl} name={me?.username} size={84} />
          </View>
          <T v="title">{me?.username ?? ' '}</T>
          <View style={{ flexDirection: 'row' }}>
            {[[drops.length, '드랍'], [receivedLikes, '받은 좋아요'], [playlists.length, '플레이리스트']].map(([n, l], i) => (
              <View key={String(l)} style={{ width: 108, alignItems: 'center', gap: 2, borderRightWidth: i < 2 ? 1 : 0, borderRightColor: colors.line }}>
                <T v="numberLarge" style={{ fontSize: 22, lineHeight: 28 }}>{n}</T>
                <T v="micro" c="ink3">{l}</T>
              </View>
            ))}
          </View>
          <Press onPress={() => nav.navigate('ProfileEdit')} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: colors.line }}>
            <T v="captionStrong" c="ink2">프로필 편집</T>
          </Press>
        </View>

        <View style={{ flexDirection: 'row', gap: 22, paddingHorizontal: 20, marginTop: 26 }}>
          {([['drops', '드랍 기록'], ['likes', myLikeCount ? `좋아요 ${myLikeCount}` : '좋아요']] as const).map(([k, l]) => (
            <Press key={k} onPress={() => setTab(k)} style={{ alignItems: 'center', gap: 6 }}>
              <T v="bodyStrong" c={tab === k ? 'ink' : 'ink3'}>{l}</T>
              <View style={[{ width: tab === k ? 24 : 0, height: 3, borderRadius: 2, backgroundColor: colors.primary }, tab === k ? glow(0.8, 6) : null]} />
            </Press>
          ))}
        </View>

        {tab === 'drops' ? (
          <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 6 }}>
            {region ? (
              <View style={{ height: 130, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, marginBottom: 8 }}>
                <MapView style={{ flex: 1 }} provider={useGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT} customMapStyle={useGoogle ? googleMapStyle : undefined} userInterfaceStyle="dark" initialRegion={region} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}>
                  {drops.map(d => (
                    <Marker key={`${d.droppingId}:${artEpoch}`} coordinate={d} tracksViewChanges={tracks} anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={[{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, Platform.OS === 'ios' ? glow(0.6, 10) : null]}><Art uri={dropArt(d)} size={26} round /></View>
                    </Marker>
                  ))}
                </MapView>
                <View style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(5,9,22,0.8)' }}>
                  <Icon name="map" size={12} color={colors.primary} />
                  <T v="micro">내 드랍 지도</T>
                </View>
              </View>
            ) : null}
            {drops.length ? drops.map(d => (
              <Press key={d.droppingId} onPress={() => openDrop(d)} onLongPress={() => removeDrop(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Art uri={dropArt(d)} size={52} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={1}>{dropTitle(d)}</T>
                  <T v="caption" c="ink2" numberOfLines={1}>{d.content || (d.type === 'MUSIC' ? d.artist : dropSub(d))}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="pin" size={11} color={colors.ink3} />
                    <T v="micro" c="ink3" numberOfLines={1}>{d.address}</T>
                  </View>
                </View>
                <LikeBadge dropId={d.droppingId} />
              </Press>
            )) : <Empty icon="wave" title="아직 남긴 드랍이 없어요" desc="지금 있는 곳에 첫 곡을 남겨보세요." action={<PrimaryButton label="첫 드랍 남기기" icon="plus" onPress={() => nav.navigate('DropType')} style={{ alignSelf: 'stretch', marginTop: 8 }} />} />}
            {drops.length ? <T v="micro" c="ink3" style={{ textAlign: 'center', marginTop: 6 }}>길게 누르면 드랍을 삭제할 수 있어요</T> : null}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 6 }}>
            {likes.length ? likes.map(l => (
              <Press key={l.droppingId} onPress={() => nav.navigate(l.droppingType === 'VOTE' ? 'VoteDrop' : l.droppingType === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: l.droppingId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Art uri={l.imageUrl} size={52} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={1}>{l.title ?? l.topic ?? l.playlistName}</T>
                  <T v="caption" c="ink2" numberOfLines={1}>{l.address}</T>
                </View>
                <Icon name="heartFill" size={16} color={colors.primary} />
              </Press>
            )) : <Empty icon="heart" title="좋아요한 드랍이 없어요" />}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** 드랍별 받은 좋아요 수 (디자인: 행 오른쪽 하트) */
function LikeBadge({ dropId }: { dropId: string }) {
  const n = useLikeCount(dropId).data;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={n !== undefined ? `좋아요 ${n}개` : undefined}>
      <Icon name="heart" size={14} color={colors.ink2} />
      <T v="number" c="ink2">{n ?? '·'}</T>
    </View>
  );
}
