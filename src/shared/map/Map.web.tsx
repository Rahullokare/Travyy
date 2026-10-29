import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, type GeoJSONSource, type MapOptions } from 'maplibre-gl';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import type { LatLng } from '@/domain/models';
import { env } from '@/shared/config/env';
import { logger } from '@/shared/lib/logger';
import type { MapMarker, MapProps } from './types';

const DEFAULT_PADDING = { top: 80, right: 40, bottom: 80, left: 40 };
const ROUTE_ID = 'travyy-route';

/**
 * Web map on MapLibre GL JS (open source, vector tiles). Same props and imperative
 * handle as the native Map, so screens never branch on platform.
 */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinsRef = useRef(new globalThis.Map<string, { marker: Marker; pin: HTMLDivElement }>());
  const userDotRef = useRef<Marker | null>(null);
  // Latest callbacks without re-binding DOM listeners on every render.
  const handlersRef = useRef({ onMarkerPress, onPress });
  useEffect(() => {
    handlersRef.current = { onMarkerPress, onPress };
  });

  // Create the map once; props below are synced incrementally.
  useEffect(() => {
    if (!containerRef.current) return;
    const pins = pinsRef.current;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: env.mapStyleUrl,
      interactive,
      attributionControl: { compact: true },
      ...initialCamera(initialPoints ?? markers.map((m) => m.coordinate), edgePadding),
    });
    map.on('click', () => handlersRef.current.onPress?.());
    // Tile/style failures (offline, blocked host) must not surface as app errors:
    // pins and routes still render, only the basemap is missing.
    map.on('error', (e) => logger.warn('Map error', { message: e.error?.message }));
    mapRef.current = map;
    return () => {
      pins.clear();
      userDotRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Mount-only by design: camera/interactivity are initial values, like native initialRegion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers: add new, update changed, remove gone.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pins = pinsRef.current;
    const ids = new Set(markers.map((m) => m.id));
    for (const [id, entry] of pins) {
      if (!ids.has(id)) {
        entry.marker.remove();
        pins.delete(id);
      }
    }
    for (const m of markers) {
      const lngLat: [number, number] = [m.coordinate.lng, m.coordinate.lat];
      let entry = pins.get(m.id);
      if (entry) {
        entry.marker.setLngLat(lngLat);
      } else {
        // A marker must have a position before it is added to the map.
        entry = createPin(m.id, (id) => handlersRef.current.onMarkerPress?.(id));
        entry.marker.setLngLat(lngLat).addTo(map);
        pins.set(m.id, entry);
      }
      paintPin(entry.pin, m);
    }
  }, [markers]);

  // Route polyline as a GeoJSON line layer (needs the style to be loaded).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const data: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: (route?.coordinates ?? []).map((p) => [p.lng, p.lat]) },
      };
      const source = map.getSource<GeoJSONSource>(ROUTE_ID);
      if (source) {
        source.setData(data);
      } else {
        map.addSource(ROUTE_ID, { type: 'geojson', data });
        map.addLayer({
          id: ROUTE_ID,
          type: 'line',
          source: ROUTE_ID,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-width': 3, 'line-dasharray': [2, 2], 'line-color': '#000' },
        });
      }
      map.setPaintProperty(ROUTE_ID, 'line-color', route?.color ?? '#000');
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [route]);

  // Device location dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userDotRef.current?.remove();
      userDotRef.current = null;
      return;
    }
    if (!userDotRef.current) {
      const dot = document.createElement('div');
      dot.setAttribute('aria-label', 'Your location');
      dot.style.cssText =
        'width:16px;height:16px;border-radius:8px;background:#2F7DF6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(47,125,246,.25)';
      userDotRef.current = new Marker({ element: dot })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    } else {
      userDotRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  useImperativeHandle(
    ref,
    () => ({
      fitTo(points) {
        const map = mapRef.current;
        if (!map || points.length === 0) return;
        if (points.length === 1) {
          map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration: 600 });
          return;
        }
        map.fitBounds(bounds(points), { padding: edgePadding, maxZoom: 15, duration: 600 });
      },
      centerOn(point) {
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 14, duration: 600 });
      },
    }),
    [edgePadding],
  );

  return (
    <View style={[{ flex: 1 }, style]}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}

function bounds(points: LatLng[]): [[number, number], [number, number]] {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function initialCamera(points: LatLng[], padding: MapProps['edgePadding']): Partial<MapOptions> {
  if (points.length === 0) return { center: [10, 30], zoom: 1 };
  if (points.length === 1) return { center: [points[0].lng, points[0].lat], zoom: 14 };
  return { bounds: bounds(points), fitBoundsOptions: { padding, maxZoom: 15 } };
}

function createPin(id: string, onSelect: (id: string) => void) {
  // MapLibre positions the outer element with a CSS transform, so visual
  // styling (including the selected scale) lives on an inner element.
  const wrapper = document.createElement('div');
  const pin = document.createElement('div');
  wrapper.appendChild(pin);
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'button');
  wrapper.style.cursor = 'pointer';
  const select = (e: Event) => {
    e.stopPropagation();
    onSelect(id);
  };
  wrapper.addEventListener('click', select);
  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') select(e);
  });
  return { marker: new Marker({ element: wrapper }), pin };
}

function paintPin(pin: HTMLDivElement, m: MapMarker) {
  pin.textContent = m.label;
  pin.parentElement?.setAttribute('aria-label', m.accessibilityLabel ?? m.label);
  pin.style.cssText = [
    'min-width:32px',
    'height:32px',
    'padding:0 4px',
    'box-sizing:border-box',
    'border-radius:16px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'border:2px solid #fff',
    'box-shadow:0 2px 6px rgba(0,0,0,.25)',
    'color:#fff',
    'font:800 15px system-ui,-apple-system,sans-serif',
    `background:${m.color}`,
    `transform:scale(${m.selected ? 1.25 : 1})`,
    'transition:transform .15s ease',
  ].join(';');
  if (m.selected) pin.parentElement?.style.setProperty('z-index', '2');
  else pin.parentElement?.style.removeProperty('z-index');
}
