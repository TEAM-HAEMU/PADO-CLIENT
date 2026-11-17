/**
 * 드랍 목록을 최신순으로 — 모든 항목에 읽을 수 있는 만든 시각(createdAt)이 있을 때만 정렬한다.
 * 하나라도 없거나 읽을 수 없으면 서버가 준 순서를 그대로 둔다 (일부만 정렬하면 순서가 뒤섞이므로).
 * 시각이 같으면 원래 순서 유지 (Array.prototype.sort는 안정 정렬).
 */
/**
 * 만든 시각 → ms. 백엔드는 Java LocalDateTime이라 소수 초가 6자리(Postgres)로 오거나 시간대가 없을 수 있다.
 * Hermes의 Date.parse는 소수 초가 3자리를 넘으면 NaN을 줄 수 있어 3자리로 자른다 (날짜·시각 사이 공백도 T로).
 * 시간대가 없으면 기기 시간대로 읽는다 — 한 응답 안에서는 모두 같은 형식이라 순서 비교에는 영향이 없다.
 */
export function createdAtMs(value: string | null | undefined): number {
  if (!value) return NaN;
  const iso = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T').replace(/(\.\d{3})\d+/, '$1');
  return Date.parse(iso);
}

export function newestFirst<T extends { createdAt?: string | null }>(drops: readonly T[]): readonly T[] {
  const times = drops.map(d => createdAtMs(d.createdAt));
  if (!drops.length || times.some(t => Number.isNaN(t))) return drops;
  return drops.map((d, i) => ({ d, t: times[i] })).sort((a, b) => b.t - a.t).map(x => x.d);
}
