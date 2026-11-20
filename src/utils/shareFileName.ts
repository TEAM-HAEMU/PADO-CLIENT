/**
 * 공유 카드 이미지의 파일 이름 (QA U-04 a). 받는 쪽(메시지·메일·파일 앱)에 이 이름이 그대로 보인다.
 * 'pado-<곡 제목>.png' — 파일 이름에 못 쓰는 문자(/ \ : * ? " < > | 와 제어 문자)는 '-'로 바꾸고,
 * 이모지·한글은 그대로 두되 코드 포인트 단위로 40자에서 자른다 (이모지를 반으로 자르지 않게).
 */
const MAX = 40;

export function shareFileName(title: string | null | undefined, ext = 'png'): string {
  const cleaned = (title ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ') // 줄바꿈·탭도 공백 하나로
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '-') // eslint-disable-line no-control-regex
    .replace(/-{2,}/g, '-')
    .trim()
    .replace(/^[.\- ]+|[.\- ]+$/g, ''); // 앞의 '.'은 숨김 파일이 되고, 끝의 '.'·공백은 일부 앱이 떼어 낸다
  const short = Array.from(cleaned).slice(0, MAX).join('').replace(/[\u200d\ufe0f]+$/, '').trim(); // 자른 끝에 남은 이모지 잇개(ZWJ)·변형 선택자는 뗀다
  return `pado${short ? `-${short}` : '-drop'}.${ext}`;
}
