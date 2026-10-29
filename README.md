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

Then press `w` for the web app. On first launch, choose **"Start with sample spots"** to explore with Lisbon and Kyoto data.

On a phone there are two options:

- **Quick look (Expo Go):** run `npm run start:go` and scan the QR code with Expo Go. Everything works except "Share to Travyy", because Expo Go can't include share extensions.
- **Full app (development build):** build once with EAS (below), install it on your phone, then `npm start` and scan the QR code with the Travyy (Dev) app. Rebuild only when native dependencies or `app.config.ts` change.

### Troubleshooting

**`Unable to resolve "react-native-web/dist/index"`** (or any "Unable to resolve" error after pulling): your `node_modules` is older than the code. Run `npm install`. `npm start` / `npm run web` now check this for you and stop with a clear message. If it still fails, make sure you're on the latest code (`git pull`) in the folder you're running.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Dev server for the web app and development builds |
| `npm run start:go` | Dev server for Expo Go (no share extension) |
| `npm run web` | Dev server, opening the web app |
| `npm run build:web` | Production web build into `dist/` (static, deploy anywhere) |
| `npm run check` | Typecheck + lint + format check + tests (what CI runs) |
| `npm test` / `npm run test:watch` | Jest + React Native Testing Library |
| `npm run format` | Prettier |
| `npm run doctor` | `expo-doctor` dependency/config diagnostics |

## Features

- **Share to Travyy:** tap Share in Instagram, TikTok, YouTube, Google Maps or a browser and pick Travyy. The app opens straight into place extraction. Uses `expo-sharing`'s iOS share extension and Android share intent, plus a Web Share Target when the web app is installed. A share that arrives before onboarding is held and delivered right after.
- **Save from any link:** paste an Instagram, TikTok, YouTube or Google Maps link, a caption, or a place name, with a review step before anything is saved.
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

EAS profiles are in `eas.json`:

| Profile | For | Install as |
|---|---|---|
| `development` | Day-to-day work with the dev server (includes the share extension) | Travyy (Dev) |
| `preview` | Internal testers, release-mode build | Travyy (Preview) |
| `production` | App Store / Play Store | Travyy |

```bash
npx eas-cli@latest build --profile development --platform android
```

iOS builds need an Apple Developer account. EAS registers the app group the share extension uses (`group.<bundle id>`) automatically.

### Testing "Share to Travyy" on a phone

1. Install a `development` (or `preview`) build. The share extension doesn't exist in Expo Go.
2. In TikTok: Share → More (Android) or "…" (iOS) → **Travyy**. The app opens and finds the places from the caption.
3. In Instagram: Share → **Travyy**. Instagram doesn't expose captions, so the app keeps the link and asks you to paste the caption or place names.
4. iOS only: the first time, you may need to tap "More" in the share sheet and enable Travyy.

The web app is a static SPA: `npm run build:web`, then deploy `dist/` to any static host (EAS Hosting, Vercel, Netlify, Cloudflare Pages).

## Roadmap (next)

1. **Instagram captions:** read reel captions server-side so Instagram shares work without pasting (see the decision in `docs/ARCHITECTURE.md`).
2. **Billing:** RevenueCat behind `useEntitlements()` (the paywall UI is built; purchases are in demo mode).
3. **Accounts and cloud sync** (Supabase), and with them a move from AsyncStorage to SQLite.
4. **Crash reporting and analytics:** Sentry and PostHog behind the existing `logger`/`track` seams.
