import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useImportInbox } from '@/features/trips/importInbox';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { useLayout } from '@/shared/lib/useLayout';
import { Map, type MapMarker } from '@/shared/map';
import { CONTENT_MAX_WIDTH, lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, EmptyState, IconBadge, Pill, Text } from '@/shared/ui';
import { UNKNOWN_CITY, useAppStore } from '@/store';
import { CATEGORY_META } from '../categories';
import { Monogram } from '../components/VaultCard';
import { decodeVault } from '../vaultLink';
import { DEFAULT_VAULT_EMOJI } from '../vaults';

/**
 * Where a shared vault link lands: the spots on a map, readable without the app or an account,
 * and one button to make the vault yours. Built like the shared trip page (ARCHITECTURE 20).
 */
export function SharedVaultScreen({ data }: { data?: string }) {
  const styles = useStyles();
  const { dark } = useTheme();
  const { isWide } = useLayout();
  const vault = useMemo(() => decodeVault(data), [data]);
  const onboarded = useAppStore((s) => s.onboarded);
  const places = useMemo(() => vault?.places ?? [], [vault]);

  useEffect(() => {
    track('shared_vault_opened', { spots: places.length, valid: !!vault });
  }, [vault, places.length]);

  const markers = useMemo<MapMarker[]>(
    () =>
      places.map((p, i) => ({
        id: String(i),
        coordinate: p,
        color: CATEGORY_META[p.category].color,
        icon: CATEGORY_META[p.category].icon,
        accessibilityLabel: `${p.name}, ${CATEGORY_META[p.category].label}`,
      })),
    [places],
  );

  const byCity = useMemo(() => {
    const groups = new globalThis.Map<string, typeof places>();
    for (const p of places) {
      const city = p.city ?? UNKNOWN_CITY;
      groups.set(city, [...(groups.get(city) ?? []), p]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [places]);

  // Leave only after onboarding is recorded: until then the tabs don't exist to go to.
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (added && onboarded) router.replace('/');
  }, [added, onboarded]);

  if (!vault) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="link"
          title="This vault link didn’t open"
          body="It may have been cut short when it was copied. Ask for it again."
          action={<Button title="Open Travyy" onPress={() => router.replace('/')} />}
        />
      </SafeAreaView>
    );
  }

  const add = () => {
    const store = useAppStore.getState();
    const id = store.importVault(vault);
    track('shared_vault_imported', { spots: places.length, newUser: !onboarded });
    haptics.success();
    // The tabs open the vault once they're on screen.
    useImportInbox.getState().holdVault(id);
    setAdded(true);
    if (!onboarded) store.completeOnboarding();
  };

  const list = (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.brand}>travyy</Text>
        <Text variant="overline" color="primaryText">
          A vault shared with you
        </Text>
        <View style={styles.titleRow}>
          <Monogram name={vault.name} flag={vault.emoji ?? DEFAULT_VAULT_EMOJI} size={52} />
          <Text variant="title" style={styles.flex}>
            {vault.name}
          </Text>
        </View>
        <View style={styles.facts}>
          <Pill icon="bookmark" label={`${places.length} spot${places.length === 1 ? '' : 's'}`} />
          {byCity.slice(0, 3).map(([city]) => (
            <Pill key={city} icon="location" label={city} />
          ))}
        </View>
      </View>
      {byCity.map(([city, spots]) => (
        <View key={city} style={styles.group}>
          <Text variant="heading">{city}</Text>
          <View style={[styles.card, lift(dark)]}>
            {spots.map((p, i) => {
              const meta = CATEGORY_META[p.category];
              return (
                <View key={`${p.name}-${i}`} style={[styles.spot, i > 0 && styles.divider]}>
                  <IconBadge icon={meta.icon} color={meta.color} size={38} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text variant="caption">{meta.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
      <Text variant="caption" color="textSubtle" align="center" style={styles.pitch}>
        Travyy turns saved reels into vaults on a map, day-by-day plans and a fair split of the costs.
      </Text>
    </ScrollView>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
        <Button title="Add to my Travyy" iconName="add-circle" loading={added} onPress={add} />
        <Text variant="caption" color="textSubtle" align="center">
          Free. No account needed. Spots you’ve already saved aren’t doubled.
        </Text>
      </View>
    </View>
  );

  const map = <Map markers={markers} initialPoints={places} />;

  return (
    <SafeAreaView style={styles.safe}>
      {isWide ? (
        <View style={styles.split}>
          <View style={styles.panel}>
            {list}
            {footer}
          </View>
          <View style={styles.flex}>{map}</View>
        </View>
      ) : (
        <>
          <View style={styles.mapNarrow}>{map}</View>
          <View style={styles.flex}>{list}</View>
          {footer}
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  panel: { width: 420, borderRightWidth: 1, borderRightColor: t.colors.border },
  mapNarrow: { height: 240 },
  list: {
    padding: spacing.gutter,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  header: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 20, fontWeight: '800', color: t.colors.primary, letterSpacing: -0.7, marginBottom: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  group: { gap: 10 },
  card: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  spot: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 16 },
  divider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  pitch: { maxWidth: 320, alignSelf: 'center' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.background,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
  },
  footerInner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 6 },
}));
