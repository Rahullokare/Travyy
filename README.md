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

- **Quick look (Expo Go):** run `npm run start:go` and scan the QR code with Expo Go. Everything works except "Share to Travyy" and the map, because Expo Go can't include their native code. The map shows a placeholder there.
- **Full app (development build):** build once with EAS (below), install it on your phone, then `npm start` and scan the QR code with the Travyy (Dev) app. Rebuild only when native dependencies or `app.config.ts` change.

### Troubleshooting

**`Unable to resolve "react-native-web/dist/index"`** (or any "Unable to resolve" error after pulling): your `node_modules` is older than the code. Run `npm install`. `npm start` / `npm run web` now check this for you and stop with a clear message. If it still fails, make sure you're on the latest code (`git pull`) in the folder you're running.

**EAS build fails at "Install dependencies" with `Missing: @emnapi/core@… from lock file`:** your `package-lock.json` was rewritten by npm 11.6.1 or 11.6.2, which have a bug that drops packages from it. EAS uploads your local files, so the broken lockfile went with it. Update npm (`npm install -g npm@11`), restore the lockfile (`git checkout -- package-lock.json`), then run `npm install` again. The repo now refuses those two npm versions (`.npmrc` + `engines`), so this can't happen silently again.

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
- **Map of everything you've saved:** category-coloured pins and city filters, on MapLibre with free OpenFreeMap tiles everywhere (no Google key). On desktop and tablets you get a split list + map layout.
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

`EXPO_PUBLIC_*` values are bundled into the app. Never put secrets in them.

## Travyy API (optional, recommended)

The server reads captions the device can't (Instagram, and any link from the web app) and extracts places with AI: **Gemini** (free tier), then **Groq** (free tier) if Gemini fails or is rate-limited, then **Claude** (paid, optional). Set the key for any of them; providers without a key are skipped, and `AI_PROVIDERS` changes the order.

```bash
cd server && npm install
```

```bash
GEMINI_API_KEY=... GROQ_API_KEY=... npm run dev
```

Point the app at it (use your computer's LAN IP when testing on a phone):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npm start
```

| Endpoint | Body | Returns |
|---|---|---|
| `POST /extract` | `{ "url"?, "text"? }` | `{ caption, places: Candidate[] }`. Reads the caption, then extracts places with the first AI provider that answers. Returns 503 when no AI key is set, 429 when every provider is rate-limited |
| `POST /caption` | `{ "url" }` | `{ caption, source }`. Caption only, no AI needed |
| `GET /health` | | `{ ok: true, ai }`. `ai` says whether `/extract` is available; the app remembers it and skips `/extract` when it isn't |

The server runs TypeScript directly on Node 22 (`node src/index.ts`) and ships with a `Dockerfile`; run its tests with `npm test`. If AI extraction fails, the app asks `/caption` and extracts on-device. If the server is unreachable, the app still works for everything except Instagram captions.

**Instagram captions** come from Instagram's public embed page. The phone reads it first; the server is the fallback (and the only path for the web app). This is unofficial: it can break when Instagram changes the page, and automated access may conflict with Instagram's terms. Set `INSTAGRAM_CAPTIONS=off` to turn off the server path. In the `caption_lookup` log lines, `outcome` says why a lookup found nothing (`login_wall`, `no_post_data`, `no_caption`, `http_429`…). See `docs/ARCHITECTURE.md` (9b).

## Free deployment: API on Render + Android APK

Everything below is free: Render's free web service, EAS Build's free plan, OpenFreeMap tiles, OpenStreetMap geocoding, and Gemini and Groq's free AI tiers. Claude is the only paid piece, and it's optional.

### 1. Deploy the API on Render (free)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, then pick this repository. Render reads [`render.yaml`](render.yaml) and creates a free `travyy-api` web service from `server/`.
3. When it's live, open `https://<your-service>.onrender.com/health`. It should show `{"ok":true}`.
4. If your URL isn't exactly `https://travyy-api.onrender.com`, put your URL in `EXPO_PUBLIC_API_URL` in [`eas.json`](eas.json) (all three profiles).

Free services sleep after about 15 idle minutes and take 30–60 s to wake. The app pings `/health` when it opens, waits up to 90 s for the server, and tells the user when it's waking up. For free AI extraction, create keys at [Google AI Studio](https://aistudio.google.com/apikey) and [Groq](https://console.groq.com/keys) and set `GEMINI_API_KEY` and `GROQ_API_KEY` in the Render dashboard (one is enough; both gives a fallback). Free tiers have per-minute and per-day limits; when they run out, the app parses on the phone for that request. Google may use Gemini free-tier requests to improve its products, so mention it in your privacy policy. Without any key, Instagram captions still work and places are extracted on the phone.

### 2. Build the APK (free)

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

`init` creates the EAS project and prints its id, then says it can't write to `app.config.ts`. That message is expected: EAS can't edit a dynamic config. Put the id in `EAS_PROJECT_ID` in [`app.config.ts`](app.config.ts). This repo is already linked to `@rahullokare77/travyy`, so skip `init` here. Then build:

```bash
npx eas-cli@latest build --profile preview --platform android
```

When the build finishes, EAS shows a download link and QR code for the `.apk`. Open it on your phone and install it (allow "install unknown apps" for your browser). The app installs as **Travyy (Preview)**.

## Building and releasing

EAS profiles are in `eas.json`:

| Profile | For | Install as |
|---|---|---|
| `development` | Day-to-day work with the dev server (includes the share extension) | Travyy (Dev) |
| `preview` | Internal testers, release-mode **APK** | Travyy (Preview) |
| `production` | App Store / Play Store | Travyy |

```bash
npx eas-cli@latest build --profile development --platform android
```

iOS builds need an Apple Developer account. EAS registers the app group the share extension uses (`group.<bundle id>`) automatically.

### Testing "Share to Travyy" on a phone

1. Install a `development` (or `preview`) build. The share extension doesn't exist in Expo Go.
2. In TikTok: Share → More (Android) or "…" (iOS) → **Travyy**. The app opens and finds the places from the caption.
3. In Instagram: Share → **Travyy**. The phone reads the reel's caption (the server tries too if the phone can't). For private posts, the app keeps the link and asks you to paste the caption.
4. iOS only: the first time, you may need to tap "More" in the share sheet and enable Travyy.

The web app is a static SPA: `npm run build:web`, then deploy `dist/` to any static host (EAS Hosting, Vercel, Netlify, Cloudflare Pages).

## Roadmap (next)

1. **Paid hosting when usage grows:** a paid Render instance (no sleeping), plus Claude or a paid Gemini tier when the free AI limits run out.
2. **Billing:** RevenueCat behind `useEntitlements()` (the paywall UI is built; purchases are in demo mode).
3. **Accounts and cloud sync** (Supabase), and with them a move from AsyncStorage to SQLite.
4. **Crash reporting and analytics:** Sentry and PostHog behind the existing `logger`/`track` seams.
