module.exports = {
  root: true,
  // "expo" provides the RN/Expo-aware base (JSX, platform file extensions,
  // React Native globals). The shared monorepo config layers the house
  // TypeScript/react-hooks rules on top, matching apps/web and apps/admin's
  // intended shared setup (packages/config/eslint-config.js).
  extends: ['expo', '../../packages/config/eslint-config.js'],
  ignorePatterns: [
    'node_modules/',
    '.expo/',
    'dist/',
    'android/',
    'ios/',
    'babel.config.js',
    'metro.config.js',
    'tailwind.config.js',
  ],
};
