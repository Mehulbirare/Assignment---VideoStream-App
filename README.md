# EdgeVision — Real-Time Video Stream Processing with OpenCV

A React Native **CLI** app that captures a live camera stream, applies a
**Canny edge-detection** effect to every frame in **native C++ using OpenCV**
(grayscale → Gaussian blur → Canny), and renders the processed stream live and
smoothly inside the app.

> **Both platforms implemented.** Android uses CameraX + JNI; iOS uses
> AVFoundation + Objective-C++. Both share the **same C++/OpenCV core**
> (`cpp/ImageProcessor.cpp`) and the **same JS layer**. See [iOS](#ios).

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture & frame pipeline](#architecture--frame-pipeline)
- [How a processed frame reaches the screen](#how-a-processed-frame-reaches-the-screen)
- [Project layout](#project-layout)
- [Setup & running](#setup--running)
- [Controls & states](#controls--states)
- [Performance & threading](#performance--threading)
- [Testing](#testing)
- [iOS](#ios)
- [Requirements checklist](#requirements-checklist)

---

## What it does

- **Source:** the device camera as a real-time stream (CameraX `ImageAnalysis`).
- **Permissions:** full lifecycle — granted / denied / blocked (never-ask-again),
  with a "Open Settings" path for the blocked case.
- **Processing:** per-frame **Canny** in native C++ (OpenCV):
  `RGBA → grayscale → Gaussian blur → Canny → RGBA`. **No pixel work happens in
  JavaScript.**
- **Rendering:** the processed RGBA frame is blitted to a native `SurfaceView`.
- **Controls (from React Native):** start/stop the stream, effect on/off toggle,
  a real-time **effect switcher**, and front/back **camera flip**.
- **Metrics overlay:** live **FPS**, **processing time per frame (ms)**, and
  **dropped-frame** count.
- **States:** `loading` (camera initializing) and `error`
  (permission denied/blocked or processing failure).

### Bonus implemented

- ✅ Multiple effects + real-time switcher: Canny, Grayscale, Blur, Sepia, Cartoon.
- ✅ Front/back camera switching (with selfie mirroring).
- ✅ Processing-time-per-frame overlay + dropped-frame handling.
- ✅ Threading: processing off the UI thread + backpressure handling.
- ✅ Unit tests for the C++ effect logic (GoogleTest) **and** the JS layer (Jest).

---

## Architecture & frame pipeline

```
                          React Native (JavaScript / TypeScript)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  App.tsx  ── state machine: idle/loading/streaming/error                    │
 │    • useCameraPermission()  → granted | denied | blocked                    │
 │    • useFrameMetrics()      → fps / ms-per-frame / dropped                  │
 │    • Controls, EffectSwitcher, FpsOverlay, StatusOverlay                    │
 │                                                                             │
 │  <EdgeDetectionView effect isActive effectEnabled cameraFacing             │
 │                     onReady onFpsUpdate onError />   (props down, events up)│
 └───────────────┬───────────────────────────────────────────────────────────┘
                 │  requireNativeComponent  (RN bridge / props + events)
 ┌───────────────▼───────────────────────────────────────────────────────────┐
 │  ANDROID NATIVE (Kotlin)                                                    │
 │  EdgeDetectionViewManager  ── maps props ↔ view, registers events          │
 │  EdgeDetectionView (FrameLayout + SurfaceView, custom LifecycleOwner)       │
 │    • CameraX ImageAnalysis (OUTPUT_IMAGE_FORMAT_RGBA_8888,                  │
 │      STRATEGY_KEEP_ONLY_LATEST)  → frames on a background executor          │
 │    • per frame: get direct RGBA ByteBuffer + rowStride                      │
 │    • NativeProcessor.nativeProcessFrame(in, stride, out, w, h, effect)      │
 │    • copyPixelsFromBuffer → Bitmap → blit to SurfaceView canvas             │
 │    • compute FPS / avg processing time / dropped frames → emit to JS        │
 └───────────────┬───────────────────────────────────────────────────────────┘
                 │  JNI (zero-copy view over the camera buffer)
 ┌───────────────▼───────────────────────────────────────────────────────────┐
 │  NATIVE C++ (OpenCV)                                                        │
 │  native-lib.cpp  ── JNI entry, wraps buffer in cv::Mat (uses rowStride)     │
 │  ImageProcessor.cpp                                                         │
 │    cannyEdges():  RGBA→gray → GaussianBlur → Canny → RGBA                   │
 │    grayscale / gaussianBlur / sepia / cartoon                              │
 │    applyEffect(): dispatch by EffectType (kept in sync with TS enum)        │
 └───────────────────────────────────────────────────────────────────────────┘
```

**iOS mirrors this exact flow** with platform-native pieces: `RCTViewManager`
instead of the Kotlin `ViewManager`, `AVCaptureVideoDataOutput` instead of
CameraX, a `CGImage`/`CALayer` blit instead of `Bitmap`/`SurfaceView` — but the
**OpenCV processing box is literally the same `cpp/ImageProcessor.cpp`** and the
JS layer is unchanged.

## How a processed frame reaches the screen

1. **Capture.** CameraX `ImageAnalysis` is configured with
   `OUTPUT_IMAGE_FORMAT_RGBA_8888`, so each `ImageProxy` arrives already in RGBA
   on a **dedicated background executor** (never the UI thread). Backpressure is
   `STRATEGY_KEEP_ONLY_LATEST` — under load, stale frames are dropped instead of
   queued, keeping latency bounded.
2. **Hand-off to C++.** We take the frame's first plane as a *direct*
   `ByteBuffer` plus its `rowStride`. In `native-lib.cpp` the JNI function wraps
   that memory **with no copy** in a `cv::Mat(h, w, CV_8UC4, ptr, rowStride)`.
3. **OpenCV processing.** `ImageProcessor::applyEffect` runs the selected effect.
   For Canny: `cvtColor(RGBA→GRAY)` → `GaussianBlur` → `Canny` →
   `cvtColor(GRAY→RGBA)`.
4. **Write back.** The result is copied into a separate **packed** output
   `ByteBuffer` (reused across frames; no per-frame allocation).
5. **Render.** Kotlin does `bitmap.copyPixelsFromBuffer(out)` then blits the
   `Bitmap` onto the `SurfaceView` canvas with a matrix that applies the camera
   rotation (and mirrors the front camera). The native processing time
   (measured in C++ with `std::chrono`) is returned across JNI.
6. **Metrics.** Every ~1 s the view emits `onFpsUpdate { fps, processingTimeMs,
   droppedFrames }` to JS, which renders the on-screen overlay.

Effect on/off and the effect switcher simply change the integer effect id sent
down as a prop — the very next frame is processed differently. `effect = 0`
(None) is a passthrough so "effect off" still shows the live camera.

---

## Project layout

```
.
├── index.js, app.json, package.json        # RN CLI entry + config
├── src/
│   ├── App.tsx                             # UI state machine
│   ├── types/index.ts                      # EffectType enum (native contract)
│   ├── constants/effects.ts               # effect list + default
│   ├── native/EdgeDetectionView.tsx       # typed wrapper over native view
│   ├── hooks/
│   │   ├── useCameraPermission.ts         # granted/denied/blocked lifecycle
│   │   └── useFrameMetrics.ts             # holds native metrics
│   └── components/                         # FpsOverlay, EffectSwitcher,
│                                           #   Controls, StatusOverlay
├── __tests__/                              # Jest tests (JS layer)
├── cpp/                                     # SHARED C++/OpenCV core
│   ├── ImageProcessor.h                     #   (compiled into BOTH platforms)
│   └── ImageProcessor.cpp                   #   pure OpenCV effects (unit-tested)
├── android/
│   └── app/src/main/
│       ├── java/com/edgevision/
│       │   ├── MainApplication.kt, MainActivity.kt
│       │   └── edgedetection/             # View, ViewManager, Package,
│       │                                   #   NativeProcessor (JNI loader)
│       └── cpp/
│           ├── native-lib.cpp             # JNI bridge -> shared core
│           ├── CMakeLists.txt             # builds libedgevision.so
│           └── tests/                      # GoogleTest for the C++ effects
├── ios/
│   ├── Podfile
│   └── EdgeVision/
│       ├── AppDelegate.{h,mm}, main.m, Info.plist, LaunchScreen.storyboard
│       └── EdgeDetection/
│           ├── EdgeDetectionView.{h,mm}    # AVFoundation capture + render
│           └── EdgeDetectionViewManager.mm # RCTViewManager -> shared core
└── TEST_CASES.md                           # manual + automated test plan
```

---

## Setup & running

### Prerequisites

- Node ≥ 18, JDK 17, Android SDK + **NDK 25.x**, CMake 3.22.
- A physical Android device (recommended for real FPS) or an emulator with a
  virtual/webcam camera.

### 1) Install JS dependencies

```bash
npm install
```

### 2) Add the OpenCV Android SDK

OpenCV is large and not committed. Download the **OpenCV Android SDK** (4.x) from
<https://opencv.org/releases/> and unpack it so the CMake config resolves:

```
android/opencv/sdk/native/jni/OpenCVConfig.cmake
```

i.e. place the SDK at `android/opencv/`. The path is wired through
`android/gradle.properties` (`opencvSdkPath=../opencv/sdk/native/jni`) into
`app/build.gradle` → CMake (`-DOpenCV_DIR=...`). To use a different location,
override `opencvSdkPath` in `android/local.properties`.

> The SDK ships static OpenCV libs that are linked directly into
> `libedgevision.so`, so no extra `.so` needs to be bundled.

### 3) Generate the Gradle wrapper (first checkout only)

The binary `gradle-wrapper.jar` is not committed. From `android/`:

```bash
gradle wrapper --gradle-version 8.3
```

(or open the `android/` folder once in Android Studio, which generates it).

### 4) Run

```bash
npm start            # Metro bundler
npm run android      # build + install on device/emulator
```

Grant the camera permission when prompted, then tap the shutter to start.

---

## Controls & states

| Control            | Behaviour                                                       |
| ------------------ | -------------------------------------------------------------- |
| Shutter button     | Start / stop the stream                                         |
| **Effect** switch  | Effect on/off (off = passthrough live preview)                 |
| Effect chips       | Real-time switch: Canny, Grayscale, Blur, Sepia, Cartoon       |
| **Flip**           | Front / back camera                                            |

**States**

- **loading** — overlay + spinner while CameraX and the pipeline initialize
  (cleared by the native `onReady` event after the first rendered frame).
- **error** — permission denied/blocked, camera init/bind failure, or a native
  processing error (surfaced via `onError`), with a Retry / Open Settings action.

---

## Performance & threading

- **Off the UI thread:** all capture, JNI, OpenCV, and the surface blit run on a
  single-threaded `cameraExecutor`; the JS/UI thread only handles props/events.
- **Backpressure:** CameraX `KEEP_ONLY_LATEST` + an `AtomicBoolean` guard drop
  frames rather than queue them; drops are counted and shown.
- **Zero/low copy:** the camera buffer is wrapped directly as a `cv::Mat`; the
  output buffer and `Bitmap` are allocated once and reused.
- **Tunables:** analysis resolution (`ANALYSIS_WIDTH/HEIGHT`) and Canny
  thresholds / blur kernel (defaults in `ImageProcessor`) trade quality vs FPS.

---

## Testing

See **[TEST_CASES.md](TEST_CASES.md)** for the full manual + automated plan.

```bash
# JS layer (hooks, components, native contract)
npm test

# C++ effect logic (desktop OpenCV + GoogleTest; no device needed)
npm run test:native
```

---

## iOS

iOS is implemented natively in Objective-C++ and **reuses the exact same C++
core** (`cpp/ImageProcessor.cpp`) and JS layer as Android:

- `ios/EdgeVision/EdgeDetection/EdgeDetectionView.mm` — an `AVCaptureSession`
  with `AVCaptureVideoDataOutput` (BGRA, `alwaysDiscardsLateVideoFrames` for
  backpressure) delivers frames on a **dedicated serial queue**. Each
  `CVPixelBuffer` is wrapped in a `cv::Mat`, converted BGRA→RGBA, run through
  `ImageProcessor::applyEffect`, turned into a `CGImage`, and blitted onto a
  `CALayer` on the main thread. Orientation/mirroring is handled on the capture
  connection. FPS / processing-time / dropped-frame metrics and errors are
  emitted to JS via `RCTBubblingEventBlock` (same event names as Android).
- `ios/EdgeVision/EdgeDetection/EdgeDetectionViewManager.mm` — an
  `RCTViewManager` exporting the view as `"EdgeDetectionView"`, so the same
  `src/native/EdgeDetectionView.tsx` wrapper drives both platforms unchanged.
- Camera permission (`NSCameraUsageDescription` in `Info.plist`) is requested
  natively; denial/restriction surfaces as an `onError` → the JS error overlay.

### iOS setup

`react-native init` normally generates the Xcode project; this repo ships the
source + config (parallel to Android shipping source but not the Gradle wrapper
jar / OpenCV SDK). To get a buildable workspace:

1. **Generate the Xcode project** (one-time). Either open `ios/` in Xcode, or
   generate a matching template and keep this repo's `ios/EdgeVision/*` sources:
   ```bash
   npx @react-native-community/cli@13 init EdgeVision --version 0.73.6 --skip-install --directory /tmp/EdgeVisionTemplate
   cp -R /tmp/EdgeVisionTemplate/ios/EdgeVision.xcodeproj ios/
   ```
2. **Add native files to the target.** In Xcode, add the `EdgeDetection/` group
   and `cpp/ImageProcessor.cpp` to the `EdgeVision` target.
3. **Header search path.** Add `$(SRCROOT)/../cpp` to *Header Search Paths* so
   `#import "ImageProcessor.h"` resolves; ensure *C++ Language Dialect* = C++17.
4. **OpenCV.** Keep `pod 'OpenCV'` in the `Podfile`, or drop in
   `opencv2.framework` (see the comment in the Podfile).
5. Install pods and run:
   ```bash
   cd ios && pod install && cd ..
   npm run ios
   ```

---

## Requirements checklist

| Requirement                                            | Status |
| ------------------------------------------------------ | :----: |
| Real-time camera stream                                |   ✅   |
| Permission handling (granted/denied/blocked)           |   ✅   |
| Canny in native C++ (gray → blur → Canny), not JS      |   ✅   |
| Live, smooth rendering via native view                 |   ✅   |
| Start/stop + effect on/off from React Native           |   ✅   |
| On-screen FPS counter                                  |   ✅   |
| Loading & error states                                 |   ✅   |
| README (pipeline + how frames reach the screen)        |   ✅   |
| Bonus: multiple effects + switcher                     |   ✅   |
| Bonus: front/back camera                               |   ✅   |
| Bonus: processing-time + dropped-frame handling        |   ✅   |
| Bonus: threading + backpressure                        |   ✅   |
| Bonus: C++ unit tests                                  |   ✅   |
| Bonus: both platforms (Android + iOS)                  |   ✅   |
| Bonus: record/save output                              |  ⬜ (not implemented) |
```
