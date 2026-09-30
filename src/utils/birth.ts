/** 생년월일 입력 보조 (순수 함수 — 테스트 대상) */
/** YYYY-MM-DD 자동 하이픈 */
export const formatBirth = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};

export function validBirth(s: string, context: 'signup' | 'edit' = 'signup'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'YYYY-MM-DD 형식으로 입력해주세요.';
  const [y, m, day] = s.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  // JS Date는 2001-02-29를 3월 1일로 넘겨버리므로 연·월·일이 그대로인지 확인
  if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day || d > new Date()) return '올바른 날짜를 입력해주세요.';
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < day)) age--;
  if (age < 14) return context === 'signup' ? '만 14세 이상만 가입할 수 있어요.' : '만 14세 이상 생년월일만 입력할 수 있어요.';
  return null;
}
