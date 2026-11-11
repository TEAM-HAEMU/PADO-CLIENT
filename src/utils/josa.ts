/**
 * 받침에 맞는 조사 — '라일락을' / 'Hype Boy를'.
 * 영문·숫자로 끝나면 읽는 소리로 어림한다 (l·m·n·ng·k·p·t 로 끝나면 받침 있음, 숫자는 한국어 읽기 기준).
 */
const DIGIT_FINAL = '0136780'; // 영·일·삼·육·칠·팔·십 — 받침 있음 ('0'은 영)

function hasFinal(word: string): boolean {
  const w = word.trim().replace(/[\s'"’”)\]}.,!?~]+$/, '');
  const ch = w.at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/\d/.test(ch)) return DIGIT_FINAL.includes(ch);
  if (/[a-z]/i.test(ch)) return /(ng|[lmnkpt])$/i.test(w);
  return false;
}

/** josa('Hype Boy', '을', '를') → '를' */
export const josa = (word: string, withFinal: string, withoutFinal: string) => (hasFinal(word) ? withFinal : withoutFinal);
