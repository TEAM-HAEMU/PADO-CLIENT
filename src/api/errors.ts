import type { ApiErrorBody } from './types';

/** 서버 오류 → 앱에서 쓰는 에러. code는 명세의 오류 코드(S1, U2, D1 …) */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback = '요청을 처리하지 못했어요.') {
    super(body?.message || fallback);
    this.name = 'ApiError';
    this.code = body?.code || (status === 0 ? 'NETWORK' : `HTTP_${status}`);
    this.status = status;
  }
}

/** 명세 오류 코드 → 사용자에게 보여줄 문장. 서버 message보다 우선할 때만 정의 */
const FRIENDLY: Record<string, string> = {
  NETWORK: '네트워크에 연결할 수 없어요. 잠시 후 다시 시도해주세요.',
  U1: '가입되지 않은 이메일이에요.',
  U4: '이미 가입된 이메일이에요. 탈퇴한 지 90일이 안 됐다면 로그인하면 계정이 복구돼요.',
  U5: '비밀번호가 올바르지 않아요.',
  U7: '소셜 로그인으로 가입한 계정이에요. 소셜 로그인을 이용해주세요.',
  U8: '같은 이메일로 가입된 다른 소셜 계정이 있어요.',
  U9: '로그인이 만료됐어요. 다시 로그인해주세요.',
  U13: '가입 시간이 지났어요. 소셜 로그인부터 다시 해주세요.',
  U14: '이메일을 입력해주세요.',
  U15: '이미 가입된 계정이에요. 다시 로그인할게요.',
  U16: '이 이메일은 이메일 로그인으로 가입돼 있어요.',
  U17: '소셜 로그인 정보가 만료됐어요. 다시 시도해주세요.',
  U18: '소셜 로그인 서버와 연결할 수 없어요.',
  U19: '만 14세 이상만 가입할 수 있어요.',
  U20: '필수 약관에 동의해주세요.',
  D1: '바로 이 자리(1m 안)에 이미 드랍이 있어요. 조금 옮겨서 다시 드랍해주세요.',
  D2: '드랍을 찾을 수 없어요. 만료됐거나 삭제된 드랍이에요.',
  D3: '곡 정보를 찾을 수 없어요.',
  D4: '지금은 음악 검색을 할 수 없어요. 잠시 후 다시 시도해주세요.',
  D5: '내가 만든 드랍만 삭제할 수 있어요.',
  D6: '유효하지 않은 투표 선택지예요.',
  D10: '내 플레이리스트만 드랍할 수 있어요.',
  P3: '이미 담긴 곡이에요.',
  R3: '이미 신고한 대상이에요.',
  B1: '나 자신은 차단할 수 없어요.',
  F1: '지금은 프로필 사진을 올릴 수 없어요. (서버 저장소 준비 중)',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // 제재(U21/U22)는 서버 message에 해제 시각이 들어 있으므로 그대로 노출
    if (e.code === 'U21' || e.code === 'U22') return e.message;
    return FRIENDLY[e.code] ?? e.message;
  }
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류가 발생했어요.';
}
