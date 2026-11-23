import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { flagOf } from '@/domain/countries';
import { CONTENT_MAX_WIDTH, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { EmptyState, Icon, PressableScale, Screen, Text } from '@/shared/ui';
import { useAppStore } from '@/store';
import { colorFor, Monogram } from '../components/VaultCard';
import { SearchField } from '../components/SearchField';
import { fold, groupByCountry, plural, UNKNOWN_COUNTRY, type CountryGroup } from '../vault';
import { openCountry } from './SavesScreen';

type Sort = 'spots' | 'recent' | 'az';
const SORT_LABEL: Record<Sort, string> = { spots: 'Most spots', recent: 'Recent', az: 'A–Z' };
const NEXT_SORT: Record<Sort, Sort> = { spots: 'recent', recent: 'az', az: 'spots' };

interface CityTile {
  key: string;
  city: string;
  country: string;
  code?: string;
  spots: number;
  visited: number;
  lastSavedAt: number;
}

/**
 * The vault that sorts itself (§22 in ARCHITECTURE.md), laid out like glide's Places: a row of
 * countries to jump between, then every city as a card. A city opens on its own map.
 */
export function PlacesScreen() {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('spots');

  const countries = useMemo(() => groupByCountry(places), [places]);
  const cities = useMemo<CityTile[]>(
    () =>
      countries.flatMap((g) =>
        g.cities
          .filter((c) => c.known)
          .map((c) => ({
            key: `${g.country}/${c.city}`,
            city: c.city,
            country: g.country,
            code: g.code,
            spots: c.places.length,
            visited: c.visited,
            lastSavedAt: Math.max(...c.places.map((p) => p.savedAt)),
          })),
      ),
    [countries],
  );

  const q = fold(query.trim());
  const order = <T extends { spots: number; lastSavedAt: number }>(list: T[], name: (x: T) => string) =>
    [...list].sort((a, b) =>
      sort === 'az'
        ? name(a).localeCompare(name(b))
        : sort === 'recent'
          ? b.lastSavedAt - a.lastSavedAt
          : b.spots - a.spots,
    );
  const shownCountries = order(
    countries.filter((c) => !q || fold(c.country).includes(q)),
    (c) => c.country,
  );
  const shownCities = order(
    cities.filter((c) => !q || fold(c.city).includes(q) || fold(c.country).includes(q)),
    (c) => c.city,
  );

  if (places.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="earth"
          title="No places yet"
          body="Every spot you save is filed by country and city here, with nothing to set up."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Search a country or city" />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PressableScale
          scale={0.95}
          hitSlop={10}
          style={styles.sort}
          onPress={() => setSort(NEXT_SORT[sort])}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${SORT_LABEL[sort]}. Change order`}
        >
          <Text variant="caption" color="textMuted">
            Sort by:
          </Text>
          <Text variant="caption" color="text" style={styles.bold}>
            {SORT_LABEL[sort]}
          </Text>
          <Icon name="swap-vertical" size={14} color="textMuted" />
        </PressableScale>

        {shownCountries.length ? (
          <>
            <Text variant="label" color="textMuted" style={styles.label}>
              Countries
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.countryRow}
              style={styles.bleed}
            >
              {shownCountries.map((g) => (
                <CountryStamp key={g.country} group={g} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text variant="label" color="textMuted" style={styles.label}>
          Cities
        </Text>
        {shownCities.length ? (
          <View style={styles.grid}>
            {shownCities.map((c) => (
              <CityCard key={c.key} tile={c} />
            ))}
          </View>
        ) : (
          <EmptyState icon="search" title="No matches" body="No country or city has that name." />
        )}
      </ScrollView>
    </Screen>
  );
}

/** A country as a postage stamp: perforated edge, the flag, how much is in it. */
function CountryStamp({ group }: { group: CountryGroup }) {
  const styles = useStyles();
  const flag = flagOf(group.code);
  const unsorted = group.country === UNKNOWN_COUNTRY;
  return (
    <PressableScale
      scale={0.95}
      style={styles.stampSlot}
      accessibilityRole="button"
      accessibilityLabel={`${group.country}, ${plural(group.spots, 'spot')}`}
      onPress={() => openCountry(group)}
    >
      <View style={styles.stamp}>
        <View style={styles.stampInner}>
          {flag ? (
            <Text style={styles.flag}>{flag}</Text>
          ) : (
            <Monogram name={group.country} size={52} flag={unsorted ? '🧭' : undefined} />
          )}
        </View>
      </View>
      <Text variant="bodyStrong" numberOfLines={1} style={styles.center}>
        {group.country}
      </Text>
      <Text variant="caption" style={styles.center}>
        {plural(group.spots, 'spot')}
      </Text>
    </PressableScale>
  );
}

function CityCard({ tile }: { tile: CityTile }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const color = colorFor(tile.city);
  const flag = flagOf(tile.code);
  return (
    <PressableScale
      scale={0.97}
      style={styles.city}
      accessibilityRole="button"
      accessibilityLabel={`${tile.city}, ${tile.country}, ${plural(tile.spots, 'spot')}`}
      onPress={() =>
        router.push({
          pathname: '/vault/[country]/[city]',
          params: { country: tile.country, city: tile.city },
        })
      }
    >
      <View style={[styles.cityCover, { backgroundColor: `${color}${dark ? '3A' : '22'}` }]}>
        {/* A sun and a skyline in the city's colour: a postcard, drawn from shapes. */}
        <View style={[styles.sun, { backgroundColor: `${color}${dark ? '66' : '44'}` }]} />
        <View style={styles.skyline}>
          {[38, 62, 46, 80, 54, 34, 58].map((h, i) => (
            <View
              key={i}
              style={[styles.building, { height: h, backgroundColor: `${color}${dark ? '88' : '5C'}` }]}
            />
          ))}
        </View>
        {flag ? <Text style={styles.cityFlag}>{flag}</Text> : null}
      </View>
      <View style={styles.cityBody}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {tile.city}
        </Text>
        <Text variant="caption" color="primaryText" style={styles.bold}>
          {plural(tile.spots, 'spot')}
        </Text>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  search: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 4 },
  label: { paddingHorizontal: 4, marginTop: spacing.sm },
  bleed: { marginHorizontal: -spacing.gutter },
  countryRow: { gap: spacing.md, paddingHorizontal: spacing.gutter },
  stampSlot: { width: 112, gap: 4 },
  // Perforations: a dashed outline a few points outside a solid card.
  stamp: {
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.colors.borderStrong,
    padding: 5,
    marginBottom: 4,
  },
  stampInner: {
    height: 96,
    borderRadius: 6,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 50, lineHeight: 62 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  city: {
    // Two per row, and a lone last tile keeps its size instead of stretching.
    width: '47.5%',
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  cityCover: { height: 130, overflow: 'hidden' },
  sun: { position: 'absolute', width: 46, height: 46, borderRadius: 23, top: 18, left: 18 },
  skyline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingHorizontal: 6,
  },
  building: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  cityFlag: { position: 'absolute', top: 10, right: 12, fontSize: 24, lineHeight: 30 },
  cityBody: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
}));
