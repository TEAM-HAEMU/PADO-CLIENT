/** react-native-maps addressForCoordinate 결과 → 표시용 주소. iOS는 빈 필드를 "(null)" 문자열로 준다. */
export interface GeoAddress {
  name?: string | null;
  thoroughfare?: string | null;
  subThoroughfare?: string | null;
  locality?: string | null;
  subLocality?: string | null;
  administrativeArea?: string | null;
  subAdministrativeArea?: string | null;
}

const clean = (v?: string | null) => {
  const s = (v ?? '').trim();
  return !s || s === '(null)' || s === 'null' ? '' : s;
};

export function formatAddress(a: GeoAddress): { dong: string; full: string } {
  const dong = clean(a.subLocality) || clean(a.locality) || clean(a.name);
  const parts = [a.administrativeArea, a.subAdministrativeArea || a.locality, a.locality, a.subLocality, a.thoroughfare, a.subThoroughfare]
    .map(clean)
    .filter(Boolean);
  const full = parts.filter((p, i) => parts.indexOf(p) === i).join(' ');
  return { dong, full: full || dong };
}
