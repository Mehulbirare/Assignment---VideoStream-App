import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {EFFECTS} from '@/constants/effects';
import {EffectType} from '@/types';

interface Props {
  selected: EffectType;
  onSelect: (effect: EffectType) => void;
  disabled?: boolean;
}

/** Horizontal real-time effect switcher (Canny + bonus effects). */
export function EffectSwitcher({selected, onSelect, disabled}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {EFFECTS.map(effect => {
        const active = effect.type === selected;
        return (
          <TouchableOpacity
            key={effect.type}
            accessibilityRole="button"
            accessibilityState={{selected: active, disabled}}
            accessibilityLabel={`${effect.label} effect`}
            disabled={disabled}
            onPress={() => onSelect(effect.type)}
            style={[
              styles.chip,
              active && styles.chipActive,
              disabled && styles.chipDisabled,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {effect.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {paddingHorizontal: 12, gap: 8},
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 8,
  },
  chipActive: {backgroundColor: '#3d8bff'},
  chipDisabled: {opacity: 0.4},
  chipText: {color: '#e8eaed', fontSize: 14, fontWeight: '600'},
  chipTextActive: {color: '#fff'},
});

export default EffectSwitcher;
