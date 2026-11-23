import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAccountSync } from '@/features/sync/useAccountSync';
import { logger } from '@/shared/lib/logger';
import { useWarmUpApi } from '@/shared/lib/useWarmUpApi';
import { queryClient } from '@/shared/query/queryClient';
import { AppThemeProvider, FONT_FAMILY, headerTitleFont, useTheme } from '@/shared/theme';
import { AnimatedSplash } from '@/shared/ui/AnimatedSplash';
import { Button, EmptyState, IconButton, Screen } from '@/shared/ui';
import { hydration, useAppStore } from '@/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <RootNavigator />
        </AppThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Closes a modal; after a web refresh there is nothing behind it, so go home instead. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function CloseButton() {
  // Android puts the title right after the left button, so give it room.
  return (
    <View style={{ marginRight: Platform.OS === 'android' ? 16 : 0 }}>
      <IconButton icon="close" accessibilityLabel="Close" variant="tinted" size={20} onPress={close} />
    </View>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const hydrated = useSyncExternalStore(hydration.subscribe, hydration.isHydrated, hydration.isHydrated);
  const onboarded = useAppStore((s) => s.onboarded);
  // A font that fails to load falls back to the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    [FONT_FAMILY[400]]: PlusJakartaSans_400Regular,
    [FONT_FAMILY[500]]: PlusJakartaSans_500Medium,
    [FONT_FAMILY[600]]: PlusJakartaSans_600SemiBold,
    [FONT_FAMILY[700]]: PlusJakartaSans_700Bold,
    [FONT_FAMILY[800]]: PlusJakartaSans_800ExtraBold,
  });
  const ready = hydrated && (fontsLoaded || !!fontError);
  // Phones get the animated intro after the native splash; the web has no native splash to follow.
  const [intro, setIntro] = useState(Platform.OS !== 'web');
  useWarmUpApi();
  useAccountSync(hydrated);

  useEffect(() => {
    if (fontError) logger.warn('Fonts failed to load; using the system font', { error: String(fontError) });
  }, [fontError]);

  // With the intro, the native splash is hidden once the intro has drawn its first frame over the
  // same picture, so the swap can't be seen.
  useEffect(() => {
    if (ready && !intro) SplashScreen.hideAsync().catch(() => {});
    // Only the first `ready` matters; the intro ending must not hide anything twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Map our tokens onto React Navigation so headers, tab bar and transitions match.
  const navigationTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.border,
      },
    };
  }, [theme]);

  // Keep the splash screen up until state and fonts are loaded: no flash of onboarding or of
  // the system font.
  if (!ready) return null;

  /** Forms and flows that sit on top of the app: they rise from the bottom and close with an X. */
  const modal = (title: string) =>
    ({
      presentation: 'modal',
      title,
      headerLeft: CloseButton,
      animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
      contentStyle: { backgroundColor: theme.colors.background },
    }) as const;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: theme.colors.text,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTitleStyle: { ...headerTitleFont, fontSize: 17, color: theme.colors.text },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={modal('Save a spot')} />
          <Stack.Screen
            name="paywall"
            options={{
              ...modal(''),
              headerShown: false,
              animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
            }}
          />
          <Stack.Screen name="sign-in" options={modal('')} />
          <Stack.Screen name="profile" options={{ title: 'You' }} />
          <Stack.Screen
            name="new"
            options={{
              presentation: 'formSheet',
              headerShown: false,
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: theme.colors.surface },
            }}
          />
          <Stack.Screen name="add-place" options={modal('Save this spot')} />
          <Stack.Screen name="places" options={{ title: 'Places' }} />
          <Stack.Screen name="place/[id]" options={{ title: '' }} />
          <Stack.Screen name="vault/[country]/index" options={{ title: '' }} />
          <Stack.Screen name="vault/[country]/[city]" options={{ headerShown: false }} />
          <Stack.Screen name="vaults/new" options={modal('New vault')} />
          <Stack.Screen name="vaults/pick" options={modal('Add to vault')} />
          <Stack.Screen name="vaults/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen name="vaults/[id]/edit" options={modal('Edit vault')} />
          <Stack.Screen name="vaults/[id]/add" options={modal('Add spots')} />
          <Stack.Screen name="vaults/[id]/share" options={modal('Share')} />
          <Stack.Screen name="trip/new" options={modal('Plan a trip')} />
          <Stack.Screen name="trip/[id]" options={{ title: '' }} />
          <Stack.Screen name="trip/[id]/expense" options={modal('')} />
          <Stack.Screen name="trip/[id]/people" options={modal('')} />
          <Stack.Screen name="trip/[id]/payment" options={modal('')} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        {/* Share-extension landing route: reachable before onboarding so first-launch shares aren't lost. */}
        <Stack.Screen name="expo-sharing" options={{ headerShown: false, animation: 'none' }} />
        {/* A trip shared as a link: the first thing a friend sees, so it's open before onboarding too. */}
        <Stack.Screen name="shared" options={{ headerShown: false }} />
        {/* A vault shared as a link, the same way. */}
        <Stack.Screen name="shared-vault" options={{ headerShown: false }} />
        {/* An invite to build a vault together: a friend's first screen, so also open before onboarding. */}
        <Stack.Screen name="join-vault" options={{ headerShown: false }} />
        {/* Where Google sign-in comes back to: it can arrive before the rest of the app is ready. */}
        <Stack.Screen name="auth-callback" options={{ headerShown: false, animation: 'none' }} />
      </Stack>
      {intro ? (
        <AnimatedSplash
          onLayout={() => SplashScreen.hideAsync().catch(() => {})}
          onDone={() => setIntro(false)}
        />
      ) : null}
    </NavigationThemeProvider>
  );
}

/** Route-level crash screen (Expo Router renders this when any screen throws). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logger.error(error, { where: 'ErrorBoundary' });
  }, [error]);
  return (
    <AppThemeProvider>
      <Screen>
        <EmptyState
          icon="refresh"
          title="Something went wrong"
          body="The error has been logged. Try again, and if it keeps happening, restart the app."
          action={<Button title="Try again" onPress={retry} />}
        />
      </Screen>
    </AppThemeProvider>
  );
}
