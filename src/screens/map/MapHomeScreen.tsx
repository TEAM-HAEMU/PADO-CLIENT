/**
 * 2.1 지도 홈 — 하늘빛 지도 + 드랍 핀 + 아래 짙은 페이드 위 '가까운 드랍' 줄 (+ 도크는 탭 바). Figma '2 지도 · 재생' B 2.1.
 * 지도: GOOGLE_MAPS_API_KEY가 있으면 Google(스타일 JSON), 없으면 iOS Apple Maps(mutedStandard + 하늘빛 막)으로 대체.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View, Image } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi } from '@/api/endpoints';
import type { DropSummary, MusicDropSummary } from '@/api/types';
import { DropPin, MeMarker, PIN_SIZE } from '@/components/map/DropPin';
import { Art, Icon, Press, T } from '@/components/ui';
import { env } from '@/config';
import { qk, useNearbyDrops } from '@/hooks/api';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { useMiniDiscActions } from '@/components/music/MiniDisc';
import { usePreviewStore } from '@/services/preview';
import { useTermsUpdateCheck } from '@/hooks/useTermsUpdateCheck';
import { distanceM, FALLBACK, formatDistance, lastKnown, useLocation } from '@/services/location';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, fonts, glow } from '@/theme/tokens';
import type { TabParamList } from '@/navigation/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatAddress } from '@/utils/address';
import { artUrl } from '@/utils/artUrl';

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

export default function MapHomeScreen({ navigation }: BottomTabScreenProps<TabParamList, 'Map'>) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { coords, fix, reason, label, setPlace, start, restart, refreshPermission, requestPermission } = useLocation(useShallow(s => ({ coords: s.coords, fix: s.fix, reason: s.reason, label: s.label, setPlace: s.setPlace, start: s.start, restart: s.restart, refreshPermission: s.refreshPermission, requestPermission: s.requestPermission })));
  // 위치를 받기 전엔 지난번 위치 근처에 카메라를 둔다 (처음 켤 때 엉뚱한 동네가 먼저 보이지 않게)
  const startHint = useRef(lastKnown()).current; // 한 번만 읽는다 (매번 새 객체면 아래 정렬·자동 재생이 계속 다시 돈다)
  const here = coords ?? startHint ?? FALLBACK;
  const nearby = useNearbyDrops(coords);
  const drops = useMemo(() => nearby.data ?? [], [nearby.data]);
  const [tracks, setTracks] = useState(true);
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
  useEffect(() => {
    if (!coords) return;
    const t = setTimeout(async () => {
      try {
        const a = await mapRef.current?.addressForCoordinate(coords);
        if (a) {
          const { dong, full } = formatAddress(a);
          setPlace(dong || '현재 위치', full);
        }
      } catch { if (!label) setPlace('현재 위치', ''); }
    }, 600);
    return () => clearTimeout(t);
  }, [coords?.latitude, coords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이미지가 로드될 시간을 주고 마커 스냅샷 고정 (성능)
  // 드랍 구성이 바뀔 때만 (같은 목록 재조회로는 다시 그리지 않음)
  const dropIds = drops.map(d => d.droppingId).join(',');
  const tracksTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackFor = React.useCallback((ms: number) => {
    setTracks(true);
    clearTimeout(tracksTimer.current);
    tracksTimer.current = setTimeout(() => setTracks(false), ms);
  }, []);
  useEffect(() => { trackFor(5000); return () => clearTimeout(tracksTimer.current); }, [dropIds, trackFor]);
  // 느린 망에서 앨범 아트가 늦게 도착해도 핀에 반영되게, 이미지가 로드되면 잠깐 다시 그린다
  const onPinImage = React.useCallback(() => trackFor(1200), [trackFor]);
  // Android는 마커 안 이미지가 로드 이벤트를 주지 않아 빈 채로 굳는다 → 미리 받아둔 뒤 마커를 한 번 다시 만든다
  const [artEpoch, setArtEpoch] = useState(0);
  useEffect(() => {
    let alive = true;
    const urls = drops.map(d => artUrl(dropArt(d), 52)).filter((u): u is string => !!u);
    if (!urls.length) return;
    Promise.all(urls.map(u => Image.prefetch(u).catch(() => false))).then(() => { if (alive) { if (Platform.OS === 'android') setArtEpoch(e => e + 1); trackFor(2500); } });
    return () => { alive = false; };
  }, [dropIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // 투표·플리는 미리보기 시트 없이 바로 전체 화면으로 가서 상세를 기다리는 동안 빈 화면이 된다 → 주변 목록이 오면 미리 받아둔다
  const qc = useQueryClient();
  useEffect(() => {
    drops.filter(d => d.type !== 'MUSIC').slice(0, 8).forEach(d => qc.prefetchQuery({ queryKey: qk.drop(d.droppingId), queryFn: () => dropApi.get(d.droppingId), staleTime: 30_000 }));
  }, [dropIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => drops.map(d => ({ d, m: distanceM(here, d) })).sort((a, b) => a.m - b.m), [drops, here]);
  const nearestId = sorted[0]?.d.droppingId;

  // 주변 곡 자동 재생 — 가까운 음악 드랍부터 차례로 (지도 화면일 때, 앱을 내려도 계속)
  const musicDrops = useMemo(() => sorted.map(x => x.d).filter((d): d is MusicDropSummary => d.type === 'MUSIC'), [sorted]);
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
  const openDrop = (d: DropSummary) => {
    const parent = navigation.getParent();
    if (d.type === 'VOTE') parent?.navigate('VoteDrop', { dropId: d.droppingId });
    else if (d.type === 'PLAYLIST') parent?.navigate('PlaylistDrop', { dropId: d.droppingId });
    else parent?.navigate('PinPreview', { dropId: d.droppingId });
  };

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
      >
        {/* Apple 지도는 스타일을 못 바꾸므로 넓은 하늘빛 막을 깔아 디자인 톤에 맞춘다 (오버레이라 핀 아래에 그려짐) */}
        {!useGoogle ? <Polygon coordinates={tintArea(here)} fillColor="rgba(120,200,232,0.22)" strokeWidth={0} strokeColor="transparent" tappable={false} /> : null}
        {coords ? (
          <Marker coordinate={coords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks} tappable={false} zIndex={0}>
            <MeMarker />
          </Marker>
        ) : null}
        {sorted.map(({ d, m }, i) => {
          const active = d.droppingId === nearestId;
          const animated = animatePins && i < ANIMATED_PINS;
          const box = active ? PIN_SIZE.active : PIN_SIZE.normal;
          return (
            <Marker
              key={`${d.droppingId}:${artEpoch}`}
              coordinate={{ latitude: d.latitude, longitude: d.longitude }}
              anchor={{ x: box.tipX / box.w, y: box.tipY / box.h }}
              tracksViewChanges={tracks || animated}
              zIndex={active ? 3 : 2}
              onPress={() => openDrop(d)}
            >
              <DropPin type={d.type} art={dropArt(d)} active={active} animated={animated} onImageLoad={onPinImage} title={dropTitle(d)} subtitle={`${d.type === 'MUSIC' ? d.artist : dropSub(d)} · ${formatDistance(m)}`} count={d.type === 'PLAYLIST' ? d.songIds.length : undefined} />
            </Marker>
          );
        })}
      </MapView>

      {/* 상단 페이드 + 동 이름 */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} locations={[0, insets.top / (insets.top + 96), 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 96 }} />
      <Press onPress={recenter} accessibilityHint="내 위치로 지도를 다시 맞춰요" style={{ position: 'absolute', top: insets.top + 12, left: 20, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <T v="title">{coords ? label || '현재 위치' : fix === 'locating' ? '위치 찾는 중…' : '위치를 알 수 없어요'}</T>
        <Caret />
      </Press>

      {/* 하단 짙은 페이드 + 가까운 드랍 */}
      {/* Figma 'fade': #040916 0.98 → 0.7(55%) → 0 */}
      <LinearGradient pointerEvents="none" colors={['rgba(4,9,22,0)', 'rgba(4,9,22,0.7)', 'rgba(4,9,22,0.98)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 354 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: dockTop(insets.bottom) + 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 16 }}>
          <T v="captionStrong" c="onPrimary">가까운 드랍</T>
          <T v="number" style={{ fontFamily: fonts.medium, color: '#2BD1FF', flex: 1 }}>{drops.length}</T>
          {/* 내 위치로 — 지도 앱처럼 언제든 한 번에 돌아온다 */}
          {coords ? (
            <Press onPress={recenter} accessibilityLabel="내 위치로 이동" hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#12214A', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
              <Icon name="locate" size={22} color={colors.primary} />
            </Press>
          ) : null}
        </View>
        {!coords ? (
          <Press onPress={fix === 'unavailable' ? retryLocation : undefined} style={card}>
            <Icon name="pin" size={22} color={colors.primary} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>{locationHelp}</T>
            {fix === 'unavailable' ? <Icon name="chevronRight" size={16} color={colors.ink3} /> : null}
          </Press>
        ) : nearby.isError && !sorted.length ? (
          <Press onPress={() => nearby.refetch()} style={card}>
            <Icon name="alert" size={22} color={colors.warning} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>주변 드랍을 불러오지 못했어요. 눌러서 다시 시도</T>
          </Press>
        ) : sorted.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 20, gap: 12 }}>
            {sorted.slice(0, 12).map(({ d }, i) => {
              const fresh = i < 3;
              const onAir = d.type === 'MUSIC' && !!playingKey && d.songId === playingKey;
              return (
                <Press key={d.droppingId} onPress={() => openDrop(d)} style={{ width: 66, alignItems: 'center', gap: 6 }}>
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
