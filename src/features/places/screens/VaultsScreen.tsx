import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { NEW_FAB_CLEARANCE, NewFab } from '@/features/capture/components/NewFab';
import { AvatarButton } from '@/features/profile/components/AvatarButton';
import { CONTENT_MAX_WIDTH, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import {
  Chip,
  ChipRow,
  EmptyState,
  Icon,
  PressableScale,
  Screen,
  ScreenHeader,
  Text,
  type IconName,
} from '@/shared/ui';
import { useAppStore } from '@/store';
import { colorFor } from '../components/VaultCard';
import { SearchField } from '../components/SearchField';
import { fold, groupByCountry, plural } from '../vault';
import {
  ALL_VAULT_ID,
  customVaultSummaries,
  LIKED_VAULT_ID,
  likedPlaces,
  type VaultSummary,
} from '../vaults';

type Filter = 'all' | 'mine' | 'shared';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared' },
];

/**
 * Every way into the saves, as glide lays it out: three pinned tiles that build themselves
 * (everything, what you ❤, and places by country and city), then the vaults you made. Each one
 * opens on its own map.
 */
export function VaultsScreen() {
  const styles = useStyles();
  const places = useAppStore((s) => s.places);
  const vaults = useAppStore((s) => s.vaults);
  const shared = useAppStore((s) => s.shared);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const yours = useMemo(() => customVaultSummaries(vaults, places), [vaults, places]);
  const liked = useMemo(() => likedPlaces(places).length, [places]);
  const countries = useMemo(() => groupByCountry(places), [places]);
  const cities = countries.reduce((n, c) => n + c.cities.filter((x) => x.known).length, 0);

  const shown = yours.filter((v) => {
    if (filter === 'mine' && shared[v.id]?.role === 'member') return false;
    if (filter === 'shared' && !shared[v.id]) return false;
    return !query.trim() || fold(v.name).includes(fold(query.trim()));
  });

  const openVault = (id: string) => router.push({ pathname: '/vaults/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader
        title="Vaults"
        subtitle={yours.length ? plural(yours.length, 'vault') : undefined}
        right={<AvatarButton />}
      />
      <View style={styles.tools}>
        <View style={styles.search}>
          <SearchField value={query} onChange={setQuery} placeholder="Search vaults" />
        </View>
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={filter === f.value}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </ChipRow>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!query.trim() && filter === 'all' ? (
          <View style={styles.pinnedRow}>
            <PinnedTile
              icon="bookmark"
              color="#2F6FE0"
              title="All saves"
              meta={plural(places.length, 'spot')}
              onPress={() => openVault(ALL_VAULT_ID)}
            />
            <PinnedTile
              icon="heart"
              color="#E0245E"
              title="Liked"
              meta={plural(liked, 'spot')}
              onPress={() => openVault(LIKED_VAULT_ID)}
            />
            <PinnedTile
              icon="earth"
              color="#7B5BE0"
              title="Places"
              meta={
                cities ? plural(cities, 'city', 'cities') : plural(countries.length, 'country', 'countries')
              }
              onPress={() => router.push('/places')}
            />
          </View>
        ) : null}

        <Text variant="label" color="textMuted" style={styles.label}>
          {filter === 'shared' ? 'Shared vaults' : 'Your vaults'}
        </Text>
        {shown.length === 0 && (query.trim() || filter !== 'all') ? (
          <EmptyState
            icon="search"
            title="No vaults here"
            body={
              filter === 'shared'
                ? 'Share a vault, or join a friend’s, to build it together.'
                : 'No vault has that name.'
            }
          />
        ) : (
          <View style={styles.grid}>
            {shown.map((v) => (
              <VaultTile
                key={v.id}
                vault={v}
                people={shared[v.id] ? (shared[v.id].people ?? 1) : undefined}
                onPress={() => openVault(v.id)}
              />
            ))}
            {filter !== 'shared' && !query.trim() ? <NewVaultTile /> : null}
          </View>
        )}
      </ScrollView>
      <NewFab />
    </Screen>
  );
}

/** A vault that builds itself: a bright tile, pinned first. */
function PinnedTile({
  icon,
  color,
  title,
  meta,
  onPress,
}: {
  icon: IconName;
  color: string;
  title: string;
  meta: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      scale={0.96}
      style={styles.pinned}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      onPress={onPress}
    >
      <View style={[styles.pinnedCover, { backgroundColor: color }]}>
        <View style={styles.pinnedShine} />
        <Icon name={icon} size={34} color="#FFFFFF" />
      </View>
      <View style={styles.pinnedLabel}>
        <Icon name="pin" size={12} color="textMuted" />
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.center}>
        {meta}
      </Text>
    </PressableScale>
  );
}

function VaultTile({
  vault,
  people,
  onPress,
}: {
  vault: VaultSummary;
  people?: number;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { dark } = useTheme();
  const color = colorFor(vault.name);
  const total = vault.places.length;
  const done = total ? vault.visited / total : 0;
  return (
    <PressableScale
      scale={0.97}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={`${vault.name}, ${plural(total, 'spot')}, ${vault.visited} visited${
        people ? `, shared with ${plural(people, 'person', 'people')}` : ''
      }`}
      onPress={onPress}
    >
      <View style={[styles.tileCover, { backgroundColor: `${color}${dark ? '33' : '1F'}` }]}>
        <View style={[styles.tileRing, { borderColor: `${color}${dark ? '2A' : '1A'}` }]} />
        <Text style={styles.emoji}>{vault.emoji}</Text>
        {people ? (
          <View style={styles.peopleBadge}>
            <Icon name="people" size={12} color="#FFFFFF" />
            <Text style={styles.peopleText}>{people}</Text>
          </View>
        ) : null}
        {total ? (
          <View style={styles.tileTrack}>
            <View style={[styles.tileFill, { width: `${Math.round(done * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {vault.name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {total ? `${plural(total, 'spot')} · ${vault.visited}/${total} visited` : 'Empty for now'}
        </Text>
      </View>
    </PressableScale>
  );
}

function NewVaultTile() {
  const styles = useStyles();
  return (
    <PressableScale
      scale={0.97}
      style={[styles.tile, styles.newTile]}
      accessibilityRole="button"
      accessibilityLabel="New vault"
      onPress={() => router.push('/vaults/new')}
    >
      <View style={styles.newIcon}>
        <Icon name="add" size={26} color="primaryText" />
      </View>
      <Text variant="bodyStrong" color="primaryText">
        New vault
      </Text>
      <Text variant="caption" align="center">
        Cafés to try, a weekend away, date nights
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  center: { textAlign: 'center' },
  tools: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  search: { paddingHorizontal: spacing.gutter },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    paddingBottom: NEW_FAB_CLEARANCE,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  label: { paddingHorizontal: 4, marginTop: spacing.sm },
  pinnedRow: { flexDirection: 'row', gap: spacing.md },
  pinned: { flex: 1, gap: 6, alignItems: 'center' },
  pinnedCover: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0px 6px 18px rgba(0,0,0,0.16)',
  },
  // A pale band across the top corner, the light catching a glossy card.
  pinnedShine: {
    position: 'absolute',
    top: -30,
    left: -30,
    width: 140,
    height: 90,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ rotate: '-20deg' }],
  },
  pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    // Two per row, and a lone last tile keeps its size instead of stretching.
    width: '47.5%',
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  tileCover: { height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 22,
    top: -70,
    right: -80,
  },
  emoji: { fontSize: 46, lineHeight: 58 },
  peopleBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  peopleText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#FFFFFF' },
  tileTrack: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  tileFill: { height: 4, borderRadius: 2, backgroundColor: t.colors.success },
  tileBody: { padding: 12, gap: 2 },
  newTile: {
    minHeight: 186,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.lg,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.colors.borderStrong,
  },
  newIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primarySoft,
  },
}));
