/**
 * 프로필 '내 드랍 지도' — 움직이지 않는 120pt 지도라 지도 SDK를 계속 띄워 두지 않고 한 번 찍은 그림으로 보여 준다.
 *
 * 프로필 탭은 늘 마운트돼 있어, 두 번째 지도 인스턴스가 다른 탭으로 가도 계속 살아 있었다 (QA R-12).
 * → 처음 보일 때만 지도를 띄워 타일이 다 그려지면 찍고(takeSnapshot), 그림으로 바꾼 뒤 지도를 내린다.
 *   (지도 SDK가 공유 캐시를 쥐고 있어 내려도 메모리가 다 돌아오지는 않는다 — 출시 빌드 iOS 기준 지도 몫 약 20MB 중 4~6MB)
 *   같은 범위·크기면 앱이 살아 있는 동안 그림을 다시 쓴다. 드랍이 생기거나 지워져 범위가 바뀌면 그때 한 번 다시 찍는다.
 * 핀은 지도 마커가 아니라 그림 위에 얹은 보통 뷰다 — 지도가 보이는 가장자리(getMapBoundaries)로 위치를 계산해,
 *   범위 안에 새 드랍이 생기거나 플리 커버가 늦게 와도 지도를 다시 띄우지 않고 핀만 다시 그린다.
 * 화면이 가려지면(탭 이동) 찍기 전이어도 지도를 내린다.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { MarkerArt } from '@/components/map/DropPin';
import { env } from '@/config';
import { googleMapStyle } from '@/theme/mapStyle';

const useGoogle = !!env.googleMapsKey || Platform.OS === 'android';
/** 핀 크기 — Figma 'stay music' 핀: 앨범 아트 55(테두리 3) + 막대 19. 바닥 가운데가 좌표 */
const PIN_W = 55;
export const PIN_H = 74;
const PIN_ART = 49;
/** 타일이 다 그려졌다는 신호(onMapLoaded)가 없을 때(Apple 지도 등) 지도 준비 뒤 이만큼 기다렸다 찍는다 */
const LOAD_FALLBACK_MS = 5000;
/** 타일 렌더 완료 직후 한 프레임 여유 */
const SETTLE_MS = 250;
/** 앱이 살아 있는 동안 둘 그림 수 (사용자 전환·드랍 변경으로 쌓이지 않게) */
const CACHE_MAX = 2;

export type Bounds = { northEast: { latitude: number; longitude: number }; southWest: { latitude: number; longitude: number } };
type Shot = { uri: string; bounds: Bounds };
export type ProfileMapPin = { id: string; latitude: number; longitude: number; /** 그림 주소를 줄바꿈으로 이은 값 (memo 비교용 원시값) */ art: string };

const shots = new Map<string, Shot>();
const remember = (key: string, shot: Shot) => {
  shots.delete(key);
  shots.set(key, shot);
  while (shots.size > CACHE_MAX) shots.delete(shots.keys().next().value as string);
};
/** 테스트용 */
export const _resetProfileMapShots = () => shots.clear();

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
/** 회전·기울기 없는 웹 메르카토르 지도에서 좌표 → 지도 칸 안의 점 (pt) */
export function projectPoint(b: Bounds, w: number, h: number, latitude: number, longitude: number) {
  const x = ((longitude - b.southWest.longitude) / (b.northEast.longitude - b.southWest.longitude)) * w;
  const top = mercY(b.northEast.latitude);
  const y = ((top - mercY(latitude)) / (top - mercY(b.southWest.latitude))) * h;
  return { x, y };
}

export function ProfileDropMap({ region, regionKey, pins, width, height, active }: { region: Region; regionKey: string; pins: readonly ProfileMapPin[]; width: number; height: number; active: boolean }) {
  const key = `${regionKey}|${Math.round(width)}x${Math.round(height)}`;
  const shot = shots.get(key);
  // 방금 찍은 그림 — 그 그림이 화면에 뜬 뒤에 지도를 내린다 (바꿔 끼우는 순간 빈 칸이 보이지 않게).
  // 이미 찍어 둔 그림으로 시작하면(탭 전환으로 다시 마운트 등) 지도를 아예 띄우지 않는다
  const [handoff, setHandoff] = useState<string | null>(null);
  // 찍기 전 살아 있는 지도의 가장자리 — 핀을 먼저 얹어 둔다
  const [liveBounds, setLiveBounds] = useState<{ key: string; bounds: Bounds } | null>(null);
  const mapRef = useRef<MapView>(null);
  const capturing = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const mountMap = active && (!shot || handoff === shot.uri);
  useEffect(() => () => { if (fallback.current) clearTimeout(fallback.current); }, []);
  useEffect(() => { if (!mountMap) { capturing.current = false; if (fallback.current) clearTimeout(fallback.current); } }, [mountMap]);

  const capture = useCallback(() => {
    if (capturing.current || shots.has(keyRef.current)) return;
    capturing.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    const forKey = keyRef.current;
    setTimeout(async () => {
      const map = mapRef.current;
      if (!map || keyRef.current !== forKey) { capturing.current = false; return; }
      try {
        const bounds = await map.getMapBoundaries();
        if (keyRef.current !== forKey || !mapRef.current) return;
        setLiveBounds({ key: forKey, bounds });
        const data = await map.takeSnapshot({ format: 'jpg', quality: 0.9, result: 'base64' });
        if (keyRef.current !== forKey || !data) return;
        const uri = `data:image/jpeg;base64,${data}`;
        remember(forKey, { uri, bounds });
        setHandoff(uri);
      } catch {
        // 찍지 못하면 살아 있는 지도를 그대로 두고, 화면이 가려질 때 내린다 (다음에 보일 때 다시 시도)
      } finally {
        capturing.current = false;
      }
    }, SETTLE_MS);
  }, []);
  const onReady = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = setTimeout(capture, LOAD_FALLBACK_MS);
    // 타일을 기다리는 동안에도 핀은 먼저 (찍을 때 가장자리를 다시 읽는다)
    const forKey = keyRef.current;
    mapRef.current?.getMapBoundaries().then(bounds => { if (keyRef.current === forKey) setLiveBounds(b => (b?.key === forKey ? b : { key: forKey, bounds })); }).catch(() => {});
  }, [capture]);

  const bounds = shot?.bounds ?? (liveBounds?.key === key ? liveBounds.bounds : null);
  return (
    <View style={{ width, height, backgroundColor: LAND }}>
      {mountMap ? (
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={useGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT} customMapStyle={useGoogle ? googleMapStyle : undefined} userInterfaceStyle="light" initialRegion={region} region={region} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false} onMapReady={onReady} onMapLoaded={capture} />
      ) : null}
      {shot ? <Image source={{ uri: shot.uri }} fadeDuration={0} onLoad={() => setHandoff(null)} style={StyleSheet.absoluteFill} /> : null}
      {bounds ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* 최신 드랍이 맨 위 (뒤에 그린 것이 위) */}
          {pins.map((_, i) => pins[pins.length - 1 - i]).map(p => {
            const { x, y } = projectPoint(bounds, width, height, p.latitude, p.longitude);
            return <ProfilePin key={p.id} left={x - PIN_W / 2} top={y - PIN_H} art={p.art} />;
          })}
        </View>
      ) : null}
    </View>
  );
}

/** 지도 땅 색 (mapStyle landscape) — 지도가 뜨기 전 빈 칸 */
const LAND = '#D4ECF6';

/** 핀 하나 — #FAFAFA 3px 테두리 앨범 아트 55 + 가는 막대 + 바닥 점. 플리 드랍은 4칸 커버 */
const ProfilePin = memo(function ProfilePinItem({ left, top, art }: { left: number; top: number; art: string }) {
  const images = React.useMemo(() => art.split('\n').map(u => u || null), [art]);
  return (
    <View style={{ position: 'absolute', left, top, alignItems: 'center', width: PIN_W }}>
      <View style={{ width: PIN_W, height: PIN_W, borderRadius: 12, borderWidth: 3, borderColor: '#FAFAFA', backgroundColor: '#FFFFFF', overflow: 'hidden' }}><MarkerArt images={images} size={PIN_ART} radius={9} /></View>
      <View style={{ width: 8, height: 19, alignItems: 'center' }}>
        <View style={{ width: 1, height: 16, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, backgroundColor: 'rgba(250,250,250,0.7)' }} />
        <View style={{ position: 'absolute', top: 12, width: 8, height: 7, borderRadius: 4, backgroundColor: 'rgba(250,250,250,0.7)' }} />
      </View>
    </View>
  );
});
