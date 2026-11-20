/** 미니 디스크 크기·자리 — 탭 화면들이 아래 여백을 맞출 수 있게 가벼운 모듈로 따로 둔다 (MiniDisc.tsx는 SVG·애니메이션을 끌고 온다) */
export const MINI_DISC_SIZE = 52;
/** 진행률 테두리까지 */
export const MINI_DISC_RING = MINI_DISC_SIZE + 8;
/** 지도 밖 탭 화면(플리·프로필)에서 원이 뜨는 높이 (하단 안전 영역 위) */
export const MINI_DISC_TAB_BOTTOM = 112;
/**
 * 탭 화면 스크롤 콘텐츠의 아래 여백 (하단 안전 영역은 빼고) — 맨 아래까지 내리면 마지막 줄이 원 위로 올라와 가려지지 않게.
 * 원이 뜨는 높이 + 원 높이(테두리 포함) + 12 (QA U-04 b)
 */
export const MINI_DISC_CLEARANCE = MINI_DISC_TAB_BOTTOM + MINI_DISC_RING + 12;
