import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactElement } from 'react';
import { View } from 'react-native';
import type { Place } from '@/domain/models';
import { CONTENT_MAX_WIDTH, makeStyles, radius, spacing } from '@/shared/theme';
import { EmptyState, Text } from '@/shared/ui';
import { PlaceRow } from './PlaceRow';

export interface SpotSection {
  key: string;
  title: string;
  subtitle?: string;
  places: Place[];
}

/** Where a row sits in its group, so the group reads as one rounded card. */
type Position = 'first' | 'middle' | 'last' | 'only';
type Row =
  | { type: 'header'; key: string; title: string; subtitle?: string }
  | { type: 'place'; key: string; place: Place; position: Position };

/**
 * Spots in titled groups, each group one rounded card. Virtualised, so a city with hundreds of
 * saves scrolls like one with ten. FlashList has no sections: they're flattened into typed rows.
 */
export function SpotList({
  sections,
  header,
  subtitleFor,
  emptyTitle = 'No matches',
  emptyBody = 'Try a different search or filter.',
}: {
  sections: SpotSection[];
  header?: ReactElement;
  /** Second line of a row. Defaults to category · city · source. */
  subtitleFor?: (place: Place) => string | undefined;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const styles = useStyles();
  const rows = useMemo<Row[]>(
    () =>
      sections
        .filter((s) => s.places.length > 0)
        .flatMap((s): Row[] => [
          { type: 'header', key: `h-${s.key}`, title: s.title, subtitle: s.subtitle },
          ...s.places.map((place, i): Row => ({
            type: 'place',
            key: `${s.key}-${place.id}`,
            place,
            position:
              s.places.length === 1
                ? 'only'
                : i === 0
                  ? 'first'
                  : i === s.places.length - 1
                    ? 'last'
                    : 'middle',
          })),
        ]),
    [sections],
  );
  const openPlace = useCallback((p: Place) => router.push(`/place/${p.id}`), []);

  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.type}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState icon="search" title={emptyTitle} body={emptyBody} />}
      contentContainerStyle={styles.content}
      renderItem={({ item }) =>
        item.type === 'header' ? (
          <View style={[styles.column, styles.sectionHeader]}>
            <Text variant="heading" numberOfLines={1} style={styles.flex}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text variant="caption" style={styles.tabular}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.column}>
            <View
              style={[
                styles.group,
                (item.position === 'first' || item.position === 'only') && styles.groupTop,
                (item.position === 'last' || item.position === 'only') && styles.groupBottom,
              ]}
            >
              {item.position === 'middle' || item.position === 'last' ? (
                <View style={styles.separator} />
              ) : null}
              <PlaceRow place={item.place} onPress={openPlace} subtitle={subtitleFor?.(item.place)} />
            </View>
          </View>
        )
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  content: { paddingBottom: spacing.xxxl },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.gutter + 4,
  },
  group: {
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
    borderLeftWidth: t.dark ? 1 : 0,
    borderRightWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  groupTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: t.dark ? 1 : 0,
  },
  groupBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: t.dark ? 1 : 0,
  },
  separator: { height: 1, marginLeft: 72, backgroundColor: t.colors.border },
}));
