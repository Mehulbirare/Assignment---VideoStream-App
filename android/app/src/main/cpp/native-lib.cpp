#include <jni.h>
#include <android/log.h>

#include <chrono>

#include <opencv2/core.hpp>

#include "ImageProcessor.h"

#define LOG_TAG "EdgeVisionNative"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

using edgevision::EffectType;
using edgevision::ImageProcessor;

extern "C" {

/**
 * Process one RGBA frame.
 *
 * CameraX delivers RGBA frames whose rows may be padded, so the input is
 * described by [inputRowStride] (bytes per row, >= width*4). We wrap that
 * memory in a cv::Mat with no copy (using the stride as the Mat step), run
 * the OpenCV effect, then write a *packed* result (width*4 per row) into
 * [outputBuffer] which backs the Bitmap the renderer blits to the surface.
 *
 * Keeping input and output separate avoids any in-place stride hazards and
 * lets the renderer hand us a clean ARGB_8888 buffer.
 *
 * @return native processing time in microseconds, or -1 on failure.
 */
JNIEXPORT jlong JNICALL
Java_com_edgevision_edgedetection_NativeProcessor_nativeProcessFrame(
        JNIEnv *env, jobject /* thiz */, jobject inputBuffer,
        jint inputRowStride, jobject outputBuffer, jint width, jint height,
        jint effect) {
    auto *inData =
            static_cast<uint8_t *>(env->GetDirectBufferAddress(inputBuffer));
    auto *outData =
            static_cast<uint8_t *>(env->GetDirectBufferAddress(outputBuffer));
    if (inData == nullptr || outData == nullptr || width <= 0 || height <= 0) {
        LOGE("Invalid buffers (in=%p, out=%p, %dx%d)", inData, outData, width,
             height);
        return -1;
    }

    const auto start = std::chrono::steady_clock::now();
    try {
        // Zero-copy view over the (possibly padded) camera buffer.
        cv::Mat frame(height, width, CV_8UC4, inData,
                      static_cast<size_t>(inputRowStride));

        cv::Mat processed =
                ImageProcessor::applyEffect(frame, static_cast<EffectType>(effect));

        // Packed destination (no padding) backing the output Bitmap.
        cv::Mat outMat(height, width, CV_8UC4, outData);
        processed.copyTo(outMat);
    } catch (const cv::Exception &e) {
        LOGE("OpenCV error: %s", e.what());
        return -1;
    } catch (...) {
        LOGE("Unknown native processing error");
        return -1;
    }

    const auto end = std::chrono::steady_clock::now();
    return std::chrono::duration_cast<std::chrono::microseconds>(end - start)
            .count();
}

}  // extern "C"
