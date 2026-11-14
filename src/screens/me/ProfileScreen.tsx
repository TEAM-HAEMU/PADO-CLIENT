/** 5.1 프로필 — 내 드랍 지도 · 드랍 기록 · 좋아요 (오른쪽 위 종 아이콘 → 알림) */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View, Image, useWindowDimensions } from 'react-native';
import { dialog } from '@/components/ui/Dialog';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { type DropSummary, isPlaylistDetail } from '@/api/types';
import { Art, Avatar, Empty, Press, T, PrimaryButton } from '@/components/ui';
import { MeGlyph, type MeGlyphName } from '@/components/me/MeIcons';
import { Wave } from '@/components/ui/Wave';
import { listStatus } from '@/components/ui/ScreenState';
import { MarkerArt } from '@/components/map/DropPin';
import { env } from '@/config';
import { invalidateAfterDropRemoved, qk, useMe, useMyDrops, useMyLikeCount, useMyLikes, useMyPlaylists, useUnreadCount } from '@/hooks/api';
import { likeApi } from '@/api/endpoints';
import { artUrl } from '@/utils/artUrl';
import { dropArt, dropSub, dropTitle } from '@/screens/map/MapHomeScreen';
import { toast } from '@/store/toast';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, fonts } from '@/theme/tokens';

const useGoogle = !!env.googleMapsKey || Platform.OS === 'android';
/** '내 드랍 지도' 칸 높이 · 핀 전체 키 (아트 55 + 막대 19) */
const DROP_MAP_H = 120;
const PIN_H = 74;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const nav = useNavigation();
  const qc = useQueryClient();
  // 프로필은 탭이라 늘 마운트돼 있다 → 드랍 수만큼 나가는 요청(좋아요 수·플리 상세)은 이 화면이 보일 때만 받는다
  // (꺼 둔 동안에도 받아 둔 값은 그대로 보인다. 앱 복귀·다른 탭에 있을 때 N개씩 다시 받지 않게)
  const focused = useIsFocused();
  const [tab, setTab] = useState<'drops' | 'likes'>('drops');
  const me = useMe().data;
  const EMPTY: never[] = [];
  const myDropsQ = useMyDrops();
  const myDrops = myDropsQ.data;
  const drops = useMemo(() => myDrops ?? EMPTY, [myDrops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 플리 드랍 핀은 플리 상세와 같은 4칸 커버 — 요약엔 첫 곡 아트뿐이라 드랍 상세의 곡 아트를 쓴다
  const playlistDrops = drops.filter(d => d.type === 'PLAYLIST');
  const plDetails = useQueries({ queries: playlistDrops.map(d => ({ queryKey: qk.drop(d.droppingId), queryFn: () => dropApi.get(d.droppingId), staleTime: 5 * 60_000, enabled: focused && tab === 'drops' })) });
  const covers: Record<string, (string | null)[]> = {};
  playlistDrops.forEach((d, i) => { const det = plDetails[i]?.data; if (det && isPlaylistDetail(det)) covers[d.droppingId] = det.songs.map(x => x.albumImagePath); });
  const pinArts = (d: DropSummary) => covers[d.droppingId] ?? [dropArt(d)];
  // 앨범 아트가 로드될 시간을 준 뒤 마커 스냅샷 고정 (Google 지도는 추적을 끄면 그 순간 모습으로 굳는다)
  // 목록을 다시 받을 때마다(같은 내용이어도) 다시 그리면 겹친 핀이 번쩍이며 순서가 바뀌므로, 핀 구성·그림이 바뀔 때만
  const [tracks, setTracks] = useState(true);
  const [artEpoch, setArtEpoch] = useState(0);
  const pinKey = drops.map(d => `${d.droppingId}=${pinArts(d).slice(0, 4).join('|')}`).join(',');
  useEffect(() => {
    if (tab !== 'drops') return; // 지도는 드랍 기록 탭에만 있다
    let alive = true;
    setTracks(true);
    let t: ReturnType<typeof setTimeout> = setTimeout(() => setTracks(false), 5000);
    // Android 마커 이미지는 미리 받아둔 뒤 다시 만들어야 보인다
    const urls = drops.flatMap(d => (covers[d.droppingId] ? covers[d.droppingId].slice(0, 4) : [artUrl(dropArt(d), 49)])).filter((u): u is string => !!u);
    Promise.all(urls.map(u => Image.prefetch(u).catch(() => false))).then(() => {
      if (!alive) return;
      if (Platform.OS === 'android') setArtEpoch(e => e + 1);
      setTracks(true); clearTimeout(t); t = setTimeout(() => setTracks(false), 2500);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [pinKey, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const likesQ = useMyLikes();
  const likes = likesQ.data ?? [];
  const myLikeCount = useMyLikeCount().data;
  // 탭 숫자는 아래 목록과 같아야 한다 — 서버 개수(/likes/count/user)는 사라진 드랍의 좋아요까지 세어 목록보다 클 수 있어, 목록을 받았으면 목록 길이로
  const likeTotal = likesQ.data ? likes.length : myLikeCount;
  // 디자인: '받은 좋아요' = 내 드랍들이 받은 좋아요 합계 (드랍별 좋아요 수 캐시를 공유) — 내가 내 드랍에 누른 좋아요는 빼고
  // 행 오른쪽 숫자(LikeBadge)도 이 결과를 받아 쓴다 — 행마다 따로 구독하면 기본 신선도(30초)로 앱 복귀 때마다 N개를 다시 받는다
  // 내가 좋아요를 누르면 useToggleLike가 해당 키를 바로 고치고 무효화하므로 5분 신선도여도 내 동작은 바로 보인다
  const likeCounts = useQueries({ queries: drops.map(d => ({ queryKey: qk.likeCount(d.droppingId), queryFn: () => likeApi.countForDrop(d.droppingId), staleTime: 5 * 60_000, enabled: focused })) });
  const myDropIds = new Set(drops.map(d => d.droppingId));
  const selfLikes = likes.filter(l => myDropIds.has(l.droppingId)).length;
  const receivedLikes = Math.max(0, likeCounts.reduce((a, q) => a + (q.data ?? 0), 0) - selfLikes);
  const playlists = useMyPlaylists().data ?? [];
  const unread = useUnreadCount().data ?? 0;

  // 핀은 좌표(바닥 점)에서 위로 74pt 솟아 있어, 좌표 범위에 딱 맞추면 가장 북쪽 핀이 지도 칸 위로 잘려 나간다
  // → 칸 높이에서 핀 키만큼 위를 비워 두고 남는 높이에 좌표 범위를 넣는다 (옆도 핀 반 폭만큼)
  const mapW = width - 40;
  const region = useMemo(() => {
    if (!drops.length) return null;
    const lats = drops.map(d => d.latitude), lngs = drops.map(d => d.longitude);
    const minLat = Math.min(...lats), latSpan = Math.max(...lats) - minLat;
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const room = DROP_MAP_H - PIN_H - 8; // 좌표들이 들어갈 세로 픽셀
    const latitudeDelta = Math.max(0.01, (latSpan * DROP_MAP_H) / room);
    const longitudeDelta = Math.max(0.01, (lngSpan * mapW) / (mapW - 64));
    // 남는 세로 여백은 위아래 반씩 — 가장 남쪽 좌표가 아래에서 bottomPx 위에 오게
    const bottomPx = (DROP_MAP_H - PIN_H - (latSpan / latitudeDelta) * DROP_MAP_H) / 2;
    const latitude = minLat - (bottomPx / DROP_MAP_H) * latitudeDelta + latitudeDelta / 2;
    return { latitude, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2, latitudeDelta, longitudeDelta };
  }, [drops, mapW]);

  const openDrop = (d: DropSummary) => nav.navigate(d.type === 'VOTE' ? 'VoteDrop' : d.type === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: d.droppingId, source: 'profile' });
  const removeDrop = (d: DropSummary) => dialog.alert('드랍을 삭제할까요?', `'${dropTitle(d)}' 드랍이 지도에서 사라지고 되돌릴 수 없어요.`, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => dropApi.remove(d.droppingId).then(() => { invalidateAfterDropRemoved(qc, d.droppingId); toast('드랍을 삭제했어요.'); }).catch(e => toast(errorMessage(e), 'error')) },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120 }}>
        {/* Figma: 프로필 사진 뒤로 wave(624×305)가 깔린다 */}
        <Wave scale={1.2} style={{ position: 'absolute', left: -73, right: 0, top: insets.top + 97 }} />
        {/* 오른쪽 위 아이콘 줄 (24px · 간격 4) — 알림(하단 바에서 옮겨옴) · 프로필 편집 · 설정 */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 24 }}>
          <Press onPress={() => nav.navigate('Notifications')} accessibilityLabel="알림" hitSlop={8}>
            <MeGlyph name="bell" size={24} />
            {unread ? <View style={{ position: 'absolute', top: 1, right: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.caution, borderWidth: 1, borderColor: colors.page }} /> : null}
          </Press>
          <Press onPress={() => nav.navigate('ProfileEdit')} accessibilityLabel="프로필 편집" hitSlop={8}><MeGlyph name="edit" size={24} /></Press>
          <Press onPress={() => nav.navigate('Settings')} accessibilityLabel="설정" hitSlop={8}><MeGlyph name="gear" size={24} /></Press>
        </View>
        <View style={{ alignItems: 'center', gap: 20, marginTop: 12 }}>
          <View style={{ width: 120, height: 120, borderRadius: 60, shadowColor: '#C0EEFF', shadowOpacity: 1, shadowRadius: 50, shadowOffset: { width: 0, height: 0 } }}>
            <Avatar uri={me?.profileImageUrl} name={me?.username} size={120} />
          </View>
          <T v="title" style={{ fontFamily: fonts.semibold, color: '#000000' }}>{me?.username ?? ' '}</T>
        </View>
        {/* 숫자 3칸 — 사이에 1×24 세로선 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 30, paddingHorizontal: 38 }}>
          {[[drops.length, '드랍'], [receivedLikes, '받은 좋아요'], [playlists.length, '플레이리스트']].map(([n, l], i) => (
            <React.Fragment key={String(l)}>
              {i ? <View style={{ width: 1, height: 24, borderRadius: 1, backgroundColor: '#EBEBEB' }} /> : null}
              <View style={{ flex: 1, alignItems: 'center' }}>
                <T v="headline" style={{ fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: '#000000' }}>{n}</T>
                <T v="caption" style={{ color: '#959595', letterSpacing: -0.24 }}>{l}</T>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Figma 'tag' 칩 탭 (높이 30) — 고른 탭이 채워진 파랑 */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 30 }}>
          <TabTag label="드랍 기록" glyph="drop" on={tab === 'drops'} onPress={() => setTab('drops')} />
          <TabTag label={likeTotal ? `좋아요 ${likeTotal}` : '좋아요'} glyph="heart" on={tab === 'likes'} onPress={() => setTab('likes')} />
        </View>

        {tab === 'drops' ? (
          <View style={{ marginTop: 30 }}>
            {region ? (
              <View style={{ height: DROP_MAP_H, marginHorizontal: 20, marginBottom: 20, borderRadius: 16, overflow: 'hidden' }}>
                <MapView style={{ flex: 1 }} provider={useGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT} customMapStyle={useGoogle ? googleMapStyle : undefined} userInterfaceStyle="light" initialRegion={region} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}>
                  {drops.map((d, i) => (
                    <Marker key={`${d.droppingId}:${artEpoch}`} coordinate={d} tracksViewChanges={tracks} anchor={{ x: 0.5, y: 1 }} zIndex={drops.length - i}>
                      {/* Figma 'stay music' 핀 — #FAFAFA 3px 테두리 앨범 아트 55 + 가는 막대 + 바닥 점 */}
                      <View style={{ alignItems: 'center', width: 55 }}>
                        <View style={{ width: 55, height: 55, borderRadius: 12, borderWidth: 3, borderColor: '#FAFAFA', backgroundColor: '#FFFFFF', overflow: 'hidden' }}><MarkerArt images={pinArts(d)} size={49} radius={9} /></View>
                        <View style={{ width: 8, height: 19, alignItems: 'center' }}>
                          <View style={{ width: 1, height: 16, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, backgroundColor: 'rgba(250,250,250,0.7)' }} />
                          <View style={{ position: 'absolute', top: 12, width: 8, height: 7, borderRadius: 4, backgroundColor: 'rgba(250,250,250,0.7)' }} />
                        </View>
                      </View>
                    </Marker>
                  ))}
                </MapView>
                <View style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFFFFF' }}>
                  <MeGlyph name="mapFold" size={12} />
                  <T v="micro" style={{ color: '#1C1C1C' }}>내 드랍 지도</T>
                </View>
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 20, gap: 4 }}>
              {listStatus(myDropsQ, '드랍 기록을 불러오지 못했어요') ?? (drops.length ? drops.map((d, i) => (
                <Press key={d.droppingId} onPress={() => openDrop(d)} onLongPress={() => removeDrop(d)} trackAs="내 드랍" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Art uri={dropArt(d)} size={52} radius={12} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="bodyStrong" numberOfLines={1} style={ROW_TITLE}>{dropTitle(d)}</T>
                    <T v="caption" c="ink2" numberOfLines={1}>{d.content || (d.type === 'MUSIC' ? d.artist : dropSub(d))}</T>
                    <Address text={d.address} />
                  </View>
                  <LikeBadge n={likeCounts[i]?.data} />
                </Press>
              )) : <Empty icon="wave" title="아직 남긴 드랍이 없어요" desc="지금 있는 곳에 첫 곡을 남겨보세요." action={<PrimaryButton label="첫 드랍 남기기" icon="plus" onPress={() => nav.navigate('DropType')} style={{ alignSelf: 'stretch', marginTop: 8 }} />} />)}
              {drops.length ? <T v="micro" c="faint" style={{ textAlign: 'center', marginTop: 8 }}>길게 누르면 드랍을 삭제할 수 있어요</T> : null}
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, marginTop: 30, gap: 4 }}>
            {listStatus(likesQ, '좋아요한 드랍을 불러오지 못했어요') ?? (likes.length ? likes.map(l => (
              <Press key={l.droppingId} onPress={() => nav.navigate(l.droppingType === 'VOTE' ? 'VoteDrop' : l.droppingType === 'PLAYLIST' ? 'PlaylistDrop' : 'PinPreview', { dropId: l.droppingId, source: 'profile' })} trackAs="좋아요한 드랍" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Art uri={l.imageUrl} size={52} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong" numberOfLines={1} style={ROW_TITLE}>{l.title ?? l.topic ?? l.playlistName}</T>
                  <Address text={l.address} />
                </View>
                <MeGlyph name="heart" size={14} color={colors.like} />
              </Press>
            )) : <Empty icon="heart" title="좋아요한 드랍이 없어요" />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Figma 드랍 행 제목 14 Medium 검정 */
const ROW_TITLE = { fontSize: 14, letterSpacing: -0.14, color: '#000000' };
/** Figma 드랍 행 주소·좋아요 숫자 색 */
const SUB_INK = '#98A2B8';

/** Figma 'tag' (h30 · 아이콘 14 · 12 Medium) — 꺼짐: 옅은 하늘 + 파란 글자 / 켜짐: 파랑 80% + 흰 글자 */
function TabTag({ label, glyph, on, onPress }: { label: string; glyph: MeGlyphName; on: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? 'rgba(43,156,255,0.8)' : 'rgba(240,252,255,0.8)' }}>
      <MeGlyph name={glyph} size={14} color={on ? colors.primarySoft : '#55B0FF'} />
      <T v="caption" style={{ fontFamily: fonts.medium, letterSpacing: -0.24, color: on ? colors.primarySoft : colors.primary }}>{label}</T>
    </Press>
  );
}

/** 주소 한 줄 — 위치 핀 10px + 10 Medium */
function Address({ text }: { text?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <MeGlyph name="place" size={10} />
      <T v="tiny" numberOfLines={1} style={{ flex: 1, fontFamily: fonts.medium, color: SUB_INK }}>{text}</T>
    </View>
  );
}

/** 드랍별 받은 좋아요 수 (디자인: 행 오른쪽 하트) */
function LikeBadge({ n }: { n: number | undefined }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={n !== undefined ? `좋아요 ${n}개` : undefined}>
      <MeGlyph name="heart" size={14} color={colors.ink2} />
      <T v="caption" style={{ lineHeight: 16, color: SUB_INK }}>{n ?? '·'}</T>
    </View>
  );
}
