/** 위치 계산 (네이티브 의존 없음) */
export interface Coords { latitude: number; longitude: number }

/** 두 좌표 사이 거리(m) */
export function distanceM(a: Coords, b: Coords) {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function formatDistance(m: number) {
  if (m < 10) return '바로 여기';
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** 반경 표시 — 500 → '500m', 5000 → '5km', 1500 → '1.5km' */
export function formatRadius(m: number) {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${Number((m / 1000).toFixed(1))}km`;
}
