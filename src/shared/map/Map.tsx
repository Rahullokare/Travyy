import type { ComponentType } from 'react';
import { TurboModuleRegistry, View } from 'react-native';
import { makeStyles } from '@/shared/theme';
import { Icon, Text } from '@/shared/ui';
import type { MapProps } from './types';

/**
 * Native entry point (the web build uses Map.web.tsx).
 *
 * MapLibre looks up its native modules as soon as it's imported, so it's loaded lazily and
 * only when the native code is in the build. Expo Go doesn't include it: there we show
 * a placeholder instead of crashing (the rest of the app works in Expo Go).
 */
const NativeMap: ComponentType<MapProps> | null = TurboModuleRegistry.get('MLRNMapViewModule')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./MapLibreNative') as typeof import('./MapLibreNative')).MapLibreNative
  : null;

export function Map(props: MapProps) {
  if (NativeMap) return <NativeMap {...props} />;
  return <MapUnavailable style={props.style} />;
}

function MapUnavailable({ style }: { style: MapProps['style'] }) {
  const styles = useStyles();
  return (
    <View style={[styles.box, style]}>
      <Icon name="map-outline" size={32} color="textMuted" />
      <Text variant="caption" align="center">
        The map needs the Travyy app build.{'\n'}Expo Go doesn’t include it; everything else works here.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: t.colors.surfacePressed,
  },
}));
