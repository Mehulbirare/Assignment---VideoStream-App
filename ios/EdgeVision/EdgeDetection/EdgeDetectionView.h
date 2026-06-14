#import <UIKit/UIKit.h>
#import <React/RCTComponent.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Native iOS camera view that mirrors the Android `EdgeDetectionView`:
 *   • captures frames with AVCaptureSession + AVCaptureVideoDataOutput
 *   • processes each frame in the SHARED C++/OpenCV core (cpp/ImageProcessor)
 *   • renders the processed RGBA frame into a CALayer
 *   • emits FPS / processing-time / dropped-frame metrics + errors to JS
 *
 * All capture + processing runs on a dedicated serial queue (off the main
 * thread); only the final layer update is dispatched back to main.
 */
@interface EdgeDetectionView : UIView

/** Numeric effect id — matches the shared C++ EffectType enum. */
@property(nonatomic, assign) NSInteger effect;
/** When NO, frames are passed through unprocessed (live preview). */
@property(nonatomic, assign) BOOL effectEnabled;
/** Starts/stops the capture session. */
@property(nonatomic, assign) BOOL isActive;
/** @"back" or @"front". */
@property(nonatomic, copy) NSString *cameraFacing;

@property(nonatomic, copy, nullable) RCTBubblingEventBlock onFpsUpdate;
@property(nonatomic, copy, nullable) RCTBubblingEventBlock onError;
@property(nonatomic, copy, nullable) RCTBubblingEventBlock onReady;

@end

NS_ASSUME_NONNULL_END
