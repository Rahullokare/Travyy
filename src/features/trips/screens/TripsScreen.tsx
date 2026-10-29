import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useEntitlements } from '@/features/paywall/entitlements';
import { track } from '@/shared/lib/analytics';
import { CONTENT_MAX_WIDTH, makeStyles } from '@/shared/theme';
import { Button, EmptyState, Screen, Text } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { suggestedDays } from '../planner';

export function TripsScreen() {
  const styles = useStyles();
  const trips = useAppStore((s) => s.trips);
  const places = useAppStore((s) => s.places);
  const { canCreateTrip } = useEntitlements();
  const ready = groupByCity(places).filter((c) => c.places.length >= 3);

  const startTrip = (city?: string) => {
    if (!canCreateTrip) {
      track('paywall_viewed', { trigger: 'trip_limit' });
      router.push('/paywall');
      return;
    }
    router.push(city ? { pathname: '/trip/new', params: { city } } : '/trip/new');
  };

  const header =
    ready.length > 0 ? (
      <View style={[styles.column, styles.headerBlock]}>
        <Text variant="label">Ready to plan</Text>
        {ready.slice(0, 3).map((c) => {
          const days = suggestedDays(c.places.length);
          return (
            <Pressable
              key={c.city}
              style={styles.suggest}
              onPress={() => startTrip(c.city)}
              accessibilityRole="button"
            >
              <View style={styles.flex}>
                <Text variant="heading" color="textInverse">
                  {c.city}
                </Text>
                <Text variant="caption" color="textInverseMuted">
                  {c.places.length} saved spots · about {days} day{days > 1 ? 's' : ''}
                </Text>
              </View>
              <Text variant="bodyStrong" color="primary">
                Auto-plan ✨
              </Text>
            </Pressable>
          );
        })}
        {trips.length > 0 ? (
          <Text variant="label" style={styles.yourTrips}>
            Your trips
          </Text>
        ) : null}
      </View>
    ) : undefined;

  return (
    <Screen>
      <FlashList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const stops = item.days.reduce((n, d) => n + d.placeIds.length, 0);
          return (
            <View style={styles.column}>
              <Pressable
                style={styles.trip}
                onPress={() => router.push(`/trip/${item.id}`)}
                accessibilityRole="button"
              >
                <Text style={styles.tripEmoji}>🧳</Text>
                <View style={styles.flex}>
                  <Text variant="heading">{item.name}</Text>
                  <Text variant="caption">
                    {item.city} · {item.days.length} day{item.days.length === 1 ? '' : 's'} · {stops} stops
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            emoji="🧭"
            title="No trips yet"
            body="Save at least 3 spots in a city, then let Travyy turn them into a day-by-day plan."
            action={<Button title="Plan a trip" onPress={() => startTrip()} />}
          />
        }
        ListFooterComponent={
          trips.length > 0 ? (
            <View style={[styles.column, styles.footer]}>
              <Button title="Plan another trip" variant="secondary" onPress={() => startTrip()} />
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  list: { paddingVertical: 16 },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16 },
  headerBlock: { gap: 12, marginBottom: 12 },
  yourTrips: { marginTop: 12 },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceInverse,
  },
  trip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  tripEmoji: { fontSize: 30, lineHeight: 38 },
  footer: { marginTop: 4 },
}));
