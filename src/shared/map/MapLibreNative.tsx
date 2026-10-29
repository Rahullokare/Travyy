import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type InitialViewState,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LatLng } from '@/domain/models';
import { env } from '@/shared/config/env';
import type { MapProps } from './types';

const DEFAULT_PADDING = { top: 80, right: 40, bottom: 80, left: 40 };
const EMPTY_LINE: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [] },
};

/**
 * iOS/Android map on MapLibre Native with free OpenFreeMap vector tiles: no Google key,
 * no billing account, and the same style and behaviour as the web map (Map.web.tsx).
 * Loaded only when the native module exists; see Map.tsx.
 */
export function MapLibreNative({
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
  const cameraRef = useRef<CameraRef>(null);

  // Initial camera, like native initialRegion / web initial bounds. Computed once.
  const initialViewState = useMemo<InitialViewState>(
    () => initialView(initialPoints ?? markers.map((m) => m.coordinate), edgePadding),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitTo(points) {
        if (points.length === 0) return;
        if (points.length === 1) {
          cameraRef.current?.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration: 600 });
          return;
        }
        cameraRef.current?.fitBounds(bounds(points), { padding: edgePadding, duration: 600 });
      },
      centerOn(point) {
        cameraRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14, duration: 600 });
      },
    }),
    [edgePadding],
  );

  const routeShape = useMemo<GeoJSON.Feature>(
    () =>
      route && route.coordinates.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.coordinates.map((p) => [p.lng, p.lat]) },
          }
        : EMPTY_LINE,
    [route],
  );

  return (
    <MapLibreMap
      style={[styles.fill, style]}
      mapStyle={env.mapStyleUrl}
      dragPan={interactive}
      touchZoom={interactive}
      doubleTapZoom={interactive}
      touchRotate={false}
      touchPitch={false}
      compass={false}
      onPress={() => onPress?.()}
    >
      <Camera ref={cameraRef} initialViewState={initialViewState} />
      <GeoJSONSource id="travyy-route" data={routeShape}>
        <Layer
          id="travyy-route-line"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': route?.color ?? '#000000', 'line-width': 3, 'line-dasharray': [2, 2] }}
        />
      </GeoJSONSource>
      {userLocation ? <NativeUserLocation /> : null}
      {markers.map((m) => (
        <Marker
          key={m.id}
          id={m.id}
          lngLat={[m.coordinate.lng, m.coordinate.lat]}
          anchor="center"
          selected={m.selected}
          accessibilityLabel={m.accessibilityLabel}
          onPress={() => onMarkerPress?.(m.id)}
        >
          <View style={[styles.pin, { backgroundColor: m.color }, m.selected && styles.selected]}>
            <Text style={styles.label}>{m.label}</Text>
          </View>
        </Marker>
      ))}
    </MapLibreMap>
  );
}

function bounds(points: LatLng[]): LngLatBounds {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return [west, south, east, north];
}

function initialView(points: LatLng[], padding: MapProps['edgePadding']): InitialViewState {
  if (points.length === 0) return { center: [10, 30], zoom: 1 };
  if (points.length === 1) return { center: [points[0].lng, points[0].lat], zoom: 14 };
  return { bounds: bounds(points), padding };
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
