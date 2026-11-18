#import <React/RCTViewManager.h>
#import "PADOLoopView.h"

/** PADOLoopView — JS: requireNativeComponent('PADOLoopView') (iOS만, src/components/anim/LoopView.tsx) */
@interface PADOLoopViewManager : RCTViewManager
@end

@implementation PADOLoopViewManager

RCT_EXPORT_MODULE()

- (UIView *)view
{
  return [PADOLoopView new];
}

RCT_EXPORT_VIEW_PROPERTY(loops, NSArray)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)

@end
