package com.edgevision.edgedetection

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.util.Log
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A self-contained native view that:
 *   1. Captures frames from the camera with CameraX `ImageAnalysis`.
 *   2. Hands each RGBA frame to native C++/OpenCV (off the UI thread).
 *   3. Blits the processed result onto a [SurfaceView].
 *   4. Tracks FPS / processing time / dropped frames and emits them to JS.
 *
 * Backpressure: `ImageAnalysis` uses STRATEGY_KEEP_ONLY_LATEST, so when
 * processing can't keep up, CameraX silently drops older frames instead of
 * queuing them — bounded latency, no memory growth. We count those drops.
 */
@SuppressLint("ViewConstructor")
class EdgeDetectionView(context: Context) :
    FrameLayout(context), LifecycleOwner {

    companion object {
        private const val TAG = "EdgeDetectionView"

        const val EVENT_FPS = "onFpsUpdate"
        const val EVENT_ERROR = "onError"
        const val EVENT_READY = "onReady"

        // Analysis resolution — a sweet spot for real-time OpenCV on-device.
        private const val ANALYSIS_WIDTH = 1280
        private const val ANALYSIS_HEIGHT = 720
    }

    private val surfaceView = SurfaceView(context)
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val lifecycleRegistry = LifecycleRegistry(this)
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

    private var cameraProvider: ProcessCameraProvider? = null
    private var surfaceReady = false

    // --- Props (set from JS via the ViewManager) ---
    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var effect: Int = 1 // Canny
    private var effectEnabled = true
    private var active = false

    // --- Reused per-frame buffers (avoid per-frame allocation) ---
    private var outputBuffer: ByteBuffer? = null
    private var outputBitmap: Bitmap? = null
    private var bufferW = 0
    private var bufferH = 0

    // --- Metrics ---
    private val processing = AtomicBoolean(false)
    private var frameCount = 0
    private var droppedFrames = 0
    private var processingMicrosSum = 0L
    private var windowStartMs = 0L
    private var emittedReady = false

    init {
        addView(
            surfaceView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                surfaceReady = true
            }

            override fun surfaceChanged(
                holder: SurfaceHolder, format: Int, width: Int, height: Int,
            ) {}

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                surfaceReady = false
            }
        })
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
    }

    override fun getLifecycle(): Lifecycle = lifecycleRegistry

    // -----------------------------------------------------------------------
    // Public prop setters
    // -----------------------------------------------------------------------

    fun setEffect(value: Int) {
        effect = value
    }

    fun setEffectEnabled(value: Boolean) {
        effectEnabled = value
    }

    fun setCameraFacing(facing: String) {
        val next = if (facing == "front") {
            CameraSelector.LENS_FACING_FRONT
        } else {
            CameraSelector.LENS_FACING_BACK
        }
        if (next != lensFacing) {
            lensFacing = next
            if (active) {
                restartCamera()
            }
        }
    }

    fun setActive(value: Boolean) {
        if (value == active) return
        active = value
        if (active) startCamera() else stopCamera()
    }

    // -----------------------------------------------------------------------
    // Camera lifecycle
    // -----------------------------------------------------------------------

    private fun startCamera() {
        resetMetrics()
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                cameraProvider = future.get()
                bindUseCases()
                lifecycleRegistry.currentState = Lifecycle.State.RESUMED
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start camera", e)
                emitError("CAMERA_INIT_FAILED", e.message ?: "Camera init failed")
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindUseCases() {
        val provider = cameraProvider ?: return
        provider.unbindAll()

        val analysis = ImageAnalysis.Builder()
            .setTargetResolution(
                android.util.Size(ANALYSIS_WIDTH, ANALYSIS_HEIGHT),
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .build()

        analysis.setAnalyzer(cameraExecutor) { image -> onFrame(image) }

        val selector = CameraSelector.Builder()
            .requireLensFacing(lensFacing)
            .build()

        try {
            provider.bindToLifecycle(this, selector, analysis)
        } catch (e: Exception) {
            Log.e(TAG, "bindToLifecycle failed", e)
            emitError("CAMERA_BIND_FAILED", e.message ?: "Camera bind failed")
        }
    }

    private fun restartCamera() {
        cameraProvider?.unbindAll()
        bindUseCases()
    }

    private fun stopCamera() {
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        cameraProvider?.unbindAll()
    }

    // -----------------------------------------------------------------------
    // Per-frame processing (runs on cameraExecutor, NOT the UI thread)
    // -----------------------------------------------------------------------

    private fun onFrame(image: ImageProxy) {
        // Drop if a previous frame is still being rendered (extra safety on
        // top of CameraX's KEEP_ONLY_LATEST backpressure).
        if (!processing.compareAndSet(false, true)) {
            droppedFrames++
            image.close()
            return
        }
        try {
            renderFrame(image)
        } catch (e: Exception) {
            Log.e(TAG, "Frame processing failed", e)
            emitError("PROCESSING_FAILED", e.message ?: "Processing failed")
        } finally {
            processing.set(false)
            image.close()
        }
    }

    private fun renderFrame(image: ImageProxy) {
        val w = image.width
        val h = image.height
        ensureBuffers(w, h)

        val outBuf = outputBuffer ?: return
        val bitmap = outputBitmap ?: return

        val plane = image.planes[0]
        val inputBuffer = plane.buffer
        val rowStride = plane.rowStride

        val effectToApply = if (effectEnabled) effect else 0 // 0 = None/passthrough

        val micros = NativeProcessor.nativeProcessFrame(
            inputBuffer, rowStride, outBuf, w, h, effectToApply,
        )
        if (micros < 0) {
            emitError("PROCESSING_FAILED", "Native processing returned error")
            return
        }

        outBuf.rewind()
        bitmap.copyPixelsFromBuffer(outBuf)

        drawToSurface(bitmap, image.imageInfo.rotationDegrees)
        recordMetrics(micros)
    }

    private fun ensureBuffers(w: Int, h: Int) {
        if (w == bufferW && h == bufferH && outputBuffer != null) return
        bufferW = w
        bufferH = h
        outputBuffer = ByteBuffer.allocateDirect(w * h * 4)
        outputBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    }

    private fun drawToSurface(bitmap: Bitmap, rotationDegrees: Int) {
        if (!surfaceReady) return
        val holder = surfaceView.holder
        val canvas: Canvas = holder.lockCanvas() ?: return
        try {
            canvas.drawColor(Color.BLACK)

            val viewW = canvas.width.toFloat()
            val viewH = canvas.height.toFloat()
            val rotated = rotationDegrees == 90 || rotationDegrees == 270
            val srcW = (if (rotated) bitmap.height else bitmap.width).toFloat()
            val srcH = (if (rotated) bitmap.width else bitmap.height).toFloat()

            // Center-crop scale to fill the view.
            val scale = maxOf(viewW / srcW, viewH / srcH)

            val matrix = Matrix()
            matrix.postTranslate(-bitmap.width / 2f, -bitmap.height / 2f)
            matrix.postRotate(rotationDegrees.toFloat())
            if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
                // Mirror the front camera for a natural selfie view.
                matrix.postScale(-1f, 1f)
            }
            matrix.postScale(scale, scale)
            matrix.postTranslate(viewW / 2f, viewH / 2f)

            canvas.drawBitmap(bitmap, matrix, paint)
        } finally {
            holder.unlockCanvasAndPost(canvas)
        }
    }

    // -----------------------------------------------------------------------
    // Metrics + events
    // -----------------------------------------------------------------------

    private fun resetMetrics() {
        frameCount = 0
        droppedFrames = 0
        processingMicrosSum = 0L
        windowStartMs = System.currentTimeMillis()
        emittedReady = false
    }

    private fun recordMetrics(micros: Long) {
        if (!emittedReady) {
            emittedReady = true
            emitReady()
        }
        frameCount++
        processingMicrosSum += micros

        val now = System.currentTimeMillis()
        val elapsed = now - windowStartMs
        if (elapsed >= 1000) {
            val fps = frameCount * 1000.0 / elapsed
            val avgMs = if (frameCount > 0) {
                (processingMicrosSum / frameCount) / 1000.0
            } else {
                0.0
            }
            emitFps(fps, avgMs, droppedFrames)
            frameCount = 0
            droppedFrames = 0
            processingMicrosSum = 0L
            windowStartMs = now
        }
    }

    private fun emitFps(fps: Double, processingMs: Double, dropped: Int) {
        val payload = Arguments.createMap().apply {
            putDouble("fps", fps)
            putDouble("processingTimeMs", processingMs)
            putInt("droppedFrames", dropped)
        }
        sendEvent(EVENT_FPS, payload)
    }

    private fun emitReady() {
        sendEvent(EVENT_READY, Arguments.createMap())
    }

    private fun emitError(code: String, message: String) {
        val payload = Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        }
        sendEvent(EVENT_ERROR, payload)
    }

    private fun sendEvent(name: String, payload: WritableMap) {
        val reactContext = context as? ReactContext ?: return
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, name, payload)
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    fun dispose() {
        active = false
        stopCamera()
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        cameraExecutor.shutdown()
        outputBitmap?.recycle()
        outputBitmap = null
        outputBuffer = null
    }
}
