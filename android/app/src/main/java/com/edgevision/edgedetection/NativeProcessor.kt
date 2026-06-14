package com.edgevision.edgedetection

import java.nio.ByteBuffer

/**
 * Thin Kotlin wrapper over the JNI entry point in native-lib.cpp.
 *
 * The native side reads the (possibly row-padded) camera buffer and writes a
 * packed RGBA result into [outputBuffer], which backs the Bitmap the renderer
 * blits to the surface. Buffers are reused per view to avoid per-frame
 * allocations.
 */
object NativeProcessor {

    init {
        System.loadLibrary("edgevision")
    }

    /**
     * Apply [effect] to the RGBA frame in [inputBuffer] (row stride
     * [inputRowStride]) and write the packed result into [outputBuffer]
     * (width * height * 4 bytes). Both must be direct buffers.
     *
     * @return native processing time in microseconds, or -1 on failure.
     */
    external fun nativeProcessFrame(
        inputBuffer: ByteBuffer,
        inputRowStride: Int,
        outputBuffer: ByteBuffer,
        width: Int,
        height: Int,
        effect: Int,
    ): Long
}
