/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  // Runs Reanimated and Worklets on their JS implementations under Jest (no native module).
  resolver: 'react-native-reanimated/jest/resolver',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/server/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/app/**', '!src/**/*.web.tsx', '!src/types/**'],
};
