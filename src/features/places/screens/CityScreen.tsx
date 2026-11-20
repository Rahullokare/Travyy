import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Category } from '@/domain/models';
import { useEntitlements } from '@/features/paywall/entitlements';
import { distanceMeters, formatDistance } from '@/shared/lib/geo';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { CONTENT_MAX_WIDTH, makeStyles, spacing } from '@/shared/theme';
import { Chip, ChipRow, EmptyState, IconButton, Screen } from '@/shared/ui';
import { useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { SearchField } from '../components/SearchField';
import { SpotList, type SpotSection } from '../components/SpotList';
import { categoryCounts, placesInCity, plural, searchSaves } from '../vault';

/** Fewer spots than this and a plan isn't worth making. */
const MIN_TO_PLAN = 3;

/**
 * The spots in one city: the bottom of the vault. Grouped by category so a long city still reads
 * at a glance, with search, filters and "nearest first" for when you're standing in it.
 */
export function CityScreen({ country, city }: { country: string; city: string }) {
  const styles = useStyles();
  const all = useAppStore((s) => s.places);
  const places = useMemo(() => placesInCity(all, country, city), [all, country, city]);
  const { canCreateTrip } = useEntitlements();
  const { location, request } = useUserLocation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const [hideVisited, setHideVisited] = useState(false);
  const [nearest, setNearest] = useState(false);

  const categories = useMemo(() => categoryCounts(places), [places]);
  const sections = useMemo<SpotSection[]>(() => {
    const shown = searchSaves(
      places.filter((p) => (!category || p.category === category) && (!hideVisited || !p.visitedAt)),
      query,
      (c) => CATEGORY_META[c].label,
    );
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
  }, [places, category, hideVisited, query, nearest, location]);

  if (places.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: city }} />
        <EmptyState
          icon="bookmark"
          title="Nothing saved here"
          body="Spots you save in this city show up here."
        />
      </Screen>
    );
  }

  const planTrip = () => {
    if (!canCreateTrip) return router.push({ pathname: '/paywall', params: { reason: 'trip' } });
    router.push({ pathname: '/trip/new', params: { city } });
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: city,
          headerRight:
            places.length >= MIN_TO_PLAN
              ? () => (
                  <IconButton
                    icon="sparkles"
                    variant="tinted"
                    size={18}
                    color="primaryText"
                    accessibilityLabel={`Plan a trip to ${city}`}
                    onPress={planTrip}
                  />
                )
              : undefined,
        }}
      />
      <View style={styles.tools}>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={`Search ${plural(places.length, 'spot')} in ${city}`}
          />
        </View>
        <ChipRow>
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
      <SpotList
        sections={sections}
        subtitleFor={
          nearest && location
            ? (p) =>
                `${CATEGORY_META[p.category].label} · ${formatDistance(distanceMeters(location, p))} away`
            : undefined
        }
        emptyBody={`Nothing saved in ${city} matches. Try clearing a filter.`}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  tools: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  search: { paddingHorizontal: spacing.gutter },
}));
