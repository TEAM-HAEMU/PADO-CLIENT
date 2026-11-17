/**
 * react-native-maps Android 패치(patches/react-native-maps+*.patch)가 적용돼 있는지 확인한다.
 * 패치가 빠지면(라이브러리 버전을 올리며 패치가 안 맞는 등) 지도 화면이 창에서 떨어졌다 붙을 때마다(탭 전환·위로 화면을 쌓음)
 * Google 지도를 새로 만들고 이전 지도를 버려, 마커 아이콘 비트맵·렌더러 스레드·네이티브 메모리가 계속 쌓인다 (600개 드랍 3라운드 PSS 380MB → 1.06GB).
 */
// 앱 tsconfig에는 Node 타입이 없어 쓰는 것만 적는다 (jest는 프로젝트 루트에서 돈다)
const fs = require('fs') as { readFileSync: (p: string, enc: 'utf8') => string };
const path = require('path') as { resolve: (...p: string[]) => string };
const MAPS = path.resolve('node_modules/react-native-maps/android/src/main/java/com/rnmaps/maps');

const src = (file: string) => fs.readFileSync(path.resolve(MAPS, file), 'utf8');
/** 메서드 하나의 본문 (다음 메서드 선언 전까지) */
const body = (code: string, signature: string) => {
  const start = code.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = code.indexOf('\n    @Override', start + signature.length);
  return code.slice(start, next < 0 ? undefined : next);
};

describe('react-native-maps Android 지도 생명주기 패치', () => {
  const mapView = src('MapView.java');

  it('창에 다시 붙을 때 Google 지도를 새로 만들지 않는다 (onCreate 재호출 없음, 마커 다시 올리지 않음)', () => {
    const attach = body(mapView, 'protected void onAttachedToWindow()');
    expect(attach).not.toMatch(/onCreate\(/);
    expect(attach).not.toMatch(/addFeature\(/);
  });

  it('창에서 떨어질 때 마커를 떼어 두지 않고 멈추기만 한다', () => {
    const detach = body(mapView, 'protected void onDetachedFromWindow()');
    expect(detach).toMatch(/onStop\(\)/);
    expect(detach).not.toMatch(/savedFeatures\s*=/);
    expect(detach).not.toMatch(/removeView\(attacherGroup\)/);
  });

  it('생명주기 관찰자를 다시 붙여 ON_CREATE를 또 받아도 Google MapView.onCreate는 한 번만', () => {
    const create = body(mapView, 'public void onCreate(LifecycleOwner owner)');
    expect(create).toMatch(/if \(mapCreated\) return;/);
  });

  it('마커 스냅샷 추적은 목록 사본을 돌아, 도는 중에 마커가 들어오고 빠져도 앱이 죽지 않는다', () => {
    expect(src('ViewChangesTracker.java')).toMatch(/for \(MapMarker marker : new ArrayList<>\(markers\)\)/);
  });
});
