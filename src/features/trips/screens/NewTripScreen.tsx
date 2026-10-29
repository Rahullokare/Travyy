import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CATEGORY_META } from '@/features/places/categories';
import { track } from '@/shared/lib/analytics';
import { CONTENT_MAX_WIDTH, makeStyles } from '@/shared/theme';
import { Button, Chip, ChipRow, EmptyState, Icon, ScreenScroll, Section, Text, TextField } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { suggestedDays } from '../planner';

const MAX_DAYS = 14;

export function NewTripScreen({ initialCity }: { initialCity?: string }) {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
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
    return <EmptyState emoji="🗺️" title="Save some spots first" body="Trips are built from your saves." />;
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
    router.dismiss();
    router.push(`/trip/${id}`);
  };

  return (
    <View style={styles.flex}>
      <ScreenScroll>
        <Section title="Where">
          <ChipRow inset={0}>
            {cities.map((c) => (
              <Chip
                key={c.city}
                label={`${c.city} · ${c.places.length}`}
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
            <Pressable
              style={styles.stepButton}
              onPress={() => setDays(Math.max(1, dayCount - 1))}
              accessibilityRole="button"
              accessibilityLabel="Fewer days"
            >
              <Icon name="remove" />
            </Pressable>
            <Text variant="title" style={styles.days} accessibilityLiveRegion="polite">
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </Text>
            <Pressable
              style={styles.stepButton}
              onPress={() => setDays(Math.min(MAX_DAYS, dayCount + 1))}
              accessibilityRole="button"
              accessibilityLabel="More days"
            >
              <Icon name="add" />
            </Pressable>
          </View>
          <Text variant="caption">
            ~{Math.ceil(chosen.length / dayCount)} stops per day, grouped by neighbourhood.
          </Text>
        </Section>

        <TextField label="Trip name" value={name} onChangeText={setName} placeholder={`${city} getaway`} />

        <Section title={`Include (${chosen.length}/${cityPlaces.length})`}>
          {cityPlaces.map((p) => {
            const on = !excluded.has(p.id);
            return (
              <Pressable
                key={p.id}
                style={[styles.item, on && styles.itemOn]}
                onPress={() => toggle(p.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={styles.itemEmoji}>{CATEGORY_META[p.category].emoji}</Text>
                <Text variant="bodyStrong" color={on ? 'text' : 'textMuted'} style={styles.flex}>
                  {p.name}
                </Text>
                <Icon name={on ? 'checkmark' : 'add'} size={20} color={on ? 'primary' : 'textMuted'} />
              </Pressable>
            );
          })}
        </Section>
      </ScreenScroll>
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <Button title={`Build my ${dayCount}-day plan ✨`} disabled={chosen.length === 0} onPress={build} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  days: { minWidth: 100, textAlign: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: t.colors.border,
  },
  itemOn: { borderColor: t.colors.primary },
  itemEmoji: { fontSize: 20, lineHeight: 26 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
  },
  footerInner: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
}));
