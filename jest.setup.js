/* eslint-env jest */

// Mock the native module + native view so the JS layer can be unit-tested
// on a machine without the Android/iOS toolchain.
jest.mock('react-native/Libraries/Utilities/codegenNativeComponent', () => {
  return {
    __esModule: true,
    default: jest.fn(() => 'EdgeDetectionView'),
  };
});
