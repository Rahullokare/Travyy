import * as WebBrowser from 'expo-web-browser';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BookingOffers, PARTNER_IDS } from '@/features/booking/components/BookingOffers';
import { placeOffers } from '@/features/booking/offers';
import { PLATFORM_LABEL } from '@/features/capture/links';
import { track } from '@/shared/lib/analytics';
import { confirm, haptics, openInMaps } from '@/shared/lib/platform';
import { Map } from '@/shared/map';
import { lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconBadge,
  IconButton,
  Pill,
  PressableScale,
  ScreenScroll,
  Section,
  Text,
  TextField,
} from '@/shared/ui';
import { useAppStore } from '@/store';
import { CATEGORIES, CATEGORY_META } from '../categories';
import { placeToMarker } from '../markers';
import { DEFAULT_VAULT_EMOJI, vaultsWith } from '../vaults';

export function PlaceDetailScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  const place = useAppStore((s) => s.places.find((p) => p.id === id));
  const updatePlace = useAppStore((s) => s.updatePlace);
  const toggleVisited = useAppStore((s) => s.toggleVisited);
  const toggleLiked = useAppStore((s) => s.toggleLiked);
  const vaults = useAppStore((s) => s.vaults);
  const inVaults = useMemo(() => vaultsWith(vaults, id), [vaults, id]);
  const removePlace = useAppStore((s) => s.removePlace);
  const [note, setNote] = useState(place?.note ?? '');
  const markers = useMemo(() => (place ? [placeToMarker(place)] : []), [place]);

  if (!place) {
    return <EmptyState icon="trash-outline" title="Spot not found" body="It may have been deleted." />;
  }
  const meta = CATEGORY_META[place.category];
  const where = [place.city, place.country].filter(Boolean).join(', ');

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
          title: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon={place.likedAt ? 'heart' : 'heart-outline'}
                variant="tinted"
                size={18}
                color={place.likedAt ? 'danger' : 'text'}
                accessibilityLabel={place.likedAt ? 'Unlike' : 'Like'}
                onPress={() => {
                  if (!place.likedAt) {
                    track('place_liked', { category: place.category });
                    haptics.success();
                  } else haptics.selection();
                  toggleLiked(place.id);
                }}
              />
              <IconButton
                icon="trash-outline"
                variant="tinted"
                size={18}
                color="danger"
                accessibilityLabel="Delete spot"
                onPress={onDelete}
              />
            </View>
          ),
        }}
      />
      <View style={[styles.mapWrap, lift(dark)]}>
        <Map markers={markers} interactive={false} />
      </View>

      <View style={styles.titleBlock}>
        <View style={styles.badges}>
          <Pill label={meta.label} icon={meta.icon} tone="neutral" />
          {place.visitedAt ? <Pill label="Visited" icon="checkmark" tone="success" /> : null}
          {place.likedAt ? <Pill label="Liked" icon="heart" tone="danger" /> : null}
        </View>
        <Text variant="title">{place.name}</Text>
        {where ? (
          <Text variant="callout" color="textMuted">
            {where}
          </Text>
        ) : null}
        {place.address ? (
          <Text variant="caption" color="textSubtle" numberOfLines={2}>
            {place.address}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          title="Directions"
          iconName="navigate"
          style={styles.flex}
          onPress={() => openInMaps(place)}
        />
        <Button
          title={place.visitedAt ? 'Visited' : 'Mark visited'}
          variant={place.visitedAt ? 'secondary' : 'tinted'}
          iconName={place.visitedAt ? 'checkmark-circle' : 'checkmark-circle-outline'}
          style={styles.flex}
          onPress={() => {
            if (!place.visitedAt) {
              track('place_visited', { category: place.category });
              haptics.success();
            }
            toggleVisited(place.id);
          }}
        />
      </View>

      <Section title="Vaults">
        <View style={styles.wrap}>
          {inVaults.map((v) => (
            <Chip
              key={v.id}
              label={`${v.emoji ?? DEFAULT_VAULT_EMOJI} ${v.name}`}
              accessibilityLabel={`Open vault ${v.name}`}
              onPress={() => router.push({ pathname: '/vaults/[id]', params: { id: v.id } })}
            />
          ))}
          <Chip
            label={inVaults.length ? 'Change' : 'Add to vault'}
            icon={inVaults.length ? 'create-outline' : 'add'}
            onPress={() => router.push({ pathname: '/vaults/pick', params: { place: place.id } })}
          />
        </View>
      </Section>

      <TextField
        label="Your note"
        value={note}
        onChangeText={setNote}
        onBlur={() => updatePlace(place.id, { note: note.trim() || undefined })}
        placeholder="What did the reel say to order? Best time to go?"
        multiline
      />

      <Section title="Category">
        <View style={styles.wrap}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_META[c].label}
              icon={CATEGORY_META[c].icon}
              selected={place.category === c}
              color={CATEGORY_META[c].color}
              onPress={() => {
                haptics.selection();
                updatePlace(place.id, { category: c });
              }}
            />
          ))}
        </View>
      </Section>

      <BookingOffers offers={placeOffers(place, PARTNER_IDS)} from="place" />

      {place.sourceUrl ? (
        <PressableScale
          scale={0.98}
          style={[styles.source, lift(dark)]}
          pressedStyle={styles.sourcePressed}
          accessibilityRole="link"
          onPress={() => WebBrowser.openBrowserAsync(place.sourceUrl!)}
        >
          <IconBadge icon="play" color={colors.primary} size={44} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">Watch the original</Text>
            <Text variant="caption" numberOfLines={1}>
              {PLATFORM_LABEL[place.sourcePlatform]} · saved {new Date(place.savedAt).toLocaleDateString()}
            </Text>
          </View>
          <Icon name="open-outline" size={18} color="textSubtle" />
        </PressableScale>
      ) : null}
    </ScreenScroll>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  mapWrap: {
    height: 200,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  titleBlock: { gap: 6 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  sourcePressed: { backgroundColor: t.colors.surfacePressed },
}));
