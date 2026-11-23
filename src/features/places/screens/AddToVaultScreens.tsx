import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '@/domain/models';
import { haptics } from '@/shared/lib/platform';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, EmptyState, Icon, IconBadge, ScreenScroll, Text } from '@/shared/ui';
import { areaOf, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { SearchField } from '../components/SearchField';
import { Monogram } from '../components/VaultCard';
import { plural, searchSaves } from '../vault';
import { DEFAULT_VAULT_EMOJI, placesInVault } from '../vaults';

/** A row you tick: a check on the left, what it is, and a line of detail. */
function CheckRow({
  checked,
  onPress,
  leading,
  title,
  subtitle,
  first,
}: {
  checked: boolean;
  onPress: () => void;
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
  first?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      {leading}
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={checked ? 'primary' : 'textSubtle'}
      />
    </Pressable>
  );
}

/**
 * "Add to vault" from a place: every vault with a tick, applied as you tap, so there's no Save
 * button to forget. A new vault made from here starts with this place in it.
 */
export function VaultPickerScreen({ placeId }: { placeId: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const vaults = useAppStore((s) => s.vaults);
  const places = useAppStore((s) => s.places);
  const addToVault = useAppStore((s) => s.addToVault);
  const removeFromVault = useAppStore((s) => s.removeFromVault);
  const place = places.find((p) => p.id === placeId);

  if (!place) {
    return <EmptyState icon="trash-outline" title="Spot not found" body="It may have been deleted." />;
  }

  return (
    <ScreenScroll>
      <Stack.Screen options={{ title: 'Add to vault' }} />
      <Text variant="callout" color="textMuted">
        {place.name}
      </Text>
      <View style={[styles.group, lift(dark)]}>
        <Pressable
          onPress={() => router.push({ pathname: '/vaults/new', params: { place: place.id } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <IconBadge icon="add" color="#2F6FE0" size={42} />
          <Text variant="bodyStrong" color="primaryText" style={styles.flex}>
            New vault
          </Text>
        </Pressable>
        {vaults.map((v) => {
          const checked = v.placeIds.includes(place.id);
          const count = placesInVault(v, places).length;
          return (
            <CheckRow
              key={v.id}
              checked={checked}
              onPress={() => (checked ? removeFromVault(v.id, [place.id]) : addToVault(v.id, [place.id]))}
              leading={<Monogram name={v.name} flag={v.emoji ?? DEFAULT_VAULT_EMOJI} size={42} />}
              title={v.name}
              subtitle={plural(count, 'spot')}
            />
          );
        })}
      </View>
      {vaults.length === 0 ? (
        <Text variant="caption" align="center">
          Vaults group spots however you like: a weekend away, cafés to try, date nights.
        </Text>
      ) : null}
    </ScreenScroll>
  );
}

/** Fill a vault from what's already saved: search, tick, done. */
export function AddSpotsScreen({ vaultId }: { vaultId: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const vault = useAppStore((s) => s.vaults.find((v) => v.id === vaultId));
  const places = useAppStore((s) => s.places);
  const addToVault = useAppStore((s) => s.addToVault);
  const removeFromVault = useAppStore((s) => s.removeFromVault);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(vault?.placeIds));

  const shown = useMemo(() => {
    const matches = searchSaves(places, query, (c) => CATEGORY_META[c].label);
    // Unfiltered, newest saves first: usually what you just saved from a reel.
    return query.trim() ? matches : [...matches].sort((a, b) => b.savedAt - a.savedAt);
  }, [places, query]);

  if (!vault) {
    return <EmptyState icon="trash-outline" title="Vault not found" body="It may have been deleted." />;
  }

  const before = new Set(vault.placeIds);
  const added = [...chosen].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !chosen.has(id));
  const changes = added.length + removed.length;

  const toggle = (p: Place) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });

  const done = () => {
    if (added.length) addToVault(vault.id, added);
    if (removed.length) removeFromVault(vault.id, removed);
    if (changes) haptics.success();
    router.back();
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: `Add to ${vault.name}` }} />
      <View style={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={`Search ${plural(places.length, 'spot')}`}
        />
      </View>
      <FlashList
        data={shown}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          places.length ? (
            <EmptyState icon="search" title="No matches" body="Try a different search." />
          ) : (
            <EmptyState
              icon="bookmark"
              title="Nothing saved yet"
              body="Save a spot first, then add it here."
            />
          )
        }
        renderItem={({ item, index }) => {
          const meta = CATEGORY_META[item.category];
          return (
            <View style={styles.column}>
              <View
                style={[
                  styles.listRow,
                  index === 0 && styles.listTop,
                  index === shown.length - 1 && styles.listBottom,
                ]}
              >
                <CheckRow
                  first={index === 0}
                  checked={chosen.has(item.id)}
                  onPress={() => toggle(item)}
                  leading={<IconBadge icon={meta.icon} color={meta.color} size={42} />}
                  title={item.name}
                  subtitle={`${meta.label} · ${areaOf(item)}`}
                />
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.footerInner}>
          <Button
            title={
              !changes
                ? 'Done'
                : added.length && !removed.length
                  ? `Add ${plural(added.length, 'spot')}`
                  : `Save ${plural(changes, 'change')}`
            }
            iconName={changes ? 'checkmark' : undefined}
            onPress={done}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  group: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 68,
  },
  divider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  pressed: { backgroundColor: t.colors.surfacePressed },
  search: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  listContent: { paddingBottom: spacing.xl },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.gutter,
  },
  listRow: {
    backgroundColor: t.colors.surface,
    overflow: 'hidden',
    borderLeftWidth: t.dark ? 1 : 0,
    borderRightWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  listTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: t.dark ? 1 : 0,
  },
  listBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: t.dark ? 1 : 0,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
  },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
}));
