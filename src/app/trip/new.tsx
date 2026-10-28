import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chip, EmptyState } from '../../components/ui';
import { CATEGORY_META } from '../../lib/categories';
import { groupByCity, useStore } from '../../lib/store';
import { colors, radius, space, type } from '../../lib/theme';

export default function NewTripScreen() {
  const params = useLocalSearchParams<{ city?: string }>();
  const places = useStore((s) => s.places);
  const createTrip = useStore((s) => s.createTrip);
  const cities = useMemo(() => groupByCity(places), [places]);

  const [city, setCity] = useState(params.city ?? cities[0]?.city);
  const cityPlaces = useMemo(() => cities.find((c) => c.city === city)?.places ?? [], [cities, city]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const suggestedDays = Math.min(7, Math.max(1, Math.round(cityPlaces.length / 5)));
  const [days, setDays] = useState<number>();
  const dayCount = days ?? suggestedDays;
  const [name, setName] = useState('');

  if (cities.length === 0) {
    return <EmptyState emoji="🗺️" title="Save some spots first" body="Trips are built from your saves." />;
  }

  const chosen = cityPlaces.filter((p) => !excluded.has(p.id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Where</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {cities.map((c) => (
              <Chip
                key={c.city}
                label={`${c.city} · ${c.places.length}`}
                active={c.city === city}
                onPress={() => {
                  setCity(c.city);
                  setExcluded(new Set());
                  setDays(undefined);
                }}
              />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>How many days</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setDays(Math.max(1, dayCount - 1))} accessibilityLabel="Fewer days">
              <Text style={styles.stepTxt}>−</Text>
            </Pressable>
            <Text style={styles.days}>
              {dayCount} day{dayCount === 1 ? '' : 's'}
            </Text>
            <Pressable style={styles.stepBtn} onPress={() => setDays(Math.min(14, dayCount + 1))} accessibilityLabel="More days">
              <Text style={styles.stepTxt}>+</Text>
            </Pressable>
          </View>
          <Text style={type.small}>~{Math.ceil(chosen.length / dayCount)} stops per day, grouped by neighbourhood.</Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Trip name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={`${city} getaway`}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>
            Include ({chosen.length}/{cityPlaces.length})
          </Text>
          {cityPlaces.map((p) => {
            const on = !excluded.has(p.id);
            return (
              <Pressable
                key={p.id}
                style={[styles.item, on && { borderColor: colors.primary }]}
                onPress={() => {
                  const next = new Set(excluded);
                  if (on) next.add(p.id);
                  else next.delete(p.id);
                  setExcluded(next);
                }}
              >
                <Text style={{ fontSize: 20 }}>{CATEGORY_META[p.category].emoji}</Text>
                <Text style={{ flex: 1, fontWeight: '600', color: on ? colors.text : colors.muted }}>{p.name}</Text>
                <Text style={{ color: on ? colors.primary : colors.muted, fontWeight: '800' }}>{on ? '✓' : '+'}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={`Build my ${dayCount}-day plan ✨`}
          disabled={chosen.length === 0 || !city}
          onPress={() => {
            const id = createTrip(name.trim() || `${city} getaway`, city!, chosen.map((p) => p.id), dayCount);
            router.dismiss();
            router.push(`/trip/${id}`);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { fontSize: 22, fontWeight: '700', color: colors.text },
  days: { fontSize: 22, fontWeight: '800', color: colors.text, minWidth: 90, textAlign: 'center' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    height: 50,
    fontSize: 16,
    color: colors.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  footer: { padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
