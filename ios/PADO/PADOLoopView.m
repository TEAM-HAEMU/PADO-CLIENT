#import "PADOLoopView.h"
#import <QuartzCore/QuartzCore.h>

static NSString *const kKeyPrefix = @"pado.loop.";

/** sync 애니메이션이 함께 쓰는 시계의 0점 (처음 쓰일 때) */
static CFTimeInterval PADOLoopEpoch(void)
{
  static CFTimeInterval epoch = 0;
  if (epoch == 0) epoch = CACurrentMediaTime();
  return epoch;
}

static NSString *PADOKeyPath(NSString *key)
{
  if ([key isEqualToString:@"rotate"]) return @"transform.rotation.z";
  if ([key isEqualToString:@"translateX"]) return @"transform.translation.x";
  if ([key isEqualToString:@"translateY"]) return @"transform.translation.y";
  if ([key isEqualToString:@"scaleX"]) return @"transform.scale.x";
  if ([key isEqualToString:@"scaleY"]) return @"transform.scale.y";
  if ([key isEqualToString:@"opacity"]) return @"opacity";
  return nil;
}

@implementation PADOLoopView {
  NSArray<NSDictionary *> *_applied;
}

- (void)setLoops:(NSArray<NSDictionary *> *)loops
{
  _loops = [loops copy];
  [self applyLoops];
}

- (void)setPaused:(BOOL)paused
{
  _paused = paused;
  [self applyPaused];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  // 애니메이션이 어떤 이유로든 지워졌으면(창에서 떨어졌다 붙음 등) 다시 건다
  if (self.window && _applied.count && ![self.layer animationForKey:[kKeyPrefix stringByAppendingString:@"0"]]) {
    _applied = nil;
    [self applyLoops];
  }
}

- (CAAnimation *)animationFor:(NSDictionary *)loop
{
  NSString *keyPath = PADOKeyPath(loop[@"key"]);
  if (!keyPath) return nil;
  BOOL rotate = [loop[@"key"] isEqualToString:@"rotate"];
  double k = rotate ? M_PI / 180.0 : 1.0;
  double from = [loop[@"from"] doubleValue] * k;
  double to = [loop[@"to"] doubleValue] * k;
  double duration = MAX(0.001, [loop[@"duration"] doubleValue] / 1000.0);
  NSString *easing = loop[@"easing"] ?: @"linear";
  BOOL autoreverse = [loop[@"autoreverse"] boolValue];
  double phase = [loop[@"phase"] doubleValue];

  CAPropertyAnimation *anim;
  if ([easing isEqualToString:@"inOutSine"]) {
    // -(cos(πt) - 1) / 2 — 베지어로는 정확히 안 맞아서 촘촘한 키프레임으로
    const int n = 48;
    NSMutableArray *values = [NSMutableArray arrayWithCapacity:n + 1];
    for (int i = 0; i <= n; i++) {
      double t = (double)i / n;
      double e = -(cos(M_PI * t) - 1) / 2;
      [values addObject:@(from + (to - from) * e)];
    }
    CAKeyframeAnimation *kf = [CAKeyframeAnimation animationWithKeyPath:keyPath];
    kf.values = values;
    kf.calculationMode = kCAAnimationLinear;
    anim = kf;
  } else {
    CABasicAnimation *basic = [CABasicAnimation animationWithKeyPath:keyPath];
    basic.fromValue = @(from);
    basic.toValue = @(to);
    if ([easing isEqualToString:@"outQuad"]) {
      // 1 - (1 - t)^2 와 정확히 같은 곡선 (2차 베지어를 3차로 올린 조절점)
      basic.timingFunction = [CAMediaTimingFunction functionWithControlPoints:1.0 / 3 :2.0 / 3 :2.0 / 3 :1];
    } else {
      basic.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionLinear];
    }
    anim = basic;
  }
  anim.duration = duration;
  anim.autoreverses = autoreverse;
  anim.repeatCount = HUGE_VALF;
  anim.removedOnCompletion = NO; // 앱이 백그라운드에 다녀와도 지워지지 않게
  anim.timeOffset = phase * duration * (autoreverse ? 2 : 1);
  if ([loop[@"sync"] boolValue]) {
    anim.beginTime = [self.layer convertTime:PADOLoopEpoch() fromLayer:nil];
  }
  return anim;
}

- (void)applyLoops
{
  NSArray *loops = _loops ?: @[];
  if ([loops isEqualToArray:_applied ?: @[]]) return;
  NSArray *before = _applied ?: @[];
  // 설정이 그대로인 애니메이션은 그대로 둔다 (예: 파도 흐름은 출렁임 세기가 바뀌어도 이어서 흐른다)
  for (NSUInteger i = 0; i < MAX(before.count, loops.count); i++) {
    NSString *key = [kKeyPrefix stringByAppendingFormat:@"%lu", (unsigned long)i];
    NSDictionary *was = i < before.count ? before[i] : nil;
    NSDictionary *now = i < loops.count ? loops[i] : nil;
    if (was && now && [was isEqualToDictionary:now] && [self.layer animationForKey:key]) continue;
    CAAnimation *anim = now ? [self animationFor:now] : nil;
    // 같은 값을 다른 세기·주기로 바꾸면(파도 출렁임 등) 처음으로 돌아가지 않고 한 주기 안의 같은 지점에서 이어 간다
    CAPropertyAnimation *old = (CAPropertyAnimation *)[self.layer animationForKey:key];
    if (anim && old && was && [old isKindOfClass:[CAPropertyAnimation class]] && [((CAPropertyAnimation *)anim).keyPath isEqualToString:old.keyPath] && ![now[@"sync"] boolValue]) {
      CFTimeInterval oldCycle = old.duration * (old.autoreverses ? 2 : 1);
      CFTimeInterval newCycle = anim.duration * (anim.autoreverses ? 2 : 1);
      CFTimeInterval local = [self.layer convertTime:CACurrentMediaTime() fromLayer:nil];
      CFTimeInterval active = (local - old.beginTime) * old.speed + old.timeOffset;
      if (oldCycle > 0 && active >= 0) anim.timeOffset = fmod(active, oldCycle) / oldCycle * newCycle;
    }
    [self.layer removeAnimationForKey:key];
    if (anim) [self.layer addAnimation:anim forKey:key];
  }
  _applied = loops;
}

- (void)applyPaused
{
  CALayer *layer = self.layer;
  if (_paused) {
    if (layer.speed == 0) return;
    CFTimeInterval t = [layer convertTime:CACurrentMediaTime() fromLayer:nil];
    layer.speed = 0;
    layer.timeOffset = t;
  } else {
    if (layer.speed != 0) return;
    CFTimeInterval pausedAt = layer.timeOffset;
    layer.speed = 1;
    layer.timeOffset = 0;
    layer.beginTime = 0;
    layer.beginTime = [layer convertTime:CACurrentMediaTime() fromLayer:nil] - pausedAt;
  }
}

@end
