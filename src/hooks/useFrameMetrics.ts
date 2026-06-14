import {useCallback, useState} from 'react';
import {FpsEventPayload} from '@/types';

export interface FrameMetrics {
  fps: number;
  processingTimeMs: number;
  droppedFrames: number;
}

const INITIAL: FrameMetrics = {fps: 0, processingTimeMs: 0, droppedFrames: 0};

/**
 * Holds the latest frame metrics emitted by the native view.
 * The native side computes FPS / processing time / dropped frames because
 * those numbers must reflect the *native* render loop, not the JS bridge.
 */
export function useFrameMetrics() {
  const [metrics, setMetrics] = useState<FrameMetrics>(INITIAL);

  const onFpsUpdate = useCallback((payload: FpsEventPayload) => {
    setMetrics({
      fps: Math.round(payload.fps),
      processingTimeMs: Math.round(payload.processingTimeMs * 10) / 10,
      droppedFrames: payload.droppedFrames,
    });
  }, []);

  const reset = useCallback(() => setMetrics(INITIAL), []);

  return {metrics, onFpsUpdate, reset};
}
