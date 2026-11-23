import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { flagOf } from '@/domain/countries';
import type { Category } from '@/domain/models';
import { useEntitlements } from '@/features/paywall/entitlements';
import { distanceMeters, formatDistance } from '@/shared/lib/geo';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import type { MapHandle } from '@/shared/map';
import { makeStyles, spacing } from '@/shared/theme';
import { Chip, ChipRow, EmptyState, IconButton, Screen, Text } from '@/shared/ui';
import { useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { MapSheet } from '../components/MapSheet';
import { PlaceMapCard } from '../components/PlaceMapCard';
import { SearchField } from '../components/SearchField';
import { SheetSpotList, type SpotSection } from '../components/SpotList';
import { Monogram } from '../components/VaultCard';
import { placeToMarker } from '../markers';
import { categoryCounts, countryCodeFor, placesInCity, plural, searchSaves } from '../vault';
import { goBack } from './VaultScreen';

/** Fewer spots than this and a plan isn't worth making. */
const MIN_TO_PLAN = 3;

/**
 * The spots in one city, the bottom of the vault, on the city's own map. Grouped by category
 * so a long city still reads at a glance, with search, filters and "nearest first" for when
 * you're standing in it. The map shows exactly what the list shows.
 */
export function CityScreen({ country, city }: { country: string; city: string }) {
  const styles = useStyles();
  const all = useAppStore((s) => s.places);
  const places = useMemo(() => placesInCity(all, country, city), [all, country, city]);
  const { canCreateTrip } = useEntitlements();
  const { location, request } = useUserLocation();
  const mapRef = useRef<MapHandle>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const [hideVisited, setHideVisited] = useState(false);
  const [nearest, setNearest] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const categories = useMemo(() => categoryCounts(places), [places]);
  const shown = useMemo(
    () =>
      searchSaves(
        places.filter((p) => (!category || p.category === category) && (!hideVisited || !p.visitedAt)),
        query,
        (c) => CATEGORY_META[c].label,
      ),
    [places, category, hideVisited, query],
  );
  const sections = useMemo<SpotSection[]>(() => {
    if (nearest && location) {
      const sorted = [...shown].sort((a, b) => distanceMeters(location, a) - distanceMeters(location, b));
      return [
        { key: 'near', title: 'Nearest to you', subtitle: plural(sorted.length, 'spot'), places: sorted },
      ];
    }
    if (query.trim()) {
      return [{ key: 'results', title: 'Results', subtitle: plural(shown.length, 'spot'), places: shown }];
    }
    return categoryCounts(shown).map(([c, n]) => ({
      key: c,
      title: CATEGORY_META[c].label,
      subtitle: plural(n, 'spot'),
      places: shown.filter((p) => p.category === c),
    }));
  }, [shown, query, nearest, location]);
  const markers = useMemo(() => shown.map((p) => placeToMarker(p, p.id === selectedId)), [shown, selectedId]);
  const selected = shown.find((p) => p.id === selectedId);

  if (places.length === 0) {
    return (
      <Screen>
        <View style={styles.missingBar}>
          <IconButton icon="arrow-back" variant="tinted" accessibilityLabel="Back" onPress={goBack} />
        </View>
        <EmptyState
          icon="bookmark"
          title="Nothing saved here"
          body="Spots you save in this city show up here."
        />
      </Screen>
    );
  }

  const visited = places.filter((p) => p.visitedAt).length;
  const planTrip = () => {
    if (!canCreateTrip) return router.push({ pathname: '/paywall', params: { reason: 'trip' } });
    router.push({ pathname: '/trip/new', params: { city } });
  };
  const locate = async () => {
    const here = location ?? (await request());
    if (here) mapRef.current?.centerOn(here);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Monogram name={city} flag={flagOf(countryCodeFor(places[0]))} size={52} />
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={1} accessibilityRole="header">
            {city}
          </Text>
          <Text variant="caption" numberOfLines={1} style={styles.tabular}>
            {plural(places.length, 'spot')} · {visited}/{places.length} visited · {country}
          </Text>
        </View>
      </View>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={`Search ${plural(places.length, 'spot')} in ${city}`}
        />
      </View>
      <ChipRow>
        {places.length >= MIN_TO_PLAN ? (
          <Chip label="Plan a trip" icon="sparkles" color="#D14318" onPress={planTrip} />
        ) : null}
        <Chip
          label="Nearest"
          icon="navigate"
          selected={nearest}
          onPress={async () => {
            if (nearest) return setNearest(false);
            if (location || (await request())) setNearest(true);
          }}
        />
        <Chip
          label="Hide visited"
          icon="eye-off"
          selected={hideVisited}
          onPress={() => setHideVisited(!hideVisited)}
        />
        {categories.map(([c, n]) => (
          <Chip
            key={c}
            label={`${CATEGORY_META[c].label} ${n}`}
            accessibilityLabel={`${CATEGORY_META[c].label}, ${plural(n, 'spot')}`}
            icon={CATEGORY_META[c].icon}
            selected={category === c}
            color={CATEGORY_META[c].color}
            onPress={() => setCategory(category === c ? undefined : c)}
          />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <MapSheet
      mapRef={mapRef}
      markers={markers}
      initialPoints={places}
      userLocation={location}
      onMarkerPress={setSelectedId}
      onMapPress={() => setSelectedId(undefined)}
      peekKey={selectedId}
      topBar={<IconButton icon="arrow-back" variant="floating" accessibilityLabel="Back" onPress={goBack} />}
      floating={
        <>
          <IconButton
            icon="locate"
            variant="floating"
            accessibilityLabel="Show my location"
            onPress={locate}
          />
          {selected ? (
            <View style={styles.cardSlot}>
              <PlaceMapCard place={selected} location={location} />
            </View>
          ) : null}
        </>
      }
      header={header}
    >
      <SheetSpotList
        sections={sections}
        subtitleFor={
          nearest && location
            ? (p) =>
                `${CATEGORY_META[p.category].label} · ${formatDistance(distanceMeters(location, p))} away`
            : undefined
        }
        emptyBody={`Nothing saved in ${city} matches. Try clearing a filter.`}
      />
    </MapSheet>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  missingBar: { paddingTop: 56, paddingHorizontal: spacing.lg },
  header: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.gutter },
  search: { paddingHorizontal: spacing.gutter },
  cardSlot: { width: '100%' },
}));
