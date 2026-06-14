#include <gtest/gtest.h>

#include <opencv2/imgproc.hpp>

#include "ImageProcessor.h"

using edgevision::EffectType;
using edgevision::ImageProcessor;

namespace {

// A synthetic RGBA test image: a white square on a black background.
// The square's borders give Canny clear, predictable edges to find.
cv::Mat makeSquareImage(int size = 100, int square = 40) {
    cv::Mat img(size, size, CV_8UC4, cv::Scalar(0, 0, 0, 255));
    const int start = (size - square) / 2;
    cv::rectangle(img, cv::Rect(start, start, square, square),
                  cv::Scalar(255, 255, 255, 255), cv::FILLED);
    return img;
}

int countNonZeroGray(const cv::Mat &rgba) {
    cv::Mat gray;
    cv::cvtColor(rgba, gray, cv::COLOR_RGBA2GRAY);
    return cv::countNonZero(gray);
}

}  // namespace

// --- Canny (the required effect) -------------------------------------------

TEST(CannyEdges, PreservesDimensionsAndType) {
    cv::Mat input = makeSquareImage();
    cv::Mat out = ImageProcessor::cannyEdges(input);

    EXPECT_EQ(out.rows, input.rows);
    EXPECT_EQ(out.cols, input.cols);
    EXPECT_EQ(out.type(), CV_8UC4);  // renderer requires RGBA
}

TEST(CannyEdges, DetectsEdgesOnSquare) {
    cv::Mat input = makeSquareImage();
    cv::Mat out = ImageProcessor::cannyEdges(input);

    // The square's 4 borders must produce a meaningful number of edge pixels.
    const int edgePixels = countNonZeroGray(out);
    EXPECT_GT(edgePixels, 100);
}

TEST(CannyEdges, BlankImageProducesNoEdges) {
    cv::Mat blank(80, 80, CV_8UC4, cv::Scalar(10, 10, 10, 255));
    cv::Mat out = ImageProcessor::cannyEdges(blank);

    EXPECT_EQ(countNonZeroGray(out), 0);
}

TEST(CannyEdges, ThresholdsAffectEdgeCount) {
    cv::Mat input = makeSquareImage(120, 60);
    // Very high thresholds should detect fewer (or equal) edges than low ones.
    const int low = countNonZeroGray(ImageProcessor::cannyEdges(input, 30, 90));
    const int high =
            countNonZeroGray(ImageProcessor::cannyEdges(input, 200, 400));
    EXPECT_GE(low, high);
}

// --- Grayscale -------------------------------------------------------------

TEST(Grayscale, OutputChannelsAreEqual) {
    cv::Mat input(10, 10, CV_8UC4, cv::Scalar(120, 60, 30, 255));
    cv::Mat out = ImageProcessor::grayscale(input);

    ASSERT_EQ(out.type(), CV_8UC4);
    const cv::Vec4b px = out.at<cv::Vec4b>(5, 5);
    // R == G == B for a true grayscale pixel.
    EXPECT_EQ(px[0], px[1]);
    EXPECT_EQ(px[1], px[2]);
    EXPECT_EQ(px[3], 255);  // alpha preserved
}

// --- Gaussian blur ---------------------------------------------------------

TEST(GaussianBlur, KeepsShapeAndType) {
    cv::Mat input = makeSquareImage();
    cv::Mat out = ImageProcessor::gaussianBlur(input, 9);
    EXPECT_EQ(out.size(), input.size());
    EXPECT_EQ(out.type(), CV_8UC4);
}

TEST(GaussianBlur, EvenKernelIsNormalizedAndDoesNotThrow) {
    cv::Mat input = makeSquareImage();
    // Passing an even kernel must be normalized to odd internally (no throw).
    EXPECT_NO_THROW({
        cv::Mat out = ImageProcessor::gaussianBlur(input, 8);
        EXPECT_EQ(out.size(), input.size());
    });
}

// --- Sepia & Cartoon -------------------------------------------------------

TEST(Sepia, KeepsShapeAndType) {
    cv::Mat input(20, 20, CV_8UC4, cv::Scalar(200, 150, 100, 255));
    cv::Mat out = ImageProcessor::sepia(input);
    EXPECT_EQ(out.size(), input.size());
    EXPECT_EQ(out.type(), CV_8UC4);
}

TEST(Cartoon, KeepsShapeAndType) {
    cv::Mat input = makeSquareImage();
    cv::Mat out = ImageProcessor::cartoon(input);
    EXPECT_EQ(out.size(), input.size());
    EXPECT_EQ(out.type(), CV_8UC4);
}

// --- Dispatch --------------------------------------------------------------

TEST(ApplyEffect, NoneReturnsEquivalentImage) {
    cv::Mat input = makeSquareImage();
    cv::Mat out = ImageProcessor::applyEffect(input, EffectType::None);
    ASSERT_EQ(out.size(), input.size());
    EXPECT_EQ(cv::countNonZero(out.reshape(1) != input.reshape(1)), 0);
}

TEST(ApplyEffect, UnknownEffectFallsBackToCopy) {
    cv::Mat input = makeSquareImage();
    cv::Mat out =
            ImageProcessor::applyEffect(input, static_cast<EffectType>(999));
    EXPECT_EQ(out.size(), input.size());
}

TEST(ApplyEffect, CannyMatchesDirectCall) {
    cv::Mat input = makeSquareImage();
    cv::Mat viaDispatch =
            ImageProcessor::applyEffect(input, EffectType::Canny);
    cv::Mat direct = ImageProcessor::cannyEdges(input);
    EXPECT_EQ(countNonZeroGray(viaDispatch), countNonZeroGray(direct));
}
