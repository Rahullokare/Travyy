# Backend guide

_Written 16 November 2026. Prices are from memory; check the providers' pricing pages before budgeting._

**Decision: Supabase for the database, accounts and live updates; the small Node API in `server/` only for AI work and webhooks.** It costs nothing while the idea is being tested, and each piece can be moved later without touching the others.

## The stack

| Layer | Pick | Why |
|---|---|---|
| Database | **Postgres**, hosted by Supabase | The data is relational: trips, members, stops, expenses and settlements, where sums must add up. Postgres has the transactions and constraints for that |
| Accounts | **Supabase Auth** | Email codes and Google are built. Apple comes next (it's required on iOS once Google is offered) |
| Who can see what | **Row-level security** in Postgres | "Only people on a trip can read it" is enforced by the database, so a bug in app code can't leak another group's data |
| Live group updates | **Supabase Realtime** | Friends see new stops and costs without refreshing; no socket server to run |
| Files | **Supabase Storage**, later | Receipt photos and trip covers |
| API server | **The existing Node API on Render** | Stateless and narrow: AI extraction, Instagram captions, billing webhooks. Everything else goes phone → Supabase |
| Billing | **RevenueCat** | One SDK for Play, App Store and web |
| On the phone | **SQLite** (`expo-sqlite`) when sync lands | Replaces the single JSON blob; the app stays offline-first |
| Analytics, errors | **PostHog, Sentry** | Free tiers; the seams exist |

## Why not the alternatives

- **Firebase:** Firestore is a document store. Splitting costs across people needs joins and transactions, and leaving Firestore later is a rewrite. Supabase is plain Postgres: export it and host it anywhere.
- **Our own auth:** password resets, token rotation, OAuth and recovery are months of work and a security risk, with no product benefit.
- **MongoDB, microservices, Kubernetes, GraphQL:** answers to problems we don't have. One database and one small server is the right size into the tens of thousands of active users.
- **A custom backend for everything:** hand-written CRUD endpoints that Supabase provides, plus the hosting bill.

## The schema

It lives in `supabase/migrations/`. Tests for the security rules are in `supabase/tests/` and run on an in-process Postgres (`cd supabase && npm test`), so they need neither Docker nor a Supabase project.

| Table | Holds | Who can read and write |
|---|---|---|
| `profiles` | One row per account: display name | Yourself; people you share a trip with can read your name |
| `places` | A person's saved spots (the vault) | Only the owner |
| `vaults` | Collections a person makes from their saves: name, emoji, place ids, invite token | The owner; people who joined can read it |
| `vault_members` | Who joined a shared vault (only through `join_vault()`) | People in the vault read; you can leave, the owner can remove |
| `vault_spots` | A shared vault's spots, as copies | People in the vault read, add as themselves and take out |
| `trips` | A trip: name, city, settle currency, invite token | People on the trip read; the owner changes and deletes |
| `trip_members` | Who's on a trip. A name, optionally linked to an account | People on the trip. You can link a member only to your own account |
| `trip_stops` | The plan: day, order, and a copy of each place | People on the trip |
| `expenses` | Costs, with payers and shares as JSON | People on the trip |
| `settlements` | Payments between two members | People on the trip |
| `entitlements` | Pro and Trip Pass | Read your own; only the server writes |
| `ai_usage` | AI imports per month | Read your own; only the server writes |

Choices worth knowing:

- **IDs are UUIDs made on the phone,** as they already are, so local records sync up without renumbering and a retried upload can't create a duplicate.
- **Every synced table has `updated_at` (set by the database, never the phone) and `deleted_at`.** Sync is "give me everything changed since my last pull"; a delete is a row with `deleted_at`, so other phones hear about it.
- **Trip stops carry a copy of the place** (name, coordinates, category). Saved places are private, so a trip can't point at one person's vault and expect the others to see it.
- **An expense is one row,** with payers and shares as JSON, and the database refuses one that doesn't add up to its amount. One record on the phone is one row here, which keeps "last write wins" simple.
- **Members are names first.** A friend counts on a trip without an account; joining with the invite link either claims that name or adds a new member.
- **Access checks go through `private.is_trip_member()`.** A policy on `trip_members` that queried `trip_members` would recurse forever; the helper runs with definer rights and isn't exposed over the API.
- **Money and limits are written only by the server** (the RevenueCat webhook, the AI endpoint) using the service role, which bypasses row-level security. The app's key can't grant itself Pro.

## How sync should work

The phone stays the source the screens read. Every change is written locally first, queued, and pushed when online; changes from others are pulled and merged. Conflicts resolve by "last write wins" per record. That's enough for trips and expenses, and the app keeps working on a plane.

Build the queue by hand first. Sync engines (PowerSync, ElectricSQL) are good, and they add cost and a dependency that zero users don't justify.

## Cost by stage

| Stage | Setup | Rough cost |
|---|---|---|
| Testing the idea | Supabase free, Render free, Gemini and Groq free tiers | $0 |
| First real users | Supabase Pro (no pausing, backups), a Render instance that doesn't sleep | about $30–35 a month |
| Thousands of active users | Bigger database, connection pooling, a paid AI tier | low hundreds a month |
| Very large | Read replicas, or a dedicated Postgres host | grows with revenue |

Two free-tier limits matter now: a free Supabase project pauses after about a week without activity, and Render's free server sleeps after about 15 idle minutes. Both go away with the first paid tier.

## How it scales

- **Database:** one Postgres instance holds millions of rows of this shape. Every table is indexed by owner or trip. Turn on connection pooling, then scale the instance up, then add read replicas.
- **API server:** holds no state, so more copies run behind a load balancer. Rate limiting moves from memory to Redis then.
- **AI cost** grows fastest. Caching, provider fallback and metering exist; counting per account on the server (`ai_usage`) is the missing piece.
- **Way out:** the database is a standard Postgres dump and the tokens are standard JWTs the server already verifies itself.

## Risks

- **Row-level security is easy to get wrong.** Every rule has a test that tries to break it; add one with every new table.
- **The `service_role` key never ships in the app.** Only the server holds it.
- **Auth emails:** Supabase's built-in sender allows a few an hour. Set up SMTP (for example Resend's free tier) before real users sign up.
- **Sync is the hard part.** Start with one table (`places`), prove it, then trips and expenses.

## Build order

1. ~~Tables and security rules, with tests.~~ Done: `supabase/migrations/20261116000000_initial_schema.sql`.
2. Backup and sync of saved places for signed-in users.
3. ~~Google sign-in.~~ Done (see below). Apple sign-in; custom SMTP.
4. Live group trips: join from the share link, everyone adds stops and costs.
5. RevenueCat, with a webhook writing `entitlements`.
6. AI limits per account on the server.

## Applying the schema

All migrations up to `20261121000000_shared_vaults.sql` are applied to the hosted project (2026-11-20). To apply new ones, from the `Travyy` folder:

```bash
npx supabase login
```

```bash
npx supabase init
```

(once, to create `supabase/config.toml`; answer N to the editor questions)

```bash
npx supabase link --project-ref <your project ref>
```

```bash
npx supabase db push --remote
```

Without `--remote`, newer CLIs push to a local Docker database. Or paste each new migration into the SQL editor in the Supabase dashboard, oldest first.

## Turning on Google sign-in

The app shows "Continue with Google" only when the Google provider is on in the Supabase project, so this is all dashboard work:

1. **Google Cloud Console** → APIs & Services → OAuth consent screen: app name, support email, and the `email`, `profile` and `openid` scopes. Publish it, or only test users can sign in.
2. Credentials → Create credentials → OAuth client ID → **Web application**. Authorised redirect URI: `https://<project ref>.supabase.co/auth/v1/callback`. One web client is enough: phones sign in through the browser too.
3. **Supabase** → Authentication → Sign In / Providers → Google: turn it on and paste the client ID and secret.
4. Supabase → Authentication → URL Configuration → Redirect URLs. Add every place the app comes back to:
   - `travyy://auth-callback`, `travyy-preview://auth-callback`, `travyy-dev://auth-callback` (the build variants)
   - `exp://**` (Expo Go during development)
   - `http://localhost:8081/auth-callback` and `https://<your web domain>/auth-callback`

   Also set Site URL to the web domain. A redirect not on the list falls back to the Site URL, and the sign-in silently doesn't finish.
