import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORY_META } from '@/features/places/categories';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { Map, type MapMarker } from '@/shared/map';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, EmptyState, Icon, Pill, Text } from '@/shared/ui';
import { useAppStore } from '@/store';
import { DAY_COLORS } from '../dayColors';
import { useImportInbox } from '../importInbox';
import { decodeTrip } from '../shareLink';

/**
 * Where a shared trip link lands: the whole plan on a map, readable without the app or an account,
 * and one button to make it yours. This is the page a group sees first, so it has to sell the
 * product by being useful straight away.
 */
export function SharedTripScreen({ data }: { data?: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const { isWide } = useLayout();
  const trip = useMemo(() => decodeTrip(data), [data]);
  const onboarded = useAppStore((s) => s.onboarded);
  const stops = useMemo(() => trip?.days.flat() ?? [], [trip]);

  useEffect(() => {
    track('shared_trip_opened', { stops: stops.length, valid: !!trip });
  }, [trip, stops.length]);

  const markers = useMemo<MapMarker[]>(
    () =>
      (trip?.days ?? []).flatMap((day, d) =>
        day.map((p, i) => ({
          id: `${d}-${i}`,
          coordinate: p,
          color: DAY_COLORS[d % DAY_COLORS.length],
          label: String(i + 1),
          accessibilityLabel: `Day ${d + 1}, stop ${i + 1}: ${p.name}`,
        })),
      ),
    [trip],
  );

  const goHome = () => router.replace('/');

  // Leave only after onboarding is recorded: until then the tabs don't exist to go to.
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (added && onboarded) router.replace('/');
  }, [added, onboarded]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="link"
          title="This trip link didn’t open"
          body="It may have been cut short when it was copied. Ask for it again, or start your own trip."
          action={<Button title="Open Travyy" onPress={goHome} />}
        />
      </SafeAreaView>
    );
  }

  const add = () => {
    const store = useAppStore.getState();
    const id = store.importTrip(trip);
    track('shared_trip_imported', { stops: stops.length, newUser: !onboarded });
    haptics.success();
    // The tabs open the trip once they're on screen, which leaves Trips behind it to go back to.
    useImportInbox.getState().hold(id);
    setAdded(true);
    // A new visitor skips the intro: they already have a real trip to look at.
    if (!onboarded) store.completeOnboarding();
  };

  const dayCount = trip.days.length;
  const plan = (
    <ScrollView contentContainerStyle={styles.plan}>
      <View style={styles.header}>
        <Text style={styles.brand}>travyy</Text>
        <Text variant="overline" color="primaryText">
          A trip shared with you
        </Text>
        <Text variant="title">{trip.name}</Text>
        <View style={styles.facts}>
          {trip.city ? <Pill icon="location" label={trip.city} /> : null}
          <Pill icon="calendar" label={`${dayCount} day${dayCount === 1 ? '' : 's'}`} />
          <Pill icon="flag" label={`${stops.length} stop${stops.length === 1 ? '' : 's'}`} />
        </View>
      </View>
      {trip.days.map((day, d) => {
        const color = DAY_COLORS[d % DAY_COLORS.length];
        return (
          <View key={d} style={styles.day}>
            <Text variant="heading">Day {d + 1}</Text>
            <View style={[styles.card, lift(dark)]}>
              {day.length === 0 ? (
                <Text variant="caption" style={styles.empty}>
                  A free day
                </Text>
              ) : null}
              {day.map((p, i) => (
                <View key={`${p.name}-${i}`} style={[styles.stop, i > 0 && styles.divider]}>
                  <View style={[styles.index, { backgroundColor: color }]}>
                    <Text style={styles.indexLabel}>{i + 1}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text variant="caption">{CATEGORY_META[p.category].label}</Text>
                  </View>
                  <Icon
                    name={CATEGORY_META[p.category].icon}
                    size={18}
                    color={CATEGORY_META[p.category].color}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <Text variant="caption" color="textSubtle" align="center" style={styles.pitch}>
        Travyy turns saved reels into a shared map, a day-by-day plan and a fair split of the costs.
      </Text>
    </ScrollView>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
        <Button title="Add to my Travyy" iconName="add-circle" loading={added} onPress={add} />
        <Text variant="caption" color="textSubtle" align="center">
          Free. No account needed.
        </Text>
      </View>
    </View>
  );

  const map = <Map markers={markers} initialPoints={stops} />;

  return (
    <SafeAreaView style={styles.safe}>
      {isWide ? (
        <View style={styles.split}>
          <View style={styles.panel}>
            {plan}
            {footer}
          </View>
          <View style={styles.flex}>{map}</View>
        </View>
      ) : (
        <>
          <View style={styles.mapNarrow}>{map}</View>
          <View style={styles.flex}>{plan}</View>
          {footer}
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  panel: { width: 420, borderRightWidth: 1, borderRightColor: t.colors.border },
  mapNarrow: { height: 240 },
  plan: {
    padding: spacing.gutter,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: { gap: 8 },
  brand: { fontSize: 20, fontWeight: '800', color: t.colors.primary, letterSpacing: -0.7, marginBottom: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  day: { gap: 10 },
  card: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  divider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  empty: { padding: 16 },
  index: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  indexLabel: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  pitch: { maxWidth: 320, alignSelf: 'center' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
  },
  footerInner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 6 },
}));
