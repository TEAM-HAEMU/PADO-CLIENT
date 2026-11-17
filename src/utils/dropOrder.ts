/**
 * 드랍 목록을 최신순으로 — 모든 항목에 읽을 수 있는 만든 시각(createdAt)이 있을 때만 정렬한다.
 * 하나라도 없거나 읽을 수 없으면 서버가 준 순서를 그대로 둔다 (일부만 정렬하면 순서가 뒤섞이므로).
 * 시각이 같으면 원래 순서 유지 (Array.prototype.sort는 안정 정렬).
 */
export function newestFirst<T extends { createdAt?: string | null }>(drops: readonly T[]): readonly T[] {
  const times = drops.map(d => (d.createdAt ? Date.parse(d.createdAt) : NaN));
  if (!drops.length || times.some(t => Number.isNaN(t))) return drops;
  return drops.map((d, i) => ({ d, t: times[i] })).sort((a, b) => b.t - a.t).map(x => x.d);
}
