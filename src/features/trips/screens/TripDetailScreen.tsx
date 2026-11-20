import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Place } from '@/domain/models';
import { BookingOffers, PARTNER_IDS } from '@/features/booking/components/BookingOffers';
import { cityOffers } from '@/features/booking/offers';
import { formatMoney } from '@/domain/money';
import { useRefreshProvisionalRates } from '@/features/expenses/api/useRefreshProvisionalRates';
import { StopCostRow } from '@/features/expenses/components/StopCostRow';
import { TripMoney } from '@/features/expenses/components/TripMoney';
import { stopCosts } from '@/features/expenses/ledger';
import { ledgerAsText, tripDeleteMessage } from '@/features/expenses/share';
import { CATEGORY_META } from '@/features/places/categories';
import { PlaceRow } from '@/features/places/components/PlaceRow';
import { track } from '@/shared/lib/analytics';
import { formatDistance, totalRouteMeters, walkingMinutes } from '@/shared/lib/geo';
import { confirm, haptics, openWalkingDirections, shareText } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { Map, type MapMarker } from '@/shared/map';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  Pill,
  Screen,
  Segmented,
  Text,
} from '@/shared/ui';
import { useAppStore, useLedgerStore } from '@/store';
import { DAY_COLORS } from '../dayColors';
import { tripAsText } from '../share';
import { tripShareUrl } from '../shareLink';

type TripView = 'plan' | 'money';
const VIEW_OPTIONS = [
  { value: 'plan', label: 'Plan' },
  { value: 'money', label: 'Money' },
] as const;

/** Category labels are plural; these read wrong after a 1. */
const SINGULAR: Partial<Record<Place['category'], string>> = {
  sight: 'sight',
  stay: 'stay',
  activity: 'activity',
};

export function TripDetailScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const { isWide } = useLayout();
  const trip = useAppStore((s) => s.trips.find((t) => t.id === id));
  const allPlaces = useAppStore((s) => s.places);
  const replanTrip = useAppStore((s) => s.replanTrip);
  const removeTrip = useAppStore((s) => s.removeTrip);
  const ledger = useLedgerStore((s) => s.ledgers[id]);
  const [day, setDay] = useState(0);
  const [view, setView] = useState<TripView>('plan');
  useRefreshProvisionalRates(ledger);

  const byId = useMemo(() => new globalThis.Map(allPlaces.map((p) => [p.id, p])), [allPlaces]);
  const dayIndex = trip ? Math.min(day, trip.days.length - 1) : 0;
  const stops = useMemo(
    () => (trip?.days[dayIndex]?.placeIds ?? []).map((pid) => byId.get(pid)).filter((p): p is Place => !!p),
    [trip, dayIndex, byId],
  );
  const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
  const markers = useMemo<MapMarker[]>(
    () =>
      stops.map((p, i) => ({
        id: p.id,
        coordinate: p,
        color,
        label: String(i + 1),
        accessibilityLabel: `Stop ${i + 1}: ${p.name}`,
      })),
    [stops, color],
  );
  const route = useMemo(() => ({ coordinates: stops, color }), [stops, color]);

  if (!trip) return <EmptyState icon="airplane" title="Trip not found" body="It may have been deleted." />;

  const meters = totalRouteMeters(stops);
  const daySpend = stops.reduce((total, p) => total + stopCosts(ledger, p.id).totalMinor, 0);

  const shareTrip = () => {
    const link = tripShareUrl(trip, byId);
    track('trip_shared', { stops: trip.days.reduce((n, d) => n + d.placeIds.length, 0), link: !!link });
    void shareText(tripAsText(trip, byId, link), trip.name);
  };

  const shareMoney = () => {
    if (!ledger) return;
    track('money_summary_shared', { expenses: ledger.expenses.length });
    void shareText(ledgerAsText(trip.name, ledger), trip.name);
  };

  const onDelete = async () => {
    if (
      await confirm({
        title: 'Delete trip?',
        message: tripDeleteMessage(ledger),
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      router.back();
      removeTrip(trip.id);
    }
  };

  const itinerary = (
    <ScrollView contentContainerStyle={styles.itinerary}>
      <View style={styles.days}>
        <ChipRow>
          {trip.days.map((d, i) => (
            <Chip
              key={d.day}
              label={`Day ${d.day}`}
              selected={i === dayIndex}
              color={DAY_COLORS[i % DAY_COLORS.length]}
              onPress={() => {
                if (i !== dayIndex) haptics.selection();
                setDay(i);
              }}
            />
          ))}
        </ChipRow>
      </View>
      <View style={styles.summary}>
        <Text variant="headline">
          Day {dayIndex + 1} · {stops.length} stop{stops.length === 1 ? '' : 's'}
        </Text>
        <View style={styles.facts}>
          <Pill
            icon="walk"
            label={
              stops.length > 1
                ? `${formatDistance(meters)} · ~${walkingMinutes(meters)} min on foot`
                : 'One easy stop'
            }
          />
          {ledger && daySpend > 0 ? (
            <Pill icon="wallet" tone="brand" label={`${formatMoney(daySpend, ledger.currency)} spent`} />
          ) : null}
        </View>
        <View style={styles.mix}>
          {categoryCounts(stops).map(([c, n]) => (
            <View key={c} style={styles.mixItem}>
              <Icon name={CATEGORY_META[c].icon} size={14} color={CATEGORY_META[c].color} />
              <Text variant="caption" style={styles.tabular}>
                {n}{' '}
                {(n === 1 ? (SINGULAR[c] ?? CATEGORY_META[c].label) : CATEGORY_META[c].label).toLowerCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {stops.length > 0 ? (
        <View style={[styles.stops, lift(dark)]}>
          {stops.map((p, i) => (
            <View key={p.id} style={styles.stop}>
              {i < stops.length - 1 ? (
                <View style={[styles.connector, { backgroundColor: `${color}55` }]} />
              ) : null}
              <PlaceRow
                place={p}
                index={i + 1}
                indexColor={color}
                onPress={() => router.push(`/place/${p.id}`)}
              />
              <StopCostRow tripId={trip.id} ledger={ledger} place={p} onOpenMoney={() => setView('money')} />
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          title="Start day in Google Maps"
          iconName="walk"
          disabled={stops.length === 0}
          onPress={() => openWalkingDirections(stops)}
        />
        <Button
          title="Re-plan days"
          iconName="shuffle"
          variant="ghost"
          size="md"
          onPress={() => replanTrip(trip.id)}
        />
      </View>
      <View style={styles.booking}>
        <BookingOffers offers={cityOffers(trip.city, PARTNER_IDS)} from="trip" />
      </View>
    </ScrollView>
  );

  // Remount the map per day so its camera frames that day's stops.
  const map = <Map key={dayIndex} markers={markers} route={route} initialPoints={stops} />;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: trip.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              {view === 'money' && ledger ? (
                <IconButton
                  icon="people-outline"
                  variant="tinted"
                  size={18}
                  accessibilityLabel="Manage people"
                  onPress={() => router.push({ pathname: '/trip/[id]/people', params: { id: trip.id } })}
                />
              ) : null}
              {view === 'plan' ? (
                <IconButton
                  icon="share-outline"
                  variant="tinted"
                  size={18}
                  accessibilityLabel="Share trip"
                  onPress={shareTrip}
                />
              ) : ledger ? (
                <IconButton
                  icon="share-outline"
                  variant="tinted"
                  size={18}
                  accessibilityLabel="Share money summary"
                  onPress={shareMoney}
                />
              ) : null}
              <IconButton
                icon="trash-outline"
                variant="tinted"
                size={18}
                color="danger"
                accessibilityLabel="Delete trip"
                onPress={onDelete}
              />
            </View>
          ),
        }}
      />
      <View style={styles.switcher}>
        <Segmented
          options={VIEW_OPTIONS}
          value={view}
          accessibilityLabel="Trip view"
          onChange={(next) => {
            if (next !== view) haptics.selection();
            setView(next);
          }}
        />
      </View>
      {view === 'money' ? (
        <TripMoney trip={trip} />
      ) : isWide ? (
        <View style={styles.split}>
          <View style={styles.panel}>{itinerary}</View>
          <View style={styles.flex}>{map}</View>
        </View>
      ) : (
        <>
          <View style={styles.mapNarrow}>{map}</View>
          <View style={styles.flex}>{itinerary}</View>
        </>
      )}
    </Screen>
  );
}

function categoryCounts(stops: Place[]): [Place['category'], number][] {
  const counts = new globalThis.Map<Place['category'], number>();
  for (const s of stops) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()];
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  switcher: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  stops: {
    marginHorizontal: spacing.gutter,
    paddingVertical: 4,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  stop: { paddingBottom: 10 },
  // Joins each stop number to the next, so the day reads as a route rather than a list.
  connector: { position: 'absolute', left: 36, width: 2, top: 50, bottom: -18, borderRadius: 1 },
  split: { flex: 1, flexDirection: 'row' },
  panel: { width: 420, borderRightWidth: 1, borderRightColor: t.colors.border },
  mapNarrow: { height: 240 },
  headerActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  itinerary: { paddingBottom: spacing.xxxl, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  days: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  summary: { paddingHorizontal: spacing.gutter, gap: 10, paddingBottom: spacing.lg },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mix: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  mixItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabular: { fontVariant: ['tabular-nums'] },
  actions: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl, gap: spacing.sm },
  booking: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl },
}));
