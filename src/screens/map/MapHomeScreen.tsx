/**
 * 2.1 지도 홈 — 하늘빛 지도 + 드랍 핀 + 아래 짙은 페이드 위 '가까운 드랍' 줄 (+ 도크는 탭 바). Figma '2 지도 · 재생' B 2.1.
 * 지도: GOOGLE_MAPS_API_KEY가 있으면 Google(스타일 JSON), 없으면 iOS Apple Maps(mutedStandard + 하늘빛 막)으로 대체.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import MapView, { Polygon, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import type { DropSummary, MusicDropSummary } from '@/api/types';
import type { DropOpenSource } from '@/navigation/types';
import { ClusterMarker, DropMarker, MyLocationMarker } from '@/components/map/DropMarker';
import { Art, Icon, Press, T } from '@/components/ui';
import { env } from '@/config';
import { qk, useNearbyDrops } from '@/hooks/api';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { useDropLock } from '@/hooks/useDropLock';
import { useDropRadius } from '@/hooks/useDropRadius';
import { scopeLabel } from '@/utils/dropScope';
import { track } from '@/services/analytics';
import { toast } from '@/store/toast';
import { lockMessage } from '@/utils/dropLock';
import { useMiniDiscActions } from '@/components/music/MiniDisc';
import { usePreviewStore } from '@/services/preview';
import { useTermsUpdateCheck } from '@/hooks/useTermsUpdateCheck';
import { distanceM, FALLBACK, formatDistance, lastKnown, useLocation } from '@/services/location';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, fonts, glow } from '@/theme/tokens';
import type { TabParamList } from '@/navigation/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatAddress } from '@/utils/address';
import { clusterPoints, clusterZoomRegion, geocodeDue, idSetKey, pickPins, shouldCluster, type GeocodeMark } from '@/utils/mapPins';

const useGoogle = !!env.googleMapsKey || Platform.OS === 'android';

export const dropArt = (d: DropSummary) => (d.type === 'MUSIC' ? d.albumImageUrl : d.firstAlbumImageUrl);
export const dropTitle = (d: DropSummary) => (d.type === 'MUSIC' ? d.title : d.type === 'VOTE' ? d.topic : d.playlistName);
/** 동 이름 옆 ▾ — Figma Location 'Frame' 아이콘 (20×24) */
const Caret = () => (
  <Svg width={20} height={24} viewBox="0 0 20 24">
    <Path d="M9.5625 14.475L6.54167 10.85C6.5 10.8 6.46875 10.7458 6.44792 10.6875C6.42708 10.6292 6.41667 10.5667 6.41667 10.5C6.41667 10.3667 6.45486 10.25 6.53125 10.15C6.60764 10.05 6.70833 10 6.83333 10H13.1667C13.2917 10 13.3924 10.05 13.4688 10.15C13.5451 10.25 13.5833 10.3667 13.5833 10.5C13.5833 10.5333 13.5417 10.65 13.4583 10.85L10.4375 14.475C10.3681 14.5583 10.2986 14.6167 10.2292 14.65C10.1597 14.6833 10.0833 14.7 10 14.7C9.91667 14.7 9.84028 14.6833 9.77083 14.65C9.70139 14.6167 9.63194 14.5583 9.5625 14.475Z" fill={colors.ink} />
  </Svg>
);

/** Apple 지도 하늘빛 막 — 지금 위치 주변 넓은 사각형 (축소해도 덮이게 ±2도) */
const tintArea = (c: { latitude: number; longitude: number }) => [
  { latitude: c.latitude + 2, longitude: c.longitude - 2 },
  { latitude: c.latitude + 2, longitude: c.longitude + 2 },
  { latitude: c.latitude - 2, longitude: c.longitude + 2 },
  { latitude: c.latitude - 2, longitude: c.longitude - 2 },
];
export const dropSub = (d: DropSummary) => (d.type === 'MUSIC' ? d.artist : d.type === 'VOTE' ? `투표 · ${d.options.length}곡` : `플레이리스트 · ${d.songIds.length}곡`);

// 파동은 가까운 핀 몇 개만, 지도가 보일 때만 (Google 지도는 애니메이션 동안 마커 비트맵을 매 프레임 다시 그림)
const ANIMATED_PINS = 4;

// 하단 도크(높이 50, Dock.tsx) 위로 띄우는 간격
const dockTop = (bottomInset: number) => Math.max(bottomInset - 4, 14) + 50;
// '가까운 드랍' 카드(상태 안내) 공통 모양 — 짙은 페이드 위 흰 카드
const card = { marginHorizontal: 20, padding: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1, borderColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 12 } as const;

/** 지도 첫 로드는 앱 실행마다 한 번만 센다 */
let mapLoadTracked = false;

export default function MapHomeScreen({ navigation }: BottomTabScreenProps<TabParamList, 'Map'>) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { coords, fix, reason, label, setPlace, start, restart, refreshPermission, requestPermission } = useLocation(useShallow(s => ({ coords: s.coords, fix: s.fix, reason: s.reason, label: s.label, setPlace: s.setPlace, start: s.start, restart: s.restart, refreshPermission: s.refreshPermission, requestPermission: s.requestPermission })));
  // 위치를 받기 전엔 지난번 위치 근처에 카메라를 둔다 (처음 켤 때 엉뚱한 동네가 먼저 보이지 않게)
  const startHint = useRef(lastKnown()).current; // 한 번만 읽는다 (매번 새 객체면 아래 정렬·자동 재생이 계속 다시 돈다)
  const here = coords ?? startHint ?? FALLBACK;
  const nearby = useNearbyDrops(coords);
  const drops = useMemo(() => nearby.data ?? [], [nearby.data]);
  const [watchKey, setWatchKey] = useState(0);
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', st => setAppActive(st === 'active')); return () => sub.remove(); }, []);
  const animatePins = focused && appActive;
  useTermsUpdateCheck();

  // 지도가 떠 있는 동안 위치 감시를 붙잡는다 (앱 전체에 하나). watchKey가 바뀌면(다시 시도) 처음부터 다시
  useEffect(() => start(), [start]);
  useEffect(() => { if (watchKey) restart(); }, [restart, watchKey]);

  // 설정에서 위치 권한·위치 서비스를 켜고 돌아오면 위치를 다시 잡는다
  useEffect(() => {
    const sub = AppState.addEventListener('change', async st => {
      if (st !== 'active' || useLocation.getState().fix !== 'unavailable') return;
      if ((await refreshPermission()) === 'granted') setWatchKey(k => k + 1);
    });
    return () => sub.remove();
  }, [refreshPermission]);

  // 신호가 약하거나 위치 서비스가 꺼져서 못 잡았으면 20초마다 조용히 다시 시도 (권한 거부는 사용자가 켜야 하므로 제외)
  useEffect(() => {
    if (fix !== 'unavailable' || reason === 'denied') return;
    const t = setTimeout(() => { if (AppState.currentState === 'active') setWatchKey(k => k + 1); }, 20_000);
    return () => clearTimeout(t);
  }, [fix, reason, watchKey]);

  const retryLocation = async () => {
    if (reason === 'timeout') return setWatchKey(k => k + 1);
    if (reason === 'off') {
      // Android는 위치 설정 화면으로 바로, iOS는 앱 설정(위치 서비스는 설정 > 개인정보 보호에서 켬)
      if (Platform.OS === 'android') return Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
      return Linking.openSettings();
    }
    const p = await refreshPermission();
    if (p === 'granted') return setWatchKey(k => k + 1);
    if ((await requestPermission()) === 'granted') return setWatchKey(k => k + 1);
    Linking.openSettings();
  };
  const locationHelp =
    fix === 'locating' ? '지금 있는 곳을 찾고 있어요…'
    : reason === 'off' ? (Platform.OS === 'ios' ? '위치 서비스가 꺼져 있어요. 설정 > 개인정보 보호 및 보안 > 위치 서비스를 켜주세요.' : '휴대폰 위치가 꺼져 있어요. 눌러서 위치를 켜주세요.')
    : reason === 'timeout' ? '위치 신호가 약해요. 창가나 실외에서 눌러서 다시 시도해주세요. (자동으로 다시 찾는 중)'
    : '위치 권한이 꺼져 있어요. 눌러서 위치 권한을 허용해주세요.';

  // 역지오코딩 → 헤더 동 이름 + 드랍 address (실제 위치일 때만)
  // 걸을 때마다(5m) 부르지 않고 100m 넘게 움직였거나, 30초 지나고 조금이라도 움직였을 때만 (geocodeDue). 실패하면 다음 위치에서 다시
  const geocoded = useRef<GeocodeMark | null>(null);
  useEffect(() => {
    if (!coords || !geocodeDue(geocoded.current, coords, Date.now())) return;
    const t = setTimeout(async () => {
      try {
        const a = await mapRef.current?.addressForCoordinate(coords);
        if (a) {
          geocoded.current = { at: coords, time: Date.now() };
          const { dong, full } = formatAddress(a);
          setPlace(dong || '현재 위치', full);
        }
      } catch { if (!label) setPlace('현재 위치', ''); }
    }, 600);
    return () => clearTimeout(t);
  }, [coords?.latitude, coords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // 드랍 구성이 바뀔 때만 (같은 목록 재조회·순서만 바뀐 재조회로는 다시 하지 않음)
  // 마커 스냅샷 추적·앨범 아트 미리 받기는 마커마다 한다 (DropMarker)
  const dropIds = useMemo(() => idSetKey(drops.map(d => d.droppingId)), [drops]);
  // 투표·플리는 미리보기 시트 없이 바로 전체 화면으로 가서 상세를 기다리는 동안 빈 화면이 된다 → 주변 목록이 오면 미리 받아둔다
  const qc = useQueryClient();
  useEffect(() => {
    drops.filter(d => d.type !== 'MUSIC').slice(0, 8).forEach(d => qc.prefetchQuery({ queryKey: qk.drop(d.droppingId), queryFn: () => dropApi.get(d.droppingId), staleTime: 30_000 }));
  }, [dropIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 재생 반경 밖(내 드랍·좋아요한 드랍 제외)은 잠금 — 핀은 흐리게 곡·커버 없이, 눌러도 안 열리고, 자동 재생에서도 뺀다
  const lockOf = useDropLock();
  const sorted = useMemo(() => drops.map(d => ({ d, m: distanceM(here, d), lock: lockOf(d) })).sort((a, b) => a.m - b.m), [drops, here, lockOf]);
  const nearestId = sorted.find(x => !x.lock.locked)?.d.droppingId;
  // 지도에 그릴 핀 — 보이는 영역(넉넉히) 안에서 가까운 순 MAX_PINS개 (영역은 지도를 다 움직인 뒤에만 갱신)
  // 많이 축소하면(CLUSTER_LNG_DELTA) 핀 대신 격자로 묶은 수 묶음만 — 묶음은 위치(GPS)와 무관하니 드랍 목록·영역이 바뀔 때만 다시 묶는다
  const [view, setView] = useState<Region | null>(null);
  const onRegionChangeComplete = useCallback((r: Region) => setView(r), []);
  const clustered = shouldCluster(view);
  const pins = useMemo(() => (clustered ? [] : pickPins(sorted, view)), [clustered, sorted, view]);
  const clusters = useMemo(() => (clustered && view ? clusterPoints(drops, view) : []), [clustered, drops, view]);

  // 주변 곡 자동 재생 — 가까운 음악 드랍부터 차례로 (지도 화면일 때, 앱을 내려도 계속)
  const musicDrops = useMemo(() => sorted.filter(x => !x.lock.locked).map(x => x.d).filter((d): d is MusicDropSummary => d.type === 'MUSIC'), [sorted]);
  const auto = useNearbyAutoplay(musicDrops, focused && !!coords);
  // 미니 디스크 길게 누르기 = 다음 주변 곡 (지도가 보일 때만)
  const nextRef = useRef(auto.next);
  nextRef.current = auto.next;
  useEffect(() => {
    if (!focused) return;
    useMiniDiscActions.setState({ onLongPress: () => nextRef.current() });
    return () => useMiniDiscActions.setState({ onLongPress: null });
  }, [focused]);
  const playingKey = usePreviewStore(st => st.key);

  // 목록에서 타입을 이미 알면 바로 해당 화면으로 (투표·플리는 미리보기 시트를 거치지 않음)
  const openDrop = (d: DropSummary, source: DropOpenSource) => {
    const parent = navigation.getParent();
    if (d.type === 'VOTE') parent?.navigate('VoteDrop', { dropId: d.droppingId, source });
    else if (d.type === 'PLAYLIST') parent?.navigate('PlaylistDrop', { dropId: d.droppingId, source });
    else parent?.navigate('PinPreview', { dropId: d.droppingId, source });
  };
  const tapDrop = ({ d, m, lock }: (typeof sorted)[number], source: DropOpenSource) => {
    if (!lock.locked) return openDrop(d, source);
    track('drop_locked_tap', { drop_id: d.droppingId, type: d.type, source, distance_m: Math.round(m), remaining_m: lock.remainingM == null ? null : Math.round(lock.remainingM) });
    toast(lockMessage(lock));
  };
  // 핀 누르기 — 마커가 다시 렌더되지 않게 고정 함수 하나 (누른 순간의 최신 목록·핸들러를 ref로 읽는다)
  const latest = useRef({ sorted, tapDrop });
  useEffect(() => { latest.current = { sorted, tapDrop }; });
  const onPinPress = useCallback((id: string) => {
    const x = latest.current.sorted.find(p => p.d.droppingId === id);
    if (x) latest.current.tapDrop(x, 'map_pin');
  }, []);
  // 묶음 누르기 — 묶인 드랍이 다 보이게 확대 (둘러보는 중이므로 내 위치 따라가기는 멈춘다)
  const latestClusters = useRef({ clusters, view });
  useEffect(() => { latestClusters.current = { clusters, view }; });
  const onClusterPress = useCallback((key: string) => {
    const { clusters: list, view: at } = latestClusters.current;
    const c = list.find(x => x.key === key);
    if (!c || !at) return;
    follow.current = false;
    track('map_cluster_tap', { count: c.count });
    mapRef.current?.animateToRegion(clusterZoomRegion(c, at), 450);
  }, []);

  // 지도 첫 로드 (앱 실행마다 한 번) — 주변 드랍 수·열 수 있는 드랍 수·반경 (반경 관련 분포용)
  const radius = useDropRadius();
  useEffect(() => {
    if (mapLoadTracked || !coords || !nearby.isSuccess) return;
    mapLoadTracked = true;
    const open = sorted.filter(x => !x.lock.locked);
    track('map_loaded', {
      nearby_count: sorted.length,
      playable_count: open.length,
      locked_count: sorted.length - open.length,
      nearest_m: sorted.length ? Math.round(sorted[0].m) : null,
      nearest_playable_m: open.length ? Math.round(open[0].m) : null,
      display_m: radius.displayMeters,
      play_m: radius.playMeters,
      visibility_mode: radius.mode,
      region_unit: radius.regionUnit,
    });
  }, [coords, nearby.isSuccess, sorted, radius]);

  const region = { latitude: here.latitude - 0.0012, longitude: here.longitude, latitudeDelta: 0.018, longitudeDelta: 0.012 };

  // 위치를 처음 받으면 그 자리로 카메라 이동 (그 전엔 기준 좌표를 보여줌)
  // 그 뒤로는 걸어서 움직이면 카메라도 따라간다 — 사용자가 지도를 직접 끌어 둘러보는 중이면 멈추고, 동 이름을 누르면 다시 따라간다
  const centered = useRef(false);
  const follow = useRef(true);
  const followedAt = useRef<{ latitude: number; longitude: number } | null>(null);
  const recenter = () => {
    follow.current = true;
    if (coords) followedAt.current = coords;
    mapRef.current?.animateToRegion(region, 500);
  };
  // Android는 지도가 준비되기 전에 부른 카메라 이동을 무시한다 → 준비된 뒤에 처음 위치로 옮긴다
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (!coords || !mapReady) return;
    if (!centered.current) {
      centered.current = true;
      followedAt.current = coords;
      mapRef.current?.animateToRegion({ ...region, latitude: coords.latitude - 0.0012, longitude: coords.longitude }, 400);
      return;
    }
    if (!follow.current || (followedAt.current && distanceM(followedAt.current, coords) < 8)) return;
    followedAt.current = coords;
    // 줌은 사용자가 맞춘 그대로 두고 가운데만 옮긴다
    mapRef.current?.animateCamera({ center: { latitude: coords.latitude - 0.0012, longitude: coords.longitude } }, { duration: 600 });
  }, [coords, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 탭에 갔다가 지도로 돌아오면 다시 내 위치로 (보던 곳을 끌어 둔 채였어도)
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current && centered.current && coords) recenter();
    wasFocused.current = focused;
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={useGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={useGoogle ? googleMapStyle : undefined}
        mapType={useGoogle ? 'standard' : 'mutedStandard'}
        userInterfaceStyle="light"
        initialRegion={region}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsBuildings={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        onPanDrag={() => { follow.current = false; }}
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {/* Apple 지도는 스타일을 못 바꾸므로 넓은 하늘빛 막을 깔아 디자인 톤에 맞춘다 (오버레이라 핀 아래에 그려짐) */}
        {!useGoogle ? <Polygon coordinates={tintArea(here)} fillColor="rgba(120,200,232,0.22)" strokeWidth={0} strokeColor="transparent" tappable={false} /> : null}
        {coords ? <MyLocationMarker latitude={coords.latitude} longitude={coords.longitude} /> : null}
        {clusters.map(c => <ClusterMarker key={c.key} id={c.key} latitude={c.latitude} longitude={c.longitude} count={c.count} onPress={onClusterPress} />)}
        {pins.map(({ item: { d, m, lock }, rank }) => (
          // 잠금이 풀리거나 잠기면 핀 모양이 통째로 바뀌므로 새 마커로
          <DropMarker
            key={`${d.droppingId}:${lock.locked ? 'l' : 'o'}`}
            id={d.droppingId}
            latitude={d.latitude}
            longitude={d.longitude}
            type={d.type}
            locked={lock.locked}
            active={d.droppingId === nearestId}
            animated={animatePins && rank < ANIMATED_PINS && !lock.locked}
            art={lock.locked ? null : dropArt(d)}
            title={lock.locked ? '잠긴 드랍' : dropTitle(d)}
            subtitle={lock.locked ? formatDistance(m) : `${d.type === 'MUSIC' ? d.artist : dropSub(d)} · ${formatDistance(m)}`}
            count={!lock.locked && d.type === 'PLAYLIST' ? d.songIds.length : undefined}
            onPress={onPinPress}
          />
        ))}
      </MapView>

      {/* 상단 페이드 + 동 이름 */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} locations={[0, insets.top / (insets.top + 96), 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 96 }} />
      <Press onPress={recenter} accessibilityHint="내 위치로 지도를 다시 맞춰요" trackAs="동 이름 (내 위치로)" style={{ position: 'absolute', top: insets.top + 12, left: 20, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <T v="title">{coords ? label || '현재 위치' : fix === 'locating' ? '위치 찾는 중…' : '위치를 알 수 없어요'}</T>
        <Caret />
      </Press>

      {/* 하단 짙은 페이드 + 가까운 드랍 */}
      {/* Figma 'fade': #040916 0.98 → 0.7(55%) → 0 */}
      <LinearGradient pointerEvents="none" colors={['rgba(4,9,22,0)', 'rgba(4,9,22,0.7)', 'rgba(4,9,22,0.98)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 354 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: dockTop(insets.bottom) + 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 16 }}>
          <T v="captionStrong" c="onPrimary">{scopeLabel(radius)}</T>
          <T v="number" style={{ fontFamily: fonts.medium, color: '#2BD1FF', flex: 1 }}>{drops.length}</T>
          {/* 내 위치로 — 지도 앱처럼 언제든 한 번에 돌아온다 */}
          {coords ? (
            <Press onPress={recenter} accessibilityLabel="내 위치로 이동" hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#12214A', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
              <Icon name="locate" size={22} color={colors.primary} />
            </Press>
          ) : null}
        </View>
        {!coords ? (
          <Press onPress={fix === 'unavailable' ? retryLocation : undefined} trackAs={`위치 다시 찾기 (${reason ?? 'locating'})`} style={card}>
            <Icon name="pin" size={22} color={colors.primary} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>{locationHelp}</T>
            {fix === 'unavailable' ? <Icon name="chevronRight" size={16} color={colors.ink3} /> : null}
          </Press>
        ) : nearby.isError && !sorted.length ? (
          <Press onPress={() => nearby.refetch()} trackAs="주변 드랍 다시 불러오기" style={card}>
            <Icon name="alert" size={22} color={colors.warning} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>주변 드랍을 불러오지 못했어요. 눌러서 다시 시도</T>
          </Press>
        ) : sorted.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 20, gap: 12 }}>
            {sorted.slice(0, 12).map((x, i) => {
              const { d, m, lock } = x;
              if (lock.locked) {
                // 잠긴 드랍 — 곡·커버 대신 자물쇠와 거리만
                return (
                  <Press key={d.droppingId} onPress={() => tapDrop(x, 'map_list')} accessibilityLabel={`잠긴 드랍 · ${formatDistance(m)}`} trackAs="주변 목록 잠긴 드랍" style={{ width: 66, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 55, height: 55, borderRadius: 12, borderWidth: 3, borderColor: '#FAFAFA', backgroundColor: '#FFFFFF', opacity: 0.6 }}>
                      <View style={{ width: 49, height: 49, borderRadius: 9, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="lock" size={18} color={colors.ink3} />
                      </View>
                    </View>
                    <View style={{ alignSelf: 'stretch' }}>
                      <T v="caption" c="onPrimary" numberOfLines={1} style={{ textAlign: 'center' }}>{formatDistance(m)}</T>
                      <T v="tiny" numberOfLines={1} style={{ textAlign: 'center', color: '#98A2B8' }}>더 가까이</T>
                    </View>
                  </Press>
                );
              }
              const fresh = i < 3;
              const onAir = d.type === 'MUSIC' && !!playingKey && d.songId === playingKey;
              return (
                <Press key={d.droppingId} onPress={() => tapDrop(x, 'map_list')} trackAs="주변 목록 드랍" style={{ width: 66, alignItems: 'center', gap: 6 }}>
                  {/* Figma 'stay music' 아트: 흰 바탕 · #FAFAFA 테두리 3 · 모서리 12 (재생 중이면 시안 테두리 + 글로우) */}
                  <View style={[{ width: 55, height: 55, borderRadius: 12, borderWidth: 3, borderColor: onAir ? colors.accent : '#FAFAFA', backgroundColor: '#FFFFFF', opacity: fresh || onAir ? 1 : 0.6 }, onAir || fresh ? glow(onAir ? 0.9 : 0.5, 12) : null]}>
                    <Art uri={dropArt(d)} size={49} radius={9} />
                    {onAir ? (
                      <View style={{ position: 'absolute', right: -7, bottom: -7, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#040916' }}>
                        <Icon name="wave" size={10} color={colors.ink} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignSelf: 'stretch' }}>
                    <T v="caption" c="onPrimary" numberOfLines={1} style={{ textAlign: 'center' }}>{dropTitle(d)}</T>
                    <T v="tiny" numberOfLines={1} style={{ textAlign: 'center', color: '#98A2B8' }}>{d.type === 'MUSIC' ? d.artist : dropSub(d)}</T>
                  </View>
                </Press>
              );
            })}
          </ScrollView>
        ) : nearby.isLoading ? (
          <View style={card}>
            <Icon name="wave" size={22} color={colors.primary} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>주변 드랍을 찾고 있어요…</T>
          </View>
        ) : (
          <Press onPress={() => navigation.getParent()?.navigate('DropType')} accessibilityLabel="첫 드랍 남기기" style={card}>
            <Icon name="wave" size={22} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="captionStrong">이 근처엔 아직 드랍이 없어요</T>
              <T v="caption" c="ink2">첫 번째 파도가 되어보세요 — 지금 듣는 곡을 여기에 남겨요.</T>
            </View>
            <Icon name="chevronRight" size={16} color={colors.ink3} />
          </Press>
        )}
      </View>
    </View>
  );
}
