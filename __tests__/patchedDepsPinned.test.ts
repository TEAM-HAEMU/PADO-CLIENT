/**
 * patch-package로 고친 라이브러리는 정확한 버전으로 고정한다.
 * 패치 파일 이름(패키지+버전.patch)과 package.json 버전이 어긋나면, lock을 다시 만들 때 다른 버전이 깔리고 패치가 조용히 안 맞는다.
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다 — mapsLifecyclePatch.test.ts와 같은 방식)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string; readdirSync: (p: string) => string[] };
const path = require('path') as { resolve: (...p: string[]) => string };

const root = path.resolve('.');
// 모듈로 만들어 다른 테스트 파일의 전역 fs·path 선언과 겹치지 않게
export {};
const pkg = JSON.parse(fs.readFileSync(path.resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.resolve(root, 'package-lock.json'), 'utf8'));
const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

const patches = fs.readdirSync(path.resolve(root, 'patches')).filter((f: string) => f.endsWith('.patch'));

describe('패치 대상 라이브러리 버전 고정', () => {
  for (const file of patches) it(file, () => {
    // 파일 이름: @scope+name+1.2.3.patch 또는 name+1.2.3.patch
    const m = file.replace(/\.patch$/, '').match(/^(.*)\+(\d[^+]*)$/);
    expect(m).not.toBeNull();
    const name = m![1].replace('+', '/');
    const version = m![2];
    expect(deps[name]).toBe(version);
    expect(lock.packages[''].dependencies?.[name] ?? lock.packages[''].devDependencies?.[name]).toBe(version);
    expect(lock.packages[`node_modules/${name}`].version).toBe(version);
  });
  it('패치가 하나 이상 있다', () => expect(patches.length).toBeGreaterThan(0));
});
