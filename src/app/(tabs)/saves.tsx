import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { PlaceRow } from '../../components/PlaceRow';
import { Button, Chip, EmptyState } from '../../components/ui';
import { CATEGORIES, CATEGORY_META } from '../../lib/categories';
import { distanceMeters, formatDistance } from '../../lib/geo';
import { groupByCity, useStore } from '../../lib/store';
import { colors, radius, space, type } from '../../lib/theme';
import type { Category } from '../../lib/types';
import { useUserLocation } from '../../lib/useUserLocation';

type Sort = 'city' | 'nearest';

export default function SavesScreen() {
  const places = useStore((s) => s.places);
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

  const sections = useMemo(() => {
    if (sort === 'nearest' && location) {
      const sorted = [...filtered].sort((a, b) => distanceMeters(location, a) - distanceMeters(location, b));
      return [{ title: 'Nearest to you', subtitle: `${sorted.length} spots`, data: sorted }];
    }
    return groupByCity(filtered).map((g) => ({
      title: g.city,
      subtitle: `${g.places.length} spot${g.places.length === 1 ? '' : 's'} · ${g.places.filter((p) => p.visitedAt).length} visited`,
      data: g.places,
    }));
  }, [filtered, sort, location]);

  const usedCategories = CATEGORIES.filter((c) => places.some((p) => p.category === c));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/add')} style={{ paddingHorizontal: space.lg }} accessibilityLabel="Save a spot">
              <Ionicons name="add-circle" size={28} color={colors.primary} />
            </Pressable>
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
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={{ gap: space.md, paddingBottom: space.sm }}>
              <View style={styles.search}>
                <Ionicons name="search" size={18} color={colors.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search saves, cities, notes"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <Chip
                  label={sort === 'nearest' ? '📍 Nearest' : '🏙️ By city'}
                  active
                  color={colors.accent}
                  onPress={async () => {
                    if (sort === 'city') {
                      if (!location) await request();
                      setSort('nearest');
                    } else setSort('city');
                  }}
                />
                <Chip label="Hide visited" active={hideVisited} onPress={() => setHideVisited(!hideVisited)} />
                {usedCategories.map((c) => (
                  <Chip
                    key={c}
                    label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
                    active={category === c}
                    color={CATEGORY_META[c].color}
                    onPress={() => setCategory(category === c ? undefined : c)}
                  />
                ))}
              </ScrollView>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={type.h2}>{section.title}</Text>
              <Text style={type.small}>{section.subtitle}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <PlaceRow
              place={item}
              onPress={() => router.push(`/place/${item.id}`)}
              subtitle={
                sort === 'nearest' && location
                  ? `${CATEGORY_META[item.category].label} · ${formatDistance(distanceMeters(location, item))} away`
                  : undefined
              }
            />
          )}
          ListEmptyComponent={<EmptyState emoji="🔍" title="No matches" body="Try a different search or filter." />}
          contentContainerStyle={{ paddingBottom: space.xxl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  chips: { paddingHorizontal: space.lg, gap: space.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xs,
  },
});
