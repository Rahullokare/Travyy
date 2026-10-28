import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_META } from '../lib/categories';
import { PLATFORM_LABEL } from '../lib/links';
import { colors, radius, space } from '../lib/theme';
import type { Place } from '../lib/types';

export function PlaceRow({
  place,
  onPress,
  subtitle,
  index,
}: {
  place: Place;
  onPress?: () => void;
  subtitle?: string;
  index?: number;
}) {
  const meta = CATEGORY_META[place.category];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${meta.label}${place.visitedAt ? ', visited' : ''}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#F4EFE7' }]}
    >
      <View style={[styles.badge, { backgroundColor: `${meta.color}1F` }]}>
        {index !== undefined ? (
          <Text style={[styles.index, { color: meta.color }]}>{index}</Text>
        ) : (
          <Text style={styles.emoji}>{meta.emoji}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle ?? [meta.label, place.city, PLATFORM_LABEL[place.sourcePlatform]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {place.visitedAt ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  badge: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  index: { fontSize: 18, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
