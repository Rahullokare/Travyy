import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatMoney } from '@/domain/money';
import { totalSpent } from '@/features/expenses/ledger';
import { useEntitlements } from '@/features/paywall/entitlements';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  EmptyState,
  Icon,
  IconBadge,
  IconButton,
  Pill,
  PressableScale,
  Screen,
  ScreenHeader,
  Text,
} from '@/shared/ui';
import { knownCities, useAppStore, useLedgerStore } from '@/store';
import { suggestedDays } from '../planner';

export function TripsScreen() {
  const styles = useStyles();
  const { dark, colors } = useTheme();
  const trips = useAppStore((s) => s.trips);
  const places = useAppStore((s) => s.places);
  const ledgers = useLedgerStore((s) => s.ledgers);
  const { canCreateTrip } = useEntitlements();
  const ready = knownCities(places).filter((c) => c.places.length >= 3);

  const startTrip = (city?: string) => {
    if (!canCreateTrip) {
      router.push({ pathname: '/paywall', params: { reason: 'trip' } });
      return;
    }
    router.push(city ? { pathname: '/trip/new', params: { city } } : '/trip/new');
  };

  const header =
    ready.length > 0 ? (
      <View style={[styles.column, styles.headerBlock]}>
        <Text variant="label" style={styles.groupLabel}>
          Ready to plan
        </Text>
        {ready.slice(0, 3).map((c) => {
          const days = suggestedDays(c.places.length);
          return (
            <PressableScale
              key={c.city}
              scale={0.98}
              style={[styles.card, lift(dark)]}
              pressedStyle={styles.cardPressed}
              onPress={() => startTrip(c.city)}
              accessibilityRole="button"
              accessibilityLabel={`Auto-plan a trip to ${c.city}`}
            >
              <IconBadge icon="sparkles" color={colors.primary} size={48} />
              <View style={styles.flex}>
                <Text variant="heading" numberOfLines={1}>
                  {c.city}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {c.places.length} spots · ~{days} day{days === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.autoPlan}>
                <Text variant="caption" color="onPrimary" style={styles.autoPlanLabel}>
                  Auto-plan
                </Text>
              </View>
            </PressableScale>
          );
        })}
        {trips.length > 0 ? (
          <Text variant="label" style={[styles.groupLabel, styles.yourTrips]}>
            Your trips
          </Text>
        ) : null}
      </View>
    ) : trips.length > 0 ? (
      <View style={styles.column}>
        <Text variant="label" style={styles.groupLabel}>
          Your trips
        </Text>
      </View>
    ) : undefined;

  return (
    <Screen>
      <ScreenHeader
        title="Trips"
        subtitle={trips.length ? `${trips.length} planned` : undefined}
        right={
          <IconButton
            icon="add"
            variant="tinted"
            color="primaryText"
            accessibilityLabel="Plan a trip"
            onPress={() => startTrip()}
          />
        }
      />
      <FlashList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const stops = item.days.reduce((n, d) => n + d.placeIds.length, 0);
          const ledger = ledgers[item.id];
          const spent = ledger ? totalSpent(ledger.expenses) : 0;
          return (
            <View style={styles.column}>
              <PressableScale
                scale={0.98}
                style={[styles.card, styles.trip, lift(dark)]}
                pressedStyle={styles.cardPressed}
                onPress={() => router.push(`/trip/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.city}, ${item.days.length} days`}
              >
                <IconBadge icon="airplane" color={colors.accent} size={48} />
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" numberOfLines={1} style={styles.tabular}>
                    {item.city} · {item.days.length} day{item.days.length === 1 ? '' : 's'} · {stops} stop
                    {stops === 1 ? '' : 's'}
                  </Text>
                  {spent > 0 && ledger ? (
                    <View style={styles.pill}>
                      <Pill
                        label={`${formatMoney(spent, ledger.currency)} spent`}
                        icon="wallet"
                        tone="brand"
                      />
                    </View>
                  ) : null}
                </View>
                <Icon name="chevron-forward" size={18} color="textSubtle" />
              </PressableScale>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="compass"
            title="No trips yet"
            body="Save at least 3 spots in a city, then let Travyy turn them into a day-by-day plan."
            action={<Button title="Plan a trip" iconName="sparkles" onPress={() => startTrip()} />}
          />
        }
        ListFooterComponent={
          trips.length > 0 ? (
            <View style={[styles.column, styles.footer]}>
              <Button
                title="Plan another trip"
                iconName="add"
                variant="secondary"
                onPress={() => startTrip()}
              />
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, gap: 2 },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
  },
  headerBlock: { gap: spacing.md, marginBottom: spacing.md },
  groupLabel: { paddingHorizontal: 4 },
  yourTrips: { marginTop: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  cardPressed: { backgroundColor: t.colors.surfacePressed },
  trip: { marginBottom: spacing.md },
  autoPlan: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: t.colors.primary,
  },
  autoPlanLabel: { fontWeight: '700' },
  tabular: { fontVariant: ['tabular-nums'] },
  pill: { marginTop: 6 },
  footer: { marginTop: spacing.xs },
}));
