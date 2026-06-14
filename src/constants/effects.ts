import {EffectType} from '@/types';

export interface EffectMeta {
  type: EffectType;
  label: string;
  /** Short description shown in the UI / used for accessibility. */
  description: string;
}

/**
 * The ordered list of effects exposed by the real-time switcher.
 * `Canny` is the primary, required effect; the rest are bonus effects,
 * all implemented in native C++ (see android/.../cpp/ImageProcessor.cpp).
 */
export const EFFECTS: EffectMeta[] = [
  {
    type: EffectType.Canny,
    label: 'Canny',
    description: 'Grayscale → Gaussian blur → Canny edge detection',
  },
  {
    type: EffectType.Grayscale,
    label: 'Grayscale',
    description: 'Luminance-only conversion',
  },
  {
    type: EffectType.Blur,
    label: 'Blur',
    description: 'Gaussian blur',
  },
  {
    type: EffectType.Sepia,
    label: 'Sepia',
    description: 'Warm sepia color transform',
  },
  {
    type: EffectType.Cartoon,
    label: 'Cartoon',
    description: 'Bilateral filter + edge mask (cartoonize)',
  },
];

export const DEFAULT_EFFECT = EffectType.Canny;
