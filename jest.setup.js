/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Icon fonts load asynchronously through expo-asset, which has no registry under Jest.
// Render icons as their name instead: keeps tests fast and lets them assert on icons.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, null, name);
  return new Proxy({ __esModule: true }, { get: (target, key) => (key in target ? target[key] : Icon) });
});
