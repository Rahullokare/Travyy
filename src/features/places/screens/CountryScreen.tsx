import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { CONTENT_MAX_WIDTH, makeStyles, spacing } from '@/shared/theme';
import { EmptyState, Pill, Screen } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { SearchField } from '../components/SearchField';
import { SpotList, type SpotSection } from '../components/SpotList';
import { VaultCard } from '../components/VaultCard';
import { categoryCounts, placesInCountry, plural, searchSaves } from '../vault';

/** One country in the vault: its cities as folders, and a search across just this country. */
export function CountryScreen({ country }: { country: string }) {
  const styles = useStyles();
  const all = useAppStore((s) => s.places);
  const places = useMemo(() => placesInCountry(all, country), [all, country]);
  const cities = useMemo(() => groupByCity(places), [places]);
  const [query, setQuery] = useState('');

  const results = useMemo<SpotSection[]>(() => {
    if (!query.trim()) return [];
    const matches = searchSaves(places, query, (c) => CATEGORY_META[c].label);
    return groupByCity(matches).map((g) => ({
      key: g.city,
      title: g.city,
      subtitle: plural(g.places.length, 'spot'),
      places: matches.filter((p) => g.places.includes(p)),
    }));
  }, [places, query]);

  if (places.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: country }} />
        <EmptyState
          icon="bookmark"
          title="Nothing saved here"
          body="Spots you save in this country show up here."
        />
      </Screen>
    );
  }
  const visited = places.filter((p) => p.visitedAt).length;

  return (
    <Screen>
      <Stack.Screen options={{ title: country }} />
      <View style={styles.tools}>
        <SearchField value={query} onChange={setQuery} placeholder={`Search in ${country}`} />
        <View style={styles.facts}>
          <Pill icon="bookmark" label={plural(places.length, 'spot')} />
          <Pill icon="business" label={plural(cities.length, 'city', 'cities')} />
          <Pill icon="checkmark" tone={visited ? 'success' : 'neutral'} label={`${visited} visited`} />
        </View>
      </View>
      {query.trim() ? (
        <SpotList sections={results} emptyBody={`Nothing saved in ${country} matches.`} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {cities.map((c) => (
            <VaultCard
              key={c.city}
              title={c.city}
              meta={plural(c.places.length, 'spot')}
              detail={categoryCounts(c.places)
                .slice(0, 3)
                .map(([cat, n]) => `${n} ${CATEGORY_META[cat].label.toLowerCase()}`)
                .join(' · ')}
              visited={c.visited}
              total={c.places.length}
              onPress={() =>
                router.push({ pathname: '/vault/[country]/[city]', params: { country, city: c.city } })
              }
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  tools: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
}));
