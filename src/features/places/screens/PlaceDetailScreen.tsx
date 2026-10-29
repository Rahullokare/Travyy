import * as WebBrowser from 'expo-web-browser';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PLATFORM_LABEL } from '@/features/capture/links';
import { track } from '@/shared/lib/analytics';
import { confirm, openInMaps } from '@/shared/lib/platform';
import { Map } from '@/shared/map';
import { makeStyles, useTheme } from '@/shared/theme';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ScreenScroll,
  Section,
  Text,
  TextField,
} from '@/shared/ui';
import { useAppStore } from '@/store';
import { CATEGORIES, CATEGORY_META } from '../categories';
import { placeToMarker } from '../markers';

export function PlaceDetailScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const place = useAppStore((s) => s.places.find((p) => p.id === id));
  const updatePlace = useAppStore((s) => s.updatePlace);
  const toggleVisited = useAppStore((s) => s.toggleVisited);
  const removePlace = useAppStore((s) => s.removePlace);
  const [note, setNote] = useState(place?.note ?? '');
  const markers = useMemo(() => (place ? [placeToMarker(place)] : []), [place]);

  if (!place) {
    return <EmptyState emoji="🗑️" title="Spot not found" body="It may have been deleted." />;
  }
  const meta = CATEGORY_META[place.category];

  const onDelete = async () => {
    if (
      await confirm({
        title: 'Delete this spot?',
        message: place.name,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      router.back();
      removePlace(place.id);
    }
  };

  return (
    <ScreenScroll contentStyle={styles.content}>
      <Stack.Screen
        options={{
          title: place.name,
          headerRight: () => (
            <IconButton
              icon="trash-outline"
              color="textMuted"
              accessibilityLabel="Delete spot"
              onPress={onDelete}
            />
          ),
        }}
      />
      <View style={styles.mapWrap}>
        <Map markers={markers} interactive={false} />
      </View>

      <View style={styles.titleBlock}>
        <Text variant="title">{place.name}</Text>
        <Text variant="caption">
          {meta.emoji} {meta.label}
          {place.city ? ` · ${place.city}` : ''}
          {place.country ? `, ${place.country}` : ''}
        </Text>
        {place.address ? <Text variant="caption">{place.address}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button
          title="Directions"
          style={styles.flex}
          icon={<Icon name="navigate" size={18} color="onPrimary" />}
          onPress={() => openInMaps(place)}
        />
        <Button
          title={place.visitedAt ? 'Visited' : 'Mark visited'}
          variant="secondary"
          style={[styles.flex, place.visitedAt ? { borderColor: colors.success } : undefined]}
          icon={
            <Icon
              name={place.visitedAt ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={18}
              color="success"
            />
          }
          onPress={() => {
            if (!place.visitedAt) track('place_visited', { category: place.category });
            toggleVisited(place.id);
          }}
        />
      </View>

      <Card>
        <TextField
          label="Your note"
          value={note}
          onChangeText={setNote}
          onBlur={() => updatePlace(place.id, { note: note.trim() || undefined })}
          placeholder="What did the reel say to order? Best time to go?"
          multiline
          style={styles.note}
        />
      </Card>

      <Section title="Category">
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
              selected={place.category === c}
              color={CATEGORY_META[c].color}
              onPress={() => updatePlace(place.id, { category: c })}
            />
          ))}
        </View>
      </Section>

      {place.sourceUrl ? (
        <Pressable
          style={styles.source}
          accessibilityRole="link"
          onPress={() => WebBrowser.openBrowserAsync(place.sourceUrl!)}
        >
          <Icon name="play-circle" size={28} color="primary" />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Watch the original</Text>
            <Text variant="caption" numberOfLines={1}>
              {PLATFORM_LABEL[place.sourcePlatform]} · saved {new Date(place.savedAt).toLocaleDateString()}
            </Text>
          </View>
          <Icon name="open-outline" size={18} color="textMuted" />
        </Pressable>
      ) : null}
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingBottom: 48 },
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  titleBlock: { gap: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  note: {
    minHeight: 70,
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
}));
