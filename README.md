# Travyy

**Turn travel reels into real trips.** Paste an Instagram Reel, TikTok, YouTube or Google Maps link. Travyy finds every place mentioned, pins it on your map, and turns a city's saves into a day-by-day walking plan.

One codebase for **iOS, Android and web** (Expo SDK 58 · React Native 0.88 · React 19 · TypeScript).

- Product research and go-to-market: [`docs/RESEARCH.md`](docs/RESEARCH.md)
- Architecture and technical decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Quick start

Requires Node 22 (see `.nvmrc`).

```bash
npm install
```

```bash
npm start
```

Then press `w` for the web app, `a` for Android, `i` for the iOS simulator, or scan the QR code with **Expo Go**. On first launch, choose **"Start with sample spots"** to explore with Lisbon and Kyoto data.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Dev server (web, iOS, Android) |
| `npm run web` | Dev server, opening the web app |
| `npm run build:web` | Production web build into `dist/` (static, deploy anywhere) |
| `npm run check` | Typecheck + lint + format check + tests (what CI runs) |
| `npm test` / `npm run test:watch` | Jest + React Native Testing Library |
| `npm run format` | Prettier |
| `npm run doctor` | `expo-doctor` dependency/config diagnostics |

## Features

- **Save from any link:** Instagram, TikTok, YouTube, Google Maps, or a pasted caption or place name, with a review step before anything is saved.
- **Map of everything you've saved:** category-coloured pins and city filters. On desktop and tablets you get a split list + map layout.
- **Saves list:** grouped by city, with search, category filters, "hide visited" and "sort by nearest".
- **Auto trip planner:** groups spots by neighbourhood into balanced days and orders each day as a walking route, then hands off to Google Maps.
- **Saved spots nearby:** a banner when you're close to something you saved.
- **Visited tracking, visit-rate stats and a travel-personality card.**
- **Share trips** as text with map links (native share sheet, Web Share API, or clipboard).
- **Light and dark mode**, accessible labels and roles, responsive layouts.
- **Local-first:** works without an account. Data is validated and versioned on the device.

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Travyy API for AI extraction (optional; without it extraction runs on-device) |
| `EXPO_PUBLIC_MAP_STYLE_URL` | MapLibre style for the web map (defaults to OpenFreeMap, free, no key) |
| `APP_VARIANT` | `development` / `preview` / `production`: app name, bundle ID and scheme, so builds install side by side |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Required for Android **release** builds (Expo Go doesn't need it) |

`EXPO_PUBLIC_*` values are bundled into the app. Never put secrets in them.

## AI extraction API (optional)

```bash
cd server && npm install
```

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

Point the app at it (use your computer's LAN IP when testing on a phone):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npm start
```

`POST /extract` takes `{ "url"?: string, "text"?: string }` and returns `{ caption, places: Candidate[] }`. The server runs TypeScript directly on Node 22 (`node src/index.ts`) and ships with a `Dockerfile`. If it's unreachable, the app falls back to on-device extraction.

## Building and releasing

EAS profiles are in `eas.json` (`preview` for internal testers, `production` for the stores):

```bash
npx eas-cli@latest build --profile preview --platform all
```

The web app is a static SPA: `npm run build:web`, then deploy `dist/` to any static host (EAS Hosting, Vercel, Netlify, Cloudflare Pages).

## Roadmap (next)

1. **Native share extension** (share straight from Instagram/TikTok). Needs a development build: add `expo-dev-client` and `expo-share-intent`, and route shared URLs to `/add?url=…`.
2. **Billing:** RevenueCat behind `useEntitlements()` (the paywall UI is built; purchases are in demo mode).
3. **Accounts and cloud sync** (Supabase), and with them a move from AsyncStorage to SQLite.
4. **Crash reporting and analytics:** Sentry and PostHog behind the existing `logger`/`track` seams.
