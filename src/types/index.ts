/**
 * Shared types for the EdgeVision app.
 */

/** Effects implemented in native C++ (OpenCV). Values match the C++ EffectType enum. */
export enum EffectType {
  None = 0,
  Canny = 1,
  Grayscale = 2,
  Blur = 3,
  Sepia = 4,
  Cartoon = 5,
}

export type CameraFacing = 'back' | 'front';

/** Permission lifecycle. "blocked" = denied with "never ask again" / restricted. */
export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'blocked';

/** High-level UI state machine for the stream. */
export type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

/** Payload emitted by the native view on every metrics tick (~1/sec). */
export interface FpsEventPayload {
  /** Rendered frames per second over the last sampling window. */
  fps: number;
  /** Average native processing time per frame, in milliseconds. */
  processingTimeMs: number;
  /** Frames dropped (skipped under backpressure) in the last window. */
  droppedFrames: number;
}

/** Error payload emitted by the native view. */
export interface NativeErrorPayload {
  code: string;
  message: string;
}
