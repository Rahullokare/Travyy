import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '@/domain/models';
import { CATEGORY_META } from '@/features/places/categories';
import { PlaceRow } from '@/features/places/components/PlaceRow';
import { placeToMarker } from '@/features/places/markers';
import { distanceMeters, formatDistance, walkingMinutes } from '@/shared/lib/geo';
import { openInMaps } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { Map, type MapHandle } from '@/shared/map';
import { elevation, makeStyles, useTheme } from '@/shared/theme';
import { Chip, ChipRow, EmptyState, Icon, IconButton, Text } from '@/shared/ui';
import { cityOf, groupByCity, useAppStore } from '@/store';

const NEARBY_RADIUS_M = 1500;
const SIDE_PANEL_WIDTH = 400;

export function MapScreen() {
  const styles = useStyles();
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const places = useAppStore((s) => s.places);
  const mapRef = useRef<MapHandle>(null);
  const [city, setCity] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const { location, request } = useUserLocation();

  const cities = useMemo(() => groupByCity(places), [places]);
  const visible = useMemo(() => (city ? places.filter((p) => cityOf(p) === city) : places), [places, city]);
  const selected = visible.find((p) => p.id === selectedId);
  const markers = useMemo(
    () => visible.map((p) => placeToMarker(p, p.id === selectedId)),
    [visible, selectedId],
  );

  // Retention hook: "you're 6 minutes from that ramen place you saved in March".
  const nearby = useMemo(() => {
    if (!location) return [];
    return places
      .filter((p) => !p.visitedAt)
      .map((place) => ({ place, meters: distanceMeters(location, place) }))
      .filter((x) => x.meters <= NEARBY_RADIUS_M)
      .sort((a, b) => a.meters - b.meters);
  }, [places, location]);

  const selectCity = (next?: string) => {
    setCity(next);
    setSelectedId(undefined);
    mapRef.current?.fitTo(next ? places.filter((p) => cityOf(p) === next) : places);
  };

  const focusPlace = useCallback((p: Place) => {
    setSelectedId(p.id);
    mapRef.current?.centerOn(p);
  }, []);

  const locate = async () => {
    const here = location ?? (await request());
    if (here) mapRef.current?.centerOn(here);
  };

  const cityChips = (
    <ChipRow>
      <Chip label="🌍 All" selected={!city} onPress={() => selectCity(undefined)} />
      {cities.map((c) => (
        <Chip
          key={c.city}
          label={`${c.city} · ${c.places.length}`}
          selected={city === c.city}
          onPress={() => selectCity(c.city)}
        />
      ))}
    </ChipRow>
  );

  const selectedCard = selected ? (
    <Pressable style={[styles.card, elevation(dark)]} onPress={() => router.push(`/place/${selected.id}`)}>
      <Text style={styles.cardEmoji}>{CATEGORY_META[selected.category].emoji}</Text>
      <View style={styles.flex}>
        <Text variant="heading" numberOfLines={1}>
          {selected.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {[
            CATEGORY_META[selected.category].label,
            selected.city,
            location && formatDistance(distanceMeters(location, selected)),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {selected.note ? (
          <Text variant="caption" color="text" numberOfLines={2} style={styles.note}>
            “{selected.note}”
          </Text>
        ) : null}
      </View>
      <Pressable
        style={styles.goButton}
        accessibilityRole="button"
        accessibilityLabel={`Directions to ${selected.name}`}
        onPress={() => openInMaps(selected)}
      >
        <Icon name="navigate" size={20} color="onPrimary" />
      </Pressable>
    </Pressable>
  ) : nearby.length > 0 ? (
    <Pressable
      style={[styles.card, styles.cardInverse, elevation(dark)]}
      onPress={() => {
        setSelectedId(nearby[0].place.id);
        mapRef.current?.fitTo(nearby.slice(0, 5).map((n) => n.place));
      }}
    >
      <Text style={styles.cardEmoji}>📍</Text>
      <View style={styles.flex}>
        <Text variant="heading" color="textInverse">
          {nearby.length === 1 ? 'A saved spot is nearby' : `${nearby.length} saved spots nearby`}
        </Text>
        <Text variant="caption" color="textInverseMuted" numberOfLines={1}>
          {nearby[0].place.name} is {walkingMinutes(nearby[0].meters)} min away on foot
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color="textInverse" />
    </Pressable>
  ) : null;

  const map = (
    <Map
      ref={mapRef}
      markers={markers}
      initialPoints={places}
      userLocation={location}
      onMarkerPress={setSelectedId}
      onPress={() => setSelectedId(undefined)}
      edgePadding={{ top: isWide ? 60 : 140, right: 40, bottom: isWide ? 60 : 200, left: 40 }}
    />
  );

  if (isWide) {
    return (
      <View style={styles.split}>
        <View style={styles.panel}>
          <View style={[styles.panelHeader, { paddingTop: insets.top + 16 }]}>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>travyy</Text>
              <IconButton
                icon="add-circle"
                size={30}
                color="primary"
                accessibilityLabel="Save a spot"
                onPress={() => router.push('/add')}
              />
            </View>
            <Text variant="caption">
              {places.length} saved · {places.filter((p) => p.visitedAt).length} visited
            </Text>
          </View>
          {cityChips}
          <FlashList
            data={visible}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <PlaceRow place={item} onPress={focusPlace} selected={item.id === selectedId} />
            )}
            ListEmptyComponent={
              <EmptyState emoji="🗺️" title="No spots yet" body="Save a reel to see it here." />
            }
          />
        </View>
        <View style={styles.flex}>
          {map}
          <View style={styles.wideOverlay} pointerEvents="box-none">
            <IconButton
              icon="locate"
              variant="floating"
              accessibilityLabel="Show my location"
              onPress={locate}
            />
            {selectedCard}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {map}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.headerPill}>
          <Text style={styles.brand}>travyy</Text>
          <Text variant="caption" style={styles.bold}>
            {places.length} saved · {places.filter((p) => p.visitedAt).length} visited
          </Text>
        </View>
        {cityChips}
      </View>
      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.fabRow} pointerEvents="box-none">
          <IconButton
            icon="locate"
            variant="floating"
            accessibilityLabel="Show my location"
            onPress={locate}
          />
          <Pressable
            style={[styles.fab, elevation(dark)]}
            accessibilityRole="button"
            accessibilityLabel="Save a spot"
            onPress={() => router.push('/add')}
          >
            <Icon name="add" size={26} color="onPrimary" />
            <Text variant="bodyStrong" color="onPrimary" style={styles.fabLabel}>
              Save a spot
            </Text>
          </Pressable>
        </View>
        {selectedCard}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.background },
  panel: { width: SIDE_PANEL_WIDTH, borderRightWidth: 1, borderRightColor: t.colors.border, gap: 8 },
  panelHeader: { paddingHorizontal: 16, gap: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wideOverlay: { position: 'absolute', right: 16, bottom: 16, left: 16, alignItems: 'flex-end', gap: 12 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 8 },
  headerPill: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: t.colors.overlay,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  brand: { fontSize: 22, fontWeight: '900', color: t.colors.primary, letterSpacing: -0.5 },
  bold: { fontWeight: '600' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 12, alignItems: 'center' },
  fabRow: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.colors.primary,
    paddingHorizontal: 24,
    height: 52,
    borderRadius: 999,
  },
  fabLabel: { fontSize: 16 },
  card: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: t.colors.surface,
    borderRadius: 24,
    padding: 16,
  },
  cardInverse: { backgroundColor: t.colors.surfaceInverse },
  cardEmoji: { fontSize: 30, lineHeight: 38 },
  note: { marginTop: 6, fontStyle: 'italic' },
  goButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
