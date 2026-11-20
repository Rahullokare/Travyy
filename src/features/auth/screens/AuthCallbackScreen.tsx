import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { track } from '@/shared/lib/analytics';
import { makeStyles, useTheme } from '@/shared/theme';
import { Button, EmptyState, Text } from '@/shared/ui';
import { completeOAuth, takeReturnPath } from '../session';

/**
 * Where Google sends the user back to. On web this page swaps the code for a session and opens the
 * page sign-in started from. On Android the redirect can also open this route while the browser
 * sheet hands the same code to the sign-in screen; `completeOAuth` runs once and this just closes.
 */
export function AuthCallbackScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    // On web the error can be in the fragment, which the router doesn't see.
    const all =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? { ...Object.fromEntries(new URLSearchParams(window.location.hash.slice(1))), ...params }
        : params;
    completeOAuth(all)
      .then(() => {
        if (!live) return;
        if (Platform.OS === 'web') {
          track('signed_in', { method: 'google' });
          router.replace(takeReturnPath() as never);
        } else if (router.canGoBack()) router.back();
        else router.replace('/');
      })
      .catch((e: unknown) => {
        if (!live) return;
        const text = e instanceof Error ? e.message : '';
        setError(
          /network|fetch/i.test(text)
            ? 'No connection. Check your internet and try again.'
            : /access_denied|denied|cancel/i.test(text)
              ? 'Sign-in was cancelled.'
              : 'Sign-in didn’t finish. Try again.',
        );
      });
    return () => {
      live = false;
    };
    // The params of this one visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <SafeAreaView style={styles.flex}>
        <EmptyState
          icon="alert-circle-outline"
          title="Couldn’t sign you in"
          body={error}
          action={<Button title="Back to Travyy" onPress={() => router.replace('/')} />}
        />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.flex, styles.center]}>
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text variant="callout" color="textMuted">
          Signing you in…
        </Text>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, backgroundColor: t.colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
}));
