/**
 * patch-package로 고친 라이브러리는 정확한 버전으로 고정한다.
 * 패치 파일 이름(패키지+버전.patch)과 package.json 버전이 어긋나면, lock을 다시 만들 때 다른 버전이 깔리고 패치가 조용히 안 맞는다.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

const patches = fs.readdirSync(path.join(root, 'patches')).filter(f => f.endsWith('.patch'));

describe('패치 대상 라이브러리 버전 고정', () => {
  it.each(patches)('%s', file => {
    // 파일 이름: @scope+name+1.2.3.patch 또는 name+1.2.3.patch
    const m = file.replace(/\.patch$/, '').match(/^(.*)\+(\d[^+]*)$/);
    expect(m).not.toBeNull();
    const name = m![1].replace('+', '/');
    const version = m![2];
    expect(deps[name]).toBe(version);
    expect(lock.packages[''].dependencies?.[name] ?? lock.packages[''].devDependencies?.[name]).toBe(version);
    expect(lock.packages[`node_modules/${name}`].version).toBe(version);
  });
});
