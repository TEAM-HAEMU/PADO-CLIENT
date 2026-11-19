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

/**
 * Android Google 지도 마커 재사용 패치
 *  · 고른 핀의 zIndex·거리순이 바뀌면 Fabric이 마커 ~100개를 떼었다(removeFeatureAt) 붙이는데(addFeature),
 *    그때마다 Google 마커를 지우고 새로 만들어(뷰를 비트맵으로 다시 그리고 지도에 다시 올림) 드랍 하나 고를 때 ~100개를 새로 만들던 것
 *    → 뗄 때 바로 지우지 않고, 같은 마운트 안에서 다시 붙으면 있던 마커를 그대로 쓴다. 다시 붙지 않았으면 그 작업이 끝난 뒤 지운다
 */
describe('react-native-maps Android 마커 재사용 패치', () => {
  const mapView = src('MapView.java');
  const between = (from: string, to: string) => {
    const start = mapView.indexOf(from);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = mapView.indexOf(to, start);
    expect(end).toBeGreaterThan(start);
    return mapView.slice(start, end);
  };

  it('뗄 때 Google 마커를 곧바로 지우지 않고 떼기로만 표시한다 (지도가 이미 없어졌으면 바로 지운다)', () => {
    const remove = between('public void removeFeatureAt(int index)', '} else if (feature instanceof MapHeatmap)');
    expect(remove).toMatch(/if \(!destroyed && feature\.getFeature\(\) != null\) \{\s*padoDetachMarker\(\(MapMarker\) feature\);\s*\} else \{\s*feature\.removeFromMap\(markerCollection\);/);
  });

  it('같은 마운트 안에서 다시 붙는 마커는 addToMap(새 Google 마커)을 건너뛴다', () => {
    const add = between('public void addFeature(View child, int index)', 'safeAddFeature(index, annotation);');
    expect(add).toMatch(/if \(!padoDetachedMarkers\.remove\(annotation\) \|\| annotation\.getFeature\(\) == null\) \{\s*annotation\.addToMap\(markerCollection\);\s*\}/);
  });

  it('다시 붙지 않은 마커는 그 작업이 끝난 뒤(메인 스레드 다음 차례) 지도에서 지운다', () => {
    const detach = between('private void padoDetachMarker(MapMarker marker)', 'public WritableMap makeClickEventData');
    expect(detach).toMatch(/padoHandler\.post\(padoFlushDetached\)/);
    expect(detach).toMatch(/marker\.removeFromMap\(markerCollection\);/);
    expect(mapView).toMatch(/new Handler\(Looper\.getMainLooper\(\)\)/);
  });
});

/**
 * iOS Google 지도 마커 패치 (patches/react-native-maps)
 *  · tracksViewChanges가 켜진 마커를 Google 지도가 매 프레임 다시 찍고(drawViewHierarchyInRect) 텍스처에 올려
 *    새 핀이 많이 생길 때(끌기·걷기·드랍 고르기) 메인 스레드를 크게 잡아먹던 것 → 켜질 때 한 번 + 0.1초마다 한 번 (말풍선만 처음 0.25초 매 프레임)
 *  · 고른 핀의 zIndex·거리순이 바뀌면 Fabric이 마커 수십 개를 떼었다 붙이는데, 그때마다 Google 마커를 새로 만들어
 *    지도가 0.2초 넘게 멈추던 것 → 같은 마운트 안에서 다시 붙으면 있던 마커를 그대로 쓴다
 */
describe('react-native-maps iOS Google 마커 패치', () => {
  const read = (f: string) => fs.readFileSync(path.resolve('node_modules/react-native-maps/ios/AirGoogleMaps', f), 'utf8');
  const marker = read('AIRGoogleMapMarker.m');
  const map = read('AIRGoogleMap.mm');

  it('JS의 tracksViewChanges를 Google 마커에 그대로 넘기지 않고 padoApplyTracking이 조절한다', () => {
    expect(marker).toMatch(/- \(void\)padoApplyTracking/);
    expect(marker).toMatch(/_realMarker\.tracksViewChanges = NO; \/\/ PADO/);
    const setter = marker.slice(marker.indexOf('- (void)setTracksViewChanges:'), marker.indexOf('- (BOOL)tracksViewChanges'));
    expect(setter).toMatch(/padoApplyTracking/);
    expect(setter).not.toMatch(/_realMarker\.tracksViewChanges = tracksViewChanges/);
  });

  it('0.1초 간격으로 찍고, 매 프레임은 말풍선(zIndex 1000 이상)의 처음 0.25초만', () => {
    expect(marker).toMatch(/PADO_TRACK_SLOW_S = 0\.1;/);
    expect(marker).toMatch(/PADO_TRACK_FULL_S = 0\.25;/);
    expect(marker).toMatch(/PADO_TRACK_FULL_ZINDEX = 1000;/);
  });

  /**
   * 추적 중 0.1초마다 무조건 찍으면 확대·축소 때 묶음 숫자가 바뀐 묶음마다 3~4번, 묶음→핀 때 새 핀마다 5~6번씩 더 찍었다
   * (찍을 때마다 drawViewHierarchy + Google 지도가 그림을 색 변환해 텍스처 아틀라스에 올림 — 메인 스레드) → 모습이 바뀌었을 때만 찍고, 바뀐 뒤 한 번 더
   */
  it('추적 중에는 모습(크기·글자·이미지)이 바뀌었을 때만 다시 찍고, 바뀐 뒤 한 번 더 찍어 굳힌다', () => {
    const tracking = marker.slice(marker.indexOf('- (void)padoApplyTracking'), marker.indexOf('- (void)dealloc'));
    expect(tracking).toMatch(/\[s padoRefreshIfChanged\];/);
    expect(tracking).not.toMatch(/\[s padoRefreshOnce\];/);
    expect(tracking).toMatch(/else \[self padoRefreshIfChanged\];/);
    const hash = marker.slice(marker.indexOf('static void padoHashView'), marker.indexOf('- (NSUInteger)padoSignature'));
    expect(hash).toMatch(/v\.frame/);
    expect(hash).toMatch(/v\.layer\.contents/);
    expect(hash).toMatch(/\(\(UIImageView \*\)v\)\.image/);
    expect(hash).toMatch(/attributedText/);
    const ifChanged = marker.slice(marker.indexOf('- (void)padoRefreshIfChanged'), marker.indexOf('- (void)padoRefreshOnce'));
    expect(ifChanged).toMatch(/\[self padoSignature\] != _padoSnapSig/);
    expect(ifChanged).toMatch(/if \(_padoSettled\) return;/);
    const once = marker.slice(marker.indexOf('- (void)padoRefreshOnce'), marker.indexOf('- (void)padoApplyTracking'));
    expect(once).toMatch(/_padoSnapSig = \[self padoSignature\];\s*_padoSettled = NO;/);
  });

  it('지도에서 뗄 때 곧바로 Google 마커를 지우지 않고, 같은 마운트 안에서 다시 붙으면 그대로 쓴다', () => {
    const remove = map.slice(map.indexOf('- (void)removeReactSubview:'), map.indexOf('[self.markers removeObject:marker]'));
    expect(remove).toMatch(/\[marker padoRemoveFromMap\]/);
    expect(remove).not.toMatch(/marker\.realMarker\.map = nil/);
    const insert = marker.slice(marker.indexOf('- (void) didInsertInMap:'), marker.indexOf('_realMarker = [AIRGMSMarker new]'));
    expect(insert).toMatch(/_padoRemovePending && _realMarker && _realMarker\.map == map/);
  });
});

/**
 * 확대·축소 때 마커 깜빡임 (patches/react-native-maps)
 *  · Android: 마커를 지울 때 자식 뷰가 먼저 빠지면 그 마커가 Google 기본 빨간 핀으로 바뀌었고, 지도에서 떨어지는 것은 마운트가 끝난 뒤라
 *    핀↔묶음 전환·묶음 다시 나누기 때 빨간 핀이 번쩍였다 → 자식이 다 빠진 뒤에는 그림을 바꾸지 않고, 떼는 중이 아닐 때만 나중에 기본 핀으로
 *  · iOS: 옛 마커는 마운트 바로 뒤에 지우고 새 마커는 몇 프레임 뒤에 첫 그림이 나와, 그 사이 지도에 마커가 하나도 없었다
 *    → 같은 마운트에서 새 마커가 붙었으면 옛 마커를 잠깐(PADO_HANDOVER_S) 남겼다가 지운다
 */
describe('react-native-maps 확대·축소 깜빡임 패치', () => {
  const marker = src('MapMarker.java');
  const iosMarker = fs.readFileSync(path.resolve('node_modules/react-native-maps/ios/AirGoogleMaps/AIRGoogleMapMarker.m'), 'utf8');

  it('Android: 자식이 다 빠지면 곧바로 기본 핀으로 바꾸지 않고 다음 차례로 미룬다', () => {
    const rl = body(marker, 'public void requestLayout()');
    const gone = rl.slice(rl.indexOf('if (getChildCount() == 0)'), rl.indexOf('} else {'));
    expect(gone).toMatch(/padoChildrenGonePending = true;/);
    expect(gone).toMatch(/padoHandler\.post\(padoChildrenGone\)/);
    expect(gone).not.toMatch(/update\(true\)/);
  });

  it('Android: 그동안은 어떤 경로로도 그림을 바꾸지 않고, 떼는 중이면 지도에서 떨어질 때까지 막는다', () => {
    const icon = body(marker, 'public void updateMarkerIcon()');
    expect(icon).toMatch(/if \(padoChildrenGonePending\) return;/);
    expect(marker).toMatch(/if \(!padoChildrenGonePending \|\| padoDetaching\) return;/);
    expect(src('MapView.java')).toMatch(/marker\.padoDetaching = true;/);
  });

  it('iOS: 같은 마운트에서 새 마커가 붙었으면 옛 마커를 PADO_HANDOVER_S 뒤에 지운다 (그동안 눌리지 않게)', () => {
    expect(iosMarker).toMatch(/PADO_HANDOVER_S = 0\.35;/);
    const remove = iosMarker.slice(iosMarker.indexOf('- (void)padoRemoveFromMap'), iosMarker.indexOf('- (void)padoRefreshOnce'));
    expect(remove).toMatch(/CACurrentMediaTime\(\) - padoLastInsertAt/);
    expect(remove).toMatch(/old\.tappable = NO;/);
    expect(remove).toMatch(/dispatch_after/);
    const insert = iosMarker.slice(iosMarker.indexOf('- (void) didInsertInMap:'), iosMarker.indexOf('- (void)iconViewInsertSubview:'));
    expect(insert).toMatch(/padoLastInsertAt = CACurrentMediaTime\(\);/);
    expect(insert).toMatch(/\[self layoutSubviews\];\s*if \(!_padoKey\) \[_realMarker setIconView:_iconView\];/);
  });
});

/**
 * iOS 그림 모드 (identifier 'pado:<모습 키>' — 지도 홈 핀·묶음)
 *  · Google 지도 iOS는 iconView 마커를 다시 찍을 때마다 그 마커를 1~2프레임 그리지 않아, 확대·축소·이동 중 핀·묶음이 0.05~0.1초씩 깜빡였다
 *    → 마커 뷰를 패치가 직접 UIImage로 그려 키별로 캐시하고 GMSMarker.icon으로 쓴다. 묶음은 지름·숫자로 바로 그린다
 *  · 그림이 없으면 지도에 붙이지 않는다(빈 아이콘이 화면에 나가지 않음) — 생기면 Google 지도 등장 페이드로 붙이고, 지울 때는 레이어 opacity 애니메이션 뒤 뗀다
 *  · 보이는 마커의 그림이 바뀌면 같은 자리에 새 마커를 붙여 겹쳐 바꾼다(그림만 갈아 끼우면 1~2프레임 비었다)
 */
describe('react-native-maps iOS 그림 모드 패치', () => {
  const marker = fs.readFileSync(path.resolve('node_modules/react-native-maps/ios/AirGoogleMaps/AIRGoogleMapMarker.m'), 'utf8');
  const slice = (from: string, to: string) => {
    const start = marker.indexOf(from);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = marker.indexOf(to, start + from.length);
    expect(end).toBeGreaterThan(start);
    return marker.slice(start, end);
  };

  it("identifier가 'pado:'로 시작하면 그 뒤를 모습 키로 쓴다", () => {
    const set = slice('- (void)setIdentifier:', '- (NSString *)identifier');
    expect(set).toMatch(/hasPrefix:PADO_KEY_PREFIX/);
    expect(marker).toMatch(/PADO_KEY_PREFIX = @"pado:"/);
  });

  it('그림 모드는 iconView를 Google 지도에 넘기지 않고, 그림이 생기기 전에는 지도에 붙이지 않는다', () => {
    const insert = slice('- (void) didInsertInMap:', '- (void)iconViewInsertSubview:');
    expect(insert).toMatch(/if \(!_padoKey\) \[_realMarker setIconView:_iconView\];/);
    expect(insert).toMatch(/if \(padoCached\) \[self padoShowIcon:padoCached\];\s*else if \(!_padoKey\) \[_realMarker setMap:map\];/);
    const show = slice('- (void)padoShowIcon:', '- (void)padoApplyTracking');
    expect(show).toMatch(/_realMarker\.appearAnimation = kGMSMarkerAnimationFadeIn;/);
    expect(show).toMatch(/_realMarker\.map = _padoPendingMap;/);
  });

  it('보이는 마커의 그림이 바뀌면 새 마커를 겹쳐 붙이고 옛 마커는 페이드아웃 뒤 뗀다', () => {
    const show = slice('- (void)padoShowIcon:', '- (void)padoApplyTracking');
    expect(show).toMatch(/padoFadeOut\(old\);/);
    expect(show).toMatch(/\[self didInsertInMap:\(AIRGoogleMap \*\)old\.map\];/);
    expect(marker).toMatch(/animationWithKeyPath:kGMSMarkerLayerOpacity/);
  });

  it('핀 그림은 아트까지 다 들어왔고 0.1초 간격 두 번이 똑같을 때만 캐시하고, 묶음은 지름·숫자로 바로 그린다', () => {
    const update = slice('- (void)padoUpdateIcon {', '- (void)padoShowIcon:');
    expect(update).toMatch(/padoImagesLoaded\(_iconView\)/);
    expect(update).toMatch(/padoSameImage\(_padoLastRender, img\)/);
    expect(marker).toMatch(/static UIImage \*padoClusterImage\(NSString \*key\)/);
    expect(marker).toMatch(/\[key hasPrefix:@"c\|"\]/);
  });

  it('지울 때 그림 모드 마커는 곧바로 떼지 않고 페이드아웃한다', () => {
    const remove = slice('- (void)padoRemoveFromMap', '- (NSUInteger)padoSignature');
    expect(remove).toMatch(/padoFadeOut\(old\);/);
  });
});
