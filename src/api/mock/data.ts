/**
 * 목 서버 시드 데이터 — USE_MOCK=true 일 때만 쓰인다.
 * 좌표는 Figma 기준 위치(부산 강서구 가락대로 1393 부근) 주변.
 * 앨범 아트는 Apple iTunes 공식 아트워크 URL(내부 시안·개발용).
 */
import type { Song, UUID } from '../types';

let seq = 0;
/** UUID v7 모양의 가짜 ID (정렬 가능한 형태만 흉내) */
export const uid = (prefix = '0199a5e0'): UUID => {
  seq += 1;
  // 시드 데이터 ID가 실행마다 같도록 고정 기준값 + 순번 (딥링크·테스트용)
  const hex = (0x19a5e0000000 + seq).toString(16).padStart(12, '0').slice(-12);
  return `${prefix}-${hex.slice(0, 4)}-7${hex.slice(4, 7)}-8${hex.slice(7, 10)}-${hex.padEnd(12, '0')}`;
};

const raw: [string, string, number, string][] = [
  ['난춘', '새소년', 229, 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/9d/83/29/9d832953-ab16-06cc-d0e1-3adf8f5f9e11/SESONEON_NANCHUN_3000.jpg/600x600bb.jpg'],
  ['사건의 지평선', '윤하', 301, 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/43/cd/c8/43cdc862-d91b-de64-9d21-e6f6a16fbf61/cover_KM0014976_1.jpg/600x600bb.jpg'],
  ['Everything', '검정치마', 293, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/be/ce/5c/bece5cff-2caf-6d8a-9c21-3035537d2a4d/Album_cover_1400X1400.jpg/600x600bb.jpg'],
  ['긴 꿈', '새소년', 258, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f1/a9/41/f1a941bb-130d-9f75-be43-5f73389feb6a/8809380636494.jpg/600x600bb.jpg'],
  ['파도', '새소년', 282, 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/3c/c8/ee/3cc8ee7b-6905-844f-25f4-fcf8b3f06d16/8809380636319.jpg/600x600bb.jpg'],
  ['자유', '새소년', 236, 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0d/bf/2c/0dbf2c33-54a2-d09d-f68d-5888f4334ec4/SESONEON_Jayu_3000.jpg/600x600bb.jpg'],
  ['Bubble Gum', 'NewJeans', 200, 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/bf/68/ca/bf68ca64-4acd-543f-bc78-455f11f06105/196922889738_Cover.jpg/600x600bb.jpg'],
  ['TOMBOY', 'HYUKOH', 242, 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/20/de/43/20de43fe-733e-3734-cab9-7bd787411260/Cover_HYUKOH_23.jpg/600x600bb.jpg'],
  ['주저하는 연인들을 위해', '잔나비', 265, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/fc/a9/b2/fca9b2d4-b1ed-92e8-2e5f-1838d77cbce7/cover-_NEW.jpg/600x600bb.jpg'],
  ['Let It Happen', 'Tame Impala', 467, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a8/2e/b4/a82eb490-f30a-a321-461a-0383c88fec95/15UMGIM23316.rgb.jpg/600x600bb.jpg'],
  ['Pink + White', 'Frank Ocean', 185, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/bb4568f3-68cd-619d-fbcb-4e179916545d/BlondCover-Final.jpg/600x600bb.jpg'],
  ['밤편지', '아이유', 253, 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/dc/12/fe/dc12fe03-172b-a843-0d96-12819fa05b6c/cover-.jpg/600x600bb.jpg'],
  ['Robbers', 'The 1975', 255, 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/7f/3b/6e/7f3b6e0f-ac35-98ff-f27f-fc51db0efea4/13UAAIM67470.rgb.jpg/600x600bb.jpg'],
  ['Square', '백예린', 262, 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ca/58/77/ca5877d9-2e1e-0456-c3b2-7704e423dc70/Every_letter_I_sent_you_3000.jpg/600x600bb.jpg'],
];

export const seedSongs: Song[] = raw.map(([title, artist, duration, art], i) => ({
  id: `0199a5e0-2222-7abc-8def-${String(i + 1).padStart(12, '0')}`,
  title,
  artist,
  duration,
  albumImagePath: art,
  links: {
    spotify: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
    youtubeMusic: `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
  },
}));

export const songByTitle = (t: string) => seedSongs.find(s => s.title === t)!;

/** 기준 위치 — 가락대로 1393 (OSM 기준 가락대로1397번길 교차점 남쪽) */
export const HOME = { latitude: 35.1889, longitude: 128.9038 };
