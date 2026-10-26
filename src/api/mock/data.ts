/**
 * 목 서버 시드 데이터 — USE_MOCK=true 일 때만 쓰인다.
 * 좌표는 Figma 기준 위치(부산 강서구 가락대로 1393 부근) 주변.
 * 앨범 아트는 직접 만든 가상 커버(covers.ts) — 실제 앨범 아트는 스토어 스크린샷에 쓰면 안 된다 (App Store 5.2.1).
 */
import type { Song, UUID } from '../types';
import { MOCK_COVERS } from './covers';

let seq = 0;
/** UUID v7 모양의 가짜 ID (정렬 가능한 형태만 흉내) */
export const uid = (prefix = '0199a5e0'): UUID => {
  seq += 1;
  // 시드 데이터 ID가 실행마다 같도록 고정 기준값 + 순번 (딥링크·테스트용)
  const hex = (0x19a5e0000000 + seq).toString(16).padStart(12, '0').slice(-12);
  return `${prefix}-${hex.slice(0, 4)}-7${hex.slice(4, 7)}-8${hex.slice(7, 10)}-${hex.padEnd(12, '0')}`;
};

const raw: [string, string, number][] = [
  ['난춘', '새소년', 229],
  ['사건의 지평선', '윤하', 301],
  ['Everything', '검정치마', 293],
  ['긴 꿈', '새소년', 258],
  ['파도', '새소년', 282],
  ['자유', '새소년', 236],
  ['Bubble Gum', 'NewJeans', 200],
  ['TOMBOY', 'HYUKOH', 242],
  ['주저하는 연인들을 위해', '잔나비', 265],
  ['Let It Happen', 'Tame Impala', 467],
  ['Pink + White', 'Frank Ocean', 185],
  ['밤편지', '아이유', 253],
  ['Robbers', 'The 1975', 255],
  ['Square', '백예린', 262],
];

export const seedSongs: Song[] = raw.map(([title, artist, duration], i) => ({
  id: `0199a5e0-2222-7abc-8def-${String(i + 1).padStart(12, '0')}`,
  title,
  artist,
  duration,
  albumImagePath: MOCK_COVERS[i % MOCK_COVERS.length],
  links: {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    youtubeMusic: `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
  },
}));

export const songByTitle = (t: string) => seedSongs.find(s => s.title === t)!;

/** 기준 위치 — 가락대로 1393 (OSM 기준 가락대로1397번길 교차점 남쪽) */
export const HOME = { latitude: 35.1889, longitude: 128.9038 };
