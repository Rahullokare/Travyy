import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useEntitlements } from '@/features/paywall/entitlements';
import { track } from '@/shared/lib/analytics';
import { CONTENT_MAX_WIDTH, lift, makeStyles, useTheme } from '@/shared/theme';
import { Button, EmptyState, Icon, PressableScale, Screen, Text } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { suggestedDays } from '../planner';

export function TripsScreen() {
  const styles = useStyles();
  const { dark } = useTheme();
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
            <PressableScale
              key={c.city}
              scale={0.98}
              style={styles.suggest}
              onPress={() => startTrip(c.city)}
              accessibilityRole="button"
              accessibilityLabel={`Auto-plan a trip to ${c.city}`}
            >
              <View style={styles.flex}>
                <Text variant="heading" color="textInverse">
                  {c.city}
                </Text>
                <Text variant="caption" color="textInverseMuted">
                  {c.places.length} saved spots · about {days} day{days === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.autoPlan}>
                <Icon name="sparkles" size={14} color="onPrimary" />
                <Text variant="caption" color="onPrimary" style={styles.autoPlanLabel}>
                  Auto-plan
                </Text>
              </View>
            </PressableScale>
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
              <PressableScale
                scale={0.98}
                style={[styles.trip, lift(dark)]}
                pressedStyle={styles.tripPressed}
                onPress={() => router.push(`/trip/${item.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.tripBadge}>
                  <Text style={styles.tripEmoji}>🧳</Text>
                </View>
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" numberOfLines={1} style={styles.tabular}>
                    {item.city} · {item.days.length} day{item.days.length === 1 ? '' : 's'} · {stops} stop
                    {stops === 1 ? '' : 's'}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} color="textMuted" />
              </PressableScale>
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
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: t.colors.surfaceInverse,
  },
  autoPlan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: t.colors.primary,
  },
  autoPlanLabel: { fontWeight: '700' },
  tabular: { fontVariant: ['tabular-nums'] },
  trip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  tripPressed: { backgroundColor: t.colors.surfacePressed },
  tripBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEmoji: { fontSize: 26, lineHeight: 32 },
  footer: { marginTop: 4 },
}));
