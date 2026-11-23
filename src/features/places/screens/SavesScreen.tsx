import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { Category, Place } from '@/domain/models';
import { NEW_FAB_CLEARANCE, NewFab } from '@/features/capture/components/NewFab';
import { AvatarButton } from '@/features/profile/components/AvatarButton';
import { distanceMeters } from '@/shared/lib/geo';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { CONTENT_MAX_WIDTH, makeStyles, spacing } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  PressableScale,
  Screen,
  ScreenHeader,
  Text,
} from '@/shared/ui';
import { knownCities, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { SearchField } from '../components/SearchField';
import { SpotCard } from '../components/SpotCard';
import {
  categoryCounts,
  groupByCountry,
  plural,
  searchSaves,
  UNKNOWN_COUNTRY,
  type CountryGroup,
} from '../vault';

const categoryLabel = (c: Category) => CATEGORY_META[c].label;

type Sort = 'recent' | 'az' | 'near';
const SORT_LABEL: Record<Sort, string> = { recent: 'Recent', az: 'A–Z', near: 'Nearest' };
const NEXT_SORT: Record<Sort, Sort> = { recent: 'az', az: 'near', near: 'recent' };

export function openCountry(group: CountryGroup) {
  // A country with one city has nothing to choose between: go straight to its spots.
  if (group.cities.length === 1) {
    router.push({
      pathname: '/vault/[country]/[city]',
      params: { country: group.country, city: group.cities[0].city },
    });
  } else {
    router.push({ pathname: '/vault/[country]', params: { country: group.country } });
  }
}

/**
 * Every save, newest first, as a grid of cards: glide's "My Saves". Browsing by country, city or
 * vault lives on the Vaults tab; this tab is for "that place I saved last week". Search and the
 * category chips filter the same grid, so the keyboard stays up while results change.
 */
export function SavesScreen() {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const [sort, setSort] = useState<Sort>('recent');
  const { location, request } = useUserLocation();

  const categories = useMemo(() => categoryCounts(places), [places]);
  const shown = useMemo(() => {
    const pool = category ? places.filter((p) => p.category === category) : places;
    // searchSaves ranks best-first, which beats any sort while typing.
    if (query.trim()) return searchSaves(pool, query, categoryLabel);
    if (sort === 'near' && location)
      return [...pool].sort((a, b) => distanceMeters(location, a) - distanceMeters(location, b));
    if (sort === 'az') return [...pool].sort((a, b) => a.name.localeCompare(b.name));
    return [...pool].sort((a, b) => b.savedAt - a.savedAt);
  }, [places, category, query, sort, location]);

  const countries = groupByCountry(places).filter((c) => c.country !== UNKNOWN_COUNTRY).length;
  const cities = knownCities(places).length;
  const openPlace = useCallback((p: Place) => router.push(`/place/${p.id}`), []);

  const cycleSort = async () => {
    const next = NEXT_SORT[sort];
    // Nearest needs a location; without one, skip to the next order rather than showing nothing new.
    if (next === 'near' && !location && !(await request())) return setSort(NEXT_SORT.near);
    setSort(next);
  };

  return (
    <Screen>
      <ScreenHeader
        title="Saves"
        subtitle={
          places.length
            ? [
                plural(places.length, 'spot'),
                countries ? plural(countries, 'country', 'countries') : undefined,
                cities ? plural(cities, 'city', 'cities') : undefined,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        right={<AvatarButton />}
      />
      {places.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="Your saves will live here"
          body="Share a reel, TikTok or Google Maps place to Travyy, paste its link, or drop a pin on the map."
          action={<Button title="Save your first spot" iconName="add" onPress={() => router.push('/new')} />}
        />
      ) : (
        <>
          {/* Outside the list, so the keyboard stays up when the first letter swaps the grid for results. */}
          <View style={styles.tools}>
            <View style={styles.search}>
              <SearchField value={query} onChange={setQuery} placeholder="Search your saves" />
            </View>
            <ChipRow>
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
          <FlashList
            data={shown}
            numColumns={2}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.grid}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <Text variant="label" color="textMuted" style={styles.flex}>
                  {query.trim() || category ? plural(shown.length, 'match', 'matches') : 'All saves'}
                </Text>
                {query.trim() ? null : (
                  <PressableScale
                    scale={0.95}
                    hitSlop={10}
                    style={styles.sort}
                    onPress={cycleSort}
                    accessibilityRole="button"
                    accessibilityLabel={`Sorted by ${SORT_LABEL[sort]}. Change order`}
                  >
                    <Text variant="caption" color="textMuted">
                      Sort:
                    </Text>
                    <Text variant="caption" color="text" style={styles.sortValue}>
                      {SORT_LABEL[sort]}
                    </Text>
                    <Icon name="swap-vertical" size={14} color="textMuted" />
                  </PressableScale>
                )}
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                icon="search"
                title="No matches"
                body="Nothing in your saves matches. Check the spelling, or clear the filter."
              />
            }
            renderItem={({ item }) => (
              <View style={styles.cell}>
                <SpotCard place={item} onPress={openPlace} />
              </View>
            )}
          />
        </>
      )}
      <NewFab />
    </Screen>
  );
}

const GRID_GAP = 6;

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  tools: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  search: { paddingHorizontal: spacing.gutter },
  grid: { paddingHorizontal: spacing.gutter - GRID_GAP, paddingBottom: NEW_FAB_CLEARANCE },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GRID_GAP + 4,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortValue: { fontWeight: '700' },
  cell: { flex: 1, padding: GRID_GAP },
}));
