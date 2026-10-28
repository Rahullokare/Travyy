import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { PlaceRow } from '../../components/PlaceRow';
import { Button, Chip } from '../../components/ui';
import { CATEGORY_META } from '../../lib/categories';
import { formatDistance, regionFor, totalRouteMeters, walkingMinutes } from '../../lib/geo';
import { openDirections } from '../../lib/openInMaps';
import { planTrip } from '../../lib/planner';
import { useStore } from '../../lib/store';
import { colors, space, type } from '../../lib/theme';
import type { Place } from '../../lib/types';

const DAY_COLORS = ['#FF5A36', '#2F7DF6', '#1FA971', '#8B5CF6', '#E0A100', '#E2508C', '#0EA5A5'];

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useStore((s) => s.trips.find((t) => t.id === id));
  const allPlaces = useStore((s) => s.places);
  const updateTrip = useStore((s) => s.updateTrip);
  const removeTrip = useStore((s) => s.removeTrip);
  const [day, setDay] = useState(0);

  const byId = useMemo(() => new Map(allPlaces.map((p) => [p.id, p])), [allPlaces]);
  if (!trip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={type.body}>This trip was deleted.</Text>
      </View>
    );
  }

  const dayIdx = Math.min(day, trip.days.length - 1);
  const stops = (trip.days[dayIdx]?.placeIds ?? []).map((pid) => byId.get(pid)).filter(Boolean) as Place[];
  const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
  const meters = totalRouteMeters(stops);

  const replan = () => {
    const ids = trip.days.flatMap((d) => d.placeIds);
    const ps = ids.map((pid) => byId.get(pid)).filter(Boolean) as Place[];
    updateTrip(trip.id, { days: planTrip(ps, trip.days.length) });
  };

  const share = () => {
    const text = [
      `${trip.name} — ${trip.days.length} days in ${trip.city}`,
      ...trip.days.map(
        (d) =>
          `\nDay ${d.day}\n` +
          d.placeIds
            .map((pid) => byId.get(pid))
            .filter(Boolean)
            .map((p, i) => `${i + 1}. ${p!.name} — https://maps.google.com/?q=${p!.lat},${p!.lng}`)
            .join('\n'),
      ),
      '\nPlanned with Travyy',
    ].join('\n');
    Share.share({ message: text });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: trip.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              <Pressable onPress={share} accessibilityLabel="Share trip">
                <Ionicons name="share-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Delete trip"
                onPress={() =>
                  Alert.alert('Delete trip?', 'Your saved spots stay saved.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        router.back();
                        removeTrip(trip.id);
                      },
                    },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={22} color={colors.muted} />
              </Pressable>
            </View>
          ),
        }}
      />
      <MapView
        key={dayIdx}
        style={{ height: 260 }}
        initialRegion={regionFor(stops, { latitude: 0, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 })}
      >
        {stops.map((p, i) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} tracksViewChanges={false}>
            <View style={[styles.num, { backgroundColor: color }]}>
              <Text style={styles.numTxt}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
        {stops.length > 1 ? (
          <Polyline
            coordinates={stops.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={color}
            strokeWidth={3}
            lineDashPattern={[6, 6]}
          />
        ) : null}
      </MapView>

      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
          {trip.days.map((d, i) => (
            <Chip key={d.day} label={`Day ${d.day}`} active={i === dayIdx} color={DAY_COLORS[i % DAY_COLORS.length]} onPress={() => setDay(i)} />
          ))}
        </ScrollView>

        <View style={styles.summary}>
          <Text style={type.h2}>
            Day {dayIdx + 1} · {stops.length} stops
          </Text>
          <Text style={type.small}>
            {stops.length > 1 ? `${formatDistance(meters)} · ~${walkingMinutes(meters)} min walking between stops` : 'One easy stop'}
          </Text>
          <Text style={type.small}>{summarise(stops)}</Text>
        </View>

        {stops.map((p, i) => (
          <PlaceRow key={p.id} place={p} index={i + 1} onPress={() => router.push(`/place/${p.id}`)} />
        ))}

        <View style={{ padding: space.lg, gap: space.sm }}>
          <Button
            title="Start day in Google Maps"
            disabled={stops.length === 0}
            icon={<Ionicons name="walk" size={18} color="#fff" />}
            onPress={() => openDirections(stops)}
          />
          <Button title="Re-shuffle days" variant="secondary" onPress={replan} />
        </View>
      </ScrollView>
    </View>
  );
}

function summarise(stops: Place[]): string {
  const counts = new Map<string, number>();
  for (const s of stops) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([c, n]) => `${CATEGORY_META[c as Place['category']].emoji} ${n}`)
    .join('   ');
}

const styles = StyleSheet.create({
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  numTxt: { color: '#fff', fontWeight: '800' },
  days: { padding: space.lg, gap: space.sm },
  summary: { paddingHorizontal: space.lg, gap: 4, paddingBottom: space.sm },
});
