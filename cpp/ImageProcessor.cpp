
#include "ImageProcessor.h"

#include <opencv2/imgproc.hpp>

namespace edgevision {

namespace {
// Gaussian kernels must be positive and odd. Clamp/normalize any input.
int normalizeOddKernel(int k) {
    if (k < 1) {
        k = 1;
    }
    if (k % 2 == 0) {
        k += 1;
    }
    return k;
}
}  // namespace

cv::Mat ImageProcessor::grayscale(const cv::Mat &rgba) {
    cv::Mat gray;
    cv::cvtColor(rgba, gray, cv::COLOR_RGBA2GRAY);
    // Return RGBA so the renderer always receives a uniform format.
    cv::Mat out;
    cv::cvtColor(gray, out, cv::COLOR_GRAY2RGBA);
    return out;
}

cv::Mat ImageProcessor::gaussianBlur(const cv::Mat &rgba, int kernel) {
    const int k = normalizeOddKernel(kernel);
    cv::Mat out;
    cv::GaussianBlur(rgba, out, cv::Size(k, k), 0);
    return out;
}

cv::Mat ImageProcessor::cannyEdges(const cv::Mat &rgba, double lowThreshold,
                                   double highThreshold, int blurKernel) {
    // 1) RGBA -> grayscale
    cv::Mat gray;
    cv::cvtColor(rgba, gray, cv::COLOR_RGBA2GRAY);

    // 2) Gaussian blur to suppress noise before edge detection
    const int k = normalizeOddKernel(blurKernel);
    cv::Mat blurred;
    cv::GaussianBlur(gray, blurred, cv::Size(k, k), 0);

    // 3) Canny edge detection
    cv::Mat edges;
    cv::Canny(blurred, edges, lowThreshold, highThreshold);

    // 4) Single-channel edges -> RGBA for the renderer
    cv::Mat out;
    cv::cvtColor(edges, out, cv::COLOR_GRAY2RGBA);
    return out;
}

cv::Mat ImageProcessor::sepia(const cv::Mat &rgba) {
    cv::Mat bgr;
    cv::cvtColor(rgba, bgr, cv::COLOR_RGBA2BGR);

    // Standard sepia transform matrix (applied to BGR channel order).
    const cv::Matx33f kernel(0.272f, 0.534f, 0.131f,
                             0.349f, 0.686f, 0.168f,
                             0.393f, 0.769f, 0.189f);
    cv::Mat sepiaBgr;
    cv::transform(bgr, sepiaBgr, kernel);

    cv::Mat out;
    cv::cvtColor(sepiaBgr, out, cv::COLOR_BGR2RGBA);
    return out;
}

cv::Mat ImageProcessor::cartoon(const cv::Mat &rgba) {
    cv::Mat bgr;
    cv::cvtColor(rgba, bgr, cv::COLOR_RGBA2BGR);

    // Edge mask from a grayscale, denoised image.
    cv::Mat gray;
    cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);
    cv::medianBlur(gray, gray, 7);
    cv::Mat edges;
    cv::adaptiveThreshold(gray, edges, 255, cv::ADAPTIVE_THRESH_MEAN_C,
                          cv::THRESH_BINARY, 9, 2);

    // Smooth colors with a bilateral filter (edge-preserving).
    cv::Mat color;
    cv::bilateralFilter(bgr, color, 9, 75, 75);

    // Combine: keep smoothed color only where there are no edges.
    cv::Mat edgesBgr;
    cv::cvtColor(edges, edgesBgr, cv::COLOR_GRAY2BGR);
    cv::Mat cartoonBgr;
    cv::bitwise_and(color, edgesBgr, cartoonBgr);

    cv::Mat out;
    cv::cvtColor(cartoonBgr, out, cv::COLOR_BGR2RGBA);
    return out;
}

cv::Mat ImageProcessor::applyEffect(const cv::Mat &rgba, EffectType effect) {
    switch (effect) {
        case EffectType::Canny:
            return cannyEdges(rgba);
        case EffectType::Grayscale:
            return grayscale(rgba);
        case EffectType::Blur:
            return gaussianBlur(rgba);
        case EffectType::Sepia:
            return sepia(rgba);
        case EffectType::Cartoon:
            return cartoon(rgba);
        case EffectType::None:
        default:
            return rgba.clone();
    }
}

}  // namespace edgevision
