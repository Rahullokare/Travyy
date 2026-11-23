import { memo } from 'react';
import { View } from 'react-native';
import { flagOf } from '@/domain/countries';
import type { Place } from '@/domain/models';
import { makeStyles, radius, useTheme } from '@/shared/theme';
import { Icon, PressableScale, Text } from '@/shared/ui';
import { areaOf } from '@/store';
import { CATEGORY_META } from '../categories';
import { usePlacePhoto } from '../photos';
import { countryCodeFor } from '../vault';
import { PlacePhotoView } from './PlacePhotoView';

/**
 * A save as a card in the Saves grid, glide's photo card: the place's photo when one is found
 * (photos.ts), else an illustration in the category's colour. The ❤ and ✓ marks sit on the cover
 * so they read at a glance.
 */
export const SpotCard = memo(function SpotCard({
  place,
  onPress,
}: {
  place: Place;
  onPress: (place: Place) => void;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  const meta = CATEGORY_META[place.category];
  const flag = flagOf(countryCodeFor(place));
  const photo = usePlacePhoto(place);
  return (
    <PressableScale
      scale={0.97}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${meta.label}, ${areaOf(place)}${place.likedAt ? ', liked' : ''}${
        place.visitedAt ? ', visited' : ''
      }`}
      onPress={() => onPress(place)}
    >
      <View style={[styles.cover, { backgroundColor: `${meta.color}${dark ? '38' : '24'}` }]}>
        {/* Two soft rings give the flat colour some depth, like light on a photo. */}
        <View
          style={[styles.ring, styles.ringLarge, { borderColor: `${meta.color}${dark ? '30' : '22'}` }]}
        />
        <View
          style={[styles.ring, styles.ringSmall, { borderColor: `${meta.color}${dark ? '40' : '2E'}` }]}
        />
        <View style={[styles.iconTile, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={26} color="#FFFFFF" />
        </View>
        {/* The real photo, when there is one, covers the illustration once it has loaded. */}
        <PlacePhotoView place={place} />
        {photo ? <View style={styles.photoShade} /> : null}
        <View style={styles.marks}>
          {place.likedAt ? (
            <View style={styles.mark}>
              <Icon name="heart" size={13} color="#E0245E" />
            </View>
          ) : null}
          {place.visitedAt ? (
            <View style={styles.mark}>
              <Icon name="checkmark" size={14} color="#22945F" />
            </View>
          ) : null}
        </View>
        <View style={styles.categoryPill}>
          <Icon name={meta.icon} size={11} color={meta.color} />
          <Text style={styles.categoryText}>{meta.label}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
          {place.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {flag ? `${flag} ` : ''}
          {areaOf(place)}
        </Text>
      </View>
    </PressableScale>
  );
});

const useStyles = makeStyles((t) => ({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  cover: { height: 132, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 18, borderRadius: 999 },
  ringLarge: { width: 220, height: 220, top: -40, left: -70 },
  ringSmall: { width: 120, height: 120, bottom: -50, right: -30 },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    boxShadow: '0px 6px 16px rgba(0,0,0,0.18)',
  },
  marks: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 4 },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Keeps the white marks and the label readable on a bright photo.
  photoShade: { ...absolute, backgroundColor: 'rgba(0,0,0,0.12)' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: t.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.85)',
  },
  categoryText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: t.colors.text },
  body: { padding: 12, paddingTop: 10, gap: 2, minHeight: 74 },
  name: { lineHeight: 20 },
}));

const absolute = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
