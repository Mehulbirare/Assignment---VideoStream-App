#ifndef EDGEVISION_IMAGE_PROCESSOR_H
#define EDGEVISION_IMAGE_PROCESSOR_H

#include <opencv2/core.hpp>

namespace edgevision {

/**
 * Effect identifiers. These integer values MUST stay in sync with the
 * TypeScript `EffectType` enum (src/types/index.ts) and the Kotlin layer,
 * because the JS side sends the raw integer across the bridge.
 */
enum class EffectType : int {
    None = 0,
    Canny = 1,
    Grayscale = 2,
    Blur = 3,
    Sepia = 4,
    Cartoon = 5,
};

/**
 * Pure, framework-agnostic image effects built on OpenCV.
 *
 * Every function takes and returns an 8-bit, 4-channel RGBA `cv::Mat`.
 * Both platforms normalize their camera frames to RGBA before calling in
 * (Android: ImageAnalysis RGBA output; iOS: BGRA pixel buffer -> RGBA), so
 * this core is fully shared and platform-agnostic. Keeping the I/O type
 * uniform makes the functions trivially composable and, importantly,
 * unit-testable on the desktop with no Android/iOS dependency
 * (see android/app/src/main/cpp/tests/).
 */
class ImageProcessor {
public:
    /** Dispatch to the requested effect. Unknown effects return a copy. */
    static cv::Mat applyEffect(const cv::Mat &rgba, EffectType effect);

    /** Required pipeline: RGBA -> gray -> Gaussian blur -> Canny -> RGBA. */
    static cv::Mat cannyEdges(const cv::Mat &rgba,
                              double lowThreshold = 50.0,
                              double highThreshold = 150.0,
                              int blurKernel = 5);

    static cv::Mat grayscale(const cv::Mat &rgba);
    static cv::Mat gaussianBlur(const cv::Mat &rgba, int kernel = 9);
    static cv::Mat sepia(const cv::Mat &rgba);
    static cv::Mat cartoon(const cv::Mat &rgba);
};

}  // namespace edgevision

#endif  // EDGEVISION_IMAGE_PROCESSOR_H
