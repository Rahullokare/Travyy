import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useEntitlements } from '@/features/paywall/entitlements';
import { syncNow } from '@/features/sync/useAccountSync';
import { Map } from '@/shared/map';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, EmptyState, Icon, IconButton, PressableScale, Screen, Segmented, Text } from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { Monogram } from '../components/VaultCard';
import { SpotList, type SpotSection } from '../components/SpotList';
import { placeToMarker } from '../markers';
import { plural } from '../vault';
import { LIKED_VAULT_ID, vaultSummary } from '../vaults';

/** Fewer spots than this in one city and a plan isn't worth making. */
const MIN_TO_PLAN = 3;

type View_ = 'list' | 'map';
const VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map' },
] as const;

/**
 * One vault: what's in it, how much of it you've done, and its own map. Opening a vault is
 * opening a plan, so the progress sits at the top and "Plan a trip" is one tap away.
 */
export function VaultScreen({ id }: { id: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const places = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const vault = useMemo(() => vaultSummary(id, vaults, places), [id, vaults, places]);
  const { canCreateTrip } = useEntitlements();
  const [view, setView] = useState<View_>('list');
  const share = useAppStore((s) => s.shared[id]);
  const isShared = !!share;

  // Opening a shared vault is when you most want to see what friends just added.
  useEffect(() => {
    if (isShared) void syncNow();
  }, [isShared]);

  const cities = useMemo(() => groupByCity(vault?.places ?? []), [vault]);
  const sections = useMemo<SpotSection[]>(
    () =>
      cities.map((c) => ({
        key: c.city,
        title: c.city,
        subtitle: `${c.visited}/${c.places.length} visited`,
        places: c.places,
      })),
    [cities],
  );
  const markers = useMemo(() => (vault?.places ?? []).map((p) => placeToMarker(p)), [vault]);

  if (!vault) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="trash-outline" title="Vault not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const isLiked = vault.id === LIKED_VAULT_ID;
  const total = vault.places.length;
  const done = total ? vault.visited / total : 0;
  const plannable = cities.find((c) => c.places.length >= MIN_TO_PLAN);

  const addSpots = () => router.push({ pathname: '/vaults/[id]/add', params: { id: vault.id } });
  const planTrip = () => {
    if (!plannable) return;
    if (!canCreateTrip) return router.push({ pathname: '/paywall', params: { reason: 'trip' } });
    router.push({ pathname: '/trip/new', params: { city: plannable.city, vault: vault.id } });
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: vault.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              {total > 0 ? (
                <IconButton
                  icon="share-outline"
                  variant="tinted"
                  size={18}
                  accessibilityLabel="Share vault"
                  onPress={() => router.push({ pathname: '/vaults/[id]/share', params: { id: vault.id } })}
                />
              ) : null}
              {vault.custom ? (
                <>
                  <IconButton
                    icon="add"
                    variant="tinted"
                    size={18}
                    color="primaryText"
                    accessibilityLabel="Add spots to this vault"
                    onPress={addSpots}
                  />
                  <IconButton
                    icon="create-outline"
                    variant="tinted"
                    size={18}
                    accessibilityLabel="Edit vault"
                    onPress={() => router.push({ pathname: '/vaults/[id]/edit', params: { id: vault.id } })}
                  />
                </>
              ) : null}
            </View>
          ),
        }}
      />
      <View style={styles.top}>
        <View style={[styles.summary, lift(dark)]}>
          <Monogram name={vault.name} flag={vault.emoji} size={56} />
          <View style={styles.flex}>
            <Text variant="headline" numberOfLines={1}>
              {vault.name}
            </Text>
            <Text variant="caption" numberOfLines={1} style={styles.tabular}>
              {[plural(total, 'spot'), vault.cities.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
            </Text>
            <View
              style={styles.progress}
              accessibilityRole="progressbar"
              accessibilityLabel={`${vault.visited} of ${total} visited`}
            >
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(done * 100)}%` }]} />
              </View>
              <Text variant="caption" color="textSubtle" style={styles.tabular}>
                {total && vault.visited === total ? 'All done 🎉' : `${vault.visited}/${total} visited`}
              </Text>
            </View>
          </View>
        </View>
        {share ? (
          <PressableScale
            scale={0.98}
            style={styles.sharedRow}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/vaults/[id]/share', params: { id: vault.id } })}
          >
            <Icon name="people" size={18} color="success" />
            <Text variant="callout" style={styles.flex} numberOfLines={1}>
              {share.role === 'member'
                ? `Shared with you · ${plural(share.people ?? 1, 'person', 'people')}`
                : (share.people ?? 1) > 1
                  ? `Shared · ${plural(share.people ?? 1, 'person', 'people')}`
                  : 'Shared · waiting for friends to join'}
            </Text>
            <Text variant="callout" color="primaryText" style={styles.invite}>
              Invite
            </Text>
          </PressableScale>
        ) : null}
        {total ? (
          <View style={styles.controls}>
            <View style={styles.flex}>
              <Segmented
                options={VIEWS}
                value={view}
                onChange={setView}
                accessibilityLabel="Show as list or map"
              />
            </View>
            {plannable ? (
              <Button title="Plan a trip" iconName="sparkles" size="md" variant="tinted" onPress={planTrip} />
            ) : null}
          </View>
        ) : null}
      </View>

      {total === 0 ? (
        <EmptyState
          icon={isLiked ? 'heart-outline' : 'albums-outline'}
          title={isLiked ? 'Nothing liked yet' : 'This vault is empty'}
          body={
            isLiked
              ? 'Tap the heart on any spot and it lands here.'
              : 'Add spots you’ve already saved, or pick this vault when you save from a reel.'
          }
          action={isLiked ? undefined : <Button title="Add spots" iconName="add" onPress={addSpots} />}
        />
      ) : view === 'map' ? (
        <View style={[styles.mapWrap, lift(dark)]}>
          <Map
            markers={markers}
            initialPoints={vault.places}
            onMarkerPress={(placeId) => router.push(`/place/${placeId}`)}
            edgePadding={{ top: 48, right: 40, bottom: 48, left: 40 }}
          />
        </View>
      ) : (
        <SpotList
          sections={sections}
          // The section header already names the city.
          subtitleFor={(p) => CATEGORY_META[p.category].label}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  top: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: t.colors.success },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: t.colors.successSoft,
  },
  invite: { fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapWrap: {
    flex: 1,
    marginHorizontal: spacing.gutter,
    marginTop: spacing.sm,
    marginBottom: spacing.gutter,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
  },
}));
