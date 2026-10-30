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
server/         Node API: AI extraction (Gemini / Groq / Claude) + geocoding
```

**Dependency direction:** `app → features → shared/store/domain`. Features may import other features' public pieces (a component, a pure function), but nothing in `shared/` imports from `features/`. One file crosses into `server/`: `server/src/instagramEmbed.ts`, the Instagram embed-page parser (9b). It has no imports and no Node or React Native APIs, so both projects compile it; keep it that way. Business logic lives in plain functions (`planner.ts`, `parseCaption.ts`, `links.ts`, `share.ts`), not in components, so it can be unit-tested without rendering.

## Decisions

Each decision below records what we chose and why, so later changes are deliberate.

### 1. Expo managed workflow + Expo Router
Continuous Native Generation (no checked-in `ios/`/`android/`), EAS for builds, OTA updates and store submission. File-based routing gives deep links for free. That matters because `travyy://add?url=…` is how the share extension will hand links to the app.

### 2. One `<Map>` API, MapLibre everywhere
`src/shared/map` exposes one component and one imperative handle (`fitTo`, `centerOn`), so screens never branch on platform.

- **Web:** `Map.web.tsx` uses **MapLibre GL JS 5**. It's pinned to v5 because v6 loads its web worker via `import.meta.url`, which Metro doesn't support.
- **iOS/Android:** `MapLibreNative.tsx` uses **MapLibre Native** (`@maplibre/maplibre-react-native` 11).
- **Same tiles everywhere:** free OpenFreeMap vector tiles and the same style, with no API key and no billing account. This replaced `react-native-maps`: its Android build needs a Google Maps key, and Google normally requires a billing account to issue one. The original reason for leaving it was that it has no web support at all.
- **Expo Go:** MapLibre looks up its native modules the moment it's imported, so `Map.tsx` loads it only when `MLRNMapViewModule` is registered. In Expo Go it renders a placeholder instead of crashing.
- **Guardrail:** ESLint forbids importing either MapLibre package outside `src/shared/map`.

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

### 9. Development builds for daily work, Expo Go for quick looks
The share extension is native code, which Expo Go can't load, so the project now includes `expo-dev-client` and an EAS `development` profile. `npm start` targets development builds; `npm run start:go` still serves Expo Go, where everything except "Share to Travyy" and the map works. Native code that might be missing at runtime (the share inbox, the map) is wrapped so the app degrades gracefully there.

### 9a. "Share to Travyy": one entry point for every platform
- **Library:** Expo's own `expo-sharing` (SDK 58), not a third-party share-intent package. Its config plugin generates the iOS share extension and the Android `SEND` intent filter (`text/plain`); both hand off by opening `<scheme>://expo-sharing`.
- **One route:** `src/app/expo-sharing.tsx` reads what was shared (`readIncomingShare`, which has a `.web.ts` variant that reads Web Share Target query params). It turns the payload into `{ url, text }`, stripping share-sheet boilerplate and tracking params, then replaces itself with `/add`. The existing capture flow extracts from there, so native, web and deep links share one pipeline.
- **Scheme must be a single string per variant** (`travyy-dev`, `travyy-preview`, `travyy`). The plugin writes it into the extension's Info.plist and Android strings; an array produces an invalid scheme and the extension crashes.
- **Shares before onboarding** are held in an in-memory inbox and delivered from the tabs layout once onboarding is done. Pushing from the root layout lost the share: the protected-route switch resets navigation at that moment. The end-to-end test caught this.
- **Caption sources:** TikTok and YouTube oEmbed, with TikTok short links resolved on native. Instagram is read on the phone, with the server as fallback (9b). If neither can read it, the app keeps the link and asks for the caption.

### 9b. Instagram captions from the embed page (server-side)
*Decided 2026-10-29, at the product owner's request, knowing the trade-offs below.*

Instagram has no public caption API, and post pages require login. The embed page (`/p/<shortcode>/embed/captioned/`), which Instagram serves so public posts can be embedded on other sites, includes the caption. `server/src/instagramEmbed.ts` parses it; the phone (`src/features/capture/api/instagram.ts`) and the server (`server/src/instagram.ts`) both fetch it.

- **Risks accepted:** it's unofficial. It can break without notice when Instagram changes the page, and automated access may conflict with Instagram's terms.
- **Guardrails:**
  - public posts only, with no login or cookies
  - an honest `Travyy/1.0` User-Agent, never a browser's (since 2026-10 Instagram answers a fake desktop-browser User-Agent with an error page, which showed up as `no_post_data` on phones too)
  - 24h cache, plus a 30-min negative cache for failures
  - outbound requests serialised with a gap and an 8s timeout
  - `INSTAGRAM_CAPTIONS=off` turns it off instantly
  - caption text is never logged
- **Resilient parsing:** three strategies, tried in order: embedded JSON (including JSON nested in strings), the rendered caption block, then description meta. Fixture tests cover each.
- **Monitoring:** each server lookup logs `caption_lookup` with the strategy that matched (`source`), or, when nothing matched, the `outcome`: `login_wall`, `no_post_data` (a page without the post, typical of a blocked IP), `no_caption`, `http_<status>`, `timeout` or `network_error`, plus `status`, `bytes` and `cached`. A drift from `embed-json` to `embed-html` is the early warning that the format is changing; `no_caption` on posts that do have captions means the parser needs a new strategy.
- **Phone first, server as fallback** *(revised 2026-10-29 after the first device test)*. The first version read captions only on the server, reasoning that requests from many phones would look like abuse and couldn't be switched off. On Render, every lookup came back without a caption: Instagram commonly refuses cloud-server IPs. A phone makes one request when its user shares a post they just watched, which is what any site embedding the post causes, and that's a better pattern than one server IP making everyone's requests. The server stays the fallback (and the only path on web, where CORS blocks the request), so Instagram works even without Claude.
- **Switching it off:** `INSTAGRAM_CAPTIONS=off` stops the server path. The phone path ships with the app; turning it off needs an app update (or EAS Update, once set up).
- **If it breaks for good:** fall back to the paste flow (already in place). Then consider the official Instagram Graph API's oEmbed (needs a Meta app review), or understanding the video itself (transcription and on-screen text).

### 10. Observability seams
`logger` and typed `track()` analytics are the only places errors and events leave the app. Adding Sentry or PostHog means changing one function body; call sites stay the same. Analytics events are a typed union, so every event sends the properties the funnel in `RESEARCH.md` needs.

### 11. Free-tier limits behind `useEntitlements()`
Screens ask `canSave(n)` / `canCreateTrip`; they never read `isPro` directly. RevenueCat replaces the local flag in one file.

### 12. API server: zero-build TypeScript on Node 22
Node 22.18+ strips TypeScript types natively, so `node src/index.ts` runs in production (see the Dockerfile) with no compile step. Requests are validated with zod, CORS is allow-listed via `ALLOWED_ORIGINS`, logs are structured JSON, and the server shuts down gracefully on SIGTERM. Rate limiting is in-memory (single instance); move it to Redis when scaling out.

### 13. Free hosting first (Render), designed for its limits
The API runs on Render's free web service, defined in `render.yaml` (Node runtime, so there's no Docker step; Node 22 runs the TypeScript directly).
- **Sleeping server:** free services sleep after ~15 idle minutes and take 30–60 s to wake. The app pings `/health` on launch and on return to the foreground (`useWarmUpApi`), allows up to 90 s for server calls, and explains the wait in the UI after 8 s.
- **AI is optional:** `/extract` answers 503 when no AI key is set and the app extracts on-device, while `/caption` (Instagram) keeps working. `/health` reports `ai`, and the app remembers it (`apiStatus.ts`), so it doesn't wake a sleeping server just to be told no.
- **Instagram refuses Render's IP:** confirmed in the first device test, so phones read Instagram captions themselves (9b) and the server is only the fallback.
- **Move to paid hosting** (no sleep) when real users arrive. The server and app code don't change; only the plan does.

### 14. AI extraction: a chain of providers, free ones first
*Decided 2026-10-30.* `/extract` used to call Claude only, which costs money, so the free deployment had no AI. Now `server/src/extract.ts` runs a chain of `PlaceExtractor`s (`server/src/ai/`): **Gemini** (free tier), then **Groq** (free tier), then **Claude** (paid, optional). A provider without its key is skipped; `AI_PROVIDERS` sets the order.
- **One prompt and schema for all** (`ai/shared.ts`). Every reply is parsed with the same zod schema, so a provider that returns malformed JSON counts as a failure and the next one is tried, instead of bad data reaching the app.
- **Gemini and Groq over plain `fetch`**, no SDKs: two small REST calls, and the server stays at two dependencies. Model IDs are env vars (`GEMINI_MODEL`, `GROQ_MODEL`) because free-tier models change often.
- **An empty list is an answer**, not a failure: a caption with no places shouldn't use up the next provider's quota.
- **Busy means 429:** when every provider failed and at least one was rate-limited, `/extract` answers 429. Not 503, which the app reads as "this server has no AI" and remembers.
- **Privacy:** Google may use Gemini free-tier requests to improve its products. Captions come from public posts, but the privacy policy has to say so. A paid tier removes this.
- **Cover images** *(added 2026-10-30)*: many reels name their places only on screen. Caption lookups also return the post's cover (oEmbed `thumbnail_url`, Instagram's `display_url`, `og:image`), and an Instagram location tag is added to the caption as a "📍 Name" line, which the phone's rules read too. The phone reads Instagram's embed page, which the server usually can't, so it sends the cover as `imageUrl`; the server accepts that only from Instagram, TikTok and YouTube CDN hosts (`images.ts`), so callers can't make it fetch arbitrary URLs. To save free image quota, a caption under 200 characters goes with the cover, and a longer one goes alone, retried with the cover only if it finds nothing. Providers marked `vision: false` (Groq) get the caption alone and are skipped when there is no caption.
- **Video** *(added 2026-10-30)*: when the caption is weak or finds nothing, providers marked `video: true` (Gemini) watch the post before the cover is tried. Public YouTube links (watch, Shorts, youtu.be) go to Gemini as a link, which it fetches itself; YouTube's oEmbed gives only the title, so this is where YouTube results come from. Instagram reels: the embed page's `video_url` (read by the phone, like the cover) is downloaded on the server (MP4/MOV/WebM, ≤12 MB) and sent inline. A provider that watched the video is trusted even when it finds nothing; a failure (bad link, private video, quota) is logged and the cover/text path runs, so video can't make extraction worse. TikTok videos aren't read: getting the file means scraping its web page. `VIDEO_EXTRACTION=off` is the kill switch.

## Quality gates

`npm run check` = typecheck + ESLint + Prettier + Jest. CI (`.github/workflows/ci.yml`) runs that **and bundles web, Android and iOS** on every push, so platform-resolution errors like the original web failure are caught before anyone runs the app.

**One toolchain everywhere:** local, CI and EAS all install with `npm ci` from the same lockfile. The lockfile is written by current npm 11 (11.21); EAS builds pin Node 22.22.0 (a `base` profile in `eas.json`), whose npm 10.9 installs from it unchanged, as CI does. `.npmrc` turns on `engine-strict` and `package.json` excludes npm 11.6.1–11.6.2: those versions silently drop `@emnapi/*` from the lockfile, which broke the first EAS build.

Tests live next to the code in `__tests__/`: pure logic (parser, link parsing, planner, geo), the store (dedupe, trip cleanup, persisted-state validation), the extraction pipeline with mocked network, and components via React Native Testing Library.
