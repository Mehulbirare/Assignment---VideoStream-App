# EdgeVision — Real-Time Video Stream Processing with OpenCV

A **React Native (CLI)** app that captures a live camera stream, applies a
**Canny edge-detection** effect to **every frame in native C++ using OpenCV**
(grayscale → Gaussian blur → Canny), and renders the processed stream back to
the screen — live and smoothly — with an on-screen FPS counter.

**Repo:** https://github.com/Mehulbirare/Assignment---VideoStream-App

> **Both platforms implemented.** Android uses **CameraX + JNI**; iOS uses
> **AVFoundation + Objective-C++**. Both call the **same C++/OpenCV core**
> (`cpp/ImageProcessor.cpp`) and are driven by the **same JS/TS layer** — one
> source of truth for the image processing and one for the UI.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture & frame pipeline](#architecture--frame-pipeline)
- [How a processed frame reaches the screen](#how-a-processed-frame-reaches-the-screen)
- [Approach & key design decisions](#approach--key-design-decisions)
- [Project layout](#project-layout)
- [Setup & running (Android)](#setup--running-android)
- [Setup & running (iOS)](#setup--running-ios)
- [Controls & states](#controls--states)
- [Performance & threading](#performance--threading)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [What I'd improve / add with more time](#what-id-improve--add-with-more-time)
- [Requirements checklist](#requirements-checklist)

---

## Features

### Required

- **Real-time camera source** — live video stream from the device camera.
- **Permission handling** — full lifecycle: **granted / denied / blocked**
  (never-ask-again), with an "Open Settings" path for the blocked case.
- **Native C++ Canny** — per frame: `RGBA → grayscale → Gaussian blur → Canny`,
  implemented with **OpenCV in native C++**. **No pixel work happens in JS.**
- **Live rendering** — the processed frame is blitted to a native view
  (`SurfaceView` on Android, `CALayer` on iOS).
- **Controls from React Native** — start/stop the stream and an effect on/off
  toggle.
- **On-screen FPS counter** — so smoothness is measurable.
- **States** — `loading` (camera initializing) and `error` (permission
  denied/blocked or processing failure).

### Bonus implemented

- ✅ **Multiple effects + real-time switcher** — Canny, Grayscale, Blur, Sepia,
  Cartoon.
- ✅ **Both Android and iOS** (shared C++ core).
- ✅ **Front / back camera switching** (with selfie mirroring on the front cam).
- ✅ **Processing-time-per-frame overlay + dropped-frame handling.**
- ✅ **Threading** — processing runs off the UI thread, with backpressure.
- ✅ **Unit tests for the C++ effect logic** (GoogleTest) **and** the JS layer
  (Jest).

> ⬜ **Not implemented:** record/save the processed output, and face detection.
> See [What I'd improve](#what-id-improve--add-with-more-time).

---

## Tech stack

| Layer       | Technology |
| ----------- | ---------- |
| App / UI    | React Native 0.73 (CLI), TypeScript |
| Android cap | CameraX `ImageAnalysis` (Kotlin), custom `SurfaceView` |
| iOS capture | AVFoundation `AVCaptureVideoDataOutput` (Objective-C++), `CALayer` |
| Native core | C++17 + **OpenCV 4.x** (shared `cpp/ImageProcessor.cpp`) |
| Bridge      | Android JNI; iOS `RCTViewManager` + `RCTBubblingEventBlock` |
| Tests       | Jest + @testing-library/react-native; GoogleTest (C++) |

---

## Architecture & frame pipeline

```
                          React Native (JavaScript / TypeScript)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  App.tsx  ── state machine: idle / loading / streaming / error             │
 │    • useCameraPermission()  → granted | denied | blocked                   │
 │    • useFrameMetrics()      → fps / ms-per-frame / dropped                 │
 │    • Controls, EffectSwitcher, FpsOverlay, StatusOverlay                   │
 │                                                                            │
 │  <EdgeDetectionView effect isActive effectEnabled cameraFacing            │
 │                     onReady onFpsUpdate onError />  (props down, events up)│
 └───────────────┬───────────────────────────────────────────────────────────┘
                 │  requireNativeComponent (RN bridge: props down, events up)
 ┌───────────────▼─────────────────────────┐   ┌─────────────────────────────┐
 │  ANDROID NATIVE (Kotlin)                 │   │  iOS NATIVE (Objective-C++) │
 │  EdgeDetectionViewManager (props/events) │   │  EdgeDetectionViewManager   │
 │  EdgeDetectionView                       │   │  EdgeDetectionView          │
 │   • CameraX ImageAnalysis (RGBA_8888,    │   │   • AVCaptureVideoDataOutput│
 │     KEEP_ONLY_LATEST) on bg executor     │   │     (BGRA) on serial queue  │
 │   • direct RGBA ByteBuffer + rowStride   │   │   • CVPixelBuffer → cv::Mat │
 │   • NativeProcessor.nativeProcessFrame() │   │   • ImageProcessor::apply…  │
 │   • Bitmap → blit to SurfaceView         │   │   • CGImage → blit CALayer  │
 │   • FPS / ms / dropped → emit to JS      │   │   • FPS / ms / dropped → JS │
 └───────────────┬─────────────────────────┘   └──────────────┬──────────────┘
                 │  JNI (zero-copy cv::Mat over buffer)        │  (direct C++ call)
 ┌───────────────▼─────────────────────────────────────────────▼──────────────┐
 │  SHARED NATIVE C++ (OpenCV)  —  cpp/ImageProcessor.cpp                       │
 │    cannyEdges():  RGBA → gray → GaussianBlur → Canny → RGBA                  │
 │    grayscale / gaussianBlur / sepia / cartoon                               │
 │    applyEffect(EffectType): dispatch (enum kept in sync with the TS enum)    │
 └─────────────────────────────────────────────────────────────────────────────┘
```

## How a processed frame reaches the screen

Using **Android** as the reference (iOS is identical in shape — see
[iOS](#setup--running-ios)):

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

Effect on/off and the switcher simply change the integer effect id sent down as
a prop — the **very next frame** is processed differently. `effect = 0` (None)
is a passthrough, so "effect off" still shows the live camera.

---

## Approach & key design decisions

- **Keep all per-pixel work in native C++.** JavaScript never touches frame
  bytes. The bridge only carries small control props (down) and metric events
  (up), so the RN/JS thread is never on the hot path.
- **One shared C++ core for both platforms.** `cpp/ImageProcessor.cpp` is pure
  OpenCV with zero Android/iOS dependencies. Android compiles it via CMake/NDK;
  iOS compiles the same file in its target. This guarantees identical results,
  halves the maintenance surface, and makes the effect logic **unit-testable on
  a desktop** (no device/emulator needed).
- **A single integer "effect contract."** The `EffectType` enum is defined
  identically in TypeScript (`src/types/index.ts`) and C++
  (`cpp/ImageProcessor.h`). JS sends the raw int across the bridge; a Jest test
  asserts the two stay in sync. Simple, fast, and impossible to desync silently.
- **Native view component, not a JS frame processor.** Capture → process →
  render all happen natively and the result is drawn straight to a
  `SurfaceView` / `CALayer`. This avoids round-tripping pixels through JS and
  gives smooth, low-latency output. (A JSI/Skia frame processor is a great
  alternative — see [improvements](#what-id-improve--add-with-more-time).)
- **Backpressure by dropping, not queuing.** CameraX `KEEP_ONLY_LATEST` plus an
  `AtomicBoolean` "busy" guard means a slow frame never backs up a queue; we
  drop and count it. Latency stays bounded and memory flat.
- **Allocate once, reuse forever.** The output buffer and `Bitmap` are sized to
  the frame and reused, and the input `cv::Mat` is a zero-copy view over the
  camera buffer — minimal per-frame allocation/GC pressure.
- **Metrics measured natively.** FPS, average processing time, and dropped
  frames reflect the *native* render loop (where the work happens), not the JS
  bridge, so the numbers are honest.

---

## Project layout

```
.
├── index.js, app.json, package.json        # RN CLI entry + config
├── metro.config.js                          # includes the @/ path-alias resolver
├── src/
│   ├── App.tsx                             # UI state machine
│   ├── types/index.ts                      # EffectType enum (native contract)
│   ├── constants/effects.ts               # effect list + default
│   ├── native/EdgeDetectionView.tsx       # typed wrapper over the native view
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
│   ├── gradlew, gradlew.bat, gradle/        # Gradle wrapper (committed)
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
└── TEST_CASES.md                           # full manual + automated test plan
```

---

## Setup & running (Android)

### Prerequisites

- **Node ≥ 18** and **JDK 17**
- **Android SDK** + **NDK 25.x** + **CMake 3.22** (install via Android Studio →
  SDK Manager → SDK Tools)
- A physical device (best for real FPS) or an emulator with a camera
  (set the AVD's *Back camera* to **Webcam0** or **VirtualScene**)

### 1) Install JS dependencies

```bash
npm install
```

### 2) Point Gradle at your Android SDK

Create `android/local.properties` (git-ignored, machine-specific):

```properties
# Windows
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
# macOS:  sdk.dir=/Users/<you>/Library/Android/sdk
# Linux:  sdk.dir=/home/<you>/Android/Sdk
```

(Or set the `ANDROID_HOME` environment variable instead.)

### 3) Add the OpenCV Android SDK (one-time, ~300 MB)

OpenCV is large and not committed. Download the **OpenCV Android SDK 4.x** from
<https://opencv.org/releases/> (this project was built against **4.10.0**) and
unpack it so this path exists:

```
android/opencv/sdk/native/jni/OpenCVConfig.cmake
```

i.e. place the SDK folder at `android/opencv/`. The path is wired through
`android/gradle.properties` (`opencvSdkPath`) into `app/build.gradle` → CMake
(`-DOpenCV_DIR=...`, resolved to an absolute path). To use a different location,
override `opencvSdkPath` in `android/local.properties`.

> The OpenCV SDK's prebuilt native libraries are linked by CMake and packaged
> into the app automatically — nothing else to copy.

### 4) Run

```bash
npm start            # terminal 1: Metro bundler
npm run android      # terminal 2: build + install + launch
```

> The **first** build compiles OpenCV + the C++ pipeline for each ABI and can
> take several minutes; subsequent builds are seconds. The Gradle wrapper and a
> debug keystore are committed, so no extra signing setup is needed.

Grant the camera permission when prompted, then tap the shutter to start.

If `npm run android` can't find `gradlew`, see [Troubleshooting](#troubleshooting).

---

## Setup & running (iOS)

iOS is implemented in Objective-C++ and **reuses the exact same C++ core** and JS
layer as Android:

- `ios/.../EdgeDetectionView.mm` — an `AVCaptureSession` with
  `AVCaptureVideoDataOutput` (BGRA, `alwaysDiscardsLateVideoFrames` for
  backpressure) delivers frames on a **dedicated serial queue**. Each
  `CVPixelBuffer` is wrapped in a `cv::Mat`, converted BGRA→RGBA, run through
  `ImageProcessor::applyEffect`, turned into a `CGImage`, and blitted onto a
  `CALayer` on the main thread. Metrics/errors are emitted via
  `RCTBubblingEventBlock` (same event names as Android).
- `ios/.../EdgeDetectionViewManager.mm` — an `RCTViewManager` exporting the view
  as `"EdgeDetectionView"`, so the same `src/native/EdgeDetectionView.tsx`
  wrapper drives both platforms unchanged.
- Camera permission (`NSCameraUsageDescription` in `Info.plist`) is requested
  natively; denial surfaces as `onError` → the JS error overlay.

### iOS setup steps

`react-native init` normally generates the Xcode project; this repo ships the
iOS **source + config** (the same way Android ships source but not the OpenCV
SDK). To get a buildable workspace on a Mac:

1. **Generate the Xcode project** (one-time), keeping this repo's
   `ios/EdgeVision/*` sources:
   ```bash
   npx @react-native-community/cli@13 init EdgeVision --version 0.73.6 \
       --skip-install --directory /tmp/EdgeVisionTemplate
   cp -R /tmp/EdgeVisionTemplate/ios/EdgeVision.xcodeproj ios/
   ```
2. **Add native files to the target.** In Xcode, add the `EdgeDetection/` group
   and `cpp/ImageProcessor.cpp` to the `EdgeVision` target.
3. **Header search path.** Add `$(SRCROOT)/../cpp` to *Header Search Paths*;
   ensure *C++ Language Dialect* = `C++17`.
4. **OpenCV.** Keep `pod 'OpenCV'` in the `Podfile`, or drop in
   `opencv2.framework` (see the comment in the Podfile).
5. Install pods and run:
   ```bash
   cd ios && pod install && cd ..
   npm run ios
   ```

---

## Controls & states

| Control            | Behaviour                                                 |
| ------------------ | -------------------------------------------------------- |
| Shutter button     | Start / stop the stream                                   |
| **Effect** switch  | Effect on/off (off = passthrough live preview)           |
| Effect chips       | Real-time switch: Canny, Grayscale, Blur, Sepia, Cartoon |
| **Flip**           | Front / back camera                                       |

**States**

- **loading** — overlay + spinner while the camera and pipeline initialize
  (cleared by the native `onReady` event after the first rendered frame).
- **error** — permission denied/blocked, camera init/bind failure, or a native
  processing error (via `onError`), with a Retry / Open Settings action.

---

## Performance & threading

- **Off the UI thread:** capture, JNI, OpenCV, and the blit run on a dedicated
  worker (`cameraExecutor` on Android, a serial `dispatch_queue` on iOS); the
  JS/UI thread only handles props/events.
- **Backpressure:** `KEEP_ONLY_LATEST` / `alwaysDiscardsLateVideoFrames` plus a
  busy-guard drop frames rather than queue them; drops are counted and shown.
- **Low/zero copy:** the camera buffer is a zero-copy `cv::Mat` view; the output
  buffer and `Bitmap` are allocated once and reused.
- **Tunables:** analysis resolution (`ANALYSIS_WIDTH/HEIGHT` in
  `EdgeDetectionView`) and the Canny thresholds / blur kernel (defaults in
  `ImageProcessor`) trade quality vs FPS.

---

## Testing

Full plan in **[TEST_CASES.md](TEST_CASES.md)** (automated + manual).

```bash
npm test            # JS layer: hooks, components, native enum contract (Jest)
npm run tsc         # TypeScript typecheck
npm run lint        # ESLint
npm run test:native # C++ effect logic: GoogleTest + desktop OpenCV (no device)
```

- **JS (Jest):** 10 cases — effect config, the TS↔C++ enum contract,
  `useFrameMetrics` rounding/reset, `EffectSwitcher` behavior.
- **C++ (GoogleTest):** 12 cases — Canny dimensions/type, edge detection on a
  synthetic square, blank-image → no edges, threshold monotonicity, grayscale
  channel equality, blur kernel normalization, sepia/cartoon shape, dispatch.

> `npm run test:native` needs desktop OpenCV (`brew install opencv` /
> `apt install libopencv-dev` / `vcpkg install opencv4`).

---

## Troubleshooting

Issues commonly hit on a fresh machine (all resolved in this repo's config):

| Symptom | Cause / fix |
| ------- | ----------- |
| `'gradlew.bat' is not recognized` | Run Gradle from the `android/` folder (`cd android && .\gradlew.bat ...`). The wrapper **is** committed; this is a CLI-from-root quirk on Windows. |
| CMake: `Could not find ... OpenCVConfig.cmake` | The OpenCV SDK isn't at `android/opencv/sdk/native/jni`. See [step 3](#3-add-the-opencv-android-sdk-one-time-300-mb). `OpenCV_DIR` must be **absolute** (already handled in `app/build.gradle`). |
| App shows **Unable to load script** + `socket failed: EPERM` | Missing `INTERNET` permission (present in this repo) — rebuild. |
| `CLEARTEXT communication ... not permitted` | The debug build needs `usesCleartextTraffic` (provided via `android/app/src/debug/AndroidManifest.xml`). |
| Metro: `Unable to resolve module @/...` | The `@/` path alias needs a Metro resolver — configured in `metro.config.js`. Restart Metro with `--reset-cache` after changing it. |
| `EADDRINUSE :::8081` | A Metro is already running. Kill it: PowerShell `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8081 -State Listen).OwningProcess -Force`. |
| Emulator shows a black/!  preview | Set the AVD camera to **Webcam0**/**VirtualScene** in the emulator's settings. |
| Installed APK can't reach Metro on a device | `adb reverse tcp:8081 tcp:8081`. |

---

## What I'd improve / add with more time

**Finish the remaining bonuses**

- **Record / save the processed output** — on Android, encode the processed
  frames with `MediaCodec` + `MediaMuxer` (or render to an input `Surface`); on
  iOS, `AVAssetWriter`. Add a record button + share sheet.
- **Face detection effect** — ML Kit / Vision face detector (or OpenCV Haar/DNN)
  with overlay boxes, exposed as another `EffectType`.

**Performance / rendering**

- **GPU rendering path** — upload the processed frame to an OpenGL ES texture
  (`TextureView`/`GLSurfaceView`) on Android and a Metal/`CAMetalLayer` view on
  iOS, removing the per-frame `Bitmap`/`CGImage` allocation and CPU blit.
- **GPU OpenCV** — run the pipeline through OpenCV's T-API/OpenCL (or shader
  Sobel/Canny) to push well past current FPS on high-res frames.
- **Adaptive quality** — auto-tune analysis resolution / Canny thresholds from
  the live FPS to hold a target frame rate on weaker devices.
- **New Architecture (Fabric + JSI)** — a Fabric native component and/or a
  vision-camera-style **JSI frame processor** to remove the legacy bridge and
  share buffers without copies.

**Robustness & polish**

- **Commit a generated iOS Xcode project** (e.g. via XcodeGen) so iOS is also
  one-command, and **add CI** (GitHub Actions) running Jest, the C++ GoogleTests,
  and a Gradle `assembleDebug` on every push.
- **Camera UX** — pinch-to-zoom, tap-to-focus, exposure control, and persisted
  user settings (last effect / camera).
- **A small download script** for the OpenCV SDK, and on-device **benchmarks**
  across a few resolutions/devices documented in the README.

---

## Requirements checklist

| Requirement                                            | Status |
| ------------------------------------------------------ | :----: |
| Real-time camera stream                                |   ✅   |
| Permission handling (granted / denied / blocked)       |   ✅   |
| Canny in native C++ (gray → blur → Canny), not JS      |   ✅   |
| Live, smooth rendering via a native view               |   ✅   |
| Start/stop + effect on/off from React Native           |   ✅   |
| On-screen FPS counter                                  |   ✅   |
| Loading & error states                                 |   ✅   |
| README (setup, approach, pipeline, improvements)       |   ✅   |
| Bonus: multiple effects + real-time switcher           |   ✅   |
| Bonus: both platforms (Android + iOS)                  |   ✅   |
| Bonus: front/back camera switching                     |   ✅   |
| Bonus: processing-time overlay + dropped-frame handling|   ✅   |
| Bonus: threading off UI thread + backpressure          |   ✅   |
| Bonus: C++ unit tests                                  |   ✅   |
| Bonus: record/save output                              |   ⬜   |
| Bonus: face detection                                  |   ⬜   |
```
