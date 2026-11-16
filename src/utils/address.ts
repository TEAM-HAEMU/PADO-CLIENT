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

/**
 * 주소 → 대략적 지역 (시·도 + 시·군·구). 분석 공통 속성용 — 동·도로명·번지는 버린다.
 * "부산광역시 해운대구 우동 1408" → "부산광역시 해운대구", "경기도 성남시 분당구 정자동" → "경기도 성남시 분당구",
 * "세종특별자치시 한누리대로 2130" → "세종특별자치시". 한국 주소 모양이 아니면 null
 */
export function regionOf(address: string | null | undefined): string | null {
  const words = (address ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || !/(도|시)$/.test(words[0])) return null;
  const out = [words[0]];
  for (const w of words.slice(1, 3)) {
    if (!/(시|군|구)$/.test(w)) break;
    out.push(w);
  }
  return out.join(' ');
}

/** 드랍의 장소 표시에 쓰는 필드 — 목록·상세·좋아요 응답 공통 (음악 상세엔 둘 다 없을 수 있다) */
export interface DropPlaceFields { placeName?: string | null; address?: string | null }

const text = (v: unknown) => (typeof v === 'string' ? clean(v) : '');

/**
 * 드랍 자리 표시 — 서버가 찾은 장소 이름(placeName)이 있으면 그것을 먼저, 없으면 지금처럼 주소. 둘 다 없으면 ''.
 * 여러 출처(상세 응답, 받아 둔 목록)를 주면 어느 출처의 장소 이름이든 주소보다 앞선다 (앞 출처가 먼저)
 */
export function dropPlace(...from: (DropPlaceFields | null | undefined)[]): string {
  for (const d of from) { const p = text(d?.placeName); if (p) return p; }
  for (const d of from) { const a = text(d?.address); if (a) return a; }
  return '';
}
