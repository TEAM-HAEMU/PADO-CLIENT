/**
 * 앨범 아트 크기 맞추기 — 백엔드는 Spotify 640px 이미지를 준다.
 * 작은 썸네일·지도 마커는 300px/64px 판본으로 받아 데이터와 마커 스냅샷 비용을 줄인다.
 * (Spotify 이미지 URL의 크기 접두어: 640=ab67616d0000b273, 300=ab67616d00001e02, 64=ab67616d00004851)
 */
export function artUrl(uri: string | null | undefined, displaySize: number): string | null | undefined {
  if (!uri || !uri.includes('i.scdn.co/image/ab67616d0000b273')) return uri;
  const px = displaySize * 3; // @3x 기준
  if (px <= 64 * 1.5) return uri.replace('ab67616d0000b273', 'ab67616d00004851');
  if (px <= 300 * 1.2) return uri.replace('ab67616d0000b273', 'ab67616d00001e02');
  return uri;
}
