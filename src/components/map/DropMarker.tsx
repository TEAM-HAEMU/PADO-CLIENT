/**
 * 지도 마커 — 드랍 핀 하나 · 많이 축소했을 때의 묶음 · 내 위치.
 * props는 원시값만 받고 memo로 감싼다 → GPS가 갱신돼 지도 화면이 다시 렌더돼도 바뀐 핀만 다시 그린다.
 * 마커 스냅샷 추적(tracksViewChanges)은 마커마다 — 처음 그릴 때, 자기 앨범 아트가 로드될 때, 모양이 바뀔 때만 잠깐 켠다
 * (Google 지도는 추적을 끄면 그 순간 모습으로 굳고, 켜 두면 계속 다시 찍어 비싸다).
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import type { DropType } from '@/api/types';
import { DropPin, MeMarker, PIN_SIZE } from '@/components/map/DropPin';
import { artUrl } from '@/utils/artUrl';
import { clusterLabel, clusterSize, createPrefetcher } from '@/utils/mapPins';
import { colors, dropShadow, fonts } from '@/theme/tokens';

/** 앨범 아트 미리 받기 — 같은 주소는 한 번, 동시에 6개씩 (화면에 그리는 열린 핀만 부른다) */
const art = createPrefetcher(u => Image.prefetch(u), 6);

const ANCHOR = {
  normal: { x: PIN_SIZE.normal.tipX / PIN_SIZE.normal.w, y: PIN_SIZE.normal.tipY / PIN_SIZE.normal.h },
  active: { x: PIN_SIZE.active.tipX / PIN_SIZE.active.w, y: PIN_SIZE.active.tipY / PIN_SIZE.active.h },
};
const ME_ANCHOR = { x: 0.5, y: 0.5 };

/** 처음 ms 동안 추적을 켜 두고, trackFor(ms)로 다시 잠깐 켠다 */
function useTracking(initialMs: number) {
  const [on, setOn] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trackFor = useCallback((ms: number) => {
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, []);
  useEffect(() => {
    timer.current = setTimeout(() => setOn(false), initialMs);
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
  /** 가장 가까운 열린 드랍 (크게 + 시안 테두리) */
  active: boolean;
  /** 물결 애니메이션 — 켜져 있는 동안은 계속 추적 */
  animated: boolean;
  art?: string | null;
  title: string;
  subtitle: string;
  count?: number;
  onPress: (id: string) => void;
}

export const DropMarker = memo(function DropMarkerItem({ id, latitude, longitude, type, locked, active, animated, art: image, title, subtitle, count, onPress }: DropMarkerProps) {
  // 잠긴 핀은 이미지가 없어 첫 스냅샷만 잡으면 된다
  const [tracking, trackFor] = useTracking(locked ? 2500 : 5000);
  const url = locked ? null : artUrl(image, 52);
  // Android는 마커 안 이미지가 로드 이벤트를 주지 않아 빈 채로 굳는다 → 미리 받아둔 뒤 그 마커만 한 번 다시 만든다
  const [epoch, setEpoch] = useState(() => (url && art.isReady(url) ? 1 : 0));
  useEffect(() => {
    if (!url || art.isReady(url)) return;
    let alive = true;
    art.prefetch(url).then(() => {
      if (!alive) return;
      if (Platform.OS === 'android') setEpoch(e => e + 1);
      trackFor(2500);
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
  // 느린 망에서 앨범 아트가 늦게 도착해도 핀에 반영되게, 이미지가 로드되면 잠깐 다시 그린다
  const onImageLoad = useCallback(() => trackFor(1200), [trackFor]);
  const press = useCallback(() => onPress(id), [onPress, id]);
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  return (
    <Marker
      key={epoch}
      coordinate={coordinate}
      anchor={active ? ANCHOR.active : ANCHOR.normal}
      tracksViewChanges={tracking || animated}
      zIndex={active ? 3 : 2}
      onPress={press}
    >
      {locked ? (
        <DropPin type={type} locked animated={false} title={title} subtitle={subtitle} />
      ) : (
        <DropPin type={type} art={image} active={active} animated={animated} onImageLoad={onImageLoad} title={title} subtitle={subtitle} count={count} />
      )}
    </Marker>
  );
});

// 묶음 둘레 여백 — Android 마커 비트맵은 뷰 밖 그림자를 잘라내므로 그림자 자리를 뷰 안에 둔다
const CLUSTER_PAD = 6;
const CLUSTER_ANCHOR = { x: 0.5, y: 0.5 };

/**
 * 드랍 묶음(2개 이상) — 하늘색 원 + 흰 테두리 + 흰 숫자 (어드민 지도 묶음과 같은 모양). 곡·커버·잠금 여부는 없다. 1개짜리는 보통 핀(DropMarker)으로 그린다.
 * 모양이 숫자뿐이라 스냅샷 추적은 처음과 숫자가 바뀔 때만 잠깐 (그 외엔 tracksViewChanges 끔)
 */
export const ClusterMarker = memo(function ClusterMarkerItem({ id, latitude, longitude, count, onPress }: { id: string; latitude: number; longitude: number; count: number; onPress: (id: string) => void }) {
  const [tracking, trackFor] = useTracking(800);
  const prevCount = useRef(count);
  useEffect(() => {
    if (prevCount.current === count) return;
    prevCount.current = count;
    trackFor(600);
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
