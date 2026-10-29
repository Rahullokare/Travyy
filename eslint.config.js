// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'server/*', 'coverage/*', '.expo/*'],
  },
  {
    rules: {
      // Architectural guardrails: platform differences are handled in one place.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-maps',
              message:
                'Use the cross-platform <Map> from @/shared/map (react-native-maps has no web support).',
            },
            {
              name: 'react-native',
              importNames: ['Alert', 'Share'],
              message:
                'Use confirm/notify/shareText from @/shared/lib/platform (Alert and Share are no-ops on web).',
            },
            {
              name: 'expo-sharing',
              message:
                'Read shares via readIncomingShare() in @/features/capture/share (handles Expo Go and web).',
            },
            {
              name: 'expo-haptics',
              message: 'Use haptics from @/shared/lib/platform (no-op on web).',
            },
          ],
        },
      ],
    },
  },
  {
    // The platform adapters themselves are allowed to use the raw APIs.
    files: [
      'src/shared/map/**',
      'src/shared/lib/platform.ts',
      'src/features/capture/share/readIncomingShare.ts',
      '**/__tests__/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
