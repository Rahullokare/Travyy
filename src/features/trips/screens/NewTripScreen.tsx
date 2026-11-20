import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORY_META } from '@/features/places/categories';
import { vaultSummary } from '@/features/places/vaults';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconBadge,
  PressableScale,
  ScreenScroll,
  Section,
  Text,
  TextField,
} from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { suggestedDays } from '../planner';

const MAX_DAYS = 14;

/** `vaultId`: plan from one vault's spots only (custom or Liked) instead of everything saved. */
export function NewTripScreen({ initialCity, vaultId }: { initialCity?: string; vaultId?: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const allPlaces = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const places = useMemo(
    () => (vaultId ? (vaultSummary(vaultId, vaults, allPlaces)?.places ?? allPlaces) : allPlaces),
    [vaultId, vaults, allPlaces],
  );
  const createTrip = useAppStore((s) => s.createTrip);
  const cities = useMemo(() => groupByCity(places), [places]);

  const [city, setCity] = useState(initialCity ?? cities[0]?.city);
  const cityPlaces = useMemo(() => cities.find((c) => c.city === city)?.places ?? [], [cities, city]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<number>();
  const [name, setName] = useState('');
  const dayCount = days ?? suggestedDays(cityPlaces.length);
  const chosen = cityPlaces.filter((p) => !excluded.has(p.id));

  if (cities.length === 0 || !city) {
    return <EmptyState icon="map" title="Save some spots first" body="Trips are built from your saves." />;
  }

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const build = () => {
    const id = createTrip({
      name: name.trim() || `${city} getaway`,
      city,
      placeIds: chosen.map((p) => p.id),
      days: dayCount,
    });
    track('trip_created', { days: dayCount, stops: chosen.length });
    haptics.success();
    // Opened straight from a link, there's nothing underneath to dismiss to.
    if (router.canDismiss()) {
      router.dismiss();
      router.push(`/trip/${id}`);
    } else {
      router.replace(`/trip/${id}`);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenScroll>
        <Section title="Where">
          <ChipRow bleed>
            {cities.map((c) => (
              <Chip
                key={c.city}
                label={`${c.city}  ${c.places.length}`}
                accessibilityLabel={`${c.city}, ${c.places.length} spots`}
                selected={c.city === city}
                onPress={() => {
                  setCity(c.city);
                  setExcluded(new Set());
                  setDays(undefined);
                }}
              />
            ))}
          </ChipRow>
        </Section>

        <Section title="How many days">
          <View style={styles.stepper}>
            <PressableScale
              scale={0.9}
              disabled={dayCount <= 1}
              style={[styles.stepButton, dayCount <= 1 && styles.stepDisabled]}
              pressedStyle={styles.stepPressed}
              onPress={() => {
                haptics.selection();
                setDays(Math.max(1, dayCount - 1));
              }}
              accessibilityRole="button"
              accessibilityLabel="Fewer days"
            >
              <Icon name="remove" />
            </PressableScale>
            <Text variant="title" style={styles.days} accessibilityLiveRegion="polite">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </Text>
            <PressableScale
              scale={0.9}
              disabled={dayCount >= MAX_DAYS}
              style={[styles.stepButton, dayCount >= MAX_DAYS && styles.stepDisabled]}
              pressedStyle={styles.stepPressed}
              onPress={() => {
                haptics.selection();
                setDays(Math.min(MAX_DAYS, dayCount + 1));
              }}
              accessibilityRole="button"
              accessibilityLabel="More days"
            >
              <Icon name="add" />
            </PressableScale>
          </View>
          <Text variant="caption">
            ~{Math.ceil(chosen.length / dayCount)} stops per day, grouped by neighbourhood.
          </Text>
        </Section>

        <TextField label="Trip name" value={name} onChangeText={setName} placeholder={`${city} getaway`} />

        <Section title={`Include ${chosen.length} of ${cityPlaces.length}`}>
          <View style={[styles.list, lift(dark)]}>
            {cityPlaces.map((p, i) => {
              const on = !excluded.has(p.id);
              const meta = CATEGORY_META[p.category];
              return (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [
                    styles.item,
                    i > 0 && styles.itemDivider,
                    pressed && styles.itemPressed,
                  ]}
                  onPress={() => {
                    haptics.selection();
                    toggle(p.id);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  aria-checked={on}
                  accessibilityLabel={p.name}
                >
                  <View style={!on && styles.dimmed}>
                    <IconBadge icon={meta.icon} color={meta.color} size={36} />
                  </View>
                  <Text
                    variant="bodyStrong"
                    color={on ? 'text' : 'textMuted'}
                    style={styles.flex}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Icon
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? 'primary' : 'textSubtle'}
                  />
                </Pressable>
              );
            })}
          </View>
        </Section>
      </ScreenScroll>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.footerInner}>
          <Button
            title={`Build my ${dayCount}-day plan`}
            iconName="sparkles"
            disabled={chosen.length === 0}
            onPress={build}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: t.colors.surfaceSunken,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: t.colors.surfacePressed },
  stepDisabled: { opacity: 0.4 },
  days: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  list: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 60,
  },
  itemDivider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  itemPressed: { backgroundColor: t.colors.surfacePressed },
  dimmed: { opacity: 0.45 },
  footer: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  footerInner: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
}));
