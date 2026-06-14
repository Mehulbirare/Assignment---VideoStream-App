import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {FrameMetrics} from '@/hooks/useFrameMetrics';

interface Props {
  metrics: FrameMetrics;
}

/** Top-left translucent overlay showing live performance numbers. */
export function FpsOverlay({metrics}: Props) {
  const fpsColor =
    metrics.fps >= 24 ? '#5dff8f' : metrics.fps >= 15 ? '#ffd45d' : '#ff5d5d';

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.row}>
        <Text style={styles.label}>FPS</Text>
        <Text style={[styles.value, {color: fpsColor}]}>{metrics.fps}</Text>
      </View>
      <Text style={styles.sub}>{metrics.processingTimeMs} ms/frame</Text>
      {metrics.droppedFrames > 0 ? (
        <Text style={styles.dropped}>{metrics.droppedFrames} dropped</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  row: {flexDirection: 'row', alignItems: 'baseline'},
  label: {color: '#9aa0a6', fontSize: 12, marginRight: 6, fontWeight: '600'},
  value: {fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums']},
  sub: {color: '#cfd2d6', fontSize: 12, marginTop: 2},
  dropped: {color: '#ff9d5d', fontSize: 11, marginTop: 2},
});

export default FpsOverlay;
