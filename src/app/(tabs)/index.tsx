import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '../../components/ui';
import { CATEGORY_META } from '../../lib/categories';
import { distanceMeters, formatDistance, regionFor, walkingMinutes } from '../../lib/geo';
import { openInMaps } from '../../lib/openInMaps';
import { groupByCity, useStore } from '../../lib/store';
import { colors, radius, shadow, space } from '../../lib/theme';
import type { Place } from '../../lib/types';
import { useUserLocation } from '../../lib/useUserLocation';

const WORLD = { latitude: 30, longitude: 10, latitudeDelta: 100, longitudeDelta: 100 };
const NEARBY_RADIUS_M = 1500;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const places = useStore((s) => s.places);
  const mapRef = useRef<MapView>(null);
  const [city, setCity] = useState<string>();
  const [selected, setSelected] = useState<Place>();
  const { location, request } = useUserLocation();

  const cities = useMemo(() => groupByCity(places), [places]);
  const visible = useMemo(
    () => (city ? places.filter((p) => (p.city ?? 'Somewhere') === city) : places),
    [places, city],
  );

  // The retention hook: "you're 6 minutes from that ramen place you saved in March".
  const nearby = useMemo(() => {
    if (!location) return [];
    return places
      .filter((p) => !p.visitedAt)
      .map((p) => ({ place: p, d: distanceMeters(location, p) }))
      .filter((x) => x.d <= NEARBY_RADIUS_M)
      .sort((a, b) => a.d - b.d);
  }, [places, location]);

  const focus = (pts: { lat: number; lng: number }[]) => {
    mapRef.current?.animateToRegion(regionFor(pts, WORLD), 500);
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(places, WORLD)}
        showsUserLocation={!!location}
        showsMyLocationButton={false}
        onPress={() => setSelected(undefined)}
      >
        {visible.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            onPress={(e) => {
              e.stopPropagation();
              setSelected(p);
            }}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: p.visitedAt ? colors.success : CATEGORY_META[p.category].color },
                selected?.id === p.id && styles.pinSelected,
              ]}
            >
              <Text style={styles.pinEmoji}>{p.visitedAt ? '✓' : CATEGORY_META[p.category].emoji}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.brand}>travyy</Text>
          <Text style={styles.count}>
            {places.length} saved · {places.filter((p) => p.visitedAt).length} visited
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip
            label="🌍 All"
            active={!city}
            onPress={() => {
              setCity(undefined);
              focus(places);
            }}
          />
          {cities.map((c) => (
            <Chip
              key={c.city}
              label={`${c.city} · ${c.places.length}`}
              active={city === c.city}
              onPress={() => {
                setCity(c.city);
                focus(c.places);
              }}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[styles.bottom, { paddingBottom: space.lg }]} pointerEvents="box-none">
        <View style={styles.fabRow} pointerEvents="box-none">
          <Pressable
            style={[styles.roundBtn, shadow]}
            accessibilityLabel="Show places near me"
            onPress={async () => {
              const loc = location ?? (await request());
              if (loc) mapRef.current?.animateToRegion({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 500);
            }}
          >
            <Ionicons name="locate" size={22} color={colors.text} />
          </Pressable>
          <Pressable style={[styles.fab, shadow]} accessibilityLabel="Save a spot" onPress={() => router.push('/add')}>
            <Ionicons name="add" size={26} color="#fff" />
            <Text style={styles.fabText}>Save a spot</Text>
          </Pressable>
        </View>

        {selected ? (
          <Pressable style={[styles.sheet, shadow]} onPress={() => router.push(`/place/${selected.id}`)}>
            <Text style={styles.sheetEmoji}>{CATEGORY_META[selected.category].emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{selected.name}</Text>
              <Text style={styles.sheetSub} numberOfLines={1}>
                {[CATEGORY_META[selected.category].label, selected.city, location && formatDistance(distanceMeters(location, selected))]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {selected.note ? <Text style={styles.sheetNote} numberOfLines={2}>“{selected.note}”</Text> : null}
            </View>
            <Pressable style={styles.goBtn} onPress={() => openInMaps(selected)} accessibilityLabel="Directions">
              <Ionicons name="navigate" size={20} color="#fff" />
            </Pressable>
          </Pressable>
        ) : nearby.length > 0 ? (
          <Pressable
            style={[styles.sheet, shadow, { backgroundColor: colors.ink }]}
            onPress={() => {
              setSelected(nearby[0].place);
              focus(nearby.slice(0, 5).map((n) => n.place));
            }}
          >
            <Text style={styles.sheetEmoji}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: '#fff' }]}>
                {nearby.length === 1 ? 'A saved spot is nearby' : `${nearby.length} saved spots nearby`}
              </Text>
              <Text style={[styles.sheetSub, { color: '#D6D0C6' }]} numberOfLines={1}>
                {nearby[0].place.name} is {walkingMinutes(nearby[0].d)} min away on foot
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: space.sm },
  header: {
    marginHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(250,247,242,0.94)',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  brand: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  count: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  chips: { paddingHorizontal: space.lg, gap: space.sm },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinSelected: { transform: [{ scale: 1.25 }] },
  pinEmoji: { fontSize: 16, color: '#fff', fontWeight: '800' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.lg, gap: space.md },
  fabRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    height: 52,
    borderRadius: radius.pill,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sheet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  sheetEmoji: { fontSize: 30 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sheetNote: { fontSize: 13, color: colors.text, marginTop: 6, fontStyle: 'italic' },
  goBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
