import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../../components/ui';
import { CATEGORY_META } from '../../lib/categories';
import { FREE_SAVE_LIMIT, groupByCity, useStore } from '../../lib/store';
import { colors, space, type } from '../../lib/theme';

export default function ProfileScreen() {
  const places = useStore((s) => s.places);
  const trips = useStore((s) => s.trips);
  const isPro = useStore((s) => s.isPro);
  const resetAll = useStore((s) => s.resetAll);

  const visited = places.filter((p) => p.visitedAt);
  const cities = groupByCity(places);
  const countries = new Set(places.map((p) => p.country).filter(Boolean));
  const rate = places.length ? Math.round((visited.length / places.length) * 100) : 0;
  const topCategory = Object.entries(
    places.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.category]: (acc[p.category] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof CATEGORY_META | undefined;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
      <Card style={{ backgroundColor: colors.ink, borderColor: colors.ink }}>
        <Text style={[type.label, { color: '#B9B1A5' }]}>Saves you actually went to</Text>
        <Text style={styles.big}>{rate}%</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${rate}%` }]} />
        </View>
        <Text style={{ color: '#D6D0C6', marginTop: space.sm }}>
          {visited.length} of {places.length} saved spots visited. Most people never visit 90% of what they save — let’s beat that.
        </Text>
      </Card>

      <View style={styles.grid}>
        <Stat n={places.length} label="Saved" />
        <Stat n={cities.length} label="Cities" />
        <Stat n={countries.size} label="Countries" />
        <Stat n={trips.length} label="Trips" />
      </View>

      {topCategory ? (
        <Card>
          <Text style={type.label}>Your travel personality</Text>
          <Text style={[type.h2, { marginTop: space.sm }]}>
            {CATEGORY_META[topCategory].emoji} {personality(topCategory)}
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <Text style={type.h2}>{isPro ? 'Travyy Pro ✨' : 'Free plan'}</Text>
        <Text style={type.small}>
          {isPro
            ? 'Unlimited saves, unlimited trips and AI extraction. Thanks for supporting an indie app.'
            : `${Math.min(places.length, FREE_SAVE_LIMIT)} / ${FREE_SAVE_LIMIT} saves used · 1 trip included`}
        </Text>
        {!isPro ? <Button title="Go Pro" onPress={() => router.push('/paywall')} /> : null}
      </Card>

      <Button
        title="Reset all data"
        variant="ghost"
        onPress={() =>
          Alert.alert('Reset everything?', 'This deletes all saves and trips on this device.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: resetAll },
          ])
        }
      />
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={type.small}>{label}</Text>
    </Card>
  );
}

function personality(c: keyof typeof CATEGORY_META): string {
  switch (c) {
    case 'food':
      return 'The Food Pilgrim';
    case 'cafe':
      return 'The Café Hopper';
    case 'nightlife':
      return 'The Night Owl';
    case 'sight':
      return 'The Culture Collector';
    case 'nature':
      return 'The Trail Chaser';
    case 'shopping':
      return 'The Treasure Hunter';
    case 'stay':
      return 'The Stay Curator';
    case 'activity':
      return 'The Experience Seeker';
    default:
      return 'The Explorer';
  }
}

const styles = StyleSheet.create({
  big: { fontSize: 56, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#3A342C', overflow: 'hidden', marginTop: space.sm },
  barFill: { height: 8, backgroundColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: '40%', alignItems: 'flex-start' },
  statN: { fontSize: 28, fontWeight: '900', color: colors.text },
});
