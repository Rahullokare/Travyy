import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/features/auth/session';
import { useImportInbox } from '@/features/trips/importInbox';
import { track } from '@/shared/lib/analytics';
import { haptics } from '@/shared/lib/platform';
import { makeStyles, spacing } from '@/shared/theme';
import { Button, EmptyState, Text } from '@/shared/ui';
import { useAppStore } from '@/store';
import { joinVault, SharingError, sharingAvailable } from '../sharing';

/**
 * Where an invite link lands. The vault can't be shown before joining (it's private to the people
 * in it), so this says what joining means, gets the person signed in, and joins.
 */
export function JoinVaultScreen({ token }: { token: string }) {
  const styles = useStyles();
  const session = useSession();
  const onboarded = useAppStore((s) => s.onboarded);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>();
  const [joined, setJoined] = useState<string>();

  // Leave only once onboarding is recorded: until then the tabs don't exist to go to.
  useEffect(() => {
    if (joined && onboarded) {
      useImportInbox.getState().holdVault(joined);
      router.replace('/');
    }
  }, [joined, onboarded]);

  if (!sharingAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          icon="people"
          title="Shared vaults aren’t available here"
          body="This version of Travyy can’t join shared vaults. Ask your friend to send a copy instead."
          action={<Button title="Open Travyy" onPress={() => router.replace('/')} />}
        />
      </SafeAreaView>
    );
  }

  const signIn = () => {
    // A new visitor skips the intro: they came for a vault.
    if (!onboarded) useAppStore.getState().completeOnboarding();
    router.push({ pathname: '/sign-in', params: { next: `/join-vault?t=${encodeURIComponent(token)}` } });
  };

  const join = async () => {
    setJoining(true);
    setError(undefined);
    try {
      const id = await joinVault(token);
      const spots = useAppStore.getState().vaults.find((v) => v.id === id)?.placeIds.length ?? 0;
      track('vault_joined', { spots });
      haptics.success();
      if (!onboarded) useAppStore.getState().completeOnboarding();
      setJoined(id);
    } catch (e) {
      setError(e instanceof SharingError ? e.message : 'Couldn’t join right now. Try again.');
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.brand}>travyy</Text>
        <EmptyState
          icon="people"
          title="You’re invited to a vault"
          body="Join to see every spot your friends have saved in it, on a map, and add your own. You keep your own visited and ❤ marks."
          action={
            <View style={styles.actions}>
              {session === undefined ? null : session ? (
                <Button title="Join vault" iconName="enter-outline" loading={joining} onPress={join} />
              ) : (
                <Button title="Sign in to join" iconName="log-in-outline" onPress={signIn} />
              )}
              {error ? (
                <Text variant="caption" color="danger" align="center">
                  {error}
                </Text>
              ) : (
                <Text variant="caption" color="textSubtle" align="center">
                  {session ? 'Free.' : 'Free, with a one-time code by email. No password.'}
                </Text>
              )}
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.background },
  body: { flex: 1, justifyContent: 'center', padding: spacing.gutter },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: t.colors.primary,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  actions: { gap: spacing.sm, alignSelf: 'stretch' },
}));
