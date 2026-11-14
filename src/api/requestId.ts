/**
 * 요청 ID — 요청마다 새로 만들어 `X-Request-Id`로 보낸다.
 * 서버(RequestLoggingFilter)는 이 값을 로그 모든 줄(MDC requestId)에 남기고 응답 헤더로 돌려준다.
 * 같은 값이 앱 오류(ApiError) · Sentry 이벤트(tag request_id) · Amplitude api_error(request_id)에도 붙어
 * "사용자가 본 오류 → Sentry 이벤트 → 서버 로그 한 줄"을 ID 하나로 찾을 수 있다.
 *
 * 형식: UUID v4 (8-4-4-4-12, 36자). 서버 허용 형식 [A-Za-z0-9-]{8,64}에 맞는다.
 * 추적용 무작위 값이라 보안용 난수일 필요는 없다 (crypto.randomUUID가 있으면 그걸 쓴다).
 */
export const REQUEST_ID_HEADER = 'X-Request-Id';

const VALID = /^[A-Za-z0-9-]{8,64}$/;

export const isValidRequestId = (v: unknown): v is string => typeof v === 'string' && VALID.test(v);

type RandomUUID = { randomUUID?: () => string };

export function newRequestId(random: () => number = Math.random): string {
  const native = (globalThis as { crypto?: RandomUUID }).crypto?.randomUUID;
  if (random === Math.random && typeof native === 'function') {
    try {
      const id = native.call((globalThis as { crypto?: RandomUUID }).crypto);
      if (isValidRequestId(id)) return id;
    } catch {
      // 아래 방식으로
    }
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  // 버전 4, variant 10xx (8·9·a·b)
  const variant = (8 + Math.min(3, Math.floor(random() * 4))).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** 응답 헤더의 요청 ID — 서버가 돌려준 값이 형식에 맞으면 그 값, 아니면 보낸 값 */
export function responseRequestId(headers: { get(name: string): string | null } | undefined, sent: string): string {
  let echoed: string | null | undefined;
  try {
    echoed = headers?.get(REQUEST_ID_HEADER);
  } catch {
    echoed = undefined;
  }
  return isValidRequestId(echoed) ? echoed : sent;
}
