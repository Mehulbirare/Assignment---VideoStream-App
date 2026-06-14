import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import EffectSwitcher from '@/components/EffectSwitcher';
import {EffectType} from '@/types';

describe('<EffectSwitcher />', () => {
  it('renders a chip for each effect', () => {
    const {getByText} = render(
      <EffectSwitcher selected={EffectType.Canny} onSelect={() => {}} />,
    );
    expect(getByText('Canny')).toBeTruthy();
    expect(getByText('Grayscale')).toBeTruthy();
    expect(getByText('Cartoon')).toBeTruthy();
  });

  it('calls onSelect with the tapped effect', () => {
    const onSelect = jest.fn();
    const {getByText} = render(
      <EffectSwitcher selected={EffectType.Canny} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Sepia'));
    expect(onSelect).toHaveBeenCalledWith(EffectType.Sepia);
  });

  it('does not fire selection when disabled', () => {
    const onSelect = jest.fn();
    const {getByText} = render(
      <EffectSwitcher
        selected={EffectType.Canny}
        onSelect={onSelect}
        disabled
      />,
    );
    fireEvent.press(getByText('Blur'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
