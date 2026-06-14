import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Variant = 'loading' | 'error' | 'permission';

interface Props {
  variant: Variant;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Full-screen overlay for loading / error / permission states. */
export function StatusOverlay({
  variant,
  title,
  message,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      {variant === 'loading' ? (
        <ActivityIndicator size="large" color="#3d8bff" />
      ) : (
        <Text style={styles.icon}>{variant === 'error' ? '⚠️' : '📷'}</Text>
      )}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onAction}
          style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0b0d10',
  },
  icon: {fontSize: 48, marginBottom: 8},
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    color: '#9aa0a6',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 21,
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#3d8bff',
  },
  buttonText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});

export default StatusOverlay;
