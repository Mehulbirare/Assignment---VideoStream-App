#import <React/RCTViewManager.h>
#import "EdgeDetectionView.h"

/**
 * Exposes `EdgeDetectionView` to React Native. The module name
 * ("EdgeDetectionView") matches the Android REACT_CLASS and the JS
 * `requireNativeComponent('EdgeDetectionView')`, so the same JS wrapper
 * (src/native/EdgeDetectionView.tsx) drives both platforms.
 */
@interface EdgeDetectionViewManager : RCTViewManager
@end

@implementation EdgeDetectionViewManager

RCT_EXPORT_MODULE(EdgeDetectionView)

- (UIView *)view {
    return [[EdgeDetectionView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(effect, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(effectEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(isActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(cameraFacing, NSString)

RCT_EXPORT_VIEW_PROPERTY(onFpsUpdate, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onReady, RCTBubblingEventBlock)

@end
