import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { makeStyles, radius, shadow, spacing, useTheme } from '@/shared/theme';
import {
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconBadge,
  IconButton,
  PressableScale,
  Text,
  useEntrance,
} from '@/shared/ui';
import { cityOf, knownCities, useAppStore } from '@/store';

const NEARBY_RADIUS_M = 1500;
const SIDE_PANEL_WIDTH = 400;

export function MapScreen() {
  const styles = useStyles();
  const entrance = useEntrance('rise');
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const places = useAppStore((s) => s.places);
  const mapRef = useRef<MapHandle>(null);
  const [city, setCity] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const { location, request } = useUserLocation();

  const cities = useMemo(() => knownCities(places), [places]);
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
      <Chip
        label="All"
        icon="globe-outline"
        floating={!isWide}
        selected={!city}
        onPress={() => selectCity(undefined)}
      />
      {cities.map((c) => (
        <Chip
          key={c.city}
          label={`${c.city}  ${c.places.length}`}
          accessibilityLabel={`${c.city}, ${c.places.length} spots`}
          floating={!isWide}
          selected={city === c.city}
          onPress={() => selectCity(c.city)}
        />
      ))}
    </ChipRow>
  );

  const selectedCard = selected ? (
    <PressableScale
      scale={0.98}
      style={[styles.card, shadow('lg', dark)]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${selected.name}`}
      onPress={() => router.push(`/place/${selected.id}`)}
    >
      <IconBadge
        icon={CATEGORY_META[selected.category].icon}
        color={CATEGORY_META[selected.category].color}
        size={52}
      />
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
      <PressableScale
        scale={0.92}
        hitSlop={6}
        style={styles.goButton}
        accessibilityRole="button"
        accessibilityLabel={`Directions to ${selected.name}`}
        onPress={() => openInMaps(selected)}
      >
        <Icon name="navigate" size={20} color="onPrimary" />
      </PressableScale>
    </PressableScale>
  ) : nearby.length > 0 ? (
    <PressableScale
      scale={0.98}
      accessibilityRole="button"
      style={[styles.card, styles.cardInverse, shadow('lg', dark)]}
      onPress={() => {
        setSelectedId(nearby[0].place.id);
        mapRef.current?.fitTo(nearby.slice(0, 5).map((n) => n.place));
      }}
    >
      <View style={styles.nearbyBadge}>
        <Icon name="walk" size={24} color="onPrimary" />
      </View>
      <View style={styles.flex}>
        <Text variant="heading" color="textInverse">
          {nearby.length === 1 ? 'A saved spot is nearby' : `${nearby.length} saved spots nearby`}
        </Text>
        <Text variant="caption" color="textInverseMuted" numberOfLines={1}>
          {nearby[0].place.name} is {walkingMinutes(nearby[0].meters)} min away on foot
        </Text>
      </View>
      <Icon name="chevron-forward" size={20} color="textInverse" />
    </PressableScale>
  ) : null;

  // The card rises in when one appears; dismissing is instant. Switching between pins
  // swaps content in place: the user is comparing spots, so motion would only slow them.
  const floatingCard = selectedCard ? (
    <Animated.View key={selected ? 'selected' : 'nearby'} style={[styles.cardSlot, entrance]}>
      {selectedCard}
    </Animated.View>
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
                icon="add"
                variant="tinted"
                color="primaryText"
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
              <EmptyState icon="map" title="No spots yet" body="Save a reel to see it here." />
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
            {floatingCard}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {map}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={[styles.headerPill, shadow('md', dark)]}>
          <Text style={styles.brand}>travyy</Text>
          <View style={styles.stats}>
            <Text variant="caption" color="text" style={[styles.bold, styles.tabular]}>
              {places.length} saved
            </Text>
            <View style={styles.dot} />
            <Text variant="caption" style={[styles.bold, styles.tabular]}>
              {places.filter((p) => p.visitedAt).length} visited
            </Text>
          </View>
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
          <PressableScale
            style={[styles.fab, shadow('lg', dark)]}
            pressedStyle={styles.fabPressed}
            accessibilityRole="button"
            accessibilityLabel="Save a spot"
            onPress={() => router.push('/add')}
          >
            <Icon name="add" size={24} color="onPrimary" />
            <Text variant="bodyStrong" color="onPrimary" style={styles.fabLabel}>
              Save a spot
            </Text>
          </PressableScale>
        </View>
        {floatingCard}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.background },
  panel: { width: SIDE_PANEL_WIDTH, borderRightWidth: 1, borderRightColor: t.colors.border, gap: spacing.sm },
  panelHeader: { paddingHorizontal: spacing.gutter, gap: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wideOverlay: { position: 'absolute', right: 16, bottom: 16, left: 16, alignItems: 'flex-end', gap: 12 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 10 },
  headerPill: {
    marginHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.colors.overlay,
    borderRadius: radius.pill,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    paddingLeft: 20,
    paddingRight: 16,
    height: 52,
  },
  brand: { fontSize: 23, fontWeight: '800', color: t.colors.primary, letterSpacing: -0.9 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: t.colors.textSubtle },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.lg,
    gap: 12,
    alignItems: 'center',
  },
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
    paddingLeft: 20,
    paddingRight: 24,
    height: 54,
    borderRadius: radius.pill,
  },
  fabPressed: { backgroundColor: t.colors.primaryPressed },
  fabLabel: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  cardSlot: { width: '100%', maxWidth: 520 },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    padding: 14,
  },
  cardInverse: { backgroundColor: t.colors.surfaceInverse, borderColor: t.colors.surfaceInverse },
  nearbyBadge: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { marginTop: 6, fontStyle: 'italic' },
  goButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
