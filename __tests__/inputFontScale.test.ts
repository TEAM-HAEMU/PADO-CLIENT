/**
 * 앱의 모든 TextInput이 글자 배율을 1.2배에서 막는지 확인한다 (QA U-03).
 * 다른 글자(T)는 1.2배에서 막히는데 입력칸만 시스템 배율(접근성 최대 약 3.1배)을 그대로 받으면,
 * 고정 높이 칸보다 글자가 커져 자리표시 글자가 칸을 꽉 채우고 g·j·p·q·y 아랫부분이 잘린다.
 * 입력칸을 새로 만들 때 maxFontSizeMultiplier를 빠뜨리면 이 테스트가 잡는다.
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다)
const fs = require('fs') as {
  readFileSync: (p: string, enc: 'utf8') => string;
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[];
};
const path = require('path') as { resolve: (...p: string[]) => string; join: (...p: string[]) => string };

const SRC = path.resolve('src');

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'mock' ? [] : tsxFiles(p);
    return e.name.endsWith('.tsx') ? [p] : [];
  });
}

/** `<TextInput` 부터 그 요소가 닫히는 `/>` 까지 (props 안의 화살표 함수 `=>`는 건너뛴다) */
function inputElements(code: string): string[] {
  const out: string[] = [];
  let i = code.indexOf('<TextInput');
  while (i >= 0) {
    let depth = 0;
    let j = i + 1;
    for (; j < code.length; j++) {
      const ch = code[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth === 0 && ch === '/' && code[j + 1] === '>') break;
      else if (depth === 0 && ch === '>') break;
    }
    out.push(code.slice(i, j + 2));
    i = code.indexOf('<TextInput', j);
  }
  return out;
}

describe('입력칸 글자 배율 (다이내믹 타입)', () => {
  const inputs = tsxFiles(SRC).flatMap(f => inputElements(fs.readFileSync(f, 'utf8')).map(el => ({ file: f.slice(SRC.length + 1), el })));

  it('입력칸을 찾는다 (검사가 비어 통과하지 않게)', () => {
    expect(inputs.length).toBeGreaterThanOrEqual(8);
  });

  it('모든 TextInput이 maxFontSizeMultiplier={1.2}를 가진다', () => {
    const missing = inputs.filter(i => !/maxFontSizeMultiplier=\{1\.2\}/.test(i.el)).map(i => i.file);
    expect(missing).toEqual([]);
  });

  it('고친 세 입력칸은 고정 height 대신 minHeight를 쓴다 (글자가 커지면 칸이 따라 늘어난다)', () => {
    const box = (file: string, marker: string) => {
      const code = fs.readFileSync(path.resolve(SRC, file), 'utf8');
      const at = code.indexOf(marker);
      expect(at).toBeGreaterThan(0);
      return code.slice(code.lastIndexOf('<View', at), at);
    };
    for (const [file, marker] of [
      ['screens/player/CommentsScreen.tsx', '<TextInput value={text}'],
      ['screens/me/NewPlaylistScreen.tsx', '<TextInput autoFocus value={name}'],
      ['screens/detail/AddSongsScreen.tsx', '<TextInput value={q}'],
    ]) {
      const style = box(file, marker);
      expect(style).toMatch(/minHeight: \d+/);
      expect(style).not.toMatch(/[^A-Za-z]height: \d+/);
    }
  });
});
