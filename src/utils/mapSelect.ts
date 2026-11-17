/**
 * 지도에서 드랍을 고를 때의 순서 (네이티브 의존 없음) — 카메라 이동 · 그릴 핀 고르기 · 핀 크기 · 말풍선.
 * 고르는 순간에 카메라 이동, 마커 만들기·지우기, 핀 크기 바꾸기(Android는 비트맵을 40ms마다 다시 찍음), 말풍선 마운트가 한꺼번에 몰리면
 * 카메라 이동이 끊긴다 → 그릴 핀은 이동을 시작할 때 도착 영역 기준으로 한 번만 고르고, 핀 크기·말풍선은 카메라가 도착한 뒤에 바꾼다.
 */
import type { DropSummary } from '@/api/types';
import { focusCamera } from '@/utils/dropBubble';
import type { Coords } from '@/utils/geo';
import { needsRepick, type MapRegion } from '@/utils/mapPins';

/** 앱이 옮기는 카메라 — 지도 명령(가운데만 또는 영역)과 도착했을 때 보일 영역 */
export interface CameraMove {
  camera: { center: Coords } | { region: MapRegion };
  /** 도착 영역 — 그릴 핀을 이 영역으로 미리 고른다 */
  dest: MapRegion;
}

/** 고른 드랍으로 옮길 카메라 (focusCamera와 같은 규칙) + 도착 영역. 가운데만 옮기면 지금 확대 수준 그대로 */
export function focusMove(target: Coords, view: MapRegion | null): CameraMove {
  const camera = focusCamera(target, view);
  if ('region' in camera) return { camera, dest: camera.region };
  // focusCamera는 영역(view)을 알 때만 가운데만 옮긴다
  return { camera, dest: { ...(view as MapRegion), latitude: target.latitude, longitude: target.longitude } };
}

/** 카메라 가운데가 이미 그 자리인가 (화면 폭의 0.2% 안) — 지도가 움직이지 않으면 이동이 끝났다는 신호도 오지 않을 수 있다 */
export function alreadyThere(view: MapRegion | null, target: Coords) {
  if (!view) return false;
  return Math.abs(view.latitude - target.latitude) <= view.latitudeDelta * 0.002 && Math.abs(view.longitude - target.longitude) <= view.longitudeDelta * 0.002;
}

/** 앱이 카메라를 옮길 때 이동 시간 뒤로 더 기다리는 여유 — 이 안에 이동이 끝났다는 신호가 오지 않아도 도착한 것으로 본다 */
export const AUTO_MOVE_SLACK_MS = 300;

/**
 * 지도가 움직이는 중에 그릴 핀·묶음을 다시 고를까 (onRegionChange).
 * 앱이 옮기는 중(autoUntil 전, 사용자 제스처 아님)이면 고르지 않는다 — 시작할 때 도착 영역으로 이미 골라 두었다.
 * 그 밖(손으로 끌기·핀치)은 needsRepick 그대로 (#24: 크게 축소하는 동안에도 핀·묶음이 따라 나오게)
 */
export function repickWhileMoving(drawn: MapRegion | null, next: MapRegion, opts: { autoUntil: number | null; now: number; isGesture?: boolean }) {
  if (opts.autoUntil != null && opts.now < opts.autoUntil && !opts.isGesture) return false;
  return needsRepick(drawn, next);
}

/**
 * 지도에서 보이는 고르기 상태 — 핀 크기(activeId)와 말풍선(bubbleId).
 * selectedId는 누르는 즉시 바뀌고(하단 목록 표시·한 번 더 누르면 자세히), arrivedId는 카메라가 그 드랍에 도착하면 바뀐다.
 *  · 크게 그리는 핀은 도착한 드랍(없으면 가장 가까운 열린 드랍) — 이동하는 동안엔 전에 크던 핀이 그대로 크다
 *  · 말풍선은 고른 드랍에 도착한 뒤에만 (다른 드랍으로 옮겨 가는 동안엔 전 말풍선도 없다)
 */
export function selectionLook(selectedId: string | null, arrivedId: string | null, nearestId: string | undefined) {
  return {
    activeId: arrivedId ?? nearestId,
    bubbleId: selectedId && selectedId === arrivedId ? selectedId : null,
  };
}

/**
 * 핀 접근성 문구 둘째 줄 — 거리는 넣지 않는다.
 * 거리를 넣으면 GPS가 갱신될 때(2~4초)마다 바뀌어 지도 핀 100개의 memo가 다 깨지고 마커를 모두 다시 커밋한다 (거리는 하단 목록·말풍선에 있다)
 */
export function pinSubtitle(d: DropSummary, locked: boolean) {
  if (locked) return '더 가까이 가면 들을 수 있어요';
  return d.type === 'MUSIC' ? d.artist : dropSub(d);
}

/** 투표·플리 둘째 줄 (음악이면 가수) — 하단 목록·프로필 목록과 같은 문구 */
export const dropSub = (d: DropSummary) => (d.type === 'MUSIC' ? d.artist : d.type === 'VOTE' ? `투표 · ${d.options.length}곡` : `플레이리스트 · ${d.songIds.length}곡`);
