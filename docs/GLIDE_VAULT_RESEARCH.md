# Research: how glide does vaults (and what Travyy should build)

*Researched 2026-11-20.* Subject: **glide: organize, plan & map** (justglide.ai, iOS id6755294996, Android `com.glidetrips.glide`), by Anwayshan Tech Solutions, Bengaluru. Not to be confused with Glide (the no-code builder) or Glide (video messaging).

Sources: App Store listing and version history (US + India storefronts), justglide.ai homepage, /about, /changelog, /vs/find-places-from-instagram-reels, privacy policy. Medium "story behind glide" returned 403; the Play Store page didn't render; homepage FAQ answers were collapsed. So anything below marked *unconfirmed* is inferred, not seen.

---

## 1. What a "vault" is in glide

A vault is a **collection of saved places with its own map**. glide's website calls them vaults ("Our vaults are, for plans"). The current App Store description calls them **collections**. Same feature, two names. Tagline on the homepage: "create collections from your saved places - by location, mood and more".

There are three kinds:

| Vault | How it's made | What it holds |
|---|---|---|
| **Places vault** | Automatic, nothing to set up | Every save, already grouped **by country → city** (store text also says sorted "by city and neighbourhood"). Each place you've been gets its own vault too. |
| **Liked vault** | Automatic | Everything you marked ❤ liked |
| **Custom vaults** | User creates, as many as they want | Anything: "weekend in Goa", "cafés to try", "date nights", "Bali trip". |

Every vault, auto or custom, gets:
- **Its own map** (only that vault's pins), plus its own details page.
- **A completion indicator**: how much of the vault you've covered (places marked done ÷ total).

## 2. Full feature list (as shipped, v0.2.x, Sep–Oct 2026)

**Getting places in**
- Share a reel/post from Instagram to glide (share sheet, "exactly like sending it to a friend on WhatsApp"), or paste the link.
- **Save straight into a vault** from the share flow: pick the vault while sharing.
- Share from **Google Maps** (added 0.2.4, Oct).
- **Search and save inside glide** without any reel (0.2.4).
- One reel with six places becomes **six places**, not one saved video.
- Privacy policy also lists TikTok, YouTube, Facebook, Pinterest, Snapchat and a browser extension. Their store copy says "more apps to share from are on the way". *TikTok etc. unconfirmed as live.*
- **"Import finished" push notification:** extraction runs in the background and pings you when the places are ready.
- Nothing is pulled from Instagram automatically, and they never ask for the Instagram password. This is a selling point ("only touches what you send it").

**Place card (AI enrichment)**
- Opening hours, price range, "the vibe", **Google rating + reviews**, menus.
- Pinned on the map automatically, sorted by city and neighbourhood, no manual tagging.
- Release 0.2.1 marketed "3X BETTER EXTRACTION". Extraction accuracy is a headline feature for them.

**Per-place status**
- **Liked ❤** and **Done ✅** (two separate marks). Done drives the completion indicator; Liked feeds the Liked vault and nearby reminders.
- **Personal notes** on each spot (who recommended it, what to order).

**Map**
- One personal map of everything; each vault also has a filtered map.
- Search, filter by area, dark/light mode.

**Nearby**
- Reminder when you're close to a **liked** place (uses background location).

**Coming soon (on the website, not shipped)**
- **Shared vaults:** build a vault together with friends for a trip, cafés or a weekend.
- **"Steal good taste":** copy a friend's curated vault into your own.
- Seeing what other users are saving nearby (social discovery).

**Business model:** free, "No credit card needed". No in-app purchase is listed. Privacy policy mentions bookings and payments (UPI, cards), so monetisation is probably bookings/affiliate later.

## 3. How it feels to users

**Ratings:** 4.8★ from 53 ratings (India App Store); not enough ratings in the US. Small, early, India-first user base. The site claims "4.8 by humans across 80+ countries" (self-reported).

**What users say (all visible reviews are positive):**
- *Giving a purpose to forgotten saves.* The emotional hook is guilt about 200 saved reels you never act on. The founder's framing: Instagram saves have "no search and no map"; "your saves are trapped".
- *Fast and accurate saves.* "really quick and accurate". Speed of share → pins is what users notice first.
- *Useful on the go.* Users open it in a city to see what's nearby and tick off bucket-list spots. Slow travellers use it to find local things.
- *Beautiful app.* Polish is mentioned explicitly.
- No visible complaints. There are only 4 visible reviews, so this isn't a strong signal. The FAQ's "Why didn't glide find the place I shared?" suggests failed extraction is the most common support question.

**The feel, in design terms:**
1. **Zero setup.** You never have to organise; the Places vault sorts itself by country/city. Custom vaults are optional extras.
2. **Plans, not storage.** The tagline "vaults are for plans" and the completion indicator turn a pile of saves into a to-do list with progress. That's the core emotional difference from a bookmarks folder.
3. **Collection-as-map.** Opening a vault means seeing *that* set on a map, not a list.
4. **Playful, warm tone.** Lowercase brand, "FOR THE ❤ OF GOING OUT", emoji marks (❤ ✅), Gen Z, going-out framing (cafés, date nights, weekends) more than big trips.
5. **Trust.** No passwords, only what you share.

## 4. Travyy today vs glide

Travyy already has the **Places vault** equivalent (`docs/ARCHITECTURE.md` §22: country → city → spots, derived grouping, ISO flags, accent-insensitive search, nearest-first, hide visited) and arguably goes further on search and on trips, splitting costs and shareable links.

| glide feature | Travyy now | Gap |
|---|---|---|
| Auto Places vault by country/city | ✅ `features/places/vault.ts` | — (ours has scoped search, which glide doesn't advertise) |
| Coverage per country/city | ✅ visited progress on country cards | Show it as a clear completion indicator on city too |
| **Custom vaults (user collections)** | ❌ | **Main gap** |
| Per-vault map | Partial (city filter on map) | Map scoped to a custom vault |
| Save into a vault from share sheet | ❌ | Vault picker on the review step in `add.tsx` / capture |
| Liked ❤ separate from Done ✅ | Only `visitedAt` (= done) | Add `likedAt`; Liked auto-vault |
| Notes on spots | ✅ `note` field | Make it prominent on the card |
| Nearby reminder | ✅ banner when close | glide limits to *liked* places, which is less noisy; consider |
| Import-finished notification | ? | If extraction is async on server, push when done |
| Enrichment: hours, price, vibe, rating | ❌ (category, address only) | Phase 2; costs Places API money |
| Google Maps share / search & save | ✅ both | — |
| Shared vaults with friends | ❌ (trips are shared, saves are private by design, BACKEND.md) | Ahead of glide if we ship it, since they haven't |
| Copy a friend's vault | Partial: trip links add to your Travyy | Extend the same link mechanism to vaults |

## 5. Recommended build (in order)

**Phase 1: custom vaults (matches glide)**
- Model: `Vault { id, name, emoji?, placeIds[], createdAt, updatedAt }`. Membership is many-to-many: a place can sit in several vaults, and deleting a vault never deletes places. Keep the auto country/city vault derived, as now (§22).
- Saves tab: a "Your vaults" row above the countries (auto Liked + custom ones + "New vault").
- Vault screen: list ↔ map toggle scoped to the vault, a completion ring (visited/total), "plan a trip from this vault" (reuse the planner, which today is city-scoped; a vault can span cities, so plan per city inside it).
- Add to vault: from place detail, multi-select in a city list, and **a vault picker on the share/review step** so a reel lands straight in "Goa weekend".
- `likedAt` on Place + Liked auto-vault; keep `visitedAt` as Done.
- Supabase: `vaults` table + `vault_places` join, owner-only RLS like `places`.

**Phase 2: social (beats glide; theirs is still "coming soon")**
- Share a vault as a link, reusing the trip-link approach (the plan travels in the link) with "Add to my Travyy". That's glide's "steal good taste".
- Collaborative vaults: members can add places. This needs the trip-stop pattern (copy of the place) because saves are private (BACKEND.md).

**Phase 3: enrichment**
- Hours, price level, rating on the place card, fetched lazily and cached, plus an "import finished" push for slow extractions.

**Feel to copy:** zero setup by default, progress over storage, every collection opens as a map, fast share → pins, warm copy ("cafés to try", "date nights") rather than "Folder 1".

---

### Sources
- [App Store (US): glide: organize, plan & map](https://apps.apple.com/us/app/glide-organize-plan-map/id6755294996)
- [App Store (India), with ratings and reviews](https://apps.apple.com/in/app/glide-organize-plan-map/id6755294996)
- [justglide.ai](https://www.justglide.ai/) · [about](https://www.justglide.ai/about) · [changelog](https://www.justglide.ai/changelog) · [vs Instagram saves](https://www.justglide.ai/vs/find-places-from-instagram-reels) · [privacy policy](https://www.justglide.ai/privacy-policy)
- [Google Play listing](https://play.google.com/store/apps/details?id=com.glidetrips.glide&hl=en_IN) (didn't render)
- [Medium: The story behind glide](https://medium.com/@glide.xyz/the-story-behind-glide-18d015486fc0) (403, not read)
