# EdgeVision — Test Cases

This document is the complete test plan: **automated tests** (run them) and
**manual test cases** (walk through them on a device). Each case lists steps and
the expected result so you can tick them off.

---

## 0. How to run the automated tests

```bash
# JS / TypeScript layer — hooks, components, native contract
npm test

# Static typecheck
npm run tsc

# C++ effect logic (desktop OpenCV + GoogleTest, no device needed)
npm run test:native
```

Expected: `npm test` → **10 passed**; `npm run tsc` → no errors;
`npm run test:native` → all GoogleTest cases pass.

---

## 1. Automated — JS layer (Jest) ✅ implemented

| ID    | Test                                          | Expected |
| ----- | --------------------------------------------- | -------- |
| JS-1  | `effects` default is Canny                     | `DEFAULT_EFFECT === EffectType.Canny` |
| JS-2  | Effect list = Canny + 4 bonus effects          | Order: Canny, Grayscale, Blur, Sepia, Cartoon |
| JS-3  | Every effect has label + description           | All non-empty |
| JS-4  | TS enum values match the native C++ contract   | None=0…Cartoon=5 |
| JS-5  | `useFrameMetrics` starts at zero               | `{fps:0, processingTimeMs:0, droppedFrames:0}` |
| JS-6  | `useFrameMetrics` rounds native payloads       | 29.7→30 fps, 12.34→12.3 ms |
| JS-7  | `useFrameMetrics` reset                        | back to zero |
| JS-8  | `EffectSwitcher` renders a chip per effect     | All chips visible |
| JS-9  | Tapping a chip fires `onSelect(effect)`        | Correct effect id |
| JS-10 | Disabled switcher ignores taps                 | `onSelect` not called |

## 2. Automated — C++ effect logic (GoogleTest) ✅ implemented

File: `android/app/src/main/cpp/tests/test_image_processor.cpp`

| ID    | Test                                          | Expected |
| ----- | --------------------------------------------- | -------- |
| CPP-1 | Canny preserves W×H and returns CV_8UC4        | Same dims, RGBA |
| CPP-2 | Canny detects edges on a white square          | > 100 edge pixels |
| CPP-3 | Canny on a flat image → no edges               | 0 edge pixels |
| CPP-4 | Higher thresholds ⇒ fewer/equal edges          | `low >= high` |
| CPP-5 | Grayscale output has R==G==B, alpha kept        | equal channels, A=255 |
| CPP-6 | Gaussian blur keeps shape/type                 | same size, RGBA |
| CPP-7 | Even blur kernel is normalized (no throw)      | no exception |
| CPP-8 | Sepia keeps shape/type                          | same size, RGBA |
| CPP-9 | Cartoon keeps shape/type                        | same size, RGBA |
| CPP-10| `applyEffect(None)` returns identical image     | pixel-equal |
| CPP-11| Unknown effect id falls back to a copy          | same size |
| CPP-12| `applyEffect(Canny)` == direct `cannyEdges`     | equal edge count |

---

> **Platforms:** the manual cases below apply to **both Android and iOS**.
> The C++ tests (§2) validate the shared `cpp/ImageProcessor.cpp` used by both.
> Permission specifics differ slightly — noted inline in §3.

## 3. Manual — Permissions (granted / denied / blocked)

> **Android** distinguishes denied vs. blocked (never-ask-again). **iOS** shows
> the system prompt once; after denial the app surfaces an error overlay and the
> user must re-enable in Settings (iOS PERM-2..PERM-4 collapse into "denied →
> Settings"). Native code requests the iOS permission and emits `onError`
> (`PERMISSION_DENIED` / `PERMISSION_BLOCKED`).

| ID    | Steps                                                                 | Expected |
| ----- | -------------------------------------------------------------------- | -------- |
| PERM-1 | Fresh install → tap shutter → OS prompt → **Allow**                 | Stream starts; loading → live processed feed |
| PERM-2 | Fresh install → tap shutter → **Deny**                              | "Camera permission needed" overlay with **Grant access** |
| PERM-3 | After deny, tap **Grant access**                                    | OS prompt re-shown; allowing starts the stream |
| PERM-4 | Deny twice / "Don't ask again" (blocked)                           | "Camera access blocked" overlay with **Open Settings** |
| PERM-5 | Tap **Open Settings** (blocked)                                     | OS app-settings page opens |
| PERM-6 | Enable permission in Settings → return to app                      | Returning + start shows the live feed |

## 4. Manual — Stream start/stop & rendering

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| STR-1 | Tap shutter to start                                  | Brief "Starting camera…" loading, then live feed |
| STR-2 | Observe default effect                                | Canny edges (white lines on black) render live |
| STR-3 | Tap shutter to stop                                   | Feed stops; FPS overlay disappears; camera LED off |
| STR-4 | Start → stop → start repeatedly                       | No crash, no leak, restarts cleanly each time |
| STR-5 | Smoothness                                            | Visibly fluid (target ≥ 24 FPS at 720p on mid device) |

## 5. Manual — Effect controls

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| FX-1  | While streaming, tap each effect chip                 | Feed updates within ~1 frame: Canny/Grayscale/Blur/Sepia/Cartoon |
| FX-2  | Toggle **Effect** switch OFF                          | Passthrough live camera (no processing); chips disabled/greyed |
| FX-3  | Toggle **Effect** switch ON                          | Selected effect re-applies immediately |
| FX-4  | Switch effects rapidly several times                  | No crash, no frozen frame, FPS recovers |

## 6. Manual — Camera switching

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| CAM-1 | While streaming, tap **Flip**                         | Switches back↔front; processing continues |
| CAM-2 | Front camera orientation                              | Image is mirrored (natural selfie) and upright |
| CAM-3 | Flip repeatedly                                       | No crash; effect stays applied |

## 7. Manual — FPS / metrics overlay

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| FPS-1 | Start stream, watch top-left overlay                  | FPS, ms/frame update ~once per second |
| FPS-2 | FPS color thresholds                                  | green ≥24, amber 15–23, red <15 |
| FPS-3 | Cover camera / point at flat wall vs detailed scene   | ms/frame changes with scene complexity (esp. Cartoon) |
| FPS-4 | Force load (Cartoon at high res on weak device)        | Dropped-frame count appears and increments |

## 8. Manual — States & errors

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| ST-1  | Start stream                                          | "loading" overlay shows until first frame (`onReady`) |
| ST-2  | Simulate processing failure (e.g. force native -1)*  | "error" overlay with **Retry** |
| ST-3  | Tap **Retry** after an error                         | Pipeline reinitializes and resumes |
| ST-4  | Background the app while streaming, then return       | Camera releases on background and resumes cleanly |

\* For ST-2 you can temporarily make `nativeProcessFrame` return `-1` to verify
the error path; revert afterwards.

## 9. Manual — Threading / backpressure / performance

| ID    | Steps                                                | Expected |
| ----- | ---------------------------------------------------- | -------- |
| PERF-1| Scroll/tap UI while streaming                         | UI stays responsive (processing is off the UI thread) |
| PERF-2| Run a heavy effect on a low-end device                | FPS drops gracefully; frames dropped, not queued; no OOM |
| PERF-3| Long run (5+ min)                                     | Stable memory (buffers/Bitmap reused), no leak/crash |

---

## 10. Edge cases to verify

- Rotate device (locked to portrait by default) — feed stays correct.
- Start stream with permission already granted — skips prompt, goes straight to loading.
- Rapidly start/stop while loading — no dangling camera session.
- Very small / very large analysis resolution (change `ANALYSIS_WIDTH/HEIGHT`) — buffers reallocate correctly.

---

## Summary

| Layer            | Type       | Status |
| ---------------- | ---------- | ------ |
| JS hooks/components/contract | Automated (Jest) | ✅ 10 cases passing |
| C++ OpenCV effects (shared by Android + iOS) | Automated (GoogleTest) | ✅ 12 cases |
| TypeScript        | Static (tsc) | ✅ clean |
| Permissions / UI / camera / metrics / states / perf | Manual (Android + iOS) | 📋 checklist above |
