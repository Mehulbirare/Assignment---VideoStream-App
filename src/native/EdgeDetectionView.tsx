import React from 'react';
import {
  requireNativeComponent,
  UIManager,
  Platform,
  ViewStyle,
  NativeSyntheticEvent,
  StyleProp,
} from 'react-native';
import {
  CameraFacing,
  EffectType,
  FpsEventPayload,
  NativeErrorPayload,
} from '@/types';

const COMPONENT_NAME = 'EdgeDetectionView';

const LINKING_ERROR =
  `The native view "${COMPONENT_NAME}" is not linked. Make sure:\n` +
  '  • You rebuilt the app after installing native code (npx react-native run-android)\n' +
  '  • You are not running in Expo Go (this project requires a custom dev build)\n' +
  `Platform: ${Platform.OS}\n`;

/** Props sent down to the native Android view. */
interface NativeProps {
  style?: StyleProp<ViewStyle>;
  /** Numeric effect id — matches the C++ EffectType enum. */
  effect: number;
  /** Whether the camera stream is actively capturing + processing. */
  isActive: boolean;
  /** Whether the OpenCV effect is applied (false = passthrough preview). */
  effectEnabled: boolean;
  /** "back" | "front". */
  cameraFacing: CameraFacing;
  onFpsUpdate?: (e: NativeSyntheticEvent<FpsEventPayload>) => void;
  onError?: (e: NativeSyntheticEvent<NativeErrorPayload>) => void;
  onReady?: (e: NativeSyntheticEvent<{}>) => void;
}

const NativeEdgeDetectionView =
  UIManager.getViewManagerConfig(COMPONENT_NAME) != null
    ? requireNativeComponent<NativeProps>(COMPONENT_NAME)
    : () => {
        throw new Error(LINKING_ERROR);
      };

export interface EdgeDetectionViewProps {
  style?: StyleProp<ViewStyle>;
  effect: EffectType;
  isActive: boolean;
  effectEnabled: boolean;
  cameraFacing: CameraFacing;
  onFpsUpdate?: (payload: FpsEventPayload) => void;
  onError?: (payload: NativeErrorPayload) => void;
  onReady?: () => void;
}

/**
 * Thin, typed React wrapper around the native CameraX + OpenCV view.
 * All heavy lifting (capture, JNI, OpenCV, rendering) happens natively;
 * this component only forwards props and surfaces native events.
 */
export function EdgeDetectionView({
  style,
  effect,
  isActive,
  effectEnabled,
  cameraFacing,
  onFpsUpdate,
  onError,
  onReady,
}: EdgeDetectionViewProps) {
  return (
    <NativeEdgeDetectionView
      style={style}
      effect={effect}
      isActive={isActive}
      effectEnabled={effectEnabled}
      cameraFacing={cameraFacing}
      onFpsUpdate={onFpsUpdate ? e => onFpsUpdate(e.nativeEvent) : undefined}
      onError={onError ? e => onError(e.nativeEvent) : undefined}
      onReady={onReady ? () => onReady() : undefined}
    />
  );
}

export default EdgeDetectionView;
