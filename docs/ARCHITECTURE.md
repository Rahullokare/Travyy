# Architecture

Travyy is one TypeScript codebase that ships to **iOS, Android and the web** (Expo SDK 58, React Native 0.88, React 19), plus a small Node API in `server/`.

## Layout

```
src/
  app/          Routes only (Expo Router). Each file is a thin wrapper that renders a feature screen.
  features/     Product features. Each owns its screens, components, API calls and pure logic.
    capture/      link/caption → candidate places (parser, link parsing, geocoding, AI client)
    places/       saved places: the vault (country → city → spots), search, detail, categories, map markers
    explore/      the map tab
    trips/        trip planner (clustering + routing), trip screens, sharing as text and as a link
    expenses/     splitting a trip's costs: ledger maths, Money view, expense/people/payment forms
    profile/      stats
    onboarding/   first-run flow + sample data
    paywall/      plans, what each allows (entitlements), purchases (billing)
    booking/      partner booking links for saved places and trips
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
supabase/       Postgres schema (migrations) and the tests for its security rules. See docs/BACKEND.md
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
`logger` and typed `track()` analytics are the only places errors and events leave the app. Adding Sentry means changing one function body; analytics already delivers to PostHog when configured (21). Analytics events are a typed union, so every event sends the properties the funnel in `RESEARCH.md` needs.

### 11. Plans behind `useEntitlements()`, purchases behind `billing`
*Revised 2026-11-16; see 18.* Screens ask `canCreateTrip` / `canUseAi`; they never read `isPro`. Only `features/paywall/billing.ts` writes entitlements.

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
- **Gemini and Groq over plain `fetch`**, no SDKs: two small REST calls, and the server stays at two dependencies. Model IDs are env vars (`GEMINI_MODELS`, `GROQ_MODEL`) because free-tier models change often.
- **Several Gemini models, in order** *(2026-10-30)*: on the free tier, capacity varies a lot by model. In the first live test `gemini-3.8-flash` hung or answered 503 ("high demand") to every request and `gemini-2.5-flash` was closed to new keys, while `gemini-3.5-flash-lite` and `gemini-3-flash-preview` answered in 1–6 s. The provider now tries `GEMINI_MODELS` in order (default: those two) and moves on when a model is overloaded, times out (15 s text, 30 s video) or is retired; the log line names every model that failed. `server/scripts/gemini-check.sh` times each model with a key, to pick the list.
- **Local names for the map** *(2026-10-30)*: the AI often returns English names ("25 de Abril Bridge", "Saint George's Castle") that OpenStreetMap doesn't know, so those places got no pin. It now also returns `localName` ("Ponte 25 de Abril"), and the server searches by it when the first search misses. Second searches stop after 20 s of geocoding per post, because Nominatim allows 1 request/s. Fuzzier geocoders (Photon) were rejected: they matched the wrong country rather than missing. Small venues that aren't on OpenStreetMap still get no pin.
- **An empty list is an answer**, not a failure: a caption with no places shouldn't use up the next provider's quota.
- **Busy means 429:** when every provider failed and at least one was rate-limited, `/extract` answers 429. Not 503, which the app reads as "this server has no AI" and remembers.
- **Privacy:** Google may use Gemini free-tier requests to improve its products. Captions come from public posts, but the privacy policy has to say so. A paid tier removes this.
- **Cover images** *(added 2026-10-30)*: many reels name their places only on screen. Caption lookups also return the post's cover (oEmbed `thumbnail_url`, Instagram's `display_url`, `og:image`), and an Instagram location tag is added to the caption as a "📍 Name" line, which the phone's rules read too. The phone reads Instagram's embed page, which the server usually can't, so it sends the cover as `imageUrl`; the server accepts that only from Instagram, TikTok and YouTube CDN hosts (`images.ts`), so callers can't make it fetch arbitrary URLs. To save free image quota, a caption under 200 characters goes with the cover, and a longer one goes alone, retried with the cover only if it finds nothing. Providers marked `vision: false` (Groq) get the caption alone and are skipped when there is no caption.
- **Video** *(added 2026-10-30)*: when the caption is weak or finds nothing, providers marked `video: true` (Gemini) watch the post before the cover is tried. Public YouTube links (watch, Shorts, youtu.be) go to Gemini as a link, which it fetches itself; YouTube's oEmbed gives only the title, so this is where YouTube results come from. Instagram reels: the embed page's `video_url` (read by the phone, like the cover) is downloaded on the server (MP4/MOV/WebM, ≤12 MB) and sent inline. A provider that watched the video is trusted even when it finds nothing; a failure (bad link, private video, quota) is logged and the cover/text path runs, so video can't make extraction worse. TikTok videos aren't read: getting the file means scraping its web page. `VIDEO_EXTRACTION=off` is the kill switch.

### 15. Accounts: Supabase, optional, email codes first
*Decided 2026-10-30.* Signing in is optional: every feature works without an account, and the profile screen offers it. It exists for limits per user now, and for backup and sync next.
- **Email one-time codes**, no passwords and no magic links: a code works on any device and needs no deep-link setup.
- **Google through the browser** *(added 2026-11-20)*: `signInWithOAuth` with PKCE. Phones open an auth sheet (`expo-web-browser`) that returns to `<scheme>://auth-callback`; web leaves the page and returns to `/auth-callback`, which opens the path sign-in started from (`next`, kept in sessionStorage, only paths inside the app). The one-time code is exchanged once even when Android also opens the callback route. Chosen over the native Google SDK: no per-platform client IDs or config plugin, and it works in Expo Go. The cost is a browser sheet instead of the system account picker. The button appears only when `/auth/v1/settings` says Google is on. Setup is in BACKEND.md. Apple sign-in is still to do, and the App Store requires it on iOS once Google is offered.
- **Session in secure storage:** the iOS Keychain or Android Keystore via `expo-secure-store`, split into chunks because a session can be over its 2 KB value limit (`features/auth/supabase.ts`). On web, supabase-js keeps it in localStorage. Tokens refresh only while the app is open.
- **Without Supabase config the app has no accounts.** `supabase` is undefined and the account card is hidden, the same "optional service" rule as the API.
- **The server checks tokens itself:** the project signs access tokens with ES256 and publishes the public keys, so `server/src/auth.ts` verifies them with `node:crypto` (keys cached for 10 minutes) and makes no call to Supabase per request. A missing or invalid token means an anonymous request, never an error. Signed-in requests are rate-limited per account instead of per IP.
- **Email delivery:** Supabase's built-in email only reaches the project's team members and sends a few emails an hour. Real users need custom SMTP (for example Resend's free tier). The email templates must include `{{ .Token }}` so they send a code rather than only a link.

### 16. Splitting costs: one ledger per trip, on the phone first
*Decided 2026-11-06.* A trip's shared costs live in `features/expenses` with their own persisted store (`store/ledgerStore.ts`, key `travyy-ledger-v1`). It works offline with no account; group sync comes later.
- **Separate from `Trip`:** `sanitize` drops any persisted record that fails its schema, so new required `Trip` fields could silently delete existing trips. A ledger keyed by trip id leaves them untouched, and a new expense doesn't rewrite every saved place. `removeTrip` and `reset` clear it too.
- **Money is integers** in the currency's smallest unit (`domain/money.ts`), with the ISO 4217 decimals per currency. `MAX_AMOUNT_MINOR` keeps `amount * weight` inside safe integer range.
- **Balances are always derived**, in `ledger.ts`, never stored, so an edit or delete can't leave one stale. The schema drops an expense whose payers or shares don't add up to its amount.
- **Members are names, not accounts:** friends count without installing anything. Someone with entries can't be removed. `isSelf` marks the phone's owner: the UI says "You", and shared text uses their real name.
- **One settle currency per trip,** fixed once there are entries, so balances never convert at a rate nobody saw. A cost paid in another currency keeps an `original` (amount, currency, rate, date, source) beside the trip-currency `amountMinor`.
- **Rates stay with their expense:** looked up for the expense's date when it's entered and never changed afterwards, because converting everything at today's rate is the classic complaint about Splitwise. Entering what the bank charged replaces the rate, and the amount is then exact.
- **Rate sources** (`expenses/api/rates.ts`): Frankfurter, then the jsDelivr currency API for that date, then its latest, all free with no key. Only currency codes and a date are sent. Frankfurter returned 522 errors for a while on 2026-11-04, hence the chain. A whole table for the trip's currency is saved on the phone, so a currency nobody has used yet still has a rate offline. Saved rates are marked `cached` and replaced by the real one when the trip is next opened online; expenses that were edited or deleted meanwhile are left alone.
- **Exact splits are typed in the currency paid,** checked against that total, then scaled to the trip currency by rounding the running total, so they can't drift or overflow.
- **Costs link to a stop by `placeId`, with a copy of its name.** Not by day: "Re-shuffle days" renumbers those. The copy keeps the record readable after the place is deleted. The day view looks up today's plan.
- **Rounding:** leftover units go to the largest remainders; ties rotate per expense, seeded by its id, so nobody absorbs every spare paisa.
- **Settling up** is greedy: the biggest debtor pays the biggest creditor. Finding the true minimum number of payments is NP-hard. A payment only records what happened; money moves outside the app.
- **Free:** no paywall here, since people resent caps on this and it's how the app reaches a whole group.

### 17. Visual design: one warm-neutral system, used the same way everywhere
*Decided 2026-11-07.* The redesign replaced screen-by-screen styling with rules every screen follows:
- **Colour:** warm neutrals (paper by day, charcoal by night) carry the UI, and the terracotta brand colour is reserved for the main action, the active tab and one hero per screen. Light-mode brand is `#D14318` (4.6:1 with white), dark-mode `#FF7246` with near-black text. Surfaces come in three steps, `surfaceSunken` (fields, chip and segment tracks), `surface` (cards) and `surfaceRaised` (map cards, the selected segment), so depth reads without heavy borders.
- **Type:** Plus Jakarta Sans, loaded with `useFonts` while the splash screen stays up (one name per weight works the same on Android, iOS and web). `Text` maps `fontWeight` to the matching file, so styles keep using plain weights and Android never fakes a bold. Field labels are sentence case; uppercase is kept for the rare `overline`.
- **Icons, not emoji:** categories, empty states, badges and map pins use Ionicons on a tile of the category's hue (`IconBadge`), so lists and pins look consistent on every platform.
- **Shadows:** `shadow(level)` uses CSS `boxShadow`, which renders the same soft, layered shadow on iOS, Android 9+ and web. Dark mode separates layers with lighter surfaces and hairlines instead.
- **Navigation:** the tab bar is the system one (`expo-router/native-tabs`: Material 3 on Android), so selection, ripple and scroll-to-top behave natively. Tab screens draw their own large title (`ScreenHeader`). Web keeps a JS tab bar styled to match (`(tabs)/_layout.web.tsx`). Forms open as modals that slide up on Android and close with an X.
- **Motion:** press feedback scales on the UI thread (`PressableScale`), the segmented control's pill slides between options, and there's a slow pulse while places are being found. Tabs switch instantly. Screen transitions are native. Reduce Motion removes movement and keeps fades.

### 18. Plans: meter what costs money, never the habit
*Decided 2026-11-16, from the second round of market research (`RESEARCH.md`).* Travyy is now positioned as the group trip app, so the free plan has to be generous exactly where the app spreads.
- **Never limited:** saved spots, splitting costs, sharing a trip. The old 30-save cap is gone: it punished the habit the product depends on.
- **Free:** 15 AI imports a calendar month and one planned trip. **Trip Pass** (one-off): one more trip for good, and unlimited AI imports for 30 days. **Pro:** no limits.
- **Running out of AI imports never blocks a save.** `extractPlaces(…, { ai: false })` skips the server's AI and reads the caption on the phone; the review screen says so and links to the plans. A blocked share from Instagram loses the user; a weaker result with an explanation is the upsell.
- **Trips added from a shared link** carry `shared: true` and don't count as planned trips, so receiving a friend's plan never uses up the free one.
- **All of it is one pure function,** `entitlementsOf(state, now)`, so the plans are unit-tested without rendering and can change in one file.
- **The AI count lives on the phone** (`aiImports: { month, count }`), which a determined user can reset. That's acceptable while extraction runs on free tiers; when it costs real money, the server enforces the same number per account (it already rate-limits per account).
- **Billing is a seam, not a provider yet.** `BillingProvider` (`products`, `purchase`, `restore`) has one implementation, the preview provider: it grants the plan on the device without charging, says so on the paywall, and refuses to run when `appVariant` is `production`, so a store build can never hand out Pro for free. RevenueCat goes in as a second provider (`react-native-purchases` on phones, `purchases-js` on web); it needs products in Play Console and App Store Connect first. Product ids: `pro_yearly`, `pro_monthly`, `trip_pass`.
- **Prices shown come from the provider.** The preview catalogue shows India prices when the phone's region or timezone is India and dollars otherwise; the stores localise for real.

### 19. Booking links: revenue from people who never pay
*Decided 2026-11-16.* `features/booking/offers.ts` turns a saved place or a trip's city into partner links: tickets and tours (GetYourGuide) for sights, activities and nature; prices (Booking.com) for stays; stays and things to do for a trip.
- **Plain search links with a partner id,** no SDK and no API: nothing to keep in sync, and nothing about the user is sent except the place or city name in the URL they choose to open.
- **Only where there's something to book.** Food, cafés, bars and shops get nothing. A card that's usually irrelevant trains people to ignore it.
- **Always labelled** ("Partner links. Travyy may earn a commission…"), which affiliate programmes and consumer law both require.
- **Partner ids are optional config** (`EXPO_PUBLIC_GYG_PARTNER_ID`, `EXPO_PUBLIC_BOOKING_AID`). Without them the links still work and earn nothing, so the feature ships before the partner accounts are approved.
- *Revisit:* move link building to the API when there are more partners or per-country rules, so they can change without an app release.

### 20. A trip in a link, with no backend
*Decided 2026-11-16.* Sharing a trip now includes a link, `/shared?d=…`, that opens the plan on a map in any browser, with one button to add it to the visitor's own Travyy. It's the growth loop: every organiser shows the product to their whole group.
- **The trip is inside the URL** (`features/trips/shareLink.ts`): base64url of compact JSON, about 1.5 KB for 20 stops. No account, no server, no table, nothing to expire, and it works offline once opened. Only names, coordinates and categories travel; notes and source links stay private.
- **A link is untrusted input.** It's parsed with a strict zod schema with size limits; anything else shows "This trip link didn't open".
- **Base64 and UTF-8 are written by hand** (40 lines, tested with accents, CJK and emoji) because `btoa`, `TextEncoder` and `Buffer` aren't all present on Hermes, browsers and Jest.
- **The route is open before onboarding,** like the share receiver. Adding the trip marks a new visitor as onboarded (they already have real data) and the tabs layout opens the trip once it has mounted (`importInbox.ts`), the same hand-off that shares before onboarding use. Because the route is open to everyone, the router can also fall back to it for a new visitor who opens `/`; without a `d` parameter it redirects to onboarding.
- **Phones need `EXPO_PUBLIC_WEB_URL`** (where the web build is hosted) to make a link; without it they share the text itinerary, as before. The web app uses its own address.
- **It's a copy, not a shared space.** Live group trips need sync (below). The link format has a version number so a future link can point at a synced trip instead.

### 21. Analytics delivery: PostHog over plain HTTP
*Decided 2026-11-16.* `track()` now sends to PostHog's capture endpoint when `EXPO_PUBLIC_POSTHOG_KEY` is set, with `fetch` and no SDK: nothing native, the same code on all three platforms. Events carry only their typed props (counts, categories, plan names), never a place name, link, caption or amount. The id is a random UUID kept on the device, with person profiles off. New events cover the money funnel: `paywall_viewed`, `purchase_completed`, `ai_quota_reached`, `booking_opened`, `trip_shared`, `shared_trip_opened`, `shared_trip_imported`. The privacy policy has to mention it before the key is set in a store build.

### 22. Saves are a vault: country → city → spots
*Decided 2026-11-16.* The Saves tab was one list grouped by city, which meant scrolling past everything to reach one spot once there were fifty or more. It's now three levels, the way photo libraries and file managers stay usable at any size.
- **Saves tab:** one card per country (spot and city counts, city names, visited progress), then the last few saves. A hundred spots is a screen of six cards. *(Since 25, the countries live under Vaults → Places, and the Saves tab is a grid of every save.)*
- **Country** (`/vault/[country]`): its cities as cards. A country with a single city skips this level.
- **City** (`/vault/[country]/[city]`): the spots, grouped by category, with the filters that only make sense there (nearest first, hide visited) and a shortcut to plan a trip.
- **Search at every level, scoped to that level,** and the box sits outside the list so the keyboard stays up when results replace folders. `searchSaves` (`features/places/vault.ts`) ignores accents and case, matches every word in any order across name, city, country, note and category ("cafe goa"), and ranks name matches first. Category chips on the Saves tab cut across countries the same way ("all my cafés").
- **Grouping is derived, never stored.** `groupByCountry` runs over the same `places` array, so nothing migrates and a spot whose country is fixed later moves by itself. Spots with no country sit in "Not sorted yet", last.
- **Countries are grouped by ISO code** *(added 2026-11-16)*. A save keeps `countryCode` beside the name: from the geocoder's `country_code` (phone and server), or looked up from the name when it's saved (`domain/countries.ts`: the ISO table plus the aliases captions and the AI use, such as "USA", "UK", "Türkiye"). Folders show the usual English name and the flag for that code, so "USA" and "United States", or "日本" and "Japan", are one folder. Saves made before codes existed are looked up by name each time the vault is built, so nothing is migrated. A name that isn't recognised gets its own folder under that name, with initials instead of a flag. A code that fails validation is dropped, never the place.
- **Flags are emoji,** the one exception to "icons, not emoji" (17): there is no icon set for 250 flags, and the emoji is the system's own. Windows has no flag glyphs and shows the two letters, which still reads correctly.
- **Cities are still matched by name** within a country, case-insensitively.

### 23. Vaults you make, and the ❤ mark
*Decided 2026-11-20.* Modelled on glide's vaults (research: `docs/GLIDE_VAULT_RESEARCH.md`). The country → city vault (22) sorts itself; these are the groupings only the person knows: "Cafés to try", "Goa weekend", "Date nights".
- **A vault holds place ids, not copies** (`Vault` in `domain/models.ts`). A place can sit in several vaults; deleting a vault never deletes a place; deleting a place drops it from every vault. Ids of places deleted on another phone are skipped when read (`placesInVault`), not cleaned up.
- **Liked ≠ visited.** `likedAt` is its own mark (❤ on the place screen); `visitedAt` stays "done". The **Liked vault is derived** from `likedAt`, like the country folders, and appears once something is liked. Its route id is `liked`.
- **Every vault opens as a plan:** a visited/total bar at the top, List ↔ Map (the map shows only that vault's pins), and "Plan a trip", which hands the planner `vault=<id>` so only that vault's spots are offered.
- **Getting places in:** pick a vault (or name a new one) on the review step when saving from a link, which is the reel → vault flow glide is known for; "Add to vault" on a place (ticks apply at once, no Save to forget); and "Add spots" inside a vault (search everything saved, tick, done).
- **Routes:** `/vaults/[id]`, `/vaults/[id]/add`, `/vaults/[id]/edit`, `/vaults/new?place=`, `/vaults/pick?place=`. Plural `vaults/` keeps them apart from the country folders at `vault/[country]`.
- **Sync:** one row per vault in `public.vaults` with `place_ids uuid[]`, last write wins per vault, the same bookkeeping as places (`vaultSync` beside `sync`, `features/sync/syncVaults.ts`). Vaults sync after places so a vault from another phone finds its spots. `places.liked_at` rides along with the place.

### 24. Sharing a vault: a copy, or building it together
*Decided 2026-11-21.* Phase 2 of the vault research. The Share button on a vault (`/vaults/[id]/share`) offers both, side by side, so the difference is plain.
- **Send a copy** (`places/vaultLink.ts`, `/shared-vault?d=…`): the vault inside the link, like a trip link (20). Cities are listed once and referenced by index; at most 150 spots; names, coordinates, categories and cities only. The page works in any browser, before onboarding, and "Add to my Travyy" runs `importVault`: spots join your saves (deduped) and a vault of your own holds them. This is glide's "steal good taste", shipped ahead of them.
- **Build it together** (`places/sharing.ts`, `sync/syncSharedVaults.ts`, migration `20261121000000_shared_vaults.sql`): needs an account. The owner's vault row gets an `invite_token`; `/join-vault?t=…` calls `join_vault()`, which adds a `vault_members` row. Anyone in the vault can read it, invite others, add spots and take them out; only the owner renames, deletes, removes people or stops sharing (which removes everyone, takes the spots down and rotates the token).
- **Spots are copies** in `vault_spots`, because saved places are private (the same reason trips copy stops). Each phone keeps the vault as an ordinary vault of its own places and maps place id ↔ spot id (`shared[vaultId].links`). One round per vault: refresh name and head count, upload new places and removals, then download everyone else's changes from that vault's own cursor. A spot from a friend joins your saves, so your map, search, visited and ❤ all work on it, and they stay yours.
- **Whose row is it:** a vault you joined never goes into your own `vaults` backup (`syncVaults` skips it, and the personal pull filters on `user_id`). Deleting or resetting never deletes someone else's vault on the server; leaving is a `vault_members` delete.
- **When it syncs:** on every change (the same debounce as places), when the app comes to the front, and when a shared vault is opened. No realtime channel yet.
- *Known edges:* deleting a place from your saves takes it out of the shared vault for everyone, like removing it from the vault. Two people adding the same place keep one copy on each phone (deduped by name and position). Members' names aren't shown yet, only a head count: `profiles` is readable only between people on a trip.

### 25. Navigation the glide way: four tabs, every vault on a map
*Decided 2026-11-23, after walking through glide's Android app.* glide feels easy to find things in because each tab is one way of browsing and every collection opens onto its own map. Travyy now does the same.
- **Tabs: Map · Saves · Vaults · Trips.** "You" left the tab bar for an avatar at the top right of each tab (`AvatarButton`, route `/profile`), as glide does. Saves is every spot as a two-column card grid (newest first; sort Recent / A–Z / Nearest; search and category chips filter the same grid). Vaults has three pinned tiles that build themselves (**All saves** at `/vaults/all`, **Liked**, **Places** at `/places`), then the vaults you made, with All / Mine / Shared filters. Places is glide's country-stamp row plus a grid of cities; a city opens on its map.
- **A vault is a map with a sheet** (`places/components/MapSheet.tsx`). Vault and city screens are a full-screen map with the list in a sheet that rests at three stops (peek, half, full). Drag or flick the header, tap the handle, or scroll the list to open it fully; a tapped pin pulls the sheet down and shows the spot's card with ❤ / been there / directions. Built on PanResponder + Reanimated, so no new native module, and it works on the web.
- **One "+ New"** (`/new`, a native form sheet) on Saves, Vaults and the map: paste a link or search, drop a pin, or make a vault.
- **Saving straight from the map.** Press and hold the map (right-click on the web), or choose "Drop a pin" to move the map under a fixed pin. Either opens `/add-place?lat=&lng=`: Nominatim's reverse lookup fills in the name (the place's own, else the street or square) and the kind of place, and you can add it to vaults. Saved with `sourcePlatform: 'manual'`.
- **Real photos, from Wikipedia** (`places/photos.ts`). Cards, the pin card and the place page show a photo when the place has a Wikipedia article: the name is searched, and the top hit is taken only if it's within 1.5 km and shares a distinctive word with the name ("Torre de Belém" ↔ "Belém Tower"); an exact title may be up to 25 km off (islands, parks). A wrong photo is worse than none, so a café whose only nearby article is a gallery keeps its illustrated card. Results, including "nothing found" (rechecked after 30 days), are cached on the phone (`photoStore`, key: folded name + rounded position) and never synced, so there's no migration. Two lookups run at a time. The place page credits the article. Reel covers were rejected: Instagram's and TikTok's image links are signed and expire within days.
- **The map follows dark mode** (OpenFreeMap `dark`, `EXPO_PUBLIC_MAP_STYLE_URL_DARK`), so a dark app no longer opens onto a white map.
- **Brand assets and intro.** The icon, adaptive icon, favicon and splash mark are a white pin on terracotta, drawn by `scripts/make-icons.js` (they were still Expo's template images). After the native splash, `AnimatedSplash` drops the pin, ripples two rings and lifts away (about 1s, never blocking; a fade under Reduce Motion). The native splash uses the theme's page colours so the hand-off can't be seen.

### 23. The database: Postgres on Supabase, guarded by row-level security
*Decided 2026-11-16.* The full reasoning, schema and build order are in `docs/BACKEND.md`. In short: the phone talks to Supabase directly, the database decides who sees what, and the Node API stays for AI and webhooks. The schema is in `supabase/migrations/`; `supabase/tests/` applies it to an in-process Postgres (PGlite, so no Docker and no Supabase project) and tries to break every access rule, in CI on every push. Nothing in the app uses the tables yet: sync of saved places is next.

## Where this is going

The stack stays: Expo + React Native for the three clients, the small Node API for extraction, Supabase for accounts. What gets added, in order:

| Next | What it takes | Why this choice |
|---|---|---|
| Store billing | RevenueCat provider behind `BillingProvider`; products in both stores; a webhook to the API so the server knows who is Pro | One SDK for Play, App Store and web; handles receipts, trials, regional prices and restores |
| Live group trips | Supabase Postgres: `trips`, `trip_members`, `trip_places`, `expenses`, `settlements`, with row-level security by membership; Realtime for changes; the local stores stay the source the UI reads, with a sync queue | Accounts already run on Supabase; RLS keeps authorisation in the database; local-first stays, so the app still works on a plane |
| Storage at scale | Move the stores from AsyncStorage to SQLite (`expo-sqlite`) when sync lands | A sync queue and thousands of rows don't belong in one JSON blob |
| Server-side limits | Count AI imports per account in Postgres; keep the per-IP limit for anonymous use | The phone's count is advisory |
| Crash reporting | Sentry in `logger.report` | The seam exists |
| Nearby alerts | `expo-location` geofences + `expo-notifications` | Needs a background-location review in both stores, so it goes after launch |

## Quality gates

`npm run check` = typecheck + ESLint + Prettier + Jest. CI (`.github/workflows/ci.yml`) runs that **and bundles web, Android and iOS** on every push, so platform-resolution errors like the original web failure are caught before anyone runs the app.

**One toolchain everywhere:** local, CI and EAS all install with `npm ci` from the same lockfile. The lockfile is written by current npm 11 (11.21); EAS builds pin Node 22.22.0 (a `base` profile in `eas.json`), whose npm 10.9 installs from it unchanged, as CI does. `.npmrc` turns on `engine-strict` and `package.json` excludes npm 11.6.1–11.6.2: those versions silently drop `@emnapi/*` from the lockfile, which broke the first EAS build.

Tests live next to the code in `__tests__/`: pure logic (parser, link parsing, planner, geo), the store (dedupe, trip cleanup, persisted-state validation), the extraction pipeline with mocked network, and components via React Native Testing Library.
