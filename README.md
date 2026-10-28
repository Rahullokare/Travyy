# Travyy

**Turn travel reels into real trips.** Paste an Instagram Reel, TikTok, YouTube or Google Maps link, and Travyy finds every place mentioned, pins it on your map, and turns a city's saves into a day-by-day walking plan.

A React Native (Expo) app for **iOS and Android**. Market research, positioning and roadmap are in [`docs/RESEARCH.md`](docs/RESEARCH.md).

## Features

- **Save from any link.** Instagram, TikTok, YouTube, Google Maps, or a pasted caption or place name. Extracted places go to a review screen before anything is saved.
- **Map of everything you've saved.** Pins are colour-coded by category, with one-tap city filters.
- **Saves list.** Grouped by city, with search, category filters, "hide visited" and "sort by nearest".
- **Auto trip planner.** Pick a city and a number of days. Places are clustered by neighbourhood, balanced across days and ordered into a walking route, with a hand-off to Google Maps directions.
- **Saved spots nearby.** A banner on the map tells you when you're near something you saved.
- **Visited tracking.** A "Visit rate" stat and a travel-personality card on the profile tab.
- **Share a trip** as text with map links.
- **Freemium paywall UI**: 30 saves and 1 trip on the free plan. Purchases are in demo mode until RevenueCat is wired up.
- **Works offline-first.** Data is stored on the device (AsyncStorage); no account is needed.

## Run it

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with **Expo Go** (Android or iOS), or press `a` / `i` to open an emulator or simulator. On first launch, pick **"Start with sample spots"** to see Lisbon and Kyoto data straight away.

Checks:

```bash
npm run typecheck
```

```bash
npm test
```

### Optional: the AI extraction backend

Without a backend, the app pulls places from captions with on-device rules (📍 pins, numbered lists, "Location:" lines, venue @handles, city hashtags) and geocodes them with OpenStreetMap. The backend uses Claude to read messy captions far more reliably.

```bash
cd server && npm install
```

```bash
ANTHROPIC_API_KEY=sk-ant-... GEOCODER_USER_AGENT="Travyy/1.0 (you@example.com)" npm start
```

Then point the app at it (use your machine's LAN IP when testing on a phone):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start
```

`POST /extract` takes `{ "url"?: string, "text"?: string }` and returns `{ caption, places: [{ name, city, country, category, lat, lng, address, confidence }] }`. If the backend fails, the app falls back to on-device extraction automatically.

## Project structure

```
src/
  app/                 Expo Router screens
    (tabs)/            Map · Saves · Trips · You
    add.tsx            Paste link → extract → review → save
    place/[id].tsx     Place detail: directions, visited, note, category, original video
    trip/new.tsx       Trip builder (city, days, which spots)
    trip/[id].tsx      Day-by-day itinerary with route map
    onboarding.tsx     3-step onboarding + sample data
    paywall.tsx        Pro plans
  components/          UI kit, PlaceRow
  lib/
    extract.ts         Caption fetch (oEmbed/OG), AI backend client, Nominatim geocoding
    parseCaption.ts    On-device rule-based place extraction
    links.ts           URL/platform detection, Google Maps URL parsing
    planner.ts         k-means day clustering + balancing
    geo.ts             Haversine, regions, nearest-neighbour + 2-opt routing
    store.ts           Zustand store persisted to AsyncStorage
server/                Node backend: Claude structured extraction + geocoding
docs/RESEARCH.md       Competitive research, positioning, GTM, roadmap
```

## Deep links

`travyy://add?url=<encoded link>` opens the save screen and starts extraction straight away. You can use this today from an iOS Shortcut or Android "Open with" until the native share extension ships.

## Before launch (see roadmap)

1. **Native share extension.** Add `expo-share-intent` (this needs a development build, not Expo Go) and route shared URLs to `/add?url=…`.
2. **Billing.** Replace the demo `setPro(true)` in `src/app/paywall.tsx` with RevenueCat.
3. **Maps on Android release builds** need a Google Maps API key in `app.json` (`android.config.googleMaps.apiKey`). Expo Go works without one.
4. **Geocoding at scale.** Public Nominatim allows about 1 request per second. Switch to Google Places, Mapbox, or a self-hosted Nominatim.
5. **Builds.** Use EAS (`npx eas-cli@latest build -p all`).
