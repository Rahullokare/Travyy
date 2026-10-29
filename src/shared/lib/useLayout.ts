import { useWindowDimensions } from 'react-native';

/** Breakpoints: phones get the single-column app, tablets and desktop web get split layouts. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, isWide: width >= 900 };
}
