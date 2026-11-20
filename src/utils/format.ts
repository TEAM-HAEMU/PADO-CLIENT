/** 날짜·시간 표시 (서버 시각은 ISO; createdAt은 오프셋 없는 로컬 표기일 수 있음) */
const parse = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);

export function formatRelative(iso: string, now = Date.now()) {
  const d = parse(iso).getTime();
  const diff = Math.max(0, now - d) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  const x = parse(iso);
  return `${x.getMonth() + 1}월 ${x.getDate()}일`;
}

export function formatDateTime(iso: string) {
  const x = parse(iso);
  return `${x.getMonth() + 1}월 ${x.getDate()}일 ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatTotal(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

/**
 * 무제한 드랍 — 서버는 만료 시각을 먼 미래 고정값(9999-12-31)으로 준다. 2100년 이후면 무제한으로 본다.
 * 만료 시각이 없거나 읽을 수 없어도(옛 응답·잘못된 값) 남은 시간을 말하지 않는다.
 */
const UNLIMITED_FROM = Date.UTC(2100, 0, 1);

export function isUnlimitedExpiry(iso: string | null | undefined) {
  if (!iso) return true;
  const t = parse(iso).getTime();
  return Number.isNaN(t) || t >= UNLIMITED_FROM;
}

/** 드랍 만료까지 남은 시간 — "3일 남음" / "5시간 남음" / "곧 사라져요". 무제한이면 null(문구를 아예 안 보여 줌) */
export function expiryLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (isUnlimitedExpiry(iso)) return null;
  const left = parse(iso!).getTime() - now;
  if (left <= 0) return '만료됨';
  const h = left / 3_600_000;
  if (h < 1) return '곧 사라져요';
  if (h < 24) return `${Math.floor(h)}시간 남음`;
  return `${Math.floor(h / 24)}일 남음`;
}
