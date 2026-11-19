/**
 * react-native-video Android 패치(patches/react-native-video+*.patch)가 적용돼 있는지 확인한다 (QA B-06 재확인).
 * 패치가 빠지면 곡이 끝나 포커스를 놓은 뒤(onStopPlayback) hasAudioFocus가 true로 남아, 같은 플레이어로 다음 곡을 틀 때
 * requestAudioFocus()가 요청을 건너뛴다 → 포커스 없이 재생돼 두 번째 전화부터는 멈추지 않는다.
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다 — mapsLifecyclePatch.test.ts와 같은 방식)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string };
const path = require('path') as { resolve: (...p: string[]) => string };
export {};

const view = fs.readFileSync(path.resolve('node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java'), 'utf8');
/** 메서드 하나의 본문 (여는 중괄호부터 짝이 맞는 닫는 중괄호까지) */
const body = (signature: string) => {
  const start = view.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = view.indexOf('{', start); i < view.length; i++) {
    if (view[i] === '{') depth++;
    else if (view[i] === '}' && --depth === 0) return view.slice(start, i + 1);
  }
  return '';
};

describe('react-native-video Android 오디오 포커스 패치', () => {
  it('포커스를 놓을 때(onStopPlayback) hasAudioFocus도 false로 내린다', () => {
    const stop = body('private void onStopPlayback()');
    expect(stop).toMatch(/abandonAudioFocus\(/);
    expect(stop).toMatch(/hasAudioFocus\s*=\s*false;/);
  });

  it('requestAudioFocus는 hasAudioFocus가 true면 요청을 건너뛴다 (패치가 필요한 전제 — 라이브러리가 바뀌면 다시 확인)', () => {
    expect(body('private boolean requestAudioFocus()')).toMatch(/this\.hasAudioFocus\)\s*{\s*return true;/);
  });

  it('곡이 끝나면(STATE_ENDED) onStopPlayback으로 포커스를 놓는다 (다음 곡은 같은 플레이어로 이어 틀어 포커스를 다시 요청해야 한다)', () => {
    const ended = view.slice(view.indexOf('case Player.STATE_ENDED:'), view.indexOf('default:', view.indexOf('case Player.STATE_ENDED:')));
    expect(ended).toMatch(/onStopPlayback\(\);/);
  });

  it('패치한 버전으로 고정돼 있다 (package.json·lock 루트)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
    expect(pkg.dependencies['react-native-video']).toBe('6.19.3');
    expect(lock.packages[''].dependencies['react-native-video']).toBe('6.19.3');
    expect(lock.packages['node_modules/react-native-video'].version).toBe('6.19.3');
  });
});
