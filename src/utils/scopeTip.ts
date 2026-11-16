/**
 * 보기·재생 범위가 바뀌었을 때 지도 위 지역 이름 아래에 한 번 띄우는 안내 문구.
 * 운영자가 어드민에서 설정을 바꾸면 따로 공지를 쓰지 않아도 앱이 처음 알아챈 때 한 번 알려 준다.
 * 비교는 모드·단위·반경만 (내가 움직여 지역 이름이 바뀐 것은 설정 변경이 아님). 네이티브 의존 없음 (jest에서 바로 시험)
 */
import type { DropRadius, RegionUnit } from '@/api/types';
import { formatRadius } from '@/utils/geo';
import { shortRegionName } from '@/utils/dropScope';

/** 설정 중 사용자에게 보이는 규칙만 — 이 값이 바뀌면 안내한다 */
export interface ScopeSig {
  mode: DropRadius['mode'];
  regionUnit: RegionUnit | null;
  displayMeters: number | null;
  playMode: DropRadius['playMode'];
  playRegionUnit: RegionUnit | null;
  playMeters: number;
}

export const scopeSig = (r: DropRadius): ScopeSig => ({
  mode: r.mode,
  regionUnit: r.mode === 'REGION' ? r.regionUnit : null,
  displayMeters: r.mode === 'DISTANCE' ? r.displayMeters : null,
  playMode: r.playMode,
  playRegionUnit: r.playMode === 'REGION' ? r.playRegionUnit : null,
  playMeters: r.playMeters,
});

const UNIT_WORD: Record<RegionUnit, string> = { SIDO: '시·도', SIGUNGU: '시·군·구', DONG: '동' };

/** 저장해 둔 값이 이 모양인지 (예전 앱이 남긴 값·깨진 값은 null) */
export function readSig(v: unknown): ScopeSig | null {
  const s = v as Partial<ScopeSig> | null;
  if (!s || typeof s !== 'object' || (s.mode !== 'DISTANCE' && s.mode !== 'REGION') || (s.playMode !== 'DISTANCE' && s.playMode !== 'REGION') || typeof s.playMeters !== 'number') return null;
  return { mode: s.mode, regionUnit: s.regionUnit ?? null, displayMeters: s.displayMeters ?? null, playMode: s.playMode, playRegionUnit: s.playRegionUnit ?? null, playMeters: s.playMeters };
}

const sameView = (a: ScopeSig, b: ScopeSig) => a.mode === b.mode && a.regionUnit === b.regionUnit && a.displayMeters === b.displayMeters;
const samePlay = (a: ScopeSig, b: ScopeSig) => a.playMode === b.playMode && a.playRegionUnit === b.playRegionUnit && a.playMeters === b.playMeters;

/** 말풍선 문구 — 큰 줄(title) 하나와, 둘 다 바뀌었을 때 받치는 줄(body) */
export interface ScopeTipText { title: string; body: string | null }

/**
 * "이제 해운대구 전체 드랍이 보여요" / "이제 전국 드랍이 보여요" / "이제 3km 안 드랍이 보여요".
 * 지도 위 이름은 내가 있는 동("중동")이라, 더 넓은 지역은 '전체'를 붙여 동보다 넓은 범위라는 게 보이게
 */
function viewLine(r: DropRadius) {
  if (r.mode === 'REGION') {
    const where = r.region ? shortRegionName(r.region.name) : `내가 있는 ${r.regionUnit ? UNIT_WORD[r.regionUnit] : '지역'}`;
    return r.regionUnit === 'DONG' ? `이제 ${where} 드랍이 다 보여요` : `이제 ${where} 전체 드랍이 보여요`;
  }
  return r.displayMeters === null ? '이제 전국 드랍이 보여요' : `이제 ${formatRadius(r.displayMeters)} 안 드랍이 보여요`;
}

/** "중동 안 드랍은 멀어도 들을 수 있어요" / "300m 안에 들어오면 들을 수 있어요" */
function playLine(r: DropRadius) {
  if (r.playMode === 'REGION') {
    const where = r.playRegion ? shortRegionName(r.playRegion.name) : `같은 ${r.playRegionUnit ? UNIT_WORD[r.playRegionUnit] : '지역'}`;
    return `${where} 안 드랍은 멀어도 들을 수 있어요`;
  }
  return `${formatRadius(r.playMeters)} 안에 들어오면 들을 수 있어요`;
}

/**
 * 지난번에 알려 준 설정(seen)과 지금 설정을 비교해 띄울 문구. 처음(seen 없음)이거나 바뀐 게 없으면 null.
 * 보기가 바뀌었으면 그게 큰 줄, 재생도 바뀌었으면 받치는 줄. 재생만 바뀌었으면 그게 큰 줄
 */
export function scopeTip(seen: ScopeSig | null, r: DropRadius): ScopeTipText | null {
  if (!seen) return null;
  const now = scopeSig(r);
  const view = !sameView(seen, now) ? viewLine(r) : null;
  const play = !samePlay(seen, now) ? playLine(r) : null;
  if (view) return { title: view, body: play };
  return play ? { title: play, body: null } : null;
}
