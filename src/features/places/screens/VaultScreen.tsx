import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Category } from '@/domain/models';
import { useEntitlements } from '@/features/paywall/entitlements';
import { syncNow } from '@/features/sync/useAccountSync';
import { useUserLocation } from '@/shared/lib/useUserLocation';
import type { MapHandle } from '@/shared/map';
import { makeStyles, radius, spacing } from '@/shared/theme';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  Text,
} from '@/shared/ui';
import { groupByCity, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { MapSheet } from '../components/MapSheet';
import { PlaceMapCard } from '../components/PlaceMapCard';
import { SheetSpotList, type SpotSection } from '../components/SpotList';
import { Monogram } from '../components/VaultCard';
import { placeToMarker } from '../markers';
import { categoryCounts, plural } from '../vault';
import { ALL_VAULT_ID, LIKED_VAULT_ID, vaultSummary } from '../vaults';

/** Fewer spots than this in one city and a plan isn't worth making. */
const MIN_TO_PLAN = 3;

/** Back to where you came from; after a web refresh there's nothing behind, so the Vaults tab. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/vaults');
}

/**
 * One vault, as glide opens it: its own map, with the spots in a sheet over it. Progress sits in
 * the sheet's header, so opening a vault is opening a plan; tap a pin for its card, drag the
 * sheet up for the list.
 */
export function VaultScreen({ id }: { id: string }) {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const vault = useMemo(() => vaultSummary(id, vaults, places), [id, vaults, places]);
  const { canCreateTrip } = useEntitlements();
  const share = useAppStore((s) => s.shared[id]);
  const isShared = !!share;
  const [category, setCategory] = useState<Category>();
  const [selectedId, setSelectedId] = useState<string>();
  const mapRef = useRef<MapHandle>(null);
  const { location, request } = useUserLocation();

  // Opening a shared vault is when you most want to see what friends just added.
  useEffect(() => {
    if (isShared) void syncNow();
  }, [isShared]);

  const all = useMemo(() => vault?.places ?? [], [vault]);
  const shown = useMemo(() => (category ? all.filter((p) => p.category === category) : all), [all, category]);
  const categories = useMemo(() => categoryCounts(all), [all]);
  const cities = useMemo(() => groupByCity(all), [all]);
  const sections = useMemo<SpotSection[]>(
    () =>
      groupByCity(shown).map((c) => ({
        key: c.city,
        title: c.city,
        subtitle: `${c.visited}/${c.places.length} visited`,
        places: c.places,
      })),
    [shown],
  );
  const markers = useMemo(() => shown.map((p) => placeToMarker(p, p.id === selectedId)), [shown, selectedId]);
  const selected = shown.find((p) => p.id === selectedId);

  if (!vault) {
    return (
      <Screen>
        <View style={styles.missingBar}>
          <IconButton icon="arrow-back" variant="tinted" accessibilityLabel="Back" onPress={goBack} />
        </View>
        <EmptyState icon="trash-outline" title="Vault not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const isLiked = vault.id === LIKED_VAULT_ID;
  const isAll = vault.id === ALL_VAULT_ID;
  const total = all.length;
  const done = total ? vault.visited / total : 0;
  const plannable = cities.find((c) => c.places.length >= MIN_TO_PLAN);

  const addSpots = () => router.push({ pathname: '/vaults/[id]/add', params: { id: vault.id } });
  const planTrip = () => {
    if (!plannable) return;
    if (!canCreateTrip) return router.push({ pathname: '/paywall', params: { reason: 'trip' } });
    router.push({
      pathname: '/trip/new',
      params: vault.custom ? { city: plannable.city, vault: vault.id } : { city: plannable.city },
    });
  };
  const filterTo = (next?: Category) => {
    setCategory(next);
    setSelectedId(undefined);
    const pts = next ? all.filter((p) => p.category === next) : all;
    if (pts.length) mapRef.current?.fitTo(pts);
  };
  const locate = async () => {
    const here = location ?? (await request());
    if (here) mapRef.current?.centerOn(here);
  };

  const topBar = (
    <>
      <IconButton icon="arrow-back" variant="floating" accessibilityLabel="Back" onPress={goBack} />
      <View style={styles.flex} />
      {total > 0 && !isAll ? (
        <IconButton
          icon="share-outline"
          variant="floating"
          accessibilityLabel="Share vault"
          onPress={() => router.push({ pathname: '/vaults/[id]/share', params: { id: vault.id } })}
        />
      ) : null}
      {vault.custom ? (
        <>
          <IconButton
            icon="add"
            variant="floating"
            color="primaryText"
            accessibilityLabel="Add spots to this vault"
            onPress={addSpots}
          />
          <IconButton
            icon="create-outline"
            variant="floating"
            accessibilityLabel="Edit vault"
            onPress={() => router.push({ pathname: '/vaults/[id]/edit', params: { id: vault.id } })}
          />
        </>
      ) : null}
    </>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Monogram name={vault.name} flag={vault.emoji} size={52} />
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={1} accessibilityRole="header">
            {vault.name}
          </Text>
          <Text variant="caption" numberOfLines={1} style={styles.tabular}>
            {[plural(total, 'spot'), vault.cities.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {total ? (
        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={`${vault.visited} of ${total} visited`}
        >
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(done * 100)}%` }]} />
          </View>
          <Text variant="caption" color="textMuted" style={[styles.tabular, styles.bold]}>
            {vault.visited === total ? 'All done 🎉' : `${vault.visited}/${total} visited`}
          </Text>
        </View>
      ) : null}
      {share ? (
        <PressableScale
          scale={0.98}
          style={styles.sharedRow}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/vaults/[id]/share', params: { id: vault.id } })}
        >
          <Icon name="people" size={16} color="success" />
          <Text variant="caption" color="text" style={styles.flex} numberOfLines={1}>
            {share.role === 'member'
              ? `Shared with you · ${plural(share.people ?? 1, 'person', 'people')}`
              : (share.people ?? 1) > 1
                ? `Shared · ${plural(share.people ?? 1, 'person', 'people')}`
                : 'Shared · waiting for friends to join'}
          </Text>
          <Text variant="caption" color="primaryText" style={styles.bold}>
            Invite
          </Text>
        </PressableScale>
      ) : null}
      {total ? (
        <ChipRow>
          {plannable ? <Chip label="Plan a trip" icon="sparkles" color="#D14318" onPress={planTrip} /> : null}
          <Chip label={`All ${total}`} selected={!category} onPress={() => filterTo(undefined)} />
          {categories.map(([c, n]) => (
            <Chip
              key={c}
              label={`${CATEGORY_META[c].label} ${n}`}
              accessibilityLabel={`${CATEGORY_META[c].label}, ${plural(n, 'spot')}`}
              icon={CATEGORY_META[c].icon}
              color={CATEGORY_META[c].color}
              selected={category === c}
              onPress={() => filterTo(category === c ? undefined : c)}
            />
          ))}
        </ChipRow>
      ) : null}
    </View>
  );

  return (
    <MapSheet
      mapRef={mapRef}
      markers={markers}
      initialPoints={all}
      userLocation={location}
      onMarkerPress={setSelectedId}
      onMapPress={() => setSelectedId(undefined)}
      peekKey={selectedId}
      topBar={topBar}
      floating={
        <>
          <IconButton
            icon="locate"
            variant="floating"
            accessibilityLabel="Show my location"
            onPress={locate}
          />
          {selected ? (
            <View style={styles.cardSlot}>
              <PlaceMapCard place={selected} location={location} />
            </View>
          ) : null}
        </>
      }
      header={header}
    >
      {total === 0 ? (
        <EmptyState
          icon={isLiked ? 'heart-outline' : 'albums-outline'}
          title={isLiked ? 'Nothing liked yet' : isAll ? 'Nothing saved yet' : 'This vault is empty'}
          body={
            isLiked
              ? 'Tap the heart on any spot and it lands here.'
              : isAll
                ? 'Share a reel to Travyy, paste a link, or long-press the map to drop a pin.'
                : 'Add spots you’ve already saved, or pick this vault when you save from a reel.'
          }
          action={vault.custom ? <Button title="Add spots" iconName="add" onPress={addSpots} /> : undefined}
        />
      ) : (
        <SheetSpotList
          sections={sections}
          // The section header already names the city.
          subtitleFor={(p) => CATEGORY_META[p.category].label}
        />
      )}
    </MapSheet>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  tabular: { fontVariant: ['tabular-nums'] },
  missingBar: { paddingTop: 56, paddingHorizontal: spacing.lg },
  header: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.gutter },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.gutter },
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
    gap: 8,
    marginHorizontal: spacing.gutter,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: t.colors.successSoft,
  },
  cardSlot: { width: '100%' },
}));
