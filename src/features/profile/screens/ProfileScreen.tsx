import { router } from 'expo-router';
import { View } from 'react-native';
import type { Category } from '@/domain/models';
import { authEnabled, signOut, useSession } from '@/features/auth/session';
import { CATEGORY_META } from '@/features/places/categories';
import { FREE_LIMITS, useEntitlements } from '@/features/paywall/entitlements';
import { confirm } from '@/shared/lib/platform';
import { makeStyles } from '@/shared/theme';
import { Button, Card, ScreenScroll, Text } from '@/shared/ui';
import { groupByCity, useAppStore, visitRate } from '@/store';

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
  const places = useAppStore((s) => s.places);
  const trips = useAppStore((s) => s.trips);
  const reset = useAppStore((s) => s.reset);
  const { isPro, savesUsed } = useEntitlements();

  const visited = places.filter((p) => p.visitedAt).length;
  const rate = visitRate(places);
  const countries = new Set(places.map((p) => p.country).filter(Boolean)).size;
  const counts = new Map<Category, number>();
  for (const p of places) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <ScreenScroll>
      <Card style={styles.hero}>
        <Text variant="label" color="textInverseMuted">
          Saves you actually went to
        </Text>
        <Text style={styles.big} color="textInverse">
          {rate}%
        </Text>
        <View
          style={styles.bar}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: rate }}
        >
          <View style={[styles.barFill, { width: `${rate}%` }]} />
        </View>
        <Text color="textInverseMuted">
          {visited} of {places.length} saved spots visited. Most people never visit 90% of what they save —
          let’s beat that.
        </Text>
      </Card>

      <View style={styles.grid}>
        <Stat n={places.length} label="Saved" />
        <Stat n={groupByCity(places).length} label="Cities" />
        <Stat n={countries} label="Countries" />
        <Stat n={trips.length} label="Trips" />
      </View>

      {topCategory ? (
        <Card style={styles.gap}>
          <Text variant="label">Your travel personality</Text>
          <Text variant="heading">
            {CATEGORY_META[topCategory].emoji} {PERSONALITY[topCategory]}
          </Text>
        </Card>
      ) : null}

      {authEnabled ? <AccountCard /> : null}

      <Card style={styles.gap}>
        <Text variant="heading">{isPro ? 'Travyy Pro ✨' : 'Free plan'}</Text>
        <Text variant="caption">
          {isPro
            ? 'Unlimited saves and trips. Thanks for supporting an indie app.'
            : `${Math.min(savesUsed, FREE_LIMITS.saves)} / ${FREE_LIMITS.saves} saves used · ${FREE_LIMITS.trips} trip included`}
        </Text>
        {!isPro ? <Button title="Go Pro" onPress={() => router.push('/paywall')} /> : null}
      </Card>

      <Button
        title="Reset all data"
        variant="ghost"
        onPress={async () => {
          if (
            await confirm({
              title: 'Reset everything?',
              message: 'This deletes all saves and trips on this device.',
              confirmText: 'Reset',
              destructive: true,
            })
          ) {
            reset();
          }
        }}
      />
    </ScreenScroll>
  );
}

function AccountCard() {
  const styles = useStyles();
  const session = useSession();
  // Still reading the saved session: show nothing rather than a flash of "Sign in".
  if (session === undefined) return null;
  if (!session) {
    return (
      <Card style={styles.gap}>
        <Text variant="heading">Your account</Text>
        <Text variant="caption">
          Sign in with your email to get ready for backup and syncing across your phones. Your saves stay on
          this phone either way.
        </Text>
        <Button title="Sign in" variant="secondary" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }
  return (
    <Card style={styles.gap}>
      <Text variant="heading">Your account</Text>
      <Text variant="caption">Signed in as {session.user.email ?? 'you'}</Text>
      <Button
        title="Sign out"
        variant="ghost"
        onPress={async () => {
          if (
            await confirm({
              title: 'Sign out?',
              message: 'Your saves and trips stay on this phone.',
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

function Stat({ n, label }: { n: number; label: string }) {
  const styles = useStyles();
  return (
    <Card style={styles.stat}>
      <Text variant="stat">{n}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  gap: { gap: 8 },
  hero: {
    backgroundColor: t.colors.surfaceInverse,
    borderColor: t.colors.surfaceInverse,
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  big: { fontSize: 64, lineHeight: 68, fontWeight: '900', letterSpacing: -3, fontVariant: ['tabular-nums'] },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: t.dark ? 'rgba(22,19,15,0.14)' : 'rgba(255,248,238,0.16)',
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: t.colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '40%', gap: 2 },
}));
