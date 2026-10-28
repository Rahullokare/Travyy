# Travyy: market research and founder playbook

*Written October 2026.*

## 1. The problem

Travel planning has moved from Google and blogs to **short-form video**. People save hundreds of Reels and TikToks ("10 cafés you NEED in Lisbon"), DM them to themselves or friends, and then never find them again. When the trip comes, the saves are buried among memes. The places never get visited.

Every app in the source list tells the same story. The *Go There* founder built it because "I kept DMing myself Instagram reels I never visited". *Roamy*'s pitch is "your Instagram saves, actually organized". The pain is real, common, and easy to describe in one sentence. Those are the conditions for consumer word of mouth.

## 2. Competitive landscape

Most of the source pages (App Store, Indie Hackers, hunted.space, mwm.ai, Substack) were **blocked by this build environment's network policy**. The notes below come from web-search summaries of those pages plus general market knowledge. Re-check them by hand before using them in a pitch deck.

| App | Platforms | What it does | Notes |
|---|---|---|---|
| **Go There** | iOS + Android | Forward an IG DM, Reel, TikTok, YouTube or Maps link, and it puts the place on your map | Indie Hackers launch; claims to be the only one that saves straight from IG DMs |
| **Triply** | iOS (Android "coming soon") | AI reads image, audio, caption and location tag and pins every place | Strongest extraction story |
| **ReelTravel** | iPhone only | Share extension, map, **day-by-day itinerary builder** | |
| **PlanPin** | iPhone only | IG + TikTok + Maps + notes → AI day-by-day trip | |
| **Tint** | iPhone only | "Map your Reels" | |
| **glide: organize & plan** | iOS | AI pulls places from Reels, fills in price, menu and "vibes", searchable | ~$151k seed (Dealroom); free, no paid tier yet |
| **Roamy → renamed Rhyme** | iOS | One-tap save, map, itinerary from trip length | 4.5★ from ~217 ratings |
| **ReelsMap, Treklist, PinPath, ReelPin, TokSpot, Travio, Dream Trip, mio, GeoTok, Plotline** | mostly iOS | Variations on reels → map → plan | Many launched in 2025–26, a crowded long tail |
| **Pocket Places, Stasht, Everyplace** | various | Generic "save places" lists | Older, not built around video |
| **Wanderlog** | iOS + Android + web | Full trip planner: map, collaboration, Gmail booking import | ~$39.99/yr Pro (offline, etc.). The incumbent |
| **Stippl** | iOS + Android | Visual trip planner + AI itinerary | €24.99/yr Pro; reported sync and crash issues on older Android |
| **Google Maps "Saved" lists** | everywhere | The default people already use | Free. Our real competitor is "good enough" |

### What the market tells us

1. **The category is validated but not won.** About 15 near-identical apps launched in about 18 months, and nobody has broken out. Funding is small (seed-stage at most). It's a land grab, and distribution wins it, not technology.
2. **Almost everyone is iOS-only.** Triply, ReelTravel, PlanPin, Tint, glide and Rhyme are all iPhone-first or iPhone-only. **Android users (most of the world, and most of India, SE Asia and LatAm) are underserved.** Shipping both platforms on day one with React Native is a real advantage, not a nice-to-have.
3. **Extraction is becoming a commodity.** Every app now says "AI finds the places". The frontier models are good enough that this no longer sets anyone apart. It's the price of entry.
4. **The gap is *after* the save.** Most apps stop at "pins on a map", which is a prettier graveyard. The real job is *getting the user to the place*. That job breaks into three parts:
   - **Planning**: turn 40 pins into "Day 1: Belém, Day 2: Alfama…"
   - **Being reminded**: "You're 6 min from that ramen spot you saved in March"
   - **Closing the loop**: marking it visited and seeing "you went to 34% of your saves"
5. **Wanderlog shows people pay for planning** (~$40/yr), but its users add places by hand. Whoever joins *effortless capture from video* with *real planning* takes the space between the two groups.

## 3. Positioning

> **Travyy: the travel app for the places you actually go to.**
> Paste any reel and the spots land on your map. Pick a city and we plan the days. Walk past a save and we tell you.

We do **not** compete on "best AI extraction". We compete on **saves visited**, which ties the product directly to the outcome users want.

North-star metric: **% of saved places marked visited** (the "Visit rate"). It's shown to the user on the profile tab. This is deliberate: it is the brand promise made measurable.

## 4. What is in this MVP, and why

A founder who has done this before ships the **smallest loop that delivers the "aha" moment** and has a built-in reason to come back. Everything else waits.

| Feature | Why it's in v1 |
|---|---|
| Paste a link or caption → places extracted → review → save | The core "aha". It takes about 10 seconds. A review step (not auto-save) builds trust and prevents junk pins |
| Works with **no backend** (rules + OpenStreetMap geocoding) and gets better with the **Claude-powered backend** | Can launch before paying for AI, and the app degrades gracefully when the API is down |
| Google Maps links parsed directly (coords + name) | A large share of shared links are Maps links. Free, exact, instant |
| Map with category pins, city filter chips | The "wow, it's all on a map" screenshot that sells the app |
| Auto-grouped by city, search, filter, sort by distance | Saves are only useful if you can find them |
| **One-tap trip planner**: geographic clustering into days + walking-route ordering | The thing others don't do well. It's also the paywall moment |
| **"Saved spots nearby" banner** | First version of the retention hook. Background geofencing comes next |
| **Visited tracking + Visit-rate stat + "travel personality"** | Closes the loop. Personality cards are shareable, which feeds the viral loop |
| Share trip as text with map links | Every shared itinerary is a free ad |
| Sample data on onboarding | Users see value before doing any work, which lifts activation |
| Freemium paywall (30 saves / 1 trip free) | Tests willingness to pay from day one |

**Left out on purpose (v1.1+):** accounts and cloud sync, social feeds, booking/affiliate, offline maps, a web app.

## 5. Monetisation

- **Free:** 30 saves, 1 planned trip, all the core features. That's enough to plan a weekend and get hooked.
- **Pro:** $4.99/mo or **$29.99/yr** (anchored under Wanderlog's ~$40), with a 7-day trial on the annual plan.
- **Trip Pass:** $7.99 for 30 days. Many travellers plan 1–2 trips a year and won't subscribe. This captures them.
- **Later:** affiliate revenue on stays and experiences (Booking, GetYourGuide, Viator) *only* for places the user already saved. That's high intent, so it converts well and doesn't feel spammy.

Unit-economics guardrail: on-device extraction is free. AI extraction runs on the backend at low effort with short prompts, so each extraction costs fractions of a cent. Rate-limit per IP now, and per user once accounts exist.

## 6. Go-to-market (distribution wins this category)

1. **Creator-native launch.** The content format *is* the product. Make Reels/TikToks that show "I pasted this viral Lisbon reel and got a 3-day plan in 10 seconds". Each video demos the product on the exact platform where the problem happens.
2. **Micro-creator partnerships.** Travel creators (10k–200k followers) get a Travyy link that opens their own guide pre-loaded. Their audience asks "where is this?" in every comment section, and the link answers that.
3. **Android-first markets.** India, Indonesia, Brazil, Mexico: huge travel-reel consumption, and the competition is iOS-only.
4. **ASO.** Target "save instagram reels places", "tiktok travel map", "trip planner from reels". Competitors' names show they're fighting over these exact keywords.
5. **Viral loops built in:** shared itineraries, "travel personality" cards, and shared trip boards later.
6. **Launch sequence:** a TestFlight/Play beta with 100 travellers from Reddit (r/solotravel, r/JapanTravel), then Product Hunt, then Indie Hackers build-in-public posts, then a creator push.

## 7. Metrics to watch (first 90 days)

| Metric | Target |
|---|---|
| Activation: first real save within first session | > 50% |
| Saves per active user per week | > 3 |
| Trip planned within 14 days of install | > 25% |
| D30 retention | > 20% (travel is seasonal, so watch cohorts around trips) |
| Visit rate (north star) | trend up |
| Free → paid | 3–5% |

## 8. Roadmap

**Next 2 weeks (before public launch)**
1. **Native share extension** (iOS share sheet + Android `SEND` intent), for example via `expo-share-intent`. This is the #1 priority because sharing straight from Instagram/TikTok is the main way users will capture spots. Today the app supports paste, clipboard detection and `travyy://add?url=` deep links. That's enough for beta and for iOS Shortcuts, but not for launch.
2. RevenueCat for purchases (the paywall UI is already built).
3. Deploy the backend (Fly.io / Railway / Cloud Run) and set `EXPO_PUBLIC_API_URL`.
4. Analytics (PostHog) on the funnel above.

**Month 2**
- Background geofencing "you're near a save" push notifications (`expo-location` geofencing + `expo-notifications`).
- Accounts + cloud sync (Supabase), so saves survive a new phone.
- Shared trip boards with friends (voting on spots).

**Month 3+**
- Video understanding: on-screen text and voiceover transcription for captions that don't name places.
- Opening hours / "open now" and smart day ordering (cafés in the morning, bars at night).
- Affiliate booking for saved stays and activities.
- Import from Google Maps saved lists (useful for winning over Google Maps users).
