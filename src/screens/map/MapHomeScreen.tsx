/**
 * 2.1 지도 홈 — 커스텀 다크 지도 + 드랍 핀 + 가까운 드랍 스트립 (+ 도크는 탭 바)
 * 지도: GOOGLE_MAPS_API_KEY가 있으면 Google(스타일 JSON), 없으면 iOS Apple Maps 다크로 대체.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View, Image } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DropSummary, MusicDropSummary } from '@/api/types';
import { DropPin, MeMarker, PIN_SIZE } from '@/components/map/DropPin';
import { Art, Icon, Press, T } from '@/components/ui';
import { env, NEARBY_RADIUS_KM } from '@/config';
import { useNearbyDrops } from '@/hooks/api';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { useMiniDiscActions } from '@/components/music/MiniDisc';
import { usePreviewStore } from '@/services/preview';
import { useTermsUpdateCheck } from '@/hooks/useTermsUpdateCheck';
import { distanceM, FALLBACK, formatDistance, useLocation } from '@/services/location';
import { usePrefs } from '@/store/prefs';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, glow } from '@/theme/tokens';
import type { TabParamList } from '@/navigation/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatAddress } from '@/utils/address';
import { artUrl } from '@/utils/artUrl';

const useGoogle = !!env.googleMapsKey || Platform.OS === 'android';

export const dropArt = (d: DropSummary) => (d.type === 'MUSIC' ? d.albumImageUrl : d.firstAlbumImageUrl);
export const dropTitle = (d: DropSummary) => (d.type === 'MUSIC' ? d.title : d.type === 'VOTE' ? d.topic : d.playlistName);
export const dropSub = (d: DropSummary) => (d.type === 'MUSIC' ? d.artist : d.type === 'VOTE' ? `투표 · ${d.options.length}곡` : `플레이리스트 · ${d.songIds.length}곡`);

// 파동은 가까운 핀 몇 개만, 지도가 보일 때만 (Google 지도는 애니메이션 동안 마커 비트맵을 매 프레임 다시 그림)
const ANIMATED_PINS = 4;

export default function MapHomeScreen({ navigation }: BottomTabScreenProps<TabParamList, 'Map'>) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { coords, fix, reason, label, setPlace, start, refreshPermission, requestPermission } = useLocation(useShallow(s => ({ coords: s.coords, fix: s.fix, reason: s.reason, label: s.label, setPlace: s.setPlace, start: s.start, refreshPermission: s.refreshPermission, requestPermission: s.requestPermission })));
  const distanceMode = usePrefs(s => s.distanceMode);
  const here = coords ?? FALLBACK;
  const nearby = useNearbyDrops(coords);
  const drops = useMemo(() => nearby.data ?? [], [nearby.data]);
  const [tracks, setTracks] = useState(true);
  const [watchKey, setWatchKey] = useState(0);
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', st => setAppActive(st === 'active')); return () => sub.remove(); }, []);
  const animatePins = focused && appActive;
  useTermsUpdateCheck();

  useEffect(() => start(), [start, watchKey]);

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
  const centered = useRef(false);
  useEffect(() => {
    if (!coords || centered.current) return;
    centered.current = true;
    mapRef.current?.animateToRegion({ ...region, latitude: coords.latitude - 0.0012, longitude: coords.longitude }, 400);
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={useGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={useGoogle ? googleMapStyle : undefined}
        userInterfaceStyle="dark"
        initialRegion={region}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsBuildings={false}
        toolbarEnabled={false}
        pitchEnabled={false}
      >
        {distanceMode === 'radius' && coords && <Circle center={coords} radius={NEARBY_RADIUS_KM * 1000} strokeColor="rgba(79,209,255,0.7)" fillColor="rgba(79,209,255,0.08)" lineDashPattern={[6, 6]} />}
        {coords ? (
          <Marker coordinate={coords} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracks}>
            <MeMarker />
          </Marker>
        ) : null}
        {sorted.map(({ d, m }, i) => {
          const active = d.droppingId === nearestId;
          const animated = animatePins && i < ANIMATED_PINS;
          const box = active ? PIN_SIZE.active : PIN_SIZE.normal;
          const fade = distanceMode === 'gradient' ? Math.max(0.35, 1 - m / (NEARBY_RADIUS_KM * 1000)) : 1;
          return (
            <Marker
              key={`${d.droppingId}:${artEpoch}`}
              coordinate={{ latitude: d.latitude, longitude: d.longitude }}
              anchor={{ x: box.tipX / box.w, y: box.tipY / box.h }}
              tracksViewChanges={tracks || animated}
              opacity={fade}
              onPress={() => openDrop(d)}
            >
              <DropPin type={d.type} art={dropArt(d)} active={active} animated={animated} onImageLoad={onPinImage} title={dropTitle(d)} subtitle={`${d.type === 'MUSIC' ? d.artist : dropSub(d)} · ${formatDistance(m)}`} count={d.type === 'PLAYLIST' ? d.songIds.length : undefined} />
            </Marker>
          );
        })}
      </MapView>

      {/* 상단 페이드 + 현재 위치 */}
      <LinearGradient pointerEvents="none" colors={['rgba(4,9,22,0.98)', 'rgba(4,9,22,0.7)', 'rgba(4,9,22,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 110 }} />
      <Press onPress={() => mapRef.current?.animateToRegion(region, 500)} style={{ position: 'absolute', top: insets.top + 14, left: 20, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T v="title">{coords ? label || '현재 위치' : fix === 'locating' ? '위치 찾는 중…' : '위치를 알 수 없어요'}</T>
        <Icon name="chevronDown" size={18} color={colors.ink2} />
      </Press>

      {/* 하단 페이드 + 가까운 드랍 */}
      <LinearGradient pointerEvents="none" colors={['rgba(4,9,22,0)', 'rgba(4,9,22,0.88)', 'rgba(4,9,22,0.98)']} locations={[0, 0.42, 1]} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 380 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 86 + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginBottom: 12 }}>
          <T v="captionStrong">가까운 드랍</T>
          <T v="number" c="primary">{drops.length}</T>
        </View>
        {!coords ? (
          <Press onPress={fix === 'unavailable' ? retryLocation : undefined} style={{ marginHorizontal: 20, padding: 16, borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.85)', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="pin" size={22} color={colors.primary} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>{locationHelp}</T>
            {fix === 'unavailable' ? <Icon name="chevronRight" size={16} color={colors.ink3} /> : null}
          </Press>
        ) : nearby.isError && !sorted.length ? (
          <Press onPress={() => nearby.refetch()} style={{ marginHorizontal: 20, padding: 16, borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.85)', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="alert" size={22} color={colors.warning} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>주변 드랍을 불러오지 못했어요. 눌러서 다시 시도</T>
          </Press>
        ) : sorted.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
            {sorted.slice(0, 12).map(({ d }, i) => {
              const fresh = i < 3;
              const onAir = d.type === 'MUSIC' && !!playingKey && d.songId === playingKey;
              return (
                <Press key={d.droppingId} onPress={() => openDrop(d)} style={{ width: 66, alignItems: 'center', gap: 6 }}>
                  <View style={[{ width: 60, height: 60, borderRadius: 30, borderWidth: fresh || onAir ? 2 : 1.5, borderColor: onAir ? colors.accent2 : fresh ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }, onAir ? glow(0.7, 12) : null]}>
                    <Art uri={dropArt(d)} size={50} round dim={!fresh && !onAir} />
                    {onAir ? (
                      <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.page }}>
                        <Icon name="wave" size={11} color={colors.onPrimary} />
                      </View>
                    ) : null}
                  </View>
                  <T v="captionStrong" c={fresh ? 'ink' : 'ink3'} numberOfLines={1} style={{ width: 66, textAlign: 'center' }}>{dropTitle(d)}</T>
                  <T v="micro" c="ink3" numberOfLines={1} style={{ width: 66, textAlign: 'center' }}>{d.type === 'MUSIC' ? d.artist : dropSub(d)}</T>
                </Press>
              );
            })}
          </ScrollView>
        ) : nearby.isLoading ? (
          <View style={{ marginHorizontal: 20, padding: 16, borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.85)', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="wave" size={22} color={colors.primary} />
            <T v="caption" c="ink2" style={{ flex: 1 }}>주변 드랍을 찾고 있어요…</T>
          </View>
        ) : (
          <Press onPress={() => navigation.getParent()?.navigate('DropType')} accessibilityLabel="첫 드랍 남기기" style={{ marginHorizontal: 20, padding: 16, borderRadius: 20, backgroundColor: 'rgba(11,19,48,0.85)', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
