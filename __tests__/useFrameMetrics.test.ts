import {renderHook, act} from '@testing-library/react-native';
import {useFrameMetrics} from '@/hooks/useFrameMetrics';

describe('useFrameMetrics', () => {
  it('starts at zero', () => {
    const {result} = renderHook(() => useFrameMetrics());
    expect(result.current.metrics).toEqual({
      fps: 0,
      processingTimeMs: 0,
      droppedFrames: 0,
    });
  });

  it('rounds fps and processing time from native payloads', () => {
    const {result} = renderHook(() => useFrameMetrics());

    act(() => {
      result.current.onFpsUpdate({
        fps: 29.7,
        processingTimeMs: 12.34,
        droppedFrames: 2,
      });
    });

    expect(result.current.metrics.fps).toBe(30);
    expect(result.current.metrics.processingTimeMs).toBe(12.3);
    expect(result.current.metrics.droppedFrames).toBe(2);
  });

  it('resets back to zero', () => {
    const {result} = renderHook(() => useFrameMetrics());
    act(() => {
      result.current.onFpsUpdate({
        fps: 30,
        processingTimeMs: 10,
        droppedFrames: 1,
      });
    });
    act(() => result.current.reset());
    expect(result.current.metrics.fps).toBe(0);
  });
});
