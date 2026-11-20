import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { Place } from '@/domain/models';
import { PLATFORM_LABEL } from '@/features/capture/links';
import { makeStyles } from '@/shared/theme';
import { Icon, IconBadge, Text } from '@/shared/ui';
import { CATEGORY_META } from '../categories';

export interface PlaceRowProps {
  place: Place;
  onPress?: (place: Place) => void;
  subtitle?: string;
  /** Show a stop number instead of the category icon (itineraries). */
  index?: number;
  /** Colour of the stop number (the day's route colour). Defaults to the category colour. */
  indexColor?: string;
  selected?: boolean;
}

/** A saved spot in a list. Transparent, so it sits inside whatever card or group holds it. */
export const PlaceRow = memo(function PlaceRow({
  place,
  onPress,
  subtitle,
  index,
  indexColor,
  selected,
}: PlaceRowProps) {
  const styles = useStyles();
  const meta = CATEGORY_META[place.category];
  return (
    <Pressable
      onPress={() => onPress?.(place)}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${meta.label}${place.likedAt ? ', liked' : ''}${place.visitedAt ? ', visited' : ''}`}
      style={({ pressed }) => [styles.row, (pressed || selected) && styles.rowActive]}
    >
      {index !== undefined ? (
        <View style={[styles.index, { backgroundColor: indexColor ?? meta.color }]}>
          <Text style={styles.indexLabel}>{index}</Text>
        </View>
      ) : (
        <IconBadge icon={meta.icon} color={meta.color} size={42} />
      )}
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {subtitle ??
            [meta.label, place.city, PLATFORM_LABEL[place.sourcePlatform]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {place.likedAt ? <Icon name="heart" size={16} color="danger" /> : null}
      {place.visitedAt ? (
        <View style={styles.visited} accessibilityLabel="Visited">
          <Icon name="checkmark" size={14} color="#FFFFFF" />
        </View>
      ) : (
        <Icon name="chevron-forward" size={18} color="textSubtle" />
      )}
    </Pressable>
  );
});

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 68,
  },
  rowActive: { backgroundColor: t.colors.surfacePressed },
  index: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  indexLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  body: { flex: 1, gap: 2 },
  visited: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
