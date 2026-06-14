import {EFFECTS, DEFAULT_EFFECT} from '@/constants/effects';
import {EffectType} from '@/types';

describe('effects configuration', () => {
  it('defaults to the required Canny effect', () => {
    expect(DEFAULT_EFFECT).toBe(EffectType.Canny);
  });

  it('exposes Canny plus the four bonus effects', () => {
    const types = EFFECTS.map(e => e.type);
    expect(types).toEqual([
      EffectType.Canny,
      EffectType.Grayscale,
      EffectType.Blur,
      EffectType.Sepia,
      EffectType.Cartoon,
    ]);
  });

  it('gives every effect a non-empty label and description', () => {
    for (const effect of EFFECTS) {
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps numeric enum values in sync with the native C++ contract', () => {
    // These MUST match android/.../cpp/ImageProcessor.h EffectType.
    expect(EffectType.None).toBe(0);
    expect(EffectType.Canny).toBe(1);
    expect(EffectType.Grayscale).toBe(2);
    expect(EffectType.Blur).toBe(3);
    expect(EffectType.Sepia).toBe(4);
    expect(EffectType.Cartoon).toBe(5);
  });
});
