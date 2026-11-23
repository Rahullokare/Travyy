import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng, Place } from '@/domain/models';
import { PlaceRow } from '@/features/places/components/PlaceRow';
import { PlaceMapCard } from '@/features/places/components/PlaceMapCard';
import { placeToMarker } from '@/features/places/markers';
import { customVaultSummaries, likedPlaces } from '@/features/places/vaults';
import { AvatarButton } from '@/features/profile/components/AvatarButton';
import { track } from '@/shared/lib/analytics';
import { distanceMeters, walkingMinutes } from '@/shared/lib/geo';
import { haptics } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { Map, type MapHandle } from '@/shared/map';
import { makeStyles, radius, shadow, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
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
  const vaults = useAppStore((s) => s.vaults);
  const mapRef = useRef<MapHandle>(null);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string>();
  const [picking, setPicking] = useState(false);
  const { location, request } = useUserLocation();
  const { pick } = useLocalSearchParams<{ pick?: string }>();

  // "Drop a pin" in the New sheet lands here with a fresh `pick` value each time. Reacting while
  // rendering (not in an effect) switches modes without drawing the old one first.
  const [seenPick, setSeenPick] = useState<string>();
  if (pick !== seenPick) {
    setSeenPick(pick);
    if (pick) {
      setSelectedId(undefined);
      setPicking(true);
    }
  }

  const cities = useMemo(() => knownCities(places), [places]);
  const yours = useMemo(
    () => customVaultSummaries(vaults, places).filter((v) => v.places.length),
    [vaults, places],
  );
  const liked = useMemo(() => likedPlaces(places), [places]);
  const visible = useMemo(() => placesFor(filter, places, yours, liked), [filter, places, yours, liked]);
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

  const show = (next: Filter) => {
    setFilter(next);
    setSelectedId(undefined);
    const pts = placesFor(next, places, yours, liked);
    if (pts.length) mapRef.current?.fitTo(pts);
  };

  /** A pin goes down where the finger held, or under the crosshair, and the save form opens. */
  const dropPin = (point: LatLng, how: 'long_press' | 'pick') => {
    haptics.success();
    track('pin_dropped', { how });
    setPicking(false);
    router.push({ pathname: '/add-place', params: { lat: point.lat.toFixed(6), lng: point.lng.toFixed(6) } });
  };
  const confirmPick = async () => {
    const center = await mapRef.current?.getCenter();
    if (center) dropPin(center, 'pick');
  };

  const focusPlace = useCallback((p: Place) => {
    setSelectedId(p.id);
    mapRef.current?.centerOn(p);
  }, []);

  const locate = async () => {
    const here = location ?? (await request());
    if (here) mapRef.current?.centerOn(here);
  };

  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b);
  const cityChips = (
    <ChipRow>
      <Chip
        label="All"
        icon="globe-outline"
        floating={!isWide}
        selected={filter.kind === 'all'}
        onPress={() => show({ kind: 'all' })}
      />
      {liked.length ? (
        <Chip
          label={`Liked  ${liked.length}`}
          icon="heart"
          color="#E0245E"
          floating={!isWide}
          selected={filter.kind === 'liked'}
          onPress={() => show({ kind: 'liked' })}
        />
      ) : null}
      <Chip
        label="To visit"
        icon="flag-outline"
        floating={!isWide}
        selected={filter.kind === 'todo'}
        onPress={() => show({ kind: 'todo' })}
      />
      {yours.map((v) => (
        <Chip
          key={v.id}
          label={`${v.emoji} ${v.name}  ${v.places.length}`}
          accessibilityLabel={`${v.name} vault, ${v.places.length} spots`}
          floating={!isWide}
          selected={same(filter, { kind: 'vault', id: v.id })}
          onPress={() => show({ kind: 'vault', id: v.id })}
        />
      ))}
      {cities.map((c) => (
        <Chip
          key={c.city}
          label={`${c.city}  ${c.places.length}`}
          accessibilityLabel={`${c.city}, ${c.places.length} spots`}
          floating={!isWide}
          selected={same(filter, { kind: 'city', city: c.city })}
          onPress={() => show({ kind: 'city', city: c.city })}
        />
      ))}
    </ChipRow>
  );

  const selectedCard = selected ? (
    <PlaceMapCard place={selected} location={location} />
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

  // Picking: the map moves under a fixed pin, so the spot is exact without fiddly dragging.
  const pickOverlay = (
    <View style={styles.pickLayer} pointerEvents="none">
      {/* Below the header pill, where the filter chips were. */}
      <View style={[styles.pickHint, shadow('md', dark), { marginTop: isWide ? 16 : insets.top + 70 }]}>
        <Icon name="hand-left-outline" size={16} color="text" />
        <Text variant="callout" color="text">
          Move the map to put the pin on the spot
        </Text>
      </View>
      <View style={styles.crosshair}>
        <View style={[styles.pinHead, shadow('lg', dark)]}>
          <Icon name="add" size={22} color="onPrimary" />
        </View>
        <View style={styles.pinStem} />
        <View style={styles.pinShadow} />
      </View>
    </View>
  );
  const pickActions = (
    <View style={[styles.pickBar, shadow('lg', dark)]}>
      <Button title="Cancel" variant="secondary" onPress={() => setPicking(false)} style={styles.flex} />
      <Button title="Save here" iconName="bookmark" onPress={confirmPick} style={styles.flex} />
    </View>
  );

  const map = (
    <Map
      ref={mapRef}
      markers={markers}
      initialPoints={places}
      userLocation={location}
      onMarkerPress={(id) => !picking && setSelectedId(id)}
      onPress={() => setSelectedId(undefined)}
      onLongPress={picking ? undefined : (point) => dropPin(point, 'long_press')}
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
              <View style={styles.row}>
                <IconButton
                  icon="add"
                  variant="tinted"
                  color="primaryText"
                  accessibilityLabel="New: save a spot or make a vault"
                  onPress={() => router.push('/new')}
                />
                <AvatarButton />
              </View>
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
          {picking ? pickOverlay : null}
          <View style={styles.wideOverlay} pointerEvents="box-none">
            {picking ? (
              pickActions
            ) : (
              <>
                <IconButton
                  icon="locate"
                  variant="floating"
                  accessibilityLabel="Show my location"
                  onPress={locate}
                />
                {floatingCard}
              </>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {map}
      {picking ? pickOverlay : null}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.headerRow} pointerEvents="box-none">
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
          <View style={[styles.avatarRing, shadow('md', dark)]}>
            <AvatarButton />
          </View>
        </View>
        {picking ? null : cityChips}
      </View>
      <View style={styles.bottom} pointerEvents="box-none">
        {picking ? (
          pickActions
        ) : (
          <>
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
                accessibilityLabel="New: save a spot or make a vault"
                onPress={() => router.push('/new')}
              >
                <Icon name="add" size={24} color="onPrimary" />
                <Text variant="bodyStrong" color="onPrimary" style={styles.fabLabel}>
                  New
                </Text>
              </PressableScale>
              <IconButton
                icon="pin-outline"
                variant="floating"
                accessibilityLabel="Drop a pin to save a spot"
                onPress={() => {
                  setSelectedId(undefined);
                  setPicking(true);
                }}
              />
            </View>
            {floatingCard}
          </>
        )}
      </View>
    </View>
  );
}

type Filter =
  | { kind: 'all' }
  | { kind: 'liked' }
  | { kind: 'todo' }
  | { kind: 'vault'; id: string }
  | { kind: 'city'; city: string };

function placesFor(
  filter: Filter,
  places: Place[],
  vaults: { id: string; places: Place[] }[],
  liked: Place[],
): Place[] {
  switch (filter.kind) {
    case 'all':
      return places;
    case 'liked':
      return liked;
    case 'todo':
      return places.filter((p) => !p.visitedAt);
    case 'vault':
      return vaults.find((v) => v.id === filter.id)?.places ?? [];
    case 'city':
      return places.filter((p) => cityOf(p) === filter.city);
  }
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.background },
  panel: { width: SIDE_PANEL_WIDTH, borderRightWidth: 1, borderRightColor: t.colors.border, gap: spacing.sm },
  panelHeader: { paddingHorizontal: spacing.gutter, gap: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wideOverlay: { position: 'absolute', right: 16, bottom: 16, left: 16, alignItems: 'flex-end', gap: 12 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.gutter },
  avatarRing: { borderRadius: 26, padding: 6, backgroundColor: t.colors.overlay },
  pickLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' },
  pickHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: t.colors.surfaceRaised,
  },
  // Centred on the screen with the stem's tip exactly at the middle: that point is what's saved.
  crosshair: { position: 'absolute', top: '50%', alignItems: 'center', marginTop: -58 },
  pinHead: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  pinStem: { width: 3, height: 14, borderRadius: 2, backgroundColor: t.colors.primary },
  pinShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.35)', marginTop: -1 },
  pickBar: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: t.colors.surfaceRaised,
  },
  headerPill: {
    flex: 1,
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
