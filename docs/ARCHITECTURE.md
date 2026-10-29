# Architecture

Travyy is one TypeScript codebase that ships to **iOS, Android and the web** (Expo SDK 58, React Native 0.88, React 19), plus a small Node API in `server/`.

## Layout

```
src/
  app/          Routes only (Expo Router). Each file is a thin wrapper that renders a feature screen.
  features/     Product features. Each owns its screens, components, API calls and pure logic.
    capture/      link/caption → candidate places (parser, link parsing, geocoding, AI client)
    places/       saved places: list, detail, categories, map markers
    explore/      the map tab
    trips/        trip planner (clustering + routing), trip screens, sharing
    profile/      stats
    onboarding/   first-run flow + sample data
    paywall/      plans, free-tier limits (entitlements)
  shared/       Feature-agnostic building blocks
    ui/           design-system components (Text, Button, Chip, Card, TextField, Screen…)
    theme/        tokens (light + dark), makeStyles, theme provider
    map/          <Map> with native (Map.tsx) and web (Map.web.tsx) implementations
    lib/          platform adapters, geo math, http, logger, analytics, hooks
    config/       validated runtime env
    query/        React Query client
  store/        Zustand store (persisted, versioned, validated) + selectors
  domain/       Domain models as zod schemas (types + runtime validation)
server/         Node API: Claude extraction + geocoding
```

**Dependency direction:** `app → features → shared/store/domain`. Features may import other features' public pieces (a component, a pure function), but nothing in `shared/` imports from `features/`. Business logic lives in plain functions (`planner.ts`, `parseCaption.ts`, `links.ts`, `share.ts`), not in components, so it can be unit-tested without rendering.

## Decisions

Each decision below records what we chose and why, so later changes are deliberate.

### 1. Expo managed workflow + Expo Router
Continuous Native Generation (no checked-in `ios/`/`android/`), EAS for builds, OTA updates and store submission. File-based routing gives deep links for free. That matters because `travyy://add?url=…` is how the share extension will hand links to the app.

### 2. One `<Map>` API, two engines
`react-native-maps` (Apple Maps / Google Maps) has no web support, which is why the first web build failed. `src/shared/map` exposes one component and one imperative handle (`fitTo`, `centerOn`). Metro picks `Map.web.tsx` on web, which uses **MapLibre GL JS 5** with free OpenFreeMap vector tiles (no API key). We pinned v5 because v6 loads its web worker via `import.meta.url`, which Metro does not support. An ESLint rule forbids importing `react-native-maps` anywhere else.

*Revisit:* `expo-maps` once we need a development build anyway (see 9).

### 3. Platform adapters instead of `Platform.OS` checks in screens
`Alert`, `Share` and haptics silently do nothing on web. `src/shared/lib/platform.ts` provides `confirm`, `notify`, `shareText`, `haptics`, `openInMaps` and `openUrl`, each correct per platform. ESLint blocks the raw APIs outside that file.

### 4. State: Zustand for app data, React Query for network
- **Zustand + persist (AsyncStorage)** holds places and trips. AsyncStorage is backed by SQLite on Android, files on iOS and localStorage on web, so one store works everywhere. The store is **versioned** (`version`, `migrate`), and every persisted record is **validated with zod on load**: a corrupt record is dropped and logged instead of crashing the app.
- **React Query** handles extraction and geocoding: loading and error states, cancellation, retries.
- *Revisit:* move to SQLite (expo-sqlite + Drizzle) when we add cloud sync (Supabase), or when a user has thousands of saves.

### 5. Domain models are zod schemas
`src/domain/models.ts` defines `Place`, `Trip` and `Candidate` once. The same definitions give TypeScript types, persisted-state validation and API response validation. The backend response is parsed with `CandidateSchema`, so a server bug can't put bad data into the store.

### 6. Styling: StyleSheet + typed tokens + `makeStyles`
There's no styling library to lock into. `makeStyles((theme) => ({…}))` creates a StyleSheet once per theme and caches it, which gives static-StyleSheet performance with **dark mode**. Colours, spacing and typography live in `shared/theme/tokens.ts`. All text goes through `<Text variant color>`.

### 7. Responsive by default
`useLayout().isWide` (≥900px) switches the map and trip screens to a split list+map layout on tablets and desktop web. Content screens cap their width at 720px.

### 8. IDs are UUIDs (`expo-crypto`)
They're stable across devices, so records sync to a backend later without remapping.

### 9. Expo Go now, development build soon
Everything today runs in Expo Go, so anyone can open the app on a phone in seconds. The share extension (the #1 roadmap item) needs native code. When it lands, add `expo-dev-client` and an EAS `development` profile, and switch the team to development builds.

### 10. Observability seams
`logger` and typed `track()` analytics are the only places errors and events leave the app. Adding Sentry or PostHog means changing one function body; call sites stay the same. Analytics events are a typed union, so every event sends the properties the funnel in `RESEARCH.md` needs.

### 11. Free-tier limits behind `useEntitlements()`
Screens ask `canSave(n)` / `canCreateTrip`; they never read `isPro` directly. RevenueCat replaces the local flag in one file.

### 12. API server: zero-build TypeScript on Node 22
Node 22.18+ strips TypeScript types natively, so `node src/index.ts` runs in production (see the Dockerfile) with no compile step. Requests are validated with zod, CORS is allow-listed via `ALLOWED_ORIGINS`, logs are structured JSON, and the server shuts down gracefully on SIGTERM. Rate limiting is in-memory (single instance); move it to Redis when scaling out.

## Quality gates

`npm run check` = typecheck + ESLint + Prettier + Jest. CI (`.github/workflows/ci.yml`) runs that **and bundles web, Android and iOS** on every push, so platform-resolution errors like the original web failure are caught before anyone runs the app.

Tests live next to the code in `__tests__/`: pure logic (parser, link parsing, planner, geo), the store (dedupe, trip cleanup, persisted-state validation), the extraction pipeline with mocked network, and components via React Native Testing Library.
