import React from 'react';
import {StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';

interface Props {
  isStreaming: boolean;
  effectEnabled: boolean;
  onToggleStream: () => void;
  onToggleEffect: (value: boolean) => void;
  onSwitchCamera: () => void;
}

/** Bottom control bar: start/stop, effect on/off, camera flip. */
export function Controls({
  isStreaming,
  effectEnabled,
  onToggleStream,
  onToggleEffect,
  onSwitchCamera,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.effectToggle}>
        <Text style={styles.toggleLabel}>Effect</Text>
        <Switch
          value={effectEnabled}
          onValueChange={onToggleEffect}
          trackColor={{false: '#555', true: '#3d8bff'}}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isStreaming ? 'Stop stream' : 'Start stream'}
        onPress={onToggleStream}
        style={[styles.startButton, isStreaming && styles.stopButton]}>
        <View style={[styles.startInner, isStreaming && styles.stopInner]} />
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Switch camera"
        onPress={onSwitchCamera}
        style={styles.flipButton}>
        <Text style={styles.flipText}>Flip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  effectToggle: {alignItems: 'center', width: 64},
  toggleLabel: {color: '#cfd2d6', fontSize: 12, marginBottom: 4},
  startButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {borderColor: '#ff5d5d'},
  startInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  stopInner: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#ff5d5d',
  },
  flipButton: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  flipText: {color: '#e8eaed', fontSize: 14, fontWeight: '600'},
});

export default Controls;
