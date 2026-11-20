/**
 * 짧은 화면(분할 화면 · 플립 커버 · 아주 작은 폰, 높이 ≲ 560dp)에서 크기를 정하는 계산 — 네이티브 의존 없음 (jest에서 바로 시험)
 * QA 2026-11-20 Z-02(핀 미리보기 디스크 사라짐) · Z-04(시트가 상태 표시줄 밑까지) · Z-06(플레이어 하단 버튼 잘림)
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 시트 꼭대기와 상단 안전영역(상태 표시줄 · 노치) 사이에 남길 틈 */
export const SHEET_TOP_GAP = 8;

/**
 * 시트가 올라갈 수 있는 최대 높이 — 시트를 담은 화면 높이에서 상단 안전영역 + 틈을 뺀 만큼.
 * 화면이 따로 준 maxHeight('70%' 같은 화면 기준 % 또는 숫자)가 있으면 둘 중 작은 쪽.
 * 화면 높이를 아직 모르면(첫 렌더) 화면이 준 값을 그대로 돌려준다.
 */
export function sheetMaxHeight(containerH: number, insetTop: number, requested?: unknown): number | string | undefined {
  const req = typeof requested === 'number' || (typeof requested === 'string' && requested) ? requested : undefined;
  if (!(containerH > 0)) return req;
  const safe = Math.max(0, Math.floor(containerH - insetTop - SHEET_TOP_GAP));
  let wanted = Infinity;
  if (typeof req === 'number') wanted = req;
  else if (typeof req === 'string') {
    const m = req.trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (m) wanted = (containerH * Number(m[1])) / 100;
    else return req; // 알 수 없는 형식은 건드리지 않는다
  }
  return Math.min(safe, Math.floor(wanted));
}

/** 내용이 보이는 높이보다 길면 스크롤 (반올림 오차 1 허용) */
export const overflows = (contentH: number, viewH: number) => viewH > 0 && contentH > viewH + 1;

// ── 핀 미리보기 알약(앨범 아트) — Figma 316×421
export const PIN_CAP_MAX = 421;
/** 이보다 작으면 주소 · 곡명 줄과 재생 버튼(58)이 알약 안에 같이 들어가지 않는다 (iPhone SE 계산값 237) */
export const PIN_CAP_MIN = 200;
/** 시트 아래 내용(미리듣기 표기 · 한마디 카드 · 좋아요/음악 앱 줄 · 하단 여백) + 지도 머리(동 이름) 몫 */
export const PIN_RESERVED = 410;

/**
 * 알약 높이 — 큰 화면에선 시트가 지도 머리를 가리지 않게 화면에 맞춰 줄이고,
 * 짧은 화면에선 최소 크기를 지킨다 (그 대신 시트 아래 내용이 스크롤된다). 예전엔 최소값이 없어 높이 ~435dp 아래면 0 이하가 됐다.
 */
export function pinCapsuleHeight(windowH: number, insetTop: number): number {
  return Math.round(clamp(windowH - insetTop - PIN_RESERVED, PIN_CAP_MIN, PIN_CAP_MAX));
}

/**
 * 알약 안 재생 버튼의 위 끝 — 가운데가 기본이고, 알약이 작아 가운데가 위쪽 글자(주소 · 곡명)와 겹치면 글자 아래로 내린다.
 * innerH: 테두리 안쪽 높이, textBottom: 글자 묶음의 아래 끝(안쪽 기준)
 */
export function pinPlayTop(innerH: number, size: number, textBottom: number, gap = 6): number {
  return Math.max((innerH - size) / 2, textBottom + gap);
}

// ── 플레이어 (재생 화면)
export type PlayerLayout = {
  /** iPhone SE·mini 등 (높이 < 760) — 간격 · 파형을 줄인다 */
  compact: boolean;
  /** 분할 화면 · 플립 커버처럼 아주 짧은 화면 — 디스크를 남은 높이에 맞추고 말풍선은 하나만 */
  tight: boolean;
  disc: number;
  /** 위 묶음(디스크~재생 줄) ↔ 말풍선 */
  gap: number;
  /** 디스크 · 제목 · 파형 · 재생 줄 사이 */
  innerGap: number;
  waveH: number;
  bubbles: number;
};

/** 플레이어 디스크 최소 지름 — 이보다 짧은 화면은 화면을 스크롤한다 */
export const PLAYER_DISC_MIN = 88;
// 디스크 말고 세로로 쌓이는 것들 (T 글자 줄 높이 기준): 제목 30 + 2 + 가수 18 · 시간 줄 8 + 14 · 재생 버튼 50 · 말풍선 한 줄 14 + 10
const TITLE_H = 50;
const TIME_H = 22;
const CONTROLS_H = 50;
const BUBBLE_H = 24;
const BUBBLE_GAP = 8;

/**
 * 재생 화면 세로 배치 — 상단 바(44)와 아래 안전영역을 뺀 높이에 디스크 · 제목 · 파형 · 재생 줄 · 말풍선이 다 들어가게.
 * 예전엔 높이 760 기준 하나뿐이라 높이 411dp에선 '이 곡에 한마디'가 화면 밖으로 잘렸다.
 * 원래 배치로 디스크가 거의 그대로 들어가는 화면(iPhone SE 이상 · 흔한 폰)은 예전과 똑같이 둔다.
 * comments: 최근 댓글 수 (없으면 '이 곡에 한마디' 한 줄)
 */
export function playerLayout(width: number, height: number, insetTop: number, insetBottom: number, comments = 0): PlayerLayout {
  const contentW = Math.min(width - 54, 400);
  const compact = height < 760;
  const avail = height - (insetTop + 4 + 44) - (insetBottom + 8);
  const shown = (max: number) => (comments > 0 ? Math.min(comments, max) : 1);
  const rest = (gap: number, innerGap: number, waveH: number, bubbles: number) =>
    innerGap * 3 + TITLE_H + waveH + TIME_H + CONTROLS_H + gap + bubbles * BUBBLE_H + (bubbles - 1) * BUBBLE_GAP;
  const base = { compact, gap: compact ? 20 : 40, innerGap: compact ? 18 : 28, waveH: compact ? 44 : 60, bubbles: compact ? 2 : 3 };
  const wanted = Math.round(Math.min(contentW, height * (compact ? 0.33 : 0.4)));
  const fit = avail - rest(base.gap, base.innerGap, base.waveH, shown(base.bubbles));
  if (fit >= wanted * 0.85) return { ...base, tight: false, disc: wanted };
  const tight = { compact, gap: 12, innerGap: 12, waveH: 32, bubbles: 1 };
  const disc = clamp(avail - rest(tight.gap, tight.innerGap, tight.waveH, 1), PLAYER_DISC_MIN, wanted);
  return { ...tight, tight: true, disc: Math.round(disc) };
}
