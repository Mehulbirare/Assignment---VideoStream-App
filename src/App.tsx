import React, {useCallback, useMemo, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, View} from 'react-native';

import EdgeDetectionView from '@/native/EdgeDetectionView';
import FpsOverlay from '@/components/FpsOverlay';
import EffectSwitcher from '@/components/EffectSwitcher';
import Controls from '@/components/Controls';
import StatusOverlay from '@/components/StatusOverlay';
import {useCameraPermission} from '@/hooks/useCameraPermission';
import {useFrameMetrics} from '@/hooks/useFrameMetrics';
import {DEFAULT_EFFECT} from '@/constants/effects';
import {
  CameraFacing,
  EffectType,
  NativeErrorPayload,
  StreamState,
} from '@/types';

function App(): React.JSX.Element {
  const {status, request, openSettings} = useCameraPermission();
  const {metrics, onFpsUpdate, reset} = useFrameMetrics();

  const [isStreaming, setIsStreaming] = useState(false);
  const [effectEnabled, setEffectEnabled] = useState(true);
  const [effect, setEffect] = useState<EffectType>(DEFAULT_EFFECT);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggleStream = useCallback(async () => {
    if (isStreaming) {
      setIsStreaming(false);
      setStreamState('idle');
      reset();
      return;
    }
    // Ensure permission before starting.
    let perm = status;
    if (perm !== 'granted') {
      perm = await request();
    }
    if (perm !== 'granted') {
      return; // overlay will guide the user
    }
    setErrorMsg(null);
    setStreamState('loading');
    setIsStreaming(true);
  }, [isStreaming, status, request, reset]);

  const handleSwitchCamera = useCallback(() => {
    setFacing(prev => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const handleReady = useCallback(() => {
    setStreamState('streaming');
  }, []);

  const handleError = useCallback((payload: NativeErrorPayload) => {
    setStreamState('error');
    setIsStreaming(false);
    setErrorMsg(`${payload.message} (${payload.code})`);
  }, []);

  const overlay = useMemo(() => {
    if (status === 'blocked') {
      return (
        <StatusOverlay
          variant="permission"
          title="Camera access blocked"
          message="Camera permission is blocked. Enable it in Settings to use EdgeVision."
          actionLabel="Open Settings"
          onAction={openSettings}
        />
      );
    }
    if (status === 'denied' && !isStreaming) {
      return (
        <StatusOverlay
          variant="permission"
          title="Camera permission needed"
          message="EdgeVision processes the live camera feed on-device. Grant access to begin."
          actionLabel="Grant access"
          onAction={request}
        />
      );
    }
    if (streamState === 'error') {
      return (
        <StatusOverlay
          variant="error"
          title="Something went wrong"
          message={errorMsg ?? 'The camera or processing pipeline failed.'}
          actionLabel="Retry"
          onAction={handleToggleStream}
        />
      );
    }
    if (streamState === 'loading') {
      return (
        <StatusOverlay
          variant="loading"
          title="Starting camera…"
          message="Initializing the capture and OpenCV pipeline."
        />
      );
    }
    return null;
  }, [
    status,
    streamState,
    errorMsg,
    isStreaming,
    openSettings,
    request,
    handleToggleStream,
  ]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0d10" />

      <View style={styles.stage}>
        {isStreaming ? (
          <EdgeDetectionView
            style={StyleSheet.absoluteFill}
            effect={effect}
            isActive={isStreaming}
            effectEnabled={effectEnabled}
            cameraFacing={facing}
            onFpsUpdate={onFpsUpdate}
            onReady={handleReady}
            onError={handleError}
          />
        ) : (
          <View style={styles.placeholder} />
        )}

        {streamState === 'streaming' ? <FpsOverlay metrics={metrics} /> : null}
        {overlay}
      </View>

      <View style={styles.bottom}>
        <EffectSwitcher
          selected={effect}
          onSelect={setEffect}
          disabled={!effectEnabled}
        />
        <Controls
          isStreaming={isStreaming}
          effectEnabled={effectEnabled}
          onToggleStream={handleToggleStream}
          onToggleEffect={setEffectEnabled}
          onSwitchCamera={handleSwitchCamera}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b0d10'},
  stage: {flex: 1, overflow: 'hidden', backgroundColor: '#000'},
  placeholder: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
  bottom: {paddingBottom: 8, backgroundColor: '#0b0d10'},
});

export default App;
