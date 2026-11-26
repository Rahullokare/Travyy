import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { Candidate, Place } from '@/domain/models';
import { CATEGORY_META } from '@/features/places/categories';
import { fold } from '@/features/places/vault';
import { distanceMeters, formatDistance } from '@/shared/lib/geo';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import { makeStyles, radius, spacing } from '@/shared/theme';
import { Button, EmptyState, Icon, IconBadge, PressableScale, Screen, Text, TextField } from '@/shared/ui';
import { useAppStore } from '@/store';
import { searchPlaces } from '../api/geocoding';

type Hit = Candidate & { lat: number; lng: number };

/**
 * Already saved: within ~150 m and one name contains the other, ignoring case and accents, so
 * "Time Out Market" (saved from a reel) matches OpenStreetMap's "Time Out Market Lisboa".
 */
function savedMatch(hit: Hit, places: Place[]): Place | undefined {
  const name = fold(hit.name.trim());
  return places.find((p) => {
    const other = fold(p.name.trim());
    return distanceMeters(p, hit) < 150 && (name.includes(other) || other.includes(name));
  });
}

/**
 * Type a place and save it, glide's "Search for a place": for the café a friend mentioned, with no
 * reel or link to share. Results come from OpenStreetMap (the same geocoder the rest of the app
 * uses). Its usage policy forbids search-as-you-type, so it searches when you press search;
 * results near you come first when the phone already knows where you are. Picking one opens the
 * save form, filled in, where vaults and a note can be added.
 */
export function SearchPlaceScreen() {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  // Never asks for permission here: a known location only ranks results.
  const { location } = useUserLocation();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  const results = useQuery({
    queryKey: ['place-search', query, location?.lat.toFixed(2), location?.lng.toFixed(2)],
    queryFn: ({ signal }) => searchPlaces(query, { near: location, limit: 10, signal }),
    enabled: query.length > 1,
    staleTime: 10 * 60 * 1000,
  });

  const hits = useMemo<Hit[]>(() => {
    const found = (results.data ?? []).filter((c): c is Hit => c.lat !== undefined && c.lng !== undefined);
    return location
      ? [...found].sort((a, b) => distanceMeters(location, a) - distanceMeters(location, b))
      : found;
  }, [results.data, location]);

  const submit = () => {
    const q = text.trim();
    if (q.length > 1) setQuery(q);
  };

  const pick = (hit: Hit) =>
    router.push({
      pathname: '/add-place',
      params: {
        lat: hit.lat.toFixed(6),
        lng: hit.lng.toFixed(6),
        name: hit.name,
        category: hit.category,
      },
    });

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <TextField
            value={text}
            onChangeText={setText}
            icon="search"
            placeholder="Café, beach, museum, street…"
            accessibilityLabel="Place to search for"
            returnKeyType="search"
            autoFocus
            autoCorrect={false}
            onSubmitEditing={submit}
          />
        </View>
        <Button title="Search" size="md" onPress={submit} disabled={text.trim().length < 2} />
      </View>
      <Text variant="caption" style={styles.hint}>
        Add the city for a better match: “Ichiran Shibuya”, “Blue Tokai Bandra”.
      </Text>

      {!query ? (
        <EmptyState
          icon="search"
          title="Search for any place"
          body="Type its name and press search. Pick a result to save it, then add it to a vault."
        />
      ) : results.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text variant="caption">Searching…</Text>
        </View>
      ) : results.isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Search didn’t work"
          body="Check your connection and try again."
          action={<Button title="Try again" iconName="refresh" onPress={() => void results.refetch()} />}
        />
      ) : hits.length === 0 ? (
        <EmptyState
          icon="help-circle-outline"
          title="No places found"
          body="Try a different spelling, add the city, or drop a pin on the map instead."
          action={
            <Button
              title="Drop a pin on the map"
              iconName="pin"
              variant="tinted"
              onPress={() => router.navigate({ pathname: '/', params: { pick: String(Date.now()) } })}
            />
          }
        />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(h, i) => `${h.lat},${h.lng},${i}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const saved = savedMatch(item, places);
            const meta = CATEGORY_META[item.category];
            return (
              <PressableScale
                scale={0.98}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}${saved ? ', already saved' : ''}`}
                onPress={() => (saved ? router.push(`/place/${saved.id}`) : pick(item))}
              >
                <IconBadge icon={meta.icon} color={meta.color} size={42} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" numberOfLines={2}>
                    {[location && formatDistance(distanceMeters(location, item)), item.address]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {saved ? (
                  <View style={styles.savedPill}>
                    <Icon name="bookmark" size={12} color="success" />
                    <Text variant="caption" color="success" style={styles.bold}>
                      Saved
                    </Text>
                  </View>
                ) : (
                  <Icon name="add-circle" size={26} color="primaryText" />
                )}
              </PressableScale>
            );
          }}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  hint: { paddingHorizontal: spacing.gutter + 4, paddingTop: spacing.sm },
  loading: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxxl },
  list: { padding: spacing.gutter, gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: t.colors.successSoft,
  },
}));
