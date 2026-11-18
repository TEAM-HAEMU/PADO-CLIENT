/**
 * 지도 마커 — 드랍 핀 하나 · 많이 축소했을 때의 묶음 · 내 위치.
 * props는 원시값만 받고 memo로 감싼다 → GPS가 갱신돼 지도 화면이 다시 렌더돼도 바뀐 핀만 다시 그린다.
 * 마커 스냅샷 추적(tracksViewChanges)은 마커마다 — 처음 그릴 때, 자기 앨범 아트가 로드될 때, 모양이 바뀔 때만 잠깐 켠다
 * (Google 지도는 추적을 끄면 그 순간 모습으로 굳고, 켜 두면 계속 다시 찍어 비싸다. iOS는 패치로 켜질 때 한 번 + 0.1초마다 찍는다 —
 * Android는 패치로 레이아웃이 끝난 뒤 한 번 + 추적을 켠 채 붙었으면 150ms 뒤 한 번, 그 뒤로는 바뀐 게 있을 때만 찍는다 — patches/react-native-maps).
 * 핀 물결 애니메이션은 마커 밖 PinRipples가 그려서, 지도가 멈춰 있으면 추적은 꺼져 있다.
 * 고른 핀의 zIndex가 바뀌거나 걸어서 거리순이 바뀌면 Fabric이 마커 ~100개를 떼었다 붙인다 — iOS·Android 모두 패치로 같은 마운트 안에서 다시 붙는 마커는 있던 Google 마커를 그대로 쓴다.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { DropType } from '@/api/types';
import { DropPin, MeMarker, PIN_SIZE } from '@/components/map/DropPin';
import { artUrl } from '@/utils/artUrl';
import { clusterLabel, clusterSize, createPrefetcher } from '@/utils/mapPins';
import { colors, dropShadow, fonts } from '@/theme/tokens';

/** 앨범 아트 미리 받기 — 같은 주소는 한 번, 동시에 6개씩. 지도에 그린 핀은 줄 맨 앞으로 */
const art = createPrefetcher(u => Image.prefetch(u), 6);
/** 마커 앨범 아트 주소 (52pt 핀 크기에 맞춘 판본) — 잠긴 드랍은 아트를 그리지 않는다 */
export const markerArtUrl = (image: string | null | undefined) => artUrl(image, 52);

/**
 * 주변 드랍의 마커 아트를 (그리기 전에) 미리 받아 둔다 — 넘겨준 순서대로(가까운 순).
 * 축소해서 멀리 있는 핀이 처음 그려질 때 이미 받아 둔 상태라 빈 핀으로 떴다가 채워지지 않는다.
 */
export function prefetchMarkerArt(images: readonly (string | null | undefined)[]) {
  for (const image of images) {
    const url = markerArtUrl(image);
    if (url) art.prefetch(url);
  }
}

const ANCHOR = {
  normal: { x: PIN_SIZE.normal.tipX / PIN_SIZE.normal.w, y: PIN_SIZE.normal.tipY / PIN_SIZE.normal.h },
  active: { x: PIN_SIZE.active.tipX / PIN_SIZE.active.w, y: PIN_SIZE.active.tipY / PIN_SIZE.active.h },
};
const ME_ANCHOR = { x: 0.5, y: 0.5 };
/**
 * 처음 스냅샷 추적 시간(ms). 축소·확대로 핀·묶음 수십 개가 한꺼번에 생길 때 그 뒤 몇 초씩 계속 다시 찍지 않게 짧게.
 *  · iOS(추적 중 0.1초마다 찍음): 잠긴 핀·묶음은 그림이 없어 첫 모습만 — 0.3초. 아트 핀은 디스크의 52pt 그림을 디코딩해 그릴 동안 — 0.5초.
 *    늦게 도착한 아트는 이미지 onLoadEnd → trackFor(TRACK.image)로 받는다.
 *  · Android: 잠긴 핀·묶음은 추적을 켜지 않는다 — 붙은 뒤 한 번 찍은 그림으로 끝(패치). 아트 핀은 추적을 켠 채 붙어 150ms 뒤 한 번 더 찍는다
 *    (마커 안 SVG 이미지는 처음 그릴 때 디스크에서 받기 시작해 그다음 그릴 때 나온다. 로드 이벤트는 JS로 오지 않는다 — image는 쓰이지 않아 0)
 *    JS가 추적을 끌 때(art 500ms 뒤) 패치가 마지막으로 한 번 더 찍는다 — 150ms 안에 못 받은 아트는 거기서 잡힌다.
 */
const TRACK = Platform.OS === 'ios' ? { locked: 300, art: 500, cluster: 300, change: 300, image: 300 } : { locked: 0, art: 500, cluster: 0, change: 600, image: 0 };

/** 지도 마커 그림 하나를 미리 받는다 (지도 홈 핀과 같은 줄·같은 기록 — 같은 주소는 한 번). urgent면 줄 맨 앞으로 */
export const prefetchMarkerImage = (url: string, urgent = false) => art.prefetch(url, urgent);
/** 이미 받아 둔 마커 그림인가 (동기) */
export const isMarkerImageReady = (url: string) => art.isReady(url);

/** 처음 ms 동안 추적을 켜 두고(0이면 처음부터 끔), trackFor(ms)로 다시 잠깐 켠다 (마커 스냅샷 추적 — 다른 지도 마커도 같은 방식으로) */
export function useTracking(initialMs: number) {
  const [on, setOn] = useState(initialMs > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackFor = useCallback((ms: number) => {
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, []);
  useEffect(() => {
    if (initialMs > 0) timer.current = setTimeout(() => setOn(false), initialMs);
    return () => clearTimeout(timer.current);
  }, [initialMs]);
  return [on, trackFor] as const;
}

interface DropMarkerProps {
  id: string;
  latitude: number;
  longitude: number;
  type: DropType;
  /** 재생 반경 밖 — 흐린 자물쇠 핀 (art·count 무시) */
  locked: boolean;
  /** 가장 가까운 열린 드랍, 또는 하단 목록에서 고른 드랍 (크게 + 시안 테두리 — 잠긴 드랍은 회청색) */
  active: boolean;
  art?: string | null;
  title: string;
  subtitle: string;
  count?: number;
  onPress: (id: string) => void;
}

export const DropMarker = memo(function DropMarkerItem({ id, latitude, longitude, type, locked, active, art: image, title, subtitle, count, onPress }: DropMarkerProps) {
  const url = locked ? null : markerArtUrl(image);
  // 처음 스냅샷 추적 시간 (TRACK) — 아트를 아직 못 받은 핀도 같다: 받아지면 아래에서 다시 찍는다(iOS는 이미지 onLoadEnd도)
  const [initialTrackMs] = useState(() => (locked ? TRACK.locked : TRACK.art));
  const [tracking, trackFor] = useTracking(initialTrackMs);
  // Android는 마커 안 이미지가 로드 이벤트를 주지 않고, 다시 찍기만으로는 늦게 받은 아트가 나오지 않아(SVG 이미지가 받는 중이면 그리지 않음) 빈 채로 굳는다
  // → 미리 받아둔 뒤 그 마커만 한 번 다시 만든다 (새 마커는 디스크의 그림을 붙은 뒤 찍기·150ms 뒤 찍기로 잡는다)
  const [epoch, setEpoch] = useState(() => (url && art.isReady(url) ? 1 : 0));
  useEffect(() => {
    if (!url || art.isReady(url)) return;
    let alive = true;
    art.prefetch(url, true).then(() => {
      if (!alive) return;
      if (Platform.OS === 'android') setEpoch(e => e + 1);
      trackFor(TRACK.art);
    });
    return () => { alive = false; };
  }, [url, trackFor]);
  // 크기·그림이 바뀌면(가장 가까운 핀이 바뀜 등) 새 모습을 한 번 다시 찍는다
  const look = `${active}:${url ?? ''}:${count ?? ''}`;
  const prevLook = useRef(look);
  useEffect(() => {
    if (prevLook.current === look) return;
    prevLook.current = look;
    trackFor(1500);
  }, [look, trackFor]);
  // 느린 망에서 앨범 아트가 늦게 도착해도 핀에 반영되게, 이미지가 로드되면 잠깐 다시 그린다 (iOS — Android 마커 안 이미지는 로드 이벤트가 JS로 오지 않는다)
  const onImageLoad = useCallback(() => trackFor(TRACK.image), [trackFor]);
  const press = useCallback(() => onPress(id), [onPress, id]);
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  return (
    <Marker
      key={epoch}
      coordinate={coordinate}
      anchor={active ? ANCHOR.active : ANCHOR.normal}
      tracksViewChanges={tracking}
      zIndex={active ? 3 : 2}
      onPress={press}
    >
      {locked ? (
        <DropPin type={type} locked active={active} title={title} subtitle={subtitle} />
      ) : (
        <DropPin type={type} art={image} active={active} onImageLoad={onImageLoad} title={title} subtitle={subtitle} count={count} />
      )}
    </Marker>
  );
});

// 묶음 둘레 여백 — Android 마커 비트맵은 뷰 밖 그림자를 잘라내므로 그림자 자리를 뷰 안에 둔다
const CLUSTER_PAD = 6;
const CLUSTER_ANCHOR = { x: 0.5, y: 0.5 };

/**
 * 드랍 묶음(2개 이상) — 하늘색 원 + 흰 테두리 + 흰 숫자 (어드민 지도 묶음과 같은 모양). 곡·커버·잠금 여부는 없다. 1개짜리는 보통 핀(DropMarker)으로 그린다.
 * 모양이 숫자뿐이라 스냅샷 추적은 처음과 숫자가 바뀔 때만 잠깐 (그 외엔 tracksViewChanges 끔 — Android는 처음에도 켜지 않는다, TRACK)
 */
export const ClusterMarker = memo(function ClusterMarkerItem({ id, latitude, longitude, count, onPress }: { id: string; latitude: number; longitude: number; count: number; onPress: (id: string) => void }) {
  const [tracking, trackFor] = useTracking(TRACK.cluster);
  const prevCount = useRef(count);
  useEffect(() => {
    if (prevCount.current === count) return;
    prevCount.current = count;
    trackFor(TRACK.change);
  }, [count, trackFor]);
  const press = useCallback(() => onPress(id), [onPress, id]);
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const size = clusterSize(count);
  return (
    <Marker coordinate={coordinate} anchor={CLUSTER_ANCHOR} tracksViewChanges={tracking} zIndex={2} onPress={press}>
      <View style={{ padding: CLUSTER_PAD }} accessible accessibilityRole="button" accessibilityLabel={`드랍 ${count}개, 눌러서 펼치기`}>
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: colors.page, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: dropShadow.shadowColor, shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, color: colors.page }}>{clusterLabel(count)}</Text>
        </View>
      </View>
    </Marker>
  );
});

/** 내 위치 마커 — 모양은 고정이라 처음 한 번만 추적 */
export const MyLocationMarker = memo(function MyLocationMarkerItem({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [tracking] = useTracking(5000);
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  return (
    <Marker coordinate={coordinate} anchor={ME_ANCHOR} tracksViewChanges={tracking} tappable={false} zIndex={0}>
      <MeMarker />
    </Marker>
  );
});
