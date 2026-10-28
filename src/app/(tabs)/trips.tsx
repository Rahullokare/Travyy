import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState } from '../../components/ui';
import { FREE_TRIP_LIMIT, groupByCity, useStore } from '../../lib/store';
import { colors, radius, space, type } from '../../lib/theme';

export default function TripsScreen() {
  const trips = useStore((s) => s.trips);
  const places = useStore((s) => s.places);
  const isPro = useStore((s) => s.isPro);
  const cities = groupByCity(places).filter((c) => c.places.length >= 3);

  const startTrip = (city?: string) => {
    if (!isPro && trips.length >= FREE_TRIP_LIMIT) {
      router.push('/paywall');
      return;
    }
    router.push(city ? { pathname: '/trip/new', params: { city } } : '/trip/new');
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      data={trips}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        cities.length > 0 ? (
          <View style={{ gap: space.md, marginBottom: space.md }}>
            <Text style={type.label}>Ready to plan</Text>
            {cities.slice(0, 3).map((c) => (
              <Pressable key={c.city} style={styles.suggest} onPress={() => startTrip(c.city)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestTitle}>{c.city}</Text>
                  <Text style={styles.suggestSub}>
                    {c.places.length} saved spots · about {Math.max(1, Math.round(c.places.length / 5))} day
                    {Math.round(c.places.length / 5) > 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.suggestCta}>Auto-plan ✨</Text>
              </Pressable>
            ))}
            {trips.length > 0 ? <Text style={[type.label, { marginTop: space.md }]}>Your trips</Text> : null}
          </View>
        ) : undefined
      }
      renderItem={({ item }) => {
        const stops = item.days.reduce((n, d) => n + d.placeIds.length, 0);
        return (
          <Pressable style={styles.trip} onPress={() => router.push(`/trip/${item.id}`)}>
            <Text style={{ fontSize: 30 }}>🧳</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.tripTitle}>{item.name}</Text>
              <Text style={styles.suggestSub}>
                {item.city} · {item.days.length} day{item.days.length === 1 ? '' : 's'} · {stops} stops
              </Text>
            </View>
          </Pressable>
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
      ListFooterComponent={trips.length > 0 ? <Button title="Plan another trip" variant="secondary" onPress={() => startTrip()} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  suggestTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  suggestSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  suggestCta: { color: colors.primary, fontWeight: '800' },
  trip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
});
