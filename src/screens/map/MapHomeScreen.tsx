/**
 * 2.1 지도 홈 — 하늘빛 지도 + 드랍 핀 + 아래 짙은 페이드 위 '가까운 드랍' 줄 (+ 도크는 탭 바). Figma '2 지도 · 재생' B 2.1.
 * 지도: GOOGLE_MAPS_API_KEY가 있으면 Google(스타일 JSON), 없으면 iOS Apple Maps(mutedStandard + 하늘빛 막)으로 대체.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import MapView, { Polygon, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { shallow } from 'zustand/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dropApi, regionApi } from '@/api/endpoints';
import type { DropSummary, MusicDropSummary } from '@/api/types';
import type { DropLock } from '@/utils/dropLock';
import type { DropOpenSource } from '@/navigation/types';
import { ClusterMarker, DropMarker, MyLocationMarker, prefetchMarkerArt } from '@/components/map/DropMarker';
import { PinRipples, type PinRipplesHandle } from '@/components/map/PinRipples';
import { Art, Icon, Press, T } from '@/components/ui';
import { env } from '@/config';
import { qk, useNearbyDrops } from '@/hooks/api';
import { useNearbyAutoplay } from '@/hooks/useNearbyAutoplay';
import { useDropLock } from '@/hooks/useDropLock';
import { useMapLive } from '@/hooks/useMapLive';
import { useStoreWhile } from '@/hooks/useStoreWhile';
import { markScopeTipSeen, useDropRadius, useScopeTip } from '@/hooks/useDropRadius';
import { ScopeTip } from '@/components/map/ScopeTip';
import { SelectedDropBubble } from '@/components/map/DropBubble';
import type { ScopeTipText } from '@/utils/scopeTip';
import { placeKey, placeLevel, placeName, sanitizeRegionsAt, wantsPlace } from '@/utils/mapPlace';
import { scopeLabel } from '@/utils/dropScope';
import { track } from '@/services/analytics';
import { useMiniDiscActions } from '@/components/music/MiniDisc';
import { startPreview, usePreviewStore } from '@/services/preview';
import { useTermsUpdateCheck } from '@/hooks/useTermsUpdateCheck';
import { useAppUpdatePrompt } from '@/hooks/useAppUpdatePrompt';
import { useExistingPushPrompt } from '@/hooks/useExistingPushPrompt';
import { distanceM, FALLBACK, formatDistance, lastKnown, useLocation } from '@/services/location';
import { googleMapStyle } from '@/theme/mapStyle';
import { colors, fonts, glow } from '@/theme/tokens';
import type { TabParamList } from '@/navigation/types';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { formatAddress } from '@/utils/address';
import type { RipplePin } from '@/utils/ambientMotion';
import { alreadyThere, AUTO_MOVE_SLACK_MS, regionOfBounds, dropSub, focusMove, pinSubtitle, repickWhileMoving, selectionLook, type CameraMove } from '@/utils/mapSelect';
import { clusterPoints, clusterZoomRegion, geocodeDue, idSetKey, needsRepick, pickPins, shouldCluster, singlePins, type GeocodeMark } from '@/utils/mapPins';

export { dropSub };

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

// 지도를 움직이는 중에 그릴 핀·묶음을 다시 고르는 최소 간격(앞의 교체를 그려 넣은 뒤부터) — 매 프레임 고르면 마커를 만들고 지우느라 움직임이 끊긴다
const REPICK_MS = 200;

// 주변 목록이 오면 마커 아트를 미리 받아 두는 가까운 열린 드랍 수 (64px 판본 — 150장이면 수백 KB)
const PREFETCH_ART = 150;

// 물결은 가까운 핀 몇 개만 — 지도가 보이고 · 재생 중이고 · 지도가 멈춰 있을 때만 (마커 밖 PinRipples 레이어가 그린다)
const ANIMATED_PINS = 4;

// 묶음 대표를 고르는 드랍 id
const dropKey = (d: DropSummary) => d.droppingId;

// 하단 '가까운 드랍' 줄에 보이는 수
const NEARBY_LIST = 12;
// 고른 드랍으로 카메라를 옮기는 시간
const FOCUS_MS = 500;

/** 거리순 주변 드랍 하나 — 드랍 · 지금 위치에서 거리(m) · 잠금 판정 */
type NearbyItem = { d: DropSummary; m: number; lock: DropLock };

// 하단 도크(높이 50, Dock.tsx) 위로 띄우는 간격
const dockTop = (bottomInset: number) => Math.max(bottomInset - 4, 14) + 50;
// '가까운 드랍' 카드(상태 안내) 공통 모양 — 짙은 페이드 위 흰 카드
const card = { marginHorizontal: 20, padding: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1, borderColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: 12 } as const;

/** 지도 첫 로드는 앱 실행마다 한 번만 센다 */
let mapLoadTracked = false;

export default function MapHomeScreen({ navigation }: BottomTabScreenProps<TabParamList, 'Map'>) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // 지도가 보이는가 (useMapLive) — 다른 탭이나 위를 덮은 상세 화면 뒤에 있으면 GPS가 갱신돼도 이 화면을 다시 그리지 않는다(정렬·핀 고르기·카메라 따라가기·2분 폴링·영역 이벤트 모두 쉼).
  // 위치 감시는 계속 돌고(드랍 만들기·푸시 지역 등이 쓴다), 다시 보이는 렌더에서 최신 위치를 한 번에 읽어 맞춘다.
  // 투명 시트(핀 미리보기 등)가 위에 떠도 지도는 비쳐 보이므로 그대로 따라간다
  const { focused, live } = useMapLive();
  const { coords, fix, reason, label, setPlace, start, restart, recheck, refreshPermission, askPermission } = useStoreWhile(useLocation, s => ({ coords: s.coords, fix: s.fix, reason: s.reason, label: s.label, setPlace: s.setPlace, start: s.start, restart: s.restart, recheck: s.recheck, refreshPermission: s.refreshPermission, askPermission: s.askPermission }), live, shallow);
  // 위치를 받기 전엔 지난번 위치 근처에 카메라를 둔다 (처음 켤 때 엉뚱한 동네가 먼저 보이지 않게)
  const startHint = useRef(lastKnown()).current; // 한 번만 읽는다 (매번 새 객체면 아래 정렬·자동 재생이 계속 다시 돈다)
  const here = coords ?? startHint ?? FALLBACK;
  const nearby = useNearbyDrops(coords, live);
  const drops = useMemo(() => nearby.data ?? [], [nearby.data]);
  const [watchKey, setWatchKey] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', st => setAppActive(st === 'active')); return () => sub.remove(); }, []);
  // 이 화면은 미리듣기 상태를 구독하지 않는다 — 재생이 시작·멈출 때마다(드랍을 고르는 순간 포함) 지도 화면 전체가 다시 그려지지 않게.
  // 재생에 따라 바뀌는 것(움직이는 물결·목록의 재생 중 표시·주변 곡 자동 재생)은 그 부분 컴포넌트가 직접 구독한다
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

  // 신호가 약하거나 위치 서비스가 꺼져서 못 잡았으면 20초마다 조용히 다시 본다 (권한 거부는 사용자가 켜야 하므로 제외).
  // 신호 약함이면 감시는 끊지 않고 위치 서비스 상태만 — 감시를 다시 켜면 GPS가 처음부터 다시 잡아야 한다. 위치 서비스를 다시 켰으면 그때 감시를 새로
  useEffect(() => {
    if (fix !== 'unavailable' || reason === 'denied') return;
    const t = setInterval(() => { if (AppState.currentState === 'active') recheck(); }, 20_000);
    return () => clearInterval(t);
  }, [fix, reason, recheck]);

  const retryLocation = async () => {
    if (reason === 'timeout') return recheck(true);
    if (reason === 'off') {
      // Android는 위치 설정 화면으로 바로, iOS는 앱 설정(위치 서비스는 설정 > 개인정보 보호에서 켬)
      if (Platform.OS === 'android') return Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
      return Linking.openSettings();
    }
    // 권한 꺼짐 — 다시 물을 수 있으면 요청 창, iOS 거부·Android '다시 묻지 않음'이면 설정 앱 (허용되면 감시를 다시)
    await askPermission();
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
  // 받아 둔 상세는 30분 동안 건너뛰고 지우지도 않는다 — 드랍을 하나 만들어 목록이 바뀌어도 새로 생긴 것만 받는다 (연 화면은 그 화면이 30초 기준으로 새로 받는다)
  const qc = useQueryClient();
  const prefetchDrop = useCallback((id: string) => qc.prefetchQuery({ queryKey: qk.drop(id), queryFn: () => dropApi.get(id), staleTime: 30 * 60_000, gcTime: 30 * 60_000 }), [qc]);

  // 재생 반경 밖(내 드랍·좋아요한 드랍 제외)은 잠금 — 핀은 흐리게 곡·커버 없이, 눌러도 안 열리고, 자동 재생에서도 뺀다
  const lockOf = useDropLock(live);
  const radius = useDropRadius(live);
  const sorted = useMemo<NearbyItem[]>(() => drops.map(d => ({ d, m: distanceM(here, d), lock: lockOf(d) })).sort((a, b) => a.m - b.m), [drops, here, lockOf]);
  // 말풍선 닉네임용 상세도 하단 목록(가까운 NEARBY_LIST개 중 열린 것)만큼 미리 받는다 — 고른 뒤 닉네임이 늦게 와서 말풍선을 다시 만들지 않게
  // (지도 핀은 누르는 순간 받기 시작한다 — 말풍선은 카메라가 도착한 뒤에 뜨므로 그동안 대개 받는다)
  useEffect(() => {
    const ids = new Set([
      ...drops.filter(d => d.type !== 'MUSIC').slice(0, 8).map(d => d.droppingId),
      ...sorted.slice(0, NEARBY_LIST).filter(x => !x.lock.locked).map(x => x.d.droppingId),
    ]);
    ids.forEach(prefetchDrop);
  }, [dropIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearestId = sorted.find(x => !x.lock.locked)?.d.droppingId;
  // 주변 목록이 오면 가까운 열린 드랍 PREFETCH_ART개의 마커 아트를 미리 받는다 — 축소해서 핀이 처음 그려질 때 빈 핀으로 뜨지 않게.
  // 나머지(먼 드랍)는 그 핀을 그릴 때 DropMarker가 줄 맨 앞으로 받는다 (셀룰러 데이터를 아끼려고 전부 받지 않음. 같은 주소는 한 번만).
  // 목록이 바뀔 때만 — 걸으며 거리순만 바뀐 것으로는 다시 돌지 않는다 (그때의 거리순을 쓴다)
  useEffect(() => {
    prefetchMarkerArt(sorted.filter(x => !x.lock.locked).slice(0, PREFETCH_ART).map(x => dropArt(x.d)));
  }, [drops]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지도에 그릴 핀 — 보이는 영역(넉넉히) 안에서 가까운 순 MAX_PINS개
  // 많이 축소하면(CLUSTER_LNG_DELTA) 핀 대신 격자로 묶은 수 묶음만 — 묶음은 위치(GPS)와 무관하니 드랍 목록·영역이 바뀔 때만 다시 묶는다
  // view: 지도가 멈춘 영역 (지역 이름·카메라 이동 기준). drawView: 핀·묶음을 고른 영역 — 움직이는 중에도 화면이 그려 둔 범위(화면 2배)를
  // 벗어나 빈 곳이 보이기 시작하거나 핀↔묶음이 바뀌면 바꿔서(REPICK_MS 간격), 크게 축소해도 멈출 때까지 기다리지 않고 핀·묶음이 따라 나온다
  const [view, setView] = useState<Region | null>(null);
  // clustered: 그 영역에서 묶음을 그리는가 — 핀↔묶음 경계에 여유가 있어(shouldCluster) 영역만으로 정하지 않고 바로 전 모드를 함께 본다
  const [drawState, setDrawState] = useState<{ view: Region; clustered: boolean } | null>(null);
  const drawView = drawState?.view ?? null;
  const drawn = useRef<{ region: Region | null; at: number; clustered: boolean }>({ region: null, at: 0, clustered: false });
  const drawAt = useCallback((r: Region, at = Date.now()) => {
    const clustered = shouldCluster(r, drawn.current.clustered);
    drawn.current = { region: r, at, clustered };
    setDrawState({ view: r, clustered });
  }, []);
  // 지도가 움직이는 중 — 핀 물결 레이어는 화면 좌표가 고정이라 움직이기 시작하면 곧바로 숨긴다 (이 화면은 다시 그리지 않는다)
  const movingRef = useRef(false);
  const ripples = useRef<PinRipplesHandle>(null);
  // 앱이 옮기는 카메라(드랍 고르기·내 위치·따라가기·묶음 누르기) — until까지는 움직이는 중 다시 고르기를 건너뛴다(도착 영역으로 미리 골랐다).
  // arrive: 도착하면 크게 그리고 말풍선을 띄울 드랍. 이동이 끝났다는 신호가 오지 않으면 timer가 대신한다
  const autoMove = useRef<{ until: number; arrive: string | null; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const [arrivedId, setArrivedId] = useState<string | null>(null);
  const latestSel = useRef<string | null>(null);
  const arrive = useCallback((id: string | null) => {
    const m = autoMove.current;
    if (m) clearTimeout(m.timer);
    autoMove.current = null;
    // 그사이 고르기를 풀었거나 다른 드랍을 골랐으면 그대로 둔다
    if (id && latestSel.current === id) setArrivedId(id);
  }, []);
  // 가려진 지도가 보내는 영역 이벤트는 버린다 (2026-11-20 QA R-10). 드랍을 남기면 완료 화면 아래에 지도가 새로 마운트되는데,
  // 창에 붙기 전의 iOS Google 지도는 첫 카메라(initialRegion)를 아직 받지 못한 기본 카메라(대서양 쪽, 줌 4)로 '멈춤' 이벤트를 보낸다.
  // 그 영역으로 핀을 다시 고르고(핀이 전부 빠짐) 그 좌표로 지역 이름을 물었다. 돌아오면 내 위치로 다시 맞추며 새 영역이 온다
  const liveRef = useRef(live);
  liveRef.current = live;
  const onRegionChange = useCallback((r: Region, details?: { isGesture?: boolean }) => {
    if (!liveRef.current) return;
    if (!movingRef.current) { movingRef.current = true; ripples.current?.hide(); }
    const auto = autoMove.current;
    // 앱이 옮기던 중에 사용자가 손으로 잡으면 그때부터는 보통 끌기처럼 (도착 표시는 손을 뗄 때)
    if (auto && details?.isGesture) auto.until = 0;
    const now = Date.now();
    if (now - drawn.current.at < REPICK_MS || !repickWhileMoving(drawn.current.region, r, { autoUntil: auto?.until ?? null, now, isGesture: details?.isGesture, clustered: drawn.current.clustered })) return;
    drawAt(r, now);
  }, [drawAt]);
  const onRegionChangeComplete = useCallback((r: Region) => {
    movingRef.current = false;
    if (autoMove.current) arrive(autoMove.current.arrive);
    if (!liveRef.current) return;
    setView(r);
    drawAt(r);
  }, [arrive, drawAt]);
  useEffect(() => () => clearTimeout(autoMove.current?.timer), []);
  // 지도에서 지금 보이는 영역을 직접 읽어 view·그릴 핀을 맞춘다 — 가려진 동안 버린 영역 이벤트를 메우는 용도 (보일 때만)
  const syncView = useCallback(() => {
    if (!liveRef.current) return;
    mapRef.current?.getMapBoundaries().then(b => {
      const r = regionOfBounds(b);
      if (!r || !liveRef.current || movingRef.current) return;
      setView(r);
      drawAt(r);
    }).catch(() => {});
  }, [drawAt]);
  /**
   * 앱이 카메라를 옮긴다 — 그릴 핀은 지금 고른 범위가 도착 영역을 못 덮을 때만 도착 영역으로 한 번 고르고, 움직이는 동안엔 다시 고르지 않는다.
   * (움직이는 중 200ms마다 다시 고르면 마커를 만들고 지우느라 이동이 끊긴다.) arriveId를 주면 도착한 뒤 그 드랍을 크게 그리고 말풍선을 띄운다
   */
  const moveCamera = (m: CameraMove, duration: number, arriveId: string | null = null) => {
    clearTimeout(autoMove.current?.timer);
    if (needsRepick(drawn.current.region, m.dest, drawn.current.clustered)) drawAt(m.dest);
    const move: NonNullable<typeof autoMove.current> = {
      until: Date.now() + duration + AUTO_MOVE_SLACK_MS,
      arrive: arriveId,
      // 이동이 끝났다는 신호가 끝내 안 오면(이미 그 자리라 카메라가 움직이지 않음 등) 지도에서 지금 영역을 직접 읽어 맞춘다
      timer: setTimeout(() => { if (autoMove.current === move) syncView(); arrive(arriveId); }, duration + AUTO_MOVE_SLACK_MS),
    };
    autoMove.current = move;
    if ('region' in m.camera) mapRef.current?.animateToRegion(m.camera.region, duration);
    else mapRef.current?.animateCamera({ center: m.camera.center }, { duration });
  };

  // 지도 위 제목 — 화면 가운데 지점의 지역 이름을 확대 수준에 맞게(넓게 보면 시·도, 중간이면 시·군·구, 가까우면 동,
  // 동보다 더 당기면 그 자리의 아는 장소 — 없으면 동). 장소는 그 단계에서만 묻는다(place=true).
  // 지도를 움직이다 멈추고 0.4초 뒤에 묻는다. 가까운 지점은 같은 요청으로 묶고 한 번 받은 이름은 다시 쓴다.
  // 못 받으면(예전 서버·오프라인) 지금처럼 내 위치의 동 이름
  const [placeAt, setPlaceAt] = useState<{ latitude: number; longitude: number; level: ReturnType<typeof placeLevel> } | null>(null);
  useEffect(() => {
    if (!view) return;
    const t = setTimeout(() => setPlaceAt({ latitude: view.latitude, longitude: view.longitude, level: placeLevel(view.latitudeDelta) }), 400);
    return () => clearTimeout(t);
  }, [view]);
  const place = useQuery({
    queryKey: ['placeAt', placeAt ? placeKey(placeAt.latitude, placeAt.longitude, placeAt.level) : 'none'],
    enabled: !!placeAt,
    queryFn: async () => sanitizeRegionsAt(await regionApi.at(placeAt!.latitude, placeAt!.longitude, wantsPlace(placeAt!.level))),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 0,
    placeholderData: keepPreviousData,
  });
  const centerName = place.data && placeAt ? placeName(place.data, placeAt.level) : null;
  const clustered = drawState?.clustered ?? false;
  // 묶음 키는 대표 드랍 id — 확대·축소로 칸 크기가 바뀌어도 대표가 같은 묶음은 같은 마커로 남아 위치·숫자만 바뀐다 (clusterPoints)
  const clusters = useMemo(() => (clustered && drawView ? clusterPoints(drops, drawView, undefined, undefined, dropKey) : []), [clustered, drops, drawView]);
  // 1개짜리 묶음은 수 원 대신 보통 핀으로 — 핀 모드와 같은 DropMarker·같은 키라 확대·축소로 모드가 바뀌어도 그 핀은 다시 만들어지지 않는다
  // 이미 그린 핀은 상한 안에서 조금 더 넓게(KEEP_PAD) 남겨 둔다 — 살짝 끌었다 되돌릴 때 마커를 지웠다 다시 만들지 않게
  const drawnPins = useRef<ReadonlySet<string>>(new Set());
  // 주의: useMemo 안에서 ref(drawnPins)를 읽는다 — 직전 그린 핀을 deps 없이 참고하려는 의도. React Compiler를 켜면 이 자리를 다시 볼 것
  const pins = useMemo(
    () => (clustered ? singlePins(sorted, clusters) : pickPins(sorted, drawView, undefined, x => drawnPins.current.has(x.d.droppingId))),
    [clustered, clusters, sorted, drawView],
  );
  useEffect(() => { drawnPins.current = new Set(pins.map(p => p.item.d.droppingId)); }, [pins]);
  // 다음 고르기 간격은 마커를 실제로 그려 넣은 뒤부터 센다 — 느린 기기에서 마커 교체가 밀려 있을 때 연달아 또 바꾸지 않게
  useEffect(() => { drawn.current.at = Date.now(); }, [drawView]);
  const groups = useMemo(() => clusters.filter(c => c.count > 1), [clusters]);

  // 하단 목록에서 고른 드랍 — 지도가 그 핀으로 옮겨 가고 핀 위에 말풍선 (지도 빈 곳·다른 핀을 누르거나 화면을 떠나면 닫힘)
  // 누르면 selectedId는 바로 바뀌고(목록 표시·한 번 더 누르면 자세히), 핀 크기·말풍선은 카메라가 도착한 뒤(arrivedId)에 바꾼다 (selectionLook)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { latestSel.current = selectedId; }, [selectedId]);
  const clearSelection = useCallback(() => {
    latestSel.current = null;
    setSelectedId(null);
    setArrivedId(null);
  }, []);
  const selected = selectedId ? sorted.find(x => x.d.droppingId === selectedId) : undefined;
  useEffect(() => { if (!focused) clearSelection(); }, [focused, clearSelection]);
  const { activeId, bubbleId } = selectionLook(selectedId, arrivedId, nearestId);
  const bubble = bubbleId ? selected : undefined;
  // 고른 핀은 그릴 핀 목록(보이는 영역·개수 제한) 밖이어도 늘 그린다 — 누르는 즉시 (카메라가 옮겨 가는 동안 마커를 미리 만든다)
  const shownPins = useMemo(() => (!selected || pins.some(p => p.item === selected) ? pins : [...pins, { item: selected, rank: Infinity }]), [pins, selected]);
  // 움직이는 물결을 그릴 핀 — 가까운 열린 핀 ANIMATED_PINS개 (재생 중인지·고리 수는 PinRipples가 본다)
  const ripplePins = useMemo<RipplePin[]>(
    () => shownPins.filter(p => p.rank < ANIMATED_PINS && !p.item.lock.locked).map(({ item: { d } }) => ({ id: d.droppingId, latitude: d.latitude, longitude: d.longitude })),
    [shownPins],
  );

  // 주변 곡 자동 재생 — 가까운 음악 드랍부터 차례로 (지도 화면일 때, 앱을 내려도 계속)
  const musicDrops = useMemo(() => sorted.filter(x => !x.lock.locked).map(x => x.d).filter((d): d is MusicDropSummary => d.type === 'MUSIC'), [sorted]);
  const listItems = useMemo(() => sorted.slice(0, NEARBY_LIST), [sorted]);

  // 목록에서 타입을 이미 알면 바로 해당 화면으로 (투표·플리는 미리보기 시트를 거치지 않음)
  const openDrop = (d: DropSummary, source: DropOpenSource) => {
    const parent = navigation.getParent();
    if (d.type === 'VOTE') parent?.navigate('VoteDrop', { dropId: d.droppingId, source });
    else if (d.type === 'PLAYLIST') parent?.navigate('PlaylistDrop', { dropId: d.droppingId, source });
    else parent?.navigate('PinPreview', { dropId: d.droppingId, source });
  };
  // 고른 드랍으로 카메라 이동 (~0.5초) — 지금 확대 수준 그대로 가운데만, 너무 넓게 보고 있으면 핀이 잘 보이게 확대.
  // 도착하면 그 핀을 크게 그리고 말풍선을 띄운다. 이미 그 자리면(카메라가 움직이지 않음) 곧바로
  const focusOn = (d: DropSummary) => {
    follow.current = false;
    if (!movingRef.current && alreadyThere(view, d)) return arrive(d.droppingId);
    moveCamera(focusMove(d, view), FOCUS_MS, d.droppingId);
  };
  // 하단 목록·지도 핀 누르기 (같은 흐름) — 처음 누르면 고르기(들을 수 있으면 미리듣기 + 지도 이동 + 말풍선), 고른 드랍을 한 번 더 누르면 자세히.
  // 잠긴 드랍은 재생·자세히 없이 말풍선(잠금 안내)만 — 토스트는 띄우지 않는다
  const pickDrop = (x: (typeof sorted)[number], via: 'list' | 'pin') => {
    const { d, m, lock } = x;
    const source: DropOpenSource = via === 'list' ? 'map_list' : 'map_pin';
    if (d.droppingId === selectedId) {
      if (lock.locked) return focusOn(d);
      track('map_bubble_open', { drop_id: d.droppingId, via });
      return openDrop(d, source);
    }
    latestSel.current = d.droppingId;
    setSelectedId(d.droppingId);
    // 말풍선 닉네임 — 카메라가 옮겨 가는 동안 받아 둔다 (잠긴 드랍 말풍선은 닉네임을 쓰지 않는다)
    if (!lock.locked) prefetchDrop(d.droppingId);
    focusOn(d);
    track(via === 'list' ? 'map_list_tap' : 'map_pin_tap', { drop_id: d.droppingId, type: d.type, locked: lock.locked });
    if (lock.locked) {
      // 서버 집계(drop_locked_tap)는 고를 때 한 번만 — 같은 드랍을 또 눌러도 다시 세지 않는다
      track('drop_locked_tap', { drop_id: d.droppingId, type: d.type, source, distance_m: Math.round(m), remaining_m: lock.remainingM == null ? null : Math.round(lock.remainingM) });
      return;
    }
    // 핀 미리보기와 같은 재생 — 같은 곡이면 이어서(처음부터 다시 틀지 않음). 투표·플리는 곡이 하나가 아니라 틀지 않는다
    if (d.type === 'MUSIC') startPreview({ id: d.songId, title: d.title, artist: d.artist, albumImagePath: d.albumImageUrl, previewUrl: d.previewUrl, dropId: d.droppingId }).catch(() => {});
  };
  // 핀 누르기 — 마커가 다시 렌더되지 않게 고정 함수 하나 (누른 순간의 최신 목록·핸들러를 ref로 읽는다)
  const latest = useRef({ sorted, pickDrop, selectedId });
  useEffect(() => { latest.current = { sorted, pickDrop, selectedId }; });
  const markerPressedAt = useRef(0);
  const onListPick = useCallback((id: string) => {
    const x = latest.current.sorted.find(p => p.d.droppingId === id);
    if (x) latest.current.pickDrop(x, 'list');
  }, []);
  const onPinPress = useCallback((id: string) => {
    markerPressedAt.current = Date.now();
    const x = latest.current.sorted.find(p => p.d.droppingId === id);
    if (x) latest.current.pickDrop(x, 'pin');
  }, []);
  // 말풍선 누르기 = 자세히 (잠긴 드랍은 열지 않는다)
  const openRef = useRef(openDrop);
  openRef.current = openDrop;
  const onBubblePress = useCallback((id: string) => {
    markerPressedAt.current = Date.now();
    const x = latest.current.sorted.find(p => p.d.droppingId === id);
    if (!x || x.lock.locked) return;
    track('map_bubble_open', { drop_id: id, via: 'bubble' });
    openRef.current(x.d, 'map_bubble');
  }, []);
  // 지도 빈 곳 누르기 = 말풍선 닫기. Apple 지도는 마커를 눌러도 지도 누르기가 같이 오므로 마커 누르기 직후·마커 누르기 표시는 건너뛴다
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const onMapPress = useCallback((e: { nativeEvent: { action?: string } }) => {
    if (!latest.current.selectedId || e.nativeEvent.action === 'marker-press') return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { if (Date.now() - markerPressedAt.current > 400) clearSelection(); }, 120);
  }, [clearSelection]);
  // 묶음 누르기 — 묶인 드랍이 다 보이게 확대 (둘러보는 중이므로 내 위치 따라가기는 멈춘다)
  const latestClusters = useRef({ clusters, view });
  useEffect(() => { latestClusters.current = { clusters, view }; });
  const latestMove = useRef(moveCamera);
  latestMove.current = moveCamera;
  const onClusterPress = useCallback((key: string) => {
    const { clusters: list, view: at } = latestClusters.current;
    const c = list.find(x => x.key === key);
    if (!c || !at) return;
    follow.current = false;
    track('map_cluster_tap', { count: c.count });
    const z = clusterZoomRegion(c, at);
    latestMove.current({ camera: { region: z }, dest: z }, 450);
  }, []);

  // 지도 첫 로드 (앱 실행마다 한 번) — 주변 드랍 수·열 수 있는 드랍 수·반경 (반경 관련 분포용)
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
      play_mode: radius.playMode,
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
    moveCamera({ camera: { region }, dest: region }, 500);
  };
  // Android는 지도가 준비되기 전에 부른 카메라 이동을 무시한다 → 준비된 뒤에 처음 위치로 옮긴다
  const [mapReady, setMapReady] = useState(false);
  // 가려졌다가 다시 보이면 지금 영역으로 한 번 맞춘다 — 가려진 채 마운트된 지도(드랍 완료 화면 아래)는 첫 영역 이벤트를 버려 view가 비어 있고,
  // 돌아와 내 위치로 옮겨도 이미 그 자리면 카메라가 움직이지 않아 새 이벤트가 오지 않는다 (화면이 창에 붙을 틈을 두고 읽는다)
  const wasLive = useRef(live);
  useEffect(() => {
    const back = live && !wasLive.current;
    wasLive.current = live;
    if (!back || !mapReady) return;
    const t = setTimeout(syncView, 400);
    return () => clearTimeout(t);
  }, [live, mapReady, syncView]);
  useEffect(() => {
    if (!coords || !mapReady) return;
    if (!centered.current) {
      centered.current = true;
      followedAt.current = coords;
      const first = { ...region, latitude: coords.latitude - 0.0012, longitude: coords.longitude };
      moveCamera({ camera: { region: first }, dest: first }, 400);
      return;
    }
    if (!follow.current || (followedAt.current && distanceM(followedAt.current, coords) < 8)) return;
    followedAt.current = coords;
    // 줌은 사용자가 맞춘 그대로 두고 가운데만 옮긴다
    const center = { latitude: coords.latitude - 0.0012, longitude: coords.longitude };
    moveCamera({ camera: { center }, dest: { ...(view ?? region), ...center } }, 600);
  }, [coords, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // 보기·재생 범위가 바뀌었으면 지역 이름 아래에 한 번 알려 준다 — 지도가 뜨고 잠시 뒤, 이 화면이 맨 앞일 때만(시트가 열려 있으면 미룸).
  // 띄우는 순간 본 것으로 기록하고, 화면 어디든 처음 누르거나 다른 화면으로 가면 닫는다
  const scopeTip = useScopeTip(s => s.tip);
  const [shownTip, setShownTip] = useState<ScopeTipText | null>(null);
  useEffect(() => {
    if (!scopeTip || !focused || !mapReady || !coords || shownTip) return;
    const t = setTimeout(() => {
      setShownTip(scopeTip.text);
      markScopeTipSeen(scopeTip.sig);
      track('scope_tip_shown', { visibility_mode: scopeTip.sig.mode, region_unit: scopeTip.sig.regionUnit, play_mode: scopeTip.sig.playMode, play_region_unit: scopeTip.sig.playRegionUnit });
    }, 1500);
    return () => clearTimeout(t);
  }, [scopeTip, focused, mapReady, !!coords, shownTip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!focused) setShownTip(null); }, [focused]);
  // 선택 업데이트 안내 시트 — 범위 말풍선이 떠 있는 동안은 기다린다 (시트가 떠 있으면 말풍선이 기다림)
  // 기존 사용자 알림 권한 안내가 업데이트 시트보다 먼저(더 짧은 대기) — 안내가 열리면 지도가 맨 앞이 아니라 업데이트 시트 타이머는 취소됨
  useExistingPushPrompt(!!shownTip);
  useAppUpdatePrompt(!!shownTip);

  // 다른 탭에 갔다가 지도로 돌아오면 다시 내 위치로 (보던 곳을 끌어 둔 채였어도)
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current && centered.current && coords) recenter();
    wasFocused.current = focused;
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // 안내 말풍선은 화면 어디든 처음 누르면 닫는다 — 누른 동작은 그대로 지도·버튼으로 간다(가로채지 않음)
    <View style={{ flex: 1, backgroundColor: colors.page }} onStartShouldSetResponderCapture={() => { if (shownTip) setShownTip(null); return false; }}>
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
        onPanDrag={() => { follow.current = false; if (autoMove.current) autoMove.current.until = 0; }}
        onMapReady={() => setMapReady(true)}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
        // Android Google 지도는 마커를 누르면 그 마커를 가운데로 옮긴다 — 핀·묶음 누르기는 앱이 직접 카메라를 옮기므로(focusOn·묶음 확대) 늘 끈다.
        // 켜 두면 지도가 먼저 움직이기 시작했다가 앱의 이동이 끊고 들어와 두 번 움직인다
        moveOnMarkerPress={false}
      >
        {/* Apple 지도는 스타일을 못 바꾸므로 넓은 하늘빛 막을 깔아 디자인 톤에 맞춘다 (오버레이라 핀 아래에 그려짐) */}
        {!useGoogle ? <Polygon coordinates={tintArea(here)} fillColor="rgba(120,200,232,0.22)" strokeWidth={0} strokeColor="transparent" tappable={false} /> : null}
        {coords ? <MyLocationMarker latitude={coords.latitude} longitude={coords.longitude} /> : null}
        {groups.map(c => <ClusterMarker key={c.key} id={c.key} latitude={c.latitude} longitude={c.longitude} count={c.count} onPress={onClusterPress} />)}
        {shownPins.map(({ item: { d, lock } }) => (
          // 잠금이 풀리거나 잠기면 핀 모양이 통째로 바뀌므로 새 마커로
          <DropMarker
            key={`${d.droppingId}:${lock.locked ? 'l' : 'o'}`}
            id={d.droppingId}
            latitude={d.latitude}
            longitude={d.longitude}
            type={d.type}
            locked={lock.locked}
            active={d.droppingId === activeId}
            art={lock.locked ? null : dropArt(d)}
            title={lock.locked ? '잠긴 드랍' : dropTitle(d)}
            subtitle={pinSubtitle(d, lock.locked)}
            count={!lock.locked && d.type === 'PLAYLIST' ? d.songIds.length : undefined}
            onPress={onPinPress}
          />
        ))}
        {bubble ? <SelectedDropBubble key={bubble.d.droppingId} drop={bubble.d} lock={bubble.lock} radius={radius} onPress={onBubblePress} /> : null}
      </MapView>
      {mapReady ? <PinRipples ref={ripples} mapRef={mapRef} pins={ripplePins} activeId={activeId} view={view} visible={focused && appActive} /> : null}
      <NearbyAutoplay drops={musicDrops} active={focused && !!coords} focused={focused} />

      {/* 상단 페이드 + 동 이름 */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} locations={[0, insets.top / (insets.top + 96), 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 96 }} />
      {/* 제목은 한 줄 — 긴 장소 이름은 끝을 줄이고 ▾는 늘 보이게 (오른쪽 여백 20 안에서) */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 12, left: 20, right: 20, flexDirection: 'row' }}>
        <Press onPress={recenter} accessibilityHint="내 위치로 지도를 다시 맞춰요" trackAs="동 이름 (내 위치로)" style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T v="title" numberOfLines={1} style={{ flexShrink: 1 }}>{coords ? centerName || label || '현재 위치' : fix === 'locating' ? '위치 찾는 중…' : '위치를 알 수 없어요'}</T>
          <Caret />
        </Press>
      </View>
      {shownTip ? <ScopeTip title={shownTip.title} body={shownTip.body} top={insets.top + 50} /> : null}

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
          <NearbyList items={listItems} selectedId={selectedId} onPick={onListPick} />
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

/**
 * 하단 '가까운 드랍' 줄 — 재생 중인 곡 표시를 여기서만 구독한다 (재생이 바뀔 때 지도 화면 전체가 아니라 이 줄만 다시 그린다).
 * 걸을 때마다(GPS 갱신) 거리순 목록이 새 배열로 오지만, 칸마다 보이는 값(곡·잠금·거리 글자·고름·재생 중)이 그대로면 그 칸은 다시 그리지 않는다 (2026-11-20 QA R-17)
 */
const NearbyList = memo(function NearbyListRow({ items, selectedId, onPick }: { items: readonly NearbyItem[]; selectedId: string | null; onPick: (id: string) => void }) {
  const playingKey = usePreviewStore(st => st.key);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16, paddingRight: 20, gap: 12 }}>
      {items.map(({ d, m, lock }, i) => (
        <NearbyCell
          key={d.droppingId}
          d={d}
          locked={lock.locked}
          // 거리는 잠긴 칸에만 보인다 — 열린 칸은 걸어도 다시 그릴 게 없다
          distance={lock.locked ? formatDistance(m) : ''}
          picked={d.droppingId === selectedId}
          fresh={i < 3}
          onAir={d.type === 'MUSIC' && !!playingKey && d.songId === playingKey}
          onPick={onPick}
        />
      ))}
    </ScrollView>
  );
});

/** '가까운 드랍' 한 칸 — 원시값 props라 값이 같으면 다시 그리지 않는다 */
const NearbyCell = memo(function NearbyCell({ d, locked, distance, picked, fresh, onAir, onPick }: { d: DropSummary; locked: boolean; distance: string; picked: boolean; fresh: boolean; onAir: boolean; onPick: (id: string) => void }) {
  if (locked) {
    // 잠긴 드랍 — 곡·커버 대신 자물쇠와 거리만
    return (
      <Press onPress={() => onPick(d.droppingId)} accessibilityLabel={`잠긴 드랍 · ${distance}`} accessibilityState={{ selected: picked }} trackAs="주변 목록 잠긴 드랍" style={{ width: 66, alignItems: 'center', gap: 6 }}>
        <View style={{ width: 55, height: 55, borderRadius: 12, borderWidth: 3, borderColor: picked ? colors.accent : '#FAFAFA', backgroundColor: '#FFFFFF', opacity: picked ? 1 : 0.6 }}>
          <View style={{ width: 49, height: 49, borderRadius: 9, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={18} color={colors.ink3} />
          </View>
        </View>
        <View style={{ alignSelf: 'stretch' }}>
          <T v="caption" c="onPrimary" numberOfLines={1} style={{ textAlign: 'center' }}>{distance}</T>
          <T v="tiny" numberOfLines={1} style={{ textAlign: 'center', color: '#98A2B8' }}>더 가까이</T>
        </View>
      </Press>
    );
  }
  return (
    <Press onPress={() => onPick(d.droppingId)} accessibilityState={{ selected: picked }} trackAs="주변 목록 드랍" style={{ width: 66, alignItems: 'center', gap: 6 }}>
      {/* Figma 'stay music' 아트: 흰 바탕 · #FAFAFA 테두리 3 · 모서리 12 (재생 중이면 시안 테두리 + 글로우) */}
      <View style={[{ width: 55, height: 55, borderRadius: 12, borderWidth: 3, borderColor: onAir || picked ? colors.accent : '#FAFAFA', backgroundColor: '#FFFFFF', opacity: fresh || onAir || picked ? 1 : 0.6 }, onAir || picked || fresh ? glow(onAir || picked ? 0.9 : 0.5, 12) : null]}>
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
});

/** 주변 곡 자동 재생 + 미니 디스크 길게 누르기(다음 주변 곡, 지도가 보일 때만) — 미리듣기 상태 구독을 지도 화면 밖에 둔다 */
function NearbyAutoplay({ drops, active, focused }: { drops: MusicDropSummary[]; active: boolean; focused: boolean }) {
  const auto = useNearbyAutoplay(drops, active);
  const nextRef = useRef(auto.next);
  nextRef.current = auto.next;
  useEffect(() => {
    if (!focused) return;
    useMiniDiscActions.setState({ onLongPress: () => nextRef.current() });
    return () => useMiniDiscActions.setState({ onLongPress: null });
  }, [focused]);
  return null;
}
