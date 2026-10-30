import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { Place } from '@/domain/models';
import { PLATFORM_LABEL } from '@/features/capture/links';
import { makeStyles } from '@/shared/theme';
import { Icon, Text } from '@/shared/ui';
import { CATEGORY_META } from '../categories';

export interface PlaceRowProps {
  place: Place;
  onPress?: (place: Place) => void;
  subtitle?: string;
  /** Show a stop number instead of the category emoji (itineraries). */
  index?: number;
  selected?: boolean;
}

export const PlaceRow = memo(function PlaceRow({ place, onPress, subtitle, index, selected }: PlaceRowProps) {
  const styles = useStyles();
  const meta = CATEGORY_META[place.category];
  return (
    <Pressable
      onPress={() => onPress?.(place)}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${meta.label}${place.visitedAt ? ', visited' : ''}`}
      style={({ pressed }) => [styles.row, (pressed || selected) && styles.rowActive]}
    >
      <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
        {index !== undefined ? (
          <Text style={[styles.index, { color: meta.color }]}>{index}</Text>
        ) : (
          <Text style={styles.emoji}>{meta.emoji}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {subtitle ??
            [meta.label, place.city, PLATFORM_LABEL[place.sourcePlatform]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {place.visitedAt ? (
        <Icon name="checkmark-circle" color="success" />
      ) : (
        <Icon name="chevron-forward" size={18} color="textMuted" />
      )}
    </Pressable>
  );
});

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowActive: { backgroundColor: t.colors.surfacePressed },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 28 },
  index: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  body: { flex: 1, gap: 2 },
}));
