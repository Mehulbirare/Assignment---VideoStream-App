// OpenCV headers first to avoid clashes with Foundation's NO/YES macros.
#import <opencv2/core.hpp>
#import <opencv2/imgproc.hpp>
#import "ImageProcessor.h"

#import "EdgeDetectionView.h"
#import <AVFoundation/AVFoundation.h>

using edgevision::EffectType;
using edgevision::ImageProcessor;

@interface EdgeDetectionView () <AVCaptureVideoDataOutputSampleBufferDelegate>
@end

@implementation EdgeDetectionView {
    AVCaptureSession *_session;
    AVCaptureVideoDataOutput *_videoOutput;
    dispatch_queue_t _captureQueue;
    CALayer *_renderLayer;

    BOOL _running;
    BOOL _processingBusy;

    // Metrics (mutated only on _captureQueue)
    int _frameCount;
    int _droppedFrames;
    double _processingMsSum;
    CFTimeInterval _windowStart;
    BOOL _emittedReady;
}

- (instancetype)initWithFrame:(CGRect)frame {
    if (self = [super initWithFrame:frame]) {
        _effect = 1;            // Canny
        _effectEnabled = YES;
        _cameraFacing = @"back";
        _captureQueue =
            dispatch_queue_create("com.edgevision.capture", DISPATCH_QUEUE_SERIAL);

        _renderLayer = [CALayer layer];
        _renderLayer.frame = self.bounds;
        _renderLayer.contentsGravity = kCAGravityResizeAspectFill;
        _renderLayer.backgroundColor = [UIColor blackColor].CGColor;
        [self.layer addSublayer:_renderLayer];
    }
    return self;
}

- (void)layoutSubviews {
    [super layoutSubviews];
    _renderLayer.frame = self.bounds;
}

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

- (void)setIsActive:(BOOL)isActive {
    if (isActive == _isActive) {
        return;
    }
    _isActive = isActive;
    if (isActive) {
        [self start];
    } else {
        [self stop];
    }
}

- (void)setCameraFacing:(NSString *)cameraFacing {
    if ([cameraFacing isEqualToString:_cameraFacing]) {
        return;
    }
    _cameraFacing = [cameraFacing copy];
    if (_running) {
        dispatch_async(_captureQueue, ^{
            [self reconfigureInput];
        });
    }
}

// -----------------------------------------------------------------------
// Session lifecycle
// -----------------------------------------------------------------------

- (void)start {
    AVAuthorizationStatus status =
        [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];

    if (status == AVAuthorizationStatusNotDetermined) {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo
                                 completionHandler:^(BOOL granted) {
                                     if (granted) {
                                         [self configureAndRun];
                                     } else {
                                         [self emitError:@"PERMISSION_DENIED"
                                                 message:@"Camera permission denied"];
                                     }
                                 }];
    } else if (status == AVAuthorizationStatusAuthorized) {
        [self configureAndRun];
    } else {
        [self emitError:@"PERMISSION_BLOCKED"
                message:@"Camera access is denied or restricted. Enable it in Settings."];
    }
}

- (void)configureAndRun {
    dispatch_async(_captureQueue, ^{
        [self resetMetrics];
        if (![self configureSession]) {
            return;
        }
        [self->_session startRunning];
        self->_running = YES;
    });
}

- (BOOL)configureSession {
    _session = [[AVCaptureSession alloc] init];
    [_session beginConfiguration];
    _session.sessionPreset = AVCaptureSessionPreset1280x720;

    AVCaptureDevice *device = [self currentDevice];
    if (!device) {
        [_session commitConfiguration];
        [self emitError:@"CAMERA_INIT_FAILED" message:@"No camera device available"];
        return NO;
    }

    NSError *error = nil;
    AVCaptureDeviceInput *input =
        [AVCaptureDeviceInput deviceInputWithDevice:device error:&error];
    if (!input || error) {
        [_session commitConfiguration];
        [self emitError:@"CAMERA_INIT_FAILED"
                message:error.localizedDescription ?: @"Failed to open camera input"];
        return NO;
    }
    if ([_session canAddInput:input]) {
        [_session addInput:input];
    }

    _videoOutput = [[AVCaptureVideoDataOutput alloc] init];
    _videoOutput.videoSettings = @{
        (id)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA)
    };
    // Backpressure: drop frames that arrive while we're still processing.
    _videoOutput.alwaysDiscardsLateVideoFrames = YES;
    [_videoOutput setSampleBufferDelegate:self queue:_captureQueue];
    if ([_session canAddOutput:_videoOutput]) {
        [_session addOutput:_videoOutput];
    }

    [self applyConnectionOrientation:device];
    [_session commitConfiguration];
    return YES;
}

- (AVCaptureDevice *)currentDevice {
    AVCaptureDevicePosition position =
        [_cameraFacing isEqualToString:@"front"] ? AVCaptureDevicePositionFront
                                                 : AVCaptureDevicePositionBack;
    AVCaptureDeviceDiscoverySession *discovery = [AVCaptureDeviceDiscoverySession
        discoverySessionWithDeviceTypes:@[ AVCaptureDeviceTypeBuiltInWideAngleCamera ]
                              mediaType:AVMediaTypeVideo
                               position:position];
    return discovery.devices.firstObject;
}

- (void)applyConnectionOrientation:(AVCaptureDevice *)device {
    AVCaptureConnection *connection =
        [_videoOutput connectionWithMediaType:AVMediaTypeVideo];
    if ([connection isVideoOrientationSupported]) {
        connection.videoOrientation = AVCaptureVideoOrientationPortrait;
    }
    if (device.position == AVCaptureDevicePositionFront &&
        connection.isVideoMirroringSupported) {
        connection.videoMirrored = YES;  // natural selfie
    }
}

- (void)reconfigureInput {
    if (!_session) {
        return;
    }
    [_session stopRunning];
    [self configureSession];
    [_session startRunning];
}

- (void)stop {
    dispatch_async(_captureQueue, ^{
        self->_running = NO;
        [self->_session stopRunning];
        self->_session = nil;
        self->_videoOutput = nil;
    });
}

- (void)removeFromSuperview {
    [self stop];
    [super removeFromSuperview];
}

// -----------------------------------------------------------------------
// Per-frame processing (runs on _captureQueue, NOT the main thread)
// -----------------------------------------------------------------------

- (void)captureOutput:(AVCaptureOutput *)output
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
           fromConnection:(AVCaptureConnection *)connection {
    if (_processingBusy) {
        _droppedFrames++;
        return;
    }
    _processingBusy = YES;

    CVImageBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!pixelBuffer) {
        _processingBusy = NO;
        return;
    }

    CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
    @try {
        const size_t width = CVPixelBufferGetWidth(pixelBuffer);
        const size_t height = CVPixelBufferGetHeight(pixelBuffer);
        const size_t stride = CVPixelBufferGetBytesPerRow(pixelBuffer);
        void *base = CVPixelBufferGetBaseAddress(pixelBuffer);

        CFTimeInterval startT = CACurrentMediaTime();

        // BGRA camera buffer -> RGBA so the shared core sees a uniform format.
        cv::Mat bgra((int)height, (int)width, CV_8UC4, base, stride);
        cv::Mat rgba;
        cv::cvtColor(bgra, rgba, cv::COLOR_BGRA2RGBA);

        EffectType effectToApply =
            _effectEnabled ? static_cast<EffectType>(_effect) : EffectType::None;
        cv::Mat processed = ImageProcessor::applyEffect(rgba, effectToApply);

        double processingMs = (CACurrentMediaTime() - startT) * 1000.0;

        CGImageRef cgImage = [self cgImageFromRGBA:processed];
        dispatch_async(dispatch_get_main_queue(), ^{
            self->_renderLayer.contents = (__bridge id)cgImage;
            CGImageRelease(cgImage);
        });

        [self recordMetrics:processingMs];
    } @catch (NSException *e) {
        [self emitError:@"PROCESSING_FAILED" message:e.reason ?: @"Processing failed"];
    } @finally {
        CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
        _processingBusy = NO;
    }
}

/// Build a CGImage from a continuous 8UC4 RGBA Mat (copies the pixel data).
- (CGImageRef)cgImageFromRGBA:(const cv::Mat &)mat CF_RETURNS_RETAINED {
    cv::Mat continuous = mat.isContinuous() ? mat : mat.clone();
    const size_t w = continuous.cols;
    const size_t h = continuous.rows;
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CFDataRef data =
        CFDataCreate(kCFAllocatorDefault, continuous.data, (CFIndex)(w * h * 4));
    CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
    CGImageRef image = CGImageCreate(
        w, h, 8, 32, w * 4, colorSpace,
        kCGBitmapByteOrderDefault | kCGImageAlphaPremultipliedLast, provider,
        NULL, false, kCGRenderingIntentDefault);
    CGDataProviderRelease(provider);
    CFRelease(data);
    CGColorSpaceRelease(colorSpace);
    return image;
}

// -----------------------------------------------------------------------
// Metrics + events
// -----------------------------------------------------------------------

- (void)resetMetrics {
    _frameCount = 0;
    _droppedFrames = 0;
    _processingMsSum = 0;
    _windowStart = CACurrentMediaTime();
    _emittedReady = NO;
}

- (void)recordMetrics:(double)processingMs {
    if (!_emittedReady) {
        _emittedReady = YES;
        if (self.onReady) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (self.onReady) {
                    self.onReady(@{});
                }
            });
        }
    }
    _frameCount++;
    _processingMsSum += processingMs;

    CFTimeInterval now = CACurrentMediaTime();
    double elapsed = now - _windowStart;
    if (elapsed >= 1.0) {
        double fps = _frameCount / elapsed;
        double avgMs = _frameCount > 0 ? _processingMsSum / _frameCount : 0.0;
        int dropped = _droppedFrames;
        if (self.onFpsUpdate) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (self.onFpsUpdate) {
                    self.onFpsUpdate(@{
                        @"fps" : @(fps),
                        @"processingTimeMs" : @(avgMs),
                        @"droppedFrames" : @(dropped),
                    });
                }
            });
        }
        _frameCount = 0;
        _droppedFrames = 0;
        _processingMsSum = 0;
        _windowStart = now;
    }
}

- (void)emitError:(NSString *)code message:(NSString *)message {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.onError) {
            self.onError(@{@"code" : code, @"message" : message});
        }
    });
}

@end
