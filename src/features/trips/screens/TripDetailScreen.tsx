import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Place } from '@/domain/models';
import { formatMoney } from '@/domain/money';
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
import { CONTENT_MAX_WIDTH, makeStyles } from '@/shared/theme';
import { Button, Chip, ChipRow, EmptyState, Icon, IconButton, Screen, Segmented, Text } from '@/shared/ui';
import { useAppStore, useLedgerStore } from '@/store';
import { tripAsText } from '../share';

type TripView = 'plan' | 'money';
const VIEW_OPTIONS = [
  { value: 'plan', label: 'Plan' },
  { value: 'money', label: 'Money' },
] as const;

const DAY_COLORS = ['#FF5A36', '#2F7DF6', '#1FA971', '#8B5CF6', '#E0A100', '#E2508C', '#0EA5A5'];

export function TripDetailScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { isWide } = useLayout();
  const trip = useAppStore((s) => s.trips.find((t) => t.id === id));
  const allPlaces = useAppStore((s) => s.places);
  const replanTrip = useAppStore((s) => s.replanTrip);
  const removeTrip = useAppStore((s) => s.removeTrip);
  const ledger = useLedgerStore((s) => s.ledgers[id]);
  const [day, setDay] = useState(0);
  const [view, setView] = useState<TripView>('plan');

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

  if (!trip) return <EmptyState emoji="🧳" title="Trip not found" body="It may have been deleted." />;

  const meters = totalRouteMeters(stops);
  const daySpend = stops.reduce((total, p) => total + stopCosts(ledger, p.id).totalMinor, 0);

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
        <Text variant="heading">
          Day {dayIndex + 1} · {stops.length} stop{stops.length === 1 ? '' : 's'}
        </Text>
        <Text variant="caption" style={styles.tabular}>
          {stops.length > 1
            ? `${formatDistance(meters)} · ~${walkingMinutes(meters)} min walking between stops`
            : 'One easy stop'}
        </Text>
        <Text variant="caption">{summarise(stops)}</Text>
        {ledger && daySpend > 0 ? (
          <Text variant="caption" style={styles.tabular}>
            {formatMoney(daySpend, ledger.currency)} spent at these stops
          </Text>
        ) : null}
      </View>
      {stops.map((p, i) => (
        <View key={p.id} style={styles.stop}>
          <PlaceRow place={p} index={i + 1} onPress={() => router.push(`/place/${p.id}`)} />
          <StopCostRow tripId={trip.id} ledger={ledger} place={p} onOpenMoney={() => setView('money')} />
        </View>
      ))}
      <View style={styles.actions}>
        <Button
          title="Start day in Google Maps"
          disabled={stops.length === 0}
          icon={<Icon name="walk" size={18} color="onPrimary" />}
          onPress={() => openWalkingDirections(stops)}
        />
        <Button title="Re-shuffle days" variant="secondary" onPress={() => replanTrip(trip.id)} />
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
                  accessibilityLabel="Manage people"
                  onPress={() => router.push({ pathname: '/trip/[id]/people', params: { id: trip.id } })}
                />
              ) : null}
              {view === 'plan' ? (
                <IconButton
                  icon="share-outline"
                  accessibilityLabel="Share trip"
                  onPress={() => shareText(tripAsText(trip, byId), trip.name)}
                />
              ) : ledger ? (
                <IconButton
                  icon="share-outline"
                  accessibilityLabel="Share money summary"
                  onPress={shareMoney}
                />
              ) : null}
              <IconButton
                icon="trash-outline"
                color="textMuted"
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

function summarise(stops: Place[]): string {
  const counts = new globalThis.Map<Place['category'], number>();
  for (const s of stops) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()].map(([c, n]) => `${CATEGORY_META[c].emoji} ${n}`).join('   ');
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  switcher: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  stop: { paddingBottom: 6 },
  split: { flex: 1, flexDirection: 'row' },
  panel: { width: 420, borderRightWidth: 1, borderRightColor: t.colors.border },
  mapNarrow: { height: 260 },
  headerActions: { flexDirection: 'row', gap: 16, paddingHorizontal: 8 },
  itinerary: { paddingBottom: 32, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  days: { paddingVertical: 16 },
  summary: { paddingHorizontal: 16, gap: 4, paddingBottom: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
  actions: { padding: 16, gap: 8 },
}));
