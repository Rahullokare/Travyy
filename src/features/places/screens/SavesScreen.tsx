import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { flagOf } from '@/domain/countries';
import type { Category } from '@/domain/models';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  ScreenHeader,
  Text,
} from '@/shared/ui';
import { areaOf, knownCities, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { PlaceRow } from '../components/PlaceRow';
import { SearchField } from '../components/SearchField';
import { SpotList, type SpotSection } from '../components/SpotList';
import { VaultCard } from '../components/VaultCard';
import {
  categoryCounts,
  groupByCountry,
  plural,
  searchSaves,
  UNKNOWN_COUNTRY,
  type CountryGroup,
} from '../vault';
import { vaultSummaries } from '../vaults';

const RECENT = 4;
const categoryLabel = (c: Category) => CATEGORY_META[c].label;

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
 * The saves vault's front door. Countries are the folders, so a hundred saves is still a short
 * screen; the search box and category chips cut across every country at once.
 */
export function SavesScreen() {
  const styles = useStyles();
  const { dark } = useTheme();
  const places = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const shared = useAppStore((s) => s.shared);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const searching = !!query.trim() || !!category;

  const countries = useMemo(() => groupByCountry(places), [places]);
  const categories = useMemo(() => categoryCounts(places), [places]);
  const yours = useMemo(() => vaultSummaries(vaults, places), [vaults, places]);
  const recent = useMemo(() => [...places].sort((a, b) => b.savedAt - a.savedAt).slice(0, RECENT), [places]);
  const results = useMemo<SpotSection[]>(() => {
    if (!searching) return [];
    const matches = searchSaves(
      category ? places.filter((p) => p.category === category) : places,
      query,
      categoryLabel,
    );
    // searchSaves ranks best-first; grouping keeps that order inside each country.
    return groupByCountry(matches).map((g) => ({
      key: g.country,
      title: g.country,
      subtitle: plural(g.spots, 'spot'),
      places: matches.filter((p) => g.cities.some((c) => c.places.includes(p))),
    }));
  }, [searching, places, category, query]);

  const cityCount = knownCities(places).length;
  const known = countries.filter((c) => c.country !== UNKNOWN_COUNTRY).length;

  return (
    <Screen>
      <ScreenHeader
        title="Saves"
        subtitle={
          places.length
            ? [
                plural(places.length, 'spot'),
                known ? plural(known, 'country', 'countries') : undefined,
                plural(cityCount, 'city', 'cities'),
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        right={
          <IconButton
            icon="add"
            variant="tinted"
            color="primaryText"
            accessibilityLabel="Save a spot"
            onPress={() => router.push('/add')}
          />
        }
      />
      {places.length === 0 ? (
        <EmptyState
          icon="bookmark"
          title="Nothing saved yet"
          body="Copy the link of any travel reel, TikTok or Google Maps place and paste it here."
          action={<Button title="Save your first spot" iconName="add" onPress={() => router.push('/add')} />}
        />
      ) : (
        <>
          {/* Outside the lists, so the keyboard stays up when the first letter swaps folders for results. */}
          <View style={styles.tools}>
            <View style={styles.search}>
              <SearchField value={query} onChange={setQuery} placeholder="Search every spot you’ve saved" />
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
          {searching ? (
            <SpotList
              sections={results}
              subtitleFor={(p) => `${CATEGORY_META[p.category].label} · ${areaOf(p)}`}
              emptyBody="Nothing in your saves matches. Check the spelling, or clear the filter."
            />
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.labelRow}>
                <Text variant="label" color="textMuted" style={[styles.label, styles.flex]}>
                  Your vaults
                </Text>
                <PressableScale
                  onPress={() => router.push('/vaults/new')}
                  accessibilityRole="button"
                  accessibilityLabel="New vault"
                  hitSlop={10}
                  scale={0.95}
                  style={styles.newVault}
                >
                  <Icon name="add" size={16} color="primaryText" />
                  <Text variant="callout" color="primaryText" style={styles.newVaultLabel}>
                    New
                  </Text>
                </PressableScale>
              </View>
              {yours.map((v) => (
                <VaultCard
                  key={v.id}
                  title={v.name}
                  flag={v.emoji}
                  meta={
                    v.cities.length
                      ? `${plural(v.places.length, 'spot')} · ${plural(v.cities.length, 'city', 'cities')}`
                      : plural(v.places.length, 'spot')
                  }
                  detail={
                    [
                      shared[v.id] ? `👥 ${plural(shared[v.id].people ?? 1, 'person', 'people')}` : undefined,
                      v.cities.join(', '),
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  visited={v.visited}
                  total={v.places.length}
                  onPress={() => router.push({ pathname: '/vaults/[id]', params: { id: v.id } })}
                />
              ))}
              {vaults.length === 0 ? (
                <PressableScale
                  scale={0.98}
                  style={styles.vaultPrompt}
                  onPress={() => router.push('/vaults/new')}
                  accessibilityRole="button"
                  accessibilityLabel="Make your first vault"
                >
                  <Text style={styles.promptEmoji} accessibilityElementsHidden>
                    ☕
                  </Text>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">Make a vault</Text>
                    <Text variant="caption">
                      Cafés to try, a weekend away, date nights. Each one gets its own map.
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color="primaryText" />
                </PressableScale>
              ) : null}
              <Text variant="label" color="textMuted" style={[styles.label, styles.recentLabel]}>
                Countries
              </Text>
              {countries.map((g) => (
                <VaultCard
                  key={g.country}
                  title={g.country}
                  flag={flagOf(g.code)}
                  meta={[
                    plural(g.spots, 'spot'),
                    ...(g.cities.some((c) => c.known)
                      ? [plural(g.cities.filter((c) => c.known).length, 'city', 'cities')]
                      : []),
                  ].join(' · ')}
                  detail={g.cities
                    .filter((c) => c.known)
                    .map((c) => c.city)
                    .join(', ')}
                  visited={g.visited}
                  total={g.spots}
                  onPress={() => openCountry(g)}
                />
              ))}
              <Text variant="label" color="textMuted" style={[styles.label, styles.recentLabel]}>
                Recently saved
              </Text>
              <View style={[styles.group, lift(dark)]}>
                {recent.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 ? <View style={styles.separator} /> : null}
                    <PlaceRow
                      place={p}
                      subtitle={`${CATEGORY_META[p.category].label} · ${areaOf(p)}`}
                      onPress={() => router.push(`/place/${p.id}`)}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  tools: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  search: { paddingHorizontal: spacing.gutter },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  flex: { flex: 1 },
  label: { paddingHorizontal: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  newVault: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  newVaultLabel: { fontWeight: '600' },
  vaultPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.primarySoft,
  },
  promptEmoji: { fontSize: 28, lineHeight: 36 },
  recentLabel: { marginTop: spacing.md },
  group: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  separator: { height: 1, marginLeft: 72, backgroundColor: t.colors.border },
}));
