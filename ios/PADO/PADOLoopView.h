#import <UIKit/UIKit.h>

/**
 * 반복 장식 애니메이션을 Core Animation으로 돌리는 뷰 (도는 디스크 · 핀 물결 · 파도 배경).
 * 애니메이션은 렌더 서버가 돌리므로 앱의 메인·JS 스레드는 매 프레임 일하지 않는다.
 * loops: [{ key, from, to, duration(ms), easing('linear'|'outQuad'|'inOutSine'), autoreverse, phase(0~1), sync }]
 *  · key: rotate(도) · translateX · translateY · scaleX · scaleY · opacity
 *  · sync: 앱 전체에서 한 시계를 함께 쓴다 (물결 고리들이 phase만큼 어긋나게 퍼지도록)
 * paused: 그 자리에서 멈추고, 풀면 멈춘 곳에서 이어 간다
 */
@interface PADOLoopView : UIView
@property (nonatomic, copy) NSArray<NSDictionary *> *loops;
@property (nonatomic, assign) BOOL paused;
@end
