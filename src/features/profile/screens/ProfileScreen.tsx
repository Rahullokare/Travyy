import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { Category } from '@/domain/models';
import { authEnabled, signOut, useSession } from '@/features/auth/session';
import { CATEGORY_META } from '@/features/places/categories';
import { FREE_LIMITS, useEntitlements } from '@/features/paywall/entitlements';
import { syncNow, useSyncStatus, type SyncStatus } from '@/features/sync/useAccountSync';
import { confirm } from '@/shared/lib/platform';
import { lift, makeStyles, radius, spacing, useTheme } from '@/shared/theme';
import { Button, Card, Icon, IconBadge, ScreenHeader, ScreenScroll, Text, type IconName } from '@/shared/ui';
import { knownCities, useAppStore, visitRate } from '@/store';

const PERSONALITY: Record<Category, string> = {
  food: 'The Food Pilgrim',
  cafe: 'The Café Hopper',
  nightlife: 'The Night Owl',
  sight: 'The Culture Collector',
  nature: 'The Trail Chaser',
  shopping: 'The Treasure Hunter',
  stay: 'The Stay Curator',
  activity: 'The Experience Seeker',
  other: 'The Explorer',
};

export function ProfileScreen() {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  const places = useAppStore((s) => s.places);
  const trips = useAppStore((s) => s.trips);
  const reset = useAppStore((s) => s.reset);
  const backedUp = useAppStore((s) => !!s.sync.ownerId);
  const { plan, aiImportsLeft, tripsPlanned, tripsAllowed, passUntil } = useEntitlements();

  const visited = places.filter((p) => p.visitedAt).length;
  const rate = visitRate(places);
  const countries = new Set(places.map((p) => p.country).filter(Boolean)).size;
  const counts = new Map<Category, number>();
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <View style={styles.flex}>
      <ScreenHeader title="You" />
      <ScreenScroll contentStyle={styles.content}>
        <View style={[styles.hero, lift(dark)]}>
          <Text variant="overline" style={styles.heroMuted}>
            Saves you actually went to
          </Text>
          <Text style={styles.big}>{rate}%</Text>
          <View
            style={styles.bar}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: rate }}
          >
            <View style={[styles.barFill, { width: `${Math.max(rate, 2)}%` }]} />
          </View>
          <Text variant="callout" style={styles.heroMuted}>
            {visited} of {places.length} saved spots visited. Most people never visit 90% of what they save.
            Let’s beat that.
          </Text>
        </View>

        <View style={styles.grid}>
          <Stat n={places.length} label="Saved" icon="bookmark" color={colors.primary} />
          <Stat n={knownCities(places).length} label="Cities" icon="business" color="#2F6FE0" />
          <Stat n={countries} label="Countries" icon="flag" color="#22945F" />
          <Stat n={trips.length} label="Trips" icon="airplane" color="#7B5BE0" />
        </View>

        {topCategory ? (
          <Card style={styles.row}>
            <IconBadge
              icon={CATEGORY_META[topCategory].icon}
              color={CATEGORY_META[topCategory].color}
              size={48}
            />
            <View style={styles.flex}>
              <Text variant="overline">Your travel personality</Text>
              <Text variant="headline">{PERSONALITY[topCategory]}</Text>
            </View>
          </Card>
        ) : null}

        {authEnabled ? <AccountCard /> : null}

        <Card style={styles.gap}>
          <View style={styles.row}>
            <IconBadge icon="sparkles" color={colors.primary} size={48} />
            <View style={styles.flex}>
              <Text variant="heading">
                {plan === 'pro' ? 'Travyy Pro' : plan === 'pass' ? 'Trip Pass' : 'Free plan'}
              </Text>
              <Text variant="caption">
                {plan === 'pro'
                  ? 'Unlimited trips and AI imports. Thanks for supporting an indie app.'
                  : plan === 'pass'
                    ? `Unlimited AI imports until ${new Date(passUntil ?? 0).toLocaleDateString()} · ${tripsPlanned} of ${tripsAllowed} trips planned`
                    : `${aiImportsLeft} of ${FREE_LIMITS.aiImportsPerMonth} AI imports left this month · ${tripsPlanned} of ${tripsAllowed} trip${tripsAllowed === 1 ? '' : 's'} planned`}
              </Text>
            </View>
          </View>
          {plan !== 'pro' ? (
            <>
              {plan === 'free' ? (
                <View style={styles.meter}>
                  <View
                    style={[
                      styles.meterFill,
                      {
                        width: `${Math.min(100, (1 - (aiImportsLeft ?? 0) / FREE_LIMITS.aiImportsPerMonth) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              ) : null}
              <Text variant="caption" color="textSubtle">
                Saving spots and splitting costs are free, with no limits.
              </Text>
              <Button
                title="See plans"
                iconName="sparkles"
                variant={plan === 'pass' ? 'secondary' : 'primary'}
                onPress={() => router.push('/paywall')}
              />
            </>
          ) : null}
        </Card>

        <View style={[styles.settings, lift(dark)]}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
            onPress={async () => {
              if (
                await confirm({
                  title: 'Reset everything?',
                  message: backedUp
                    ? 'This deletes all saves and trips on this phone, and your saved spots from your account and your other phones too.'
                    : 'This deletes all saves and trips on this device.',
                  confirmText: 'Reset',
                  destructive: true,
                })
              ) {
                reset();
              }
            }}
          >
            <Icon name="trash-outline" size={20} color="danger" />
            <Text variant="bodyStrong" color="danger" style={styles.flex}>
              Reset all data
            </Text>
          </Pressable>
        </View>
      </ScreenScroll>
    </View>
  );
}

function AccountCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const session = useSession();
  // Still reading the saved session: show nothing rather than a flash of "Sign in".
  if (session === undefined) return null;
  if (!session) {
    return (
      <Card style={styles.gap}>
        <View style={styles.row}>
          <IconBadge icon="person" color={colors.accent} size={48} />
          <View style={styles.flex}>
            <Text variant="heading">Your account</Text>
            <Text variant="caption">
              Sign in with your email to back up your saved spots and see them on your other phones. They stay
              on this phone either way.
            </Text>
          </View>
        </View>
        <Button
          title="Sign in"
          iconName="mail"
          variant="secondary"
          size="md"
          onPress={() => router.push({ pathname: '/sign-in', params: { next: '/profile' } })}
        />
      </Card>
    );
  }
  return (
    <Card style={styles.gap}>
      <View style={styles.row}>
        <IconBadge icon="person" color={colors.accent} size={48} />
        <View style={styles.flex}>
          <Text variant="heading">Your account</Text>
          <Text variant="caption" numberOfLines={1}>
            Signed in as {session.user.email ?? 'you'}
          </Text>
        </View>
      </View>
      <BackupStatus />
      <Button
        title="Sign out"
        variant="secondary"
        size="md"
        onPress={async () => {
          if (
            await confirm({
              title: 'Sign out?',
              message: 'Your saves and trips stay on this phone. Backup pauses until you sign in again.',
              confirmText: 'Sign out',
            })
          ) {
            await signOut();
          }
        }}
      />
    </Card>
  );
}

const BACKUP_COPY: Record<
  SyncStatus,
  { icon: IconName; tone: 'success' | 'textMuted' | 'warning'; text: string }
> = {
  idle: { icon: 'cloud-outline', tone: 'textMuted', text: 'Backup starts in a moment.' },
  syncing: { icon: 'sync', tone: 'textMuted', text: 'Backing up your saved spots…' },
  synced: { icon: 'cloud-done', tone: 'success', text: 'Saved spots are backed up.' },
  error: {
    icon: 'cloud-offline',
    tone: 'warning',
    text: 'Couldn’t reach the backup. Your changes are kept here and sent when you’re back online.',
  },
  'other-account': {
    icon: 'alert-circle',
    tone: 'warning',
    text: 'The spots on this phone are backed up to a different account. Sign in with that one, or reset this phone’s data to use this account.',
  },
};

/** Says, in one line, whether the account's backup is current. Trips and costs aren't backed up yet. */
function BackupStatus() {
  const styles = useStyles();
  const { status, lastSyncedAt } = useSyncStatus();
  const waiting = useAppStore((s) => Object.keys(s.sync.dirty).length + s.sync.deleted.length);
  const copy = BACKUP_COPY[status];
  return (
    <View style={styles.backup}>
      <View style={styles.backupRow}>
        <Icon name={copy.icon} size={18} color={copy.tone} />
        <Text variant="callout" style={styles.flex}>
          {copy.text}
          {status === 'synced' && lastSyncedAt
            ? ` Last checked ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
            : ''}
          {status === 'error' && waiting ? ` ${waiting} waiting.` : ''}
        </Text>
      </View>
      <Text variant="caption" color="textSubtle">
        Trips and split costs stay on this phone for now.
      </Text>
      {status === 'error' || status === 'synced' ? (
        <Button
          title={status === 'error' ? 'Try again' : 'Back up now'}
          iconName="sync"
          variant="tinted"
          size="sm"
          onPress={() => void syncNow()}
        />
      ) : null}
    </View>
  );
}

function Stat({ n, label, icon, color }: { n: number; label: string; icon: IconName; color: string }) {
  const styles = useStyles();
  return (
    <Card style={styles.stat}>
      <IconBadge icon={icon} color={color} size={32} />
      <Text variant="stat" style={styles.statValue}>
        {n}
      </Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, gap: 2 },
  content: { paddingTop: spacing.sm },
  gap: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backup: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: t.colors.surfaceSunken,
  },
  backupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // The one brand-coloured surface on the screen: the number the app exists to move.
  hero: {
    backgroundColor: t.colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: 10,
  },
  heroMuted: { color: t.colors.onPrimary, opacity: 0.85 },
  big: {
    fontSize: 64,
    lineHeight: 70,
    fontWeight: '800',
    letterSpacing: -3,
    color: t.colors.onPrimary,
    fontVariant: ['tabular-nums'],
  },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.dark ? 'rgba(15,14,13,0.18)' : 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: t.colors.onPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: '40%', gap: 4 },
  statValue: { marginTop: 6 },
  meter: { height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceSunken, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: t.colors.primary },
  settings: {
    borderRadius: radius.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, minHeight: 56 },
  pressed: { backgroundColor: t.colors.surfacePressed },
}));
