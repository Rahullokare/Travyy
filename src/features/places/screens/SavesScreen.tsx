import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Category, Place } from '@/domain/models';
import { distanceMeters, formatDistance } from '@/shared/lib/geo';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { CONTENT_MAX_WIDTH, lift, makeStyles, useTheme } from '@/shared/theme';
import { Button, Chip, ChipRow, EmptyState, Icon, IconButton, Screen, Text } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { CATEGORIES, CATEGORY_META } from '../categories';
import { PlaceRow } from '../components/PlaceRow';

type Sort = 'city' | 'nearest';
type Row =
  | { type: 'header'; key: string; title: string; subtitle: string }
  | { type: 'place'; key: string; place: Place };

export function SavesScreen() {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);
  const places = useAppStore((s) => s.places);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>();
  const [hideVisited, setHideVisited] = useState(false);
  const [sort, setSort] = useState<Sort>('city');
  const { location, request } = useUserLocation();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter(
      (p) =>
        (!category || p.category === category) &&
        (!hideVisited || !p.visitedAt) &&
        (!q || [p.name, p.city, p.country, p.note].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [places, query, category, hideVisited]);

  // FlashList has no sections: flatten into typed rows (headers + places) instead.
  const rows = useMemo<Row[]>(() => {
    if (sort === 'nearest' && location) {
      const sorted = [...filtered].sort((a, b) => distanceMeters(location, a) - distanceMeters(location, b));
      return [
        { type: 'header', key: 'h-near', title: 'Nearest to you', subtitle: `${sorted.length} spots` },
        ...sorted.map((place): Row => ({ type: 'place', key: place.id, place })),
      ];
    }
    return groupByCity(filtered).flatMap((g): Row[] => [
      {
        type: 'header',
        key: `h-${g.city}`,
        title: g.city,
        subtitle: `${g.places.length} spot${g.places.length === 1 ? '' : 's'} · ${g.visited} visited`,
      },
      ...g.places.map((place): Row => ({ type: 'place', key: place.id, place })),
    ]);
  }, [filtered, sort, location]);

  const openPlace = useCallback((p: Place) => router.push(`/place/${p.id}`), []);
  const usedCategories = CATEGORIES.filter((c) => places.some((p) => p.category === c));

  const header = (
    <View style={styles.header}>
      <View style={[styles.search, lift(dark), searchFocused && styles.searchFocused]}>
        <Icon name="search" size={18} color="textMuted" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search saves, cities, notes"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search saves"
          style={styles.searchInput}
          returnKeyType="search"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {query ? (
          <IconButton
            icon="close-circle"
            size={18}
            color="textMuted"
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
          />
        ) : null}
      </View>
      <ChipRow>
        <Chip
          label={sort === 'nearest' ? '📍 Nearest' : '🏙️ By city'}
          selected
          color={colors.accent}
          onPress={async () => {
            if (sort === 'nearest') return setSort('city');
            if (location || (await request())) setSort('nearest');
          }}
        />
        <Chip label="Hide visited" selected={hideVisited} onPress={() => setHideVisited(!hideVisited)} />
        {usedCategories.map((c) => (
          <Chip
            key={c}
            label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
            selected={category === c}
            color={CATEGORY_META[c].color}
            onPress={() => setCategory(category === c ? undefined : c)}
          />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerAction}>
              <IconButton
                icon="add-circle"
                size={28}
                color="primary"
                accessibilityLabel="Save a spot"
                onPress={() => router.push('/add')}
              />
            </View>
          ),
        }}
      />
      {places.length === 0 ? (
        <EmptyState
          emoji="🔖"
          title="Nothing saved yet"
          body="Copy the link of any travel reel, TikTok or Google Maps place and paste it here."
          action={<Button title="Save your first spot" onPress={() => router.push('/add')} />}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.type}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState emoji="🔍" title="No matches" body="Try a different search or filter." />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <View style={[styles.column, styles.sectionHeader]}>
                <Text variant="heading">{item.title}</Text>
                <Text variant="caption" style={styles.tabular}>
                  {item.subtitle}
                </Text>
              </View>
            ) : (
              <View style={styles.column}>
                <PlaceRow
                  place={item.place}
                  onPress={openPlace}
                  subtitle={
                    sort === 'nearest' && location
                      ? `${CATEGORY_META[item.place.category].label} · ${formatDistance(distanceMeters(location, item.place))} away`
                      : undefined
                  }
                />
              </View>
            )
          }
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    gap: 12,
    paddingTop: 8,
    paddingBottom: 4,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  headerAction: { paddingHorizontal: 12 },
  search: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: t.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 16,
    height: 46,
  },
  searchFocused: { borderColor: t.colors.primary },
  searchInput: { flex: 1, fontSize: 16, color: t.colors.text, height: '100%', outlineWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 6,
  },
  listContent: { paddingBottom: 32 },
}));
