import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Button, Card, Chip } from '../../components/ui';
import { CATEGORIES, CATEGORY_META } from '../../lib/categories';
import { PLATFORM_LABEL } from '../../lib/links';
import { openInMaps } from '../../lib/openInMaps';
import { useStore } from '../../lib/store';
import { colors, radius, space, type } from '../../lib/theme';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = useStore((s) => s.places.find((p) => p.id === id));
  const updatePlace = useStore((s) => s.updatePlace);
  const toggleVisited = useStore((s) => s.toggleVisited);
  const removePlace = useStore((s) => s.removePlace);
  const [note, setNote] = useState(place?.note ?? '');

  if (!place) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={type.body}>This spot was deleted.</Text>
      </View>
    );
  }
  const meta = CATEGORY_META[place.category];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel="Delete spot"
              onPress={() =>
                Alert.alert('Delete this spot?', place.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      router.back();
                      removePlace(place.id);
                    },
                  },
                ])
              }
            >
              <Ionicons name="trash-outline" size={22} color={colors.muted} />
            </Pressable>
          ),
        }}
      />
      <MapView
        style={styles.map}
        initialRegion={{ latitude: place.lat, longitude: place.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <Marker coordinate={{ latitude: place.lat, longitude: place.lng }} pinColor={meta.color} />
      </MapView>

      <View style={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text style={type.title}>{place.name}</Text>
          <Text style={type.small}>
            {meta.emoji} {meta.label}
            {place.city ? ` · ${place.city}` : ''}
            {place.country ? `, ${place.country}` : ''}
          </Text>
          {place.address ? <Text style={[type.small, { marginTop: 4 }]}>{place.address}</Text> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            title="Directions"
            style={{ flex: 1 }}
            icon={<Ionicons name="navigate" size={18} color="#fff" />}
            onPress={() => openInMaps(place)}
          />
          <Button
            title={place.visitedAt ? 'Visited' : 'Mark visited'}
            variant="secondary"
            style={[{ flex: 1 }, place.visitedAt ? { borderColor: colors.success } : undefined]}
            icon={<Ionicons name={place.visitedAt ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={colors.success} />}
            onPress={() => toggleVisited(place.id)}
          />
        </View>

        <Card style={{ gap: space.sm }}>
          <Text style={type.label}>Your note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            onEndEditing={() => updatePlace(place.id, { note: note.trim() || undefined })}
            placeholder="What did the reel say to order? Best time to go?"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.note}
          />
        </Card>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>Category</Text>
          <View style={styles.wrap}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
                active={place.category === c}
                color={CATEGORY_META[c].color}
                onPress={() => updatePlace(place.id, { category: c })}
              />
            ))}
          </View>
        </View>

        {place.sourceUrl ? (
          <Pressable style={styles.source} onPress={() => WebBrowser.openBrowserAsync(place.sourceUrl!)}>
            <Ionicons name="play-circle" size={28} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Watch the original</Text>
              <Text style={type.small} numberOfLines={1}>
                {PLATFORM_LABEL[place.sourcePlatform]} · saved {new Date(place.savedAt).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  map: { height: 220 },
  note: { minHeight: 60, fontSize: 15, color: colors.text, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
