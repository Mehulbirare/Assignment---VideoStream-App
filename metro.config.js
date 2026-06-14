const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Adds a resolver for the `@/*` path alias (mirrors tsconfig.json `paths` and
 * jest `moduleNameMapper`) so `import x from '@/...'` resolves to `src/...`.
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('@/')) {
        const target = path.resolve(__dirname, 'src', moduleName.slice(2));
        return context.resolveRequest(context, target, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
