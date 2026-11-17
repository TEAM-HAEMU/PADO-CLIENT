/**
 * 지도 말풍선 — 하단 목록에서 드랍을 고르면 그 핀 위에 띄우는 한마디 말풍선의 문구와 카메라 이동 (그리기는 components/map/DropBubble).
 *  - 한마디가 있으면: 첫 줄 “한마디”, 둘째 줄 닉네임 · (투표·플레이리스트면 종류 ·) 제목
 *  - 한마디가 없으면: 첫 줄 제목(굵게), 둘째 줄 가수(투표·플리는 종류 · 곡 수) · 닉네임
 *  - 잠긴 드랍: 곡·커버를 숨기는 규칙 그대로 제목은 보이지 않는다. 첫 줄 한마디(없으면 '잠긴 드랍'), 둘째 줄 잠금 안내(lockMessage)
 * 닉네임은 주변 목록 응답에 없어 상세를 받은 뒤에만 붙는다 (받기 전엔 빼고 나머지만).
 */
import type { DropSummary } from '@/api/types';
import type { DropLock } from '@/utils/dropLock';
import type { Coords } from '@/utils/geo';
import type { MapRegion } from '@/utils/mapPins';

export interface BubbleText {
  /** 첫 줄 — 한마디(따옴표 포함, 노트 글꼴). 없으면 null이고 title을 쓴다 */
  quote: string | null;
  /** 첫 줄 — 한마디가 없을 때의 제목 (굵게) */
  title: string | null;
  /** 둘째 줄 (보조 색). 잠긴 드랍이면 잠금 안내 */
  sub: string;
  locked: boolean;
}

const kindWord = (d: DropSummary) => (d.type === 'VOTE' ? '투표' : d.type === 'PLAYLIST' ? '플레이리스트' : null);
const titleOf = (d: DropSummary) => (d.type === 'MUSIC' ? d.title : d.type === 'VOTE' ? d.topic : d.playlistName);
const detailOf = (d: DropSummary) => (d.type === 'MUSIC' ? d.artist : d.type === 'VOTE' ? `투표 · 후보 ${d.options.length}곡` : `플레이리스트 · ${d.songIds.length}곡`);
const join = (parts: (string | null | undefined)[]) => parts.map(p => p?.trim()).filter(Boolean).join(' · ');

export const quoteNote = (note: string) => `“${note}”`;

export function bubbleText(d: DropSummary, opts: { username?: string | null; lock: DropLock; lockMsg: string }): BubbleText {
  const note = d.content?.trim() || null;
  if (opts.lock.locked) return { quote: note ? quoteNote(note) : null, title: note ? null : '잠긴 드랍', sub: opts.lockMsg, locked: true };
  if (note) return { quote: quoteNote(note), title: null, sub: join([opts.username, kindWord(d), titleOf(d)]), locked: false };
  return { quote: null, title: titleOf(d), sub: join([detailOf(d), opts.username]), locked: false };
}

/** 이보다 넓게(경도 폭) 보고 있으면 고른 핀이 잘 보이게 FOCUS_LNG_DELTA까지 확대한다 (묶음으로 바뀌는 0.04보다 좁게) */
export const FOCUS_MAX_LNG_DELTA = 0.024;
/** 확대할 때의 경도 폭 — 처음 지도 폭과 같다 */
export const FOCUS_LNG_DELTA = 0.012;

/**
 * 고른 드랍으로 카메라를 옮길 곳 — 지금 확대 수준이 적당하면 가운데만(center), 너무 넓게 보고 있으면 확대한 영역(region).
 * 영역을 아직 모르면(지도가 처음 움직이기 전) 처음 지도 크기로.
 */
export function focusCamera(target: Coords, view: MapRegion | null): { center: Coords } | { region: MapRegion } {
  const center = { latitude: target.latitude, longitude: target.longitude };
  if (view && view.longitudeDelta <= FOCUS_MAX_LNG_DELTA) return { center };
  const aspect = view && view.longitudeDelta > 0 ? view.latitudeDelta / view.longitudeDelta : 1.5;
  return { region: { ...center, longitudeDelta: FOCUS_LNG_DELTA, latitudeDelta: FOCUS_LNG_DELTA * aspect } };
}
