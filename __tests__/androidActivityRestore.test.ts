/**
 * Android MainActivity가 다시 만들어질 때 앱이 죽지 않게 하는 설정 (QA B-07).
 * react-native-screens는 화면 프래그먼트 복원을 지원하지 않는다. 저장된 상태(savedInstanceState)를 super.onCreate에 넘기면
 * Activity가 다시 만들어질 때(글꼴 크기·언어·화면 배율 변경, 백그라운드에서 프로세스가 회수된 뒤 복귀)
 * FragmentManager가 ScreenStackFragment를 되살리려다 "Screen fragments should never be restored"로 크래시한다.
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string };
const path = require('path') as { resolve: (...p: string[]) => string };

// 다른 테스트 파일(mapsLifecyclePatch)과 fs·path 이름이 겹치지 않게 모듈로 둔다
export {};

const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');
const activity = read('android/app/src/main/java/com/pado/app/MainActivity.kt');
const manifest = read('android/app/src/main/AndroidManifest.xml');

/** MainActivity 선언의 configChanges 값 */
const configChanges = () => {
  const decl = manifest.slice(manifest.indexOf('android:name=".MainActivity"'));
  const m = decl.match(/android:configChanges="([^"]+)"/);
  expect(m).not.toBeNull();
  return (m as RegExpMatchArray)[1].split('|');
};

describe('Android MainActivity 재생성 (B-07)', () => {
  it('저장된 상태를 super.onCreate에 넘기지 않는다 (react-native-screens 프래그먼트 복원 크래시)', () => {
    expect(activity).toMatch(/super\.onCreate\(null\)/);
    expect(activity).not.toMatch(/super\.onCreate\(savedInstanceState\)/);
  });

  it('글꼴 크기·언어 변경은 Activity를 다시 만들지 않고 그 자리에서 받는다 (화면·재생 상태 유지)', () => {
    expect(configChanges()).toEqual(expect.arrayContaining(['fontScale', 'locale', 'layoutDirection']));
  });

  it('기존에 받던 변경(다크 모드·회전·화면 크기 등)도 그대로 받는다', () => {
    expect(configChanges()).toEqual(
      expect.arrayContaining(['keyboard', 'keyboardHidden', 'orientation', 'screenLayout', 'screenSize', 'smallestScreenSize', 'uiMode']),
    );
  });
});
