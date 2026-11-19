/**
 * 혜택·소식(광고성) 알림 수신 동의·철회 처리 결과 문구 — 정보통신망법이 요구하는 처리 결과 통지 (네이티브 의존 없음).
 * 날짜는 서버 응답의 marketingUpdatedAt(동의·철회한 시각)을 한국 시간 날짜로. 없거나 읽을 수 없으면 지금 시각으로
 * 계약: handoff/push-marketing-contract.md '앱'
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 오프셋이 없는 서버 시각은 UTC로 본다 (utils/format과 같은 규칙) */
const parse = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);

/** 한국 시간 날짜 — 2026년 11월 19일 */
export function kstDateLabel(at: Date): string {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/** "2026년 11월 19일 혜택·소식 알림 수신에 동의했어요" / "…수신을 거부했어요" */
export function marketingResultText(agreed: boolean, updatedAt: string | null | undefined, now: Date = new Date()): string {
  const d = updatedAt ? parse(updatedAt) : null;
  const at = d && !Number.isNaN(d.getTime()) ? d : now;
  return `${kstDateLabel(at)} 혜택·소식 알림 수신${agreed ? '에 동의했어요' : '을 거부했어요'}`;
}
