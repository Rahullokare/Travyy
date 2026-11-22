# Travyy

**The group trip app: from the reel in the group chat to the last rupee settled.** Share an Instagram Reel, TikTok, YouTube or Google Maps link. Travyy finds every place mentioned, pins it on your map, turns a city's saves into a day-by-day walking plan you can send as a link, and splits the trip's costs.

One codebase for **iOS, Android and web** (Expo SDK 58 · React Native 0.88 · React 19 · TypeScript).

- Product research and go-to-market: [`docs/RESEARCH.md`](docs/RESEARCH.md)
- Architecture and technical decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Backend, database and scaling guide: [`docs/BACKEND.md`](docs/BACKEND.md)

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
- **Saves vault:** countries, then cities, then spots grouped by category, so a hundred saves is still a short screen. Search at every level ignores accents and word order ("cafe goa"); in a city you can sort by nearest and hide visited.
- **Your vaults:** make collections like "Cafés to try" or "Goa weekend", each with its own map, a visited progress bar and one-tap trip planning. Pick a vault while saving from a reel, and ❤ spots to fill the Liked vault.
- **Share a vault:** send a copy as a link that opens on a map in any browser, or invite friends to build it together, with everyone's spots synced to everyone's phone.
- **Auto trip planner:** groups spots by neighbourhood into balanced days and orders each day as a walking route, then hands off to Google Maps.
- **Saved spots nearby:** a banner when you're close to something you saved.
- **Visited tracking, visit-rate stats and a travel-personality card.**
- **Share a trip as a link** that opens on a map in any browser, with one tap to add it to the visitor's own Travyy. No account or server involved: the plan travels inside the link. Falls back to text with map links.
- **Split costs** per trip in any currency, offline, with no limits (see `docs/ARCHITECTURE.md`, 16).
- **Book ahead:** partner links for tickets, tours and stays on saved places and trips, labelled as such.
- **Plans:** saving, splitting and sharing are free without limits; the free plan includes 15 AI imports a month and one planned trip; Trip Pass and Pro lift those. Purchases run in preview mode until store billing is connected.
- **Light and dark mode**, accessible labels and roles, responsive layouts.
- **Local-first:** works without an account. Data is validated and versioned on the device.

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Travyy API for AI extraction (optional; without it extraction runs on-device) |
| `EXPO_PUBLIC_MAP_STYLE_URL` | MapLibre style for the web map (defaults to OpenFreeMap, free, no key) |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project for sign-in (optional; without them the app has no accounts). The anon key is public by design; never use the `service_role` key |
| `EXPO_PUBLIC_WEB_URL` | Where the web build is hosted, so phones can share a trip as a link (optional; without it phones share text) |
| `EXPO_PUBLIC_GYG_PARTNER_ID`, `EXPO_PUBLIC_BOOKING_AID` | GetYourGuide and Booking.com partner IDs for booking links (optional; links work without them, unpaid) |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | PostHog project for product analytics (optional; off without a key) |
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
| `POST /extract` | `{ "url"?, "text"?, "imageUrl"?, "videoUrl"? }` | `{ caption, places: Candidate[] }`. Reads the caption, then extracts places with the first AI provider that answers. When the caption is short or finds nothing, Gemini watches the video (public YouTube links directly, Instagram reel clips), then the cover image is tried. `imageUrl`/`videoUrl` are what the phone read (Instagram/TikTok/YouTube CDNs only). `VIDEO_EXTRACTION=off` turns video off. Returns 503 when no AI key is set, 429 when every provider is rate-limited |
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

## Branches and pull requests

| Branch | What it is | Builds from it |
|---|---|---|
| `develop` | Default branch. All work is merged here through pull requests | EAS `preview` (test APKs) |
| `main` | What's released. Only updated by merging `develop` into it when shipping | EAS `production` (stores) |

Everything else is a short-lived branch cut from `develop`, opened as a PR into `develop`, and deleted once merged. Name it `type/short-description`, lower case with hyphens:

| Type | For | Example |
|---|---|---|
| `feature/` | New features and improvements | `feature/apple-sign-in` |
| `fix/` | Bug fixes | `fix/vault-delete-navigation` |
| `chore/` | Dependencies, tooling, CI, config | `chore/update-expo-packages` |
| `docs/` | Documentation only | `docs/backend-setup` |

```bash
git switch develop && git pull
```

```bash
git switch -c feature/short-description
```

To release, open a PR from `develop` into `main`, merge it, then build with `--profile production` from `main`. A fix needed in a release goes into `develop` first, then into `main` the same way. CI runs on every pull request and on pushes to `develop` and `main`.

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

1. **Store billing:** a RevenueCat provider behind `features/paywall/billing.ts` (the plans, paywall and limits are built; purchases are in preview mode and refuse to run in production builds).
2. **Live group trips:** Supabase tables with row-level security, so a shared link becomes a shared space where everyone adds spots and costs. Then voting on spots.
3. **Partner accounts:** apply to the GetYourGuide and Booking.com programmes and set the two IDs.
4. **Paid hosting when usage grows:** a paid Render instance (no sleeping), plus a paid AI tier when the free limits run out.
5. **Crash reporting** (Sentry behind `logger`) and **nearby alerts** in the background.
