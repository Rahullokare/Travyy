import { QueryClientProvider } from '@tanstack/react-query';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  type ErrorBoundaryProps,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logger } from '@/shared/lib/logger';
import { useWarmUpApi } from '@/shared/lib/useWarmUpApi';
import { queryClient } from '@/shared/query/queryClient';
import { AppThemeProvider, useTheme } from '@/shared/theme';
import { Button, EmptyState, Screen } from '@/shared/ui';
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

function RootNavigator() {
  const theme = useTheme();
  const hydrated = useSyncExternalStore(hydration.subscribe, hydration.isHydrated, hydration.isHydrated);
  const onboarded = useAppStore((s) => s.onboarded);
  useWarmUpApi();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

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

  // Keep the splash screen up until persisted state is loaded: no flash of onboarding.
  if (!hydrated) return null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Save a spot' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="place/[id]" options={{ title: '' }} />
          <Stack.Screen name="trip/new" options={{ presentation: 'modal', title: 'Plan a trip' }} />
          <Stack.Screen name="trip/[id]" options={{ title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Share-extension landing route: reachable before onboarding so first-launch shares aren't lost. */}
        <Stack.Screen name="expo-sharing" options={{ headerShown: false, animation: 'none' }} />
      </Stack>
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
          emoji="🧯"
          title="Something went wrong"
          body="The error has been logged. Try again, and if it keeps happening, restart the app."
          action={<Button title="Try again" onPress={retry} />}
        />
      </Screen>
    </AppThemeProvider>
  );
}
