import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build variants let dev, preview and production builds sit side by side on one device.
 * Select with APP_VARIANT (set per profile in eas.json); defaults to development.
 *
 * Note: this is a dynamic config, so `expo install` cannot auto-add plugins.
 * Add a package's config plugin to `plugins` below by hand when its docs require one.
 */
type Variant = 'development' | 'preview' | 'production';
const variant = (process.env.APP_VARIANT ?? 'development') as Variant;

const VARIANTS: Record<Variant, { name: string; id: string; scheme: string }> = {
  development: { name: 'Travyy (Dev)', id: 'app.travyy.dev', scheme: 'travyy-dev' },
  preview: { name: 'Travyy (Preview)', id: 'app.travyy.preview', scheme: 'travyy-preview' },
  production: { name: 'Travyy', id: 'app.travyy', scheme: 'travyy' },
};
const v = VARIANTS[variant] ?? VARIANTS.development;
const LOCATION_COPY = 'Travyy uses your location to show saved spots near you.';

/** EAS project https://expo.dev/accounts/rahullokare77/projects/travyy (created by `eas init`). */
const EAS_OWNER = 'rahullokare77';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '3b17632d-648c-494c-b26f-d0c7de93338d';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: v.name,
  slug: 'travyy',
  owner: EAS_OWNER,
  // One scheme per variant so dev/preview/production builds don't steal each other's links.
  // Must stay a single string: the expo-sharing extension opens `<scheme>://expo-sharing`.
  scheme: v.scheme,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: v.id,
    supportsTablet: true,
    infoPlist: { NSLocationWhenInUseUsageDescription: LOCATION_COPY, ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: v.id,
    adaptiveIcon: {
      backgroundColor: '#FFE9E2',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/favicon.png',
    name: 'Travyy',
    shortName: 'Travyy',
    themeColor: '#FF5A36',
    backgroundColor: '#FAF7F2',
  },
  plugins: [
    'expo-router',
    'expo-web-browser',
    // Keeps the signed-in session in the iOS Keychain / Android Keystore.
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: LOCATION_COPY }],
    // Phone map: MapLibre Native + OpenFreeMap tiles. Free, no API key or billing account.
    '@maplibre/maplibre-react-native',
    // "Share to Travyy" from Instagram, TikTok, YouTube, Google Maps or any browser.
    // Needs a development/EAS build (share extensions can't run in Expo Go).
    [
      'expo-sharing',
      {
        ios: {
          enabled: true,
          appGroupId: `group.${v.id}`,
          activationRule: { supportsText: true, supportsWebUrlWithMaxCount: 1 },
        },
        android: { enabled: true, singleShareMimeTypes: ['text/plain'] },
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#FAF7F2',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#16130F' },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appVariant: variant,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
