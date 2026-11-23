import { router } from 'expo-router';
import { View } from 'react-native';
import type { LatLng, Place } from '@/domain/models';
import { distanceMeters, formatDistance } from '@/shared/lib/geo';
import { haptics, openInMaps } from '@/shared/lib/platform';
import { makeStyles, radius, shadow, useTheme } from '@/shared/theme';
import { Icon, IconBadge, PressableScale, Text, type IconName } from '@/shared/ui';
import { useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { PlacePhotoView } from './PlacePhotoView';

/**
 * The card for a pin you tapped: what it is, how far, and glide's three quick marks (❤, been
 * there, directions) so you can act without leaving the map. Its top row opens the place.
 */
export function PlaceMapCard({ place, location }: { place: Place; location?: LatLng }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const toggleLiked = useAppStore((s) => s.toggleLiked);
  const toggleVisited = useAppStore((s) => s.toggleVisited);
  const meta = CATEGORY_META[place.category];
  // A View, not one big button: the quick actions are buttons of their own, and buttons can't nest.
  return (
    <View style={[styles.card, shadow('lg', dark)]}>
      <PressableScale
        scale={0.98}
        style={styles.top}
        accessibilityRole="button"
        accessibilityLabel={`Open ${place.name}`}
        onPress={() => router.push(`/place/${place.id}`)}
      >
        <View style={styles.thumb}>
          <IconBadge icon={meta.icon} color={meta.color} size={48} />
          <PlacePhotoView place={place} />
        </View>
        <View style={styles.flex}>
          <Text variant="heading" numberOfLines={1}>
            {place.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {[meta.label, place.city, location && formatDistance(distanceMeters(location, place))]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color="textSubtle" />
      </PressableScale>
      {place.note ? (
        <Text variant="caption" color="text" numberOfLines={2} style={styles.note}>
          “{place.note}”
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Action
          icon={place.likedAt ? 'heart' : 'heart-outline'}
          tint="#E0245E"
          active={!!place.likedAt}
          label={place.likedAt ? 'Liked' : 'Like'}
          onPress={() => {
            haptics.selection();
            toggleLiked(place.id);
          }}
        />
        <Action
          icon={place.visitedAt ? 'checkmark-circle' : 'checkmark-circle-outline'}
          tint="#22945F"
          active={!!place.visitedAt}
          label={place.visitedAt ? 'Been' : 'Been there'}
          onPress={() => {
            if (!place.visitedAt) haptics.success();
            toggleVisited(place.id);
          }}
        />
        <Action icon="navigate" tint="#2F6FE0" label="Go" onPress={() => openInMaps(place)} />
      </View>
    </View>
  );
}

function Action({
  icon,
  tint,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  tint: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      scale={0.94}
      hitSlop={4}
      style={[styles.action, active && { backgroundColor: `${tint}22` }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
    >
      <Icon name={icon} size={18} color={tint} />
      <Text variant="caption" color="text" style={styles.actionLabel}>
        {label}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 10,
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    padding: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 15, overflow: 'hidden' },
  note: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: t.colors.surfaceSunken,
  },
  actionLabel: { fontWeight: '600' },
}));
