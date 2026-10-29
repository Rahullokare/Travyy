import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { regionFor } from '@/shared/lib/geo';
import { useTheme } from '@/shared/theme';
import type { LatLng } from '@/domain/models';
import type { MapMarker, MapProps } from './types';

const WORLD = { latitude: 30, longitude: 10, latitudeDelta: 100, longitudeDelta: 100 };
const DEFAULT_PADDING = { top: 80, right: 40, bottom: 80, left: 40 };

/** Native map (Apple Maps on iOS, Google Maps on Android). The web build uses Map.web.tsx. */
export function Map({
  ref,
  markers,
  route,
  initialPoints,
  userLocation,
  interactive = true,
  onMarkerPress,
  onPress,
  style,
  edgePadding = DEFAULT_PADDING,
}: MapProps) {
  const mapRef = useRef<MapView>(null);
  const theme = useTheme();

  useImperativeHandle(ref, () => {
    const centerOn = (point: LatLng) =>
      mapRef.current?.animateToRegion(
        { latitude: point.lat, longitude: point.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        450,
      );
    return {
      centerOn,
      fitTo(points) {
        if (points.length === 0) return;
        if (points.length === 1) return centerOn(points[0]);
        mapRef.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding, animated: true },
        );
      },
    };
  }, [edgePadding]);

  return (
    <MapView
      ref={mapRef}
      style={[styles.fill, style]}
      initialRegion={regionFor(initialPoints ?? markers.map((m) => m.coordinate), WORLD)}
      showsUserLocation={!!userLocation}
      showsMyLocationButton={false}
      userInterfaceStyle={theme.dark ? 'dark' : 'light'}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      pitchEnabled={interactive}
      rotateEnabled={interactive}
      onPress={onPress}
    >
      {markers.map((m) => (
        <PinMarker
          // A changed pin remounts (see PinMarker) instead of showing a stale snapshot.
          key={`${m.id}:${m.color}:${m.label}:${m.selected ? 1 : 0}`}
          marker={m}
          onPress={onMarkerPress}
        />
      ))}
      {route && route.coordinates.length > 1 ? (
        <Polyline
          coordinates={route.coordinates.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={route.color}
          strokeWidth={3}
          lineDashPattern={[6, 6]}
        />
      ) : null}
    </MapView>
  );
}

/**
 * Custom marker views are rasterised to a bitmap. Tracking view changes forever is
 * expensive with many pins, but turning it off immediately can snapshot the view before
 * layout (blank pins on Android). Track briefly after mount, then freeze.
 */
function PinMarker({ marker: m, onPress }: { marker: MapMarker; onPress?: (id: string) => void }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Marker
      coordinate={{ latitude: m.coordinate.lat, longitude: m.coordinate.lng }}
      accessibilityLabel={m.accessibilityLabel}
      onPress={(e) => {
        e.stopPropagation();
        onPress?.(m.id);
      }}
      tracksViewChanges={tracking}
    >
      <View style={[styles.pin, { backgroundColor: m.color }, m.selected && styles.selected]}>
        <Text style={styles.label}>{m.label}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pin: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  selected: { transform: [{ scale: 1.25 }] },
  label: { fontSize: 15, color: '#fff', fontWeight: '800' },
});
