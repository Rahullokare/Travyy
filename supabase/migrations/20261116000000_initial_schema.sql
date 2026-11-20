-- Travyy: initial schema. See docs/BACKEND.md.
--
-- Rules every table follows:
--   * ids are UUIDs made on the phone, so a retried upload can't create a duplicate;
--   * `updated_at` is set here, never by the phone, so "changed since my last pull" can be trusted;
--   * a delete is a row with `deleted_at`, so other phones hear about it;
--   * row-level security is on, and nothing is readable without a policy that says so.

-- Helpers that must not be callable over the API live here: PostgREST only exposes `public`.
create schema if not exists private;

create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function private.touch_updated_at();

-- Every account gets a profile the moment it's created.
create function private.create_profile() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger create_profile after insert on auth.users
  for each row execute function private.create_profile();

-- ---------------------------------------------------------------------------------------------
-- Saved places: a person's vault. Private to them.
-- ---------------------------------------------------------------------------------------------

create table public.places (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  city text,
  country text,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  category text not null check (
    category in ('food', 'cafe', 'nightlife', 'sight', 'nature', 'stay', 'shopping', 'activity', 'other')
  ),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text,
  note text,
  source_url text,
  source_platform text not null check (
    source_platform in ('instagram', 'tiktok', 'youtube', 'google_maps', 'web', 'manual')
  ),
  saved_at timestamptz not null default now(),
  visited_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Sync pulls "my rows changed since X".
create index places_user_updated on public.places (user_id, updated_at);

create trigger places_touch before insert or update on public.places
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Trips and the people on them
-- ---------------------------------------------------------------------------------------------

create table public.trips (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  city text not null default '',
  day_count integer not null default 1 check (day_count between 1 and 60),
  -- ISO 4217. What the trip's costs are settled in; null until someone sets up the money view.
  currency text check (currency ~ '^[A-Z]{3}$'),
  -- Whoever holds this can join the trip. Rotating it cancels old invite links.
  invite_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index trips_owner_updated on public.trips (owner_id, updated_at);

create trigger trips_touch before insert or update on public.trips
  for each row execute function private.touch_updated_at();

-- Someone on a trip. A name first, so friends count without an account; `user_id` links the
-- name to an account once that person joins.
create table public.trip_members (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- One account is one person on a trip.
  unique (trip_id, user_id),
  -- Lets payments insist that both people are on the same trip as the payment.
  unique (id, trip_id)
);

create index trip_members_trip_updated on public.trip_members (trip_id, updated_at);
-- "Which trips am I on?" is asked on every pull.
create index trip_members_user on public.trip_members (user_id) where user_id is not null;

create trigger trip_members_touch before insert or update on public.trip_members
  for each row execute function private.touch_updated_at();

-- The one question every trip policy asks. A policy on trip_members that queried trip_members
-- itself would recurse forever, so this runs with definer rights, outside row-level security.
create function private.is_trip_member(trip uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.trips t where t.id = trip and t.owner_id = (select auth.uid()))
    or exists (
      select 1
      from public.trip_members m
      where m.trip_id = trip and m.user_id = (select auth.uid()) and m.deleted_at is null
    );
$$;

-- Whether two accounts share a trip, so names of fellow travellers are readable and nobody else's.
create function private.shares_trip_with(other uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members theirs
    where theirs.user_id = other
      and theirs.deleted_at is null
      and private.is_trip_member(theirs.trip_id)
  )
  or exists (
    select 1 from public.trips t where t.owner_id = other and private.is_trip_member(t.id)
  );
$$;

-- The plan. Each stop carries a copy of the place: saved places are private, so a trip can't
-- point into one person's vault and expect the others to see it.
create table public.trip_stops (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  day integer not null check (day between 1 and 60),
  -- Order within the day. Not unique: two phones may reorder at once, and ties sort by id.
  position integer not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  city text,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  category text not null check (
    category in ('food', 'cafe', 'nightlife', 'sight', 'nature', 'stay', 'shopping', 'activity', 'other')
  ),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index trip_stops_trip_updated on public.trip_stops (trip_id, updated_at);

create trigger trip_stops_touch before insert or update on public.trip_stops
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Money. Amounts are integers in the currency's smallest unit, as on the phone.
-- ---------------------------------------------------------------------------------------------

-- Adds up `[{"memberId": …, "amountMinor": 123}, …]`. Null when an entry isn't a whole,
-- non-negative number, which makes the check below fail.
create function private.sum_amounts(entries jsonb) returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then null
    when exists (
      select 1
      from jsonb_array_elements(entries) e
      where jsonb_typeof(e -> 'amountMinor') is distinct from 'number'
        or (e ->> 'amountMinor')::numeric < 0
        or (e ->> 'amountMinor')::numeric <> trunc((e ->> 'amountMinor')::numeric)
        or jsonb_typeof(e -> 'memberId') is distinct from 'string'
    ) then null
    else (select sum((e ->> 'amountMinor')::bigint) from jsonb_array_elements(entries) e)
  end;
$$;

-- One expense is one row, with who paid and who owes as JSON: one record on the phone is one row
-- here, which keeps "last write wins" simple. A record that doesn't add up is refused, because it
-- would corrupt everyone's balance.
create table public.expenses (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null check (category in ('food', 'transport', 'stay', 'activity', 'shopping', 'other')),
  spent_on date not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 9000000000000),
  -- What was actually paid when that wasn't the trip's currency: amount, currency, rate, date, source.
  original jsonb,
  payers jsonb not null,
  split_mode text not null check (split_mode in ('equal', 'exact', 'percent', 'shares')),
  shares jsonb not null,
  -- The stop this paid for: its id and a copy of its name.
  stop jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payers_add_up check (private.sum_amounts(payers) is not distinct from amount_minor),
  constraint shares_add_up check (private.sum_amounts(shares) is not distinct from amount_minor)
);

create index expenses_trip_updated on public.expenses (trip_id, updated_at);

create trigger expenses_touch before insert or update on public.expenses
  for each row execute function private.touch_updated_at();

-- Money that changed hands between two people on the trip.
create table public.settlements (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 9000000000000),
  paid_on date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member <> to_member),
  foreign key (from_member, trip_id) references public.trip_members (id, trip_id),
  foreign key (to_member, trip_id) references public.trip_members (id, trip_id)
);

create index settlements_trip_updated on public.settlements (trip_id, updated_at);

create trigger settlements_touch before insert or update on public.settlements
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Plans and limits. Read by their owner, written only by the server (service role).
-- ---------------------------------------------------------------------------------------------

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_pro boolean not null default false,
  pro_until timestamptz,
  trip_passes integer not null default 0 check (trip_passes >= 0),
  pass_until timestamptz,
  updated_at timestamptz not null default now()
);

create trigger entitlements_touch before insert or update on public.entitlements
  for each row execute function private.touch_updated_at();

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Calendar month, 'YYYY-MM'.
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  imports integer not null default 0 check (imports >= 0),
  primary key (user_id, month)
);

-- ---------------------------------------------------------------------------------------------
-- Joining a trip from an invite link
-- ---------------------------------------------------------------------------------------------

-- Joins the caller to the trip the token belongs to and returns its id. With `claim`, the caller
-- takes over a name the organiser already added ("Priya") so her existing costs become hers;
-- otherwise a new member is added. Definer rights are needed because someone who isn't on the
-- trip yet can't see it; the token is the proof they were invited.
create function public.join_trip(token uuid, claim uuid default null) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  trip uuid;
begin
  if me is null then
    raise exception 'Sign in to join a trip' using errcode = '28000';
  end if;

  select t.id into trip from public.trips t where t.invite_token = token and t.deleted_at is null;
  if trip is null then
    raise exception 'This invite link is no longer valid' using errcode = 'P0002';
  end if;

  -- Joining twice is not an error: the link gets tapped more than once.
  if exists (select 1 from public.trip_members m where m.trip_id = trip and m.user_id = me) then
    update public.trip_members m set deleted_at = null where m.trip_id = trip and m.user_id = me;
    return trip;
  end if;

  if claim is not null then
    update public.trip_members m
    set user_id = me
    where m.id = claim and m.trip_id = trip and m.user_id is null and m.deleted_at is null;
    if found then
      return trip;
    end if;
  end if;

  insert into public.trip_members (id, trip_id, name, user_id)
  values (
    gen_random_uuid(),
    trip,
    coalesce((select p.display_name from public.profiles p where p.id = me), 'New traveller'),
    me
  );
  return trip;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_stops enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.entitlements enable row level security;
alter table public.ai_usage enable row level security;

-- `(select auth.uid())` rather than `auth.uid()`: Postgres then evaluates it once per query
-- instead of once per row.

create policy "Read your own profile and your fellow travellers'" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_trip_with(id));

create policy "Change your own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Your saved places are yours alone" on public.places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "People on a trip can see it" on public.trips
  for select to authenticated
  using (private.is_trip_member(id));

create policy "Create trips as yourself" on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Only the owner: the row holds the invite token and the ownership itself.
create policy "The owner changes the trip" on public.trips
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "The owner deletes the trip" on public.trips
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "People on a trip can see who's on it" on public.trip_members
  for select to authenticated
  using (private.is_trip_member(trip_id));

-- You can add a name, or yourself. Never someone else's account: that would hand them access
-- (or hide a trip in their list) without their say.
create policy "People on a trip can add people" on public.trip_members
  for insert to authenticated
  with check (private.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())));

create policy "People on a trip can rename names and themselves" on public.trip_members
  for update to authenticated
  using (private.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())))
  with check (private.is_trip_member(trip_id) and (user_id is null or user_id = (select auth.uid())));

create policy "The owner removes people" on public.trip_members
  for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = (select auth.uid())));

create policy "People on a trip share its plan" on public.trip_stops
  for all to authenticated
  using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id));

create policy "People on a trip share its costs" on public.expenses
  for all to authenticated
  using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id));

create policy "People on a trip share its payments" on public.settlements
  for all to authenticated
  using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id));

-- No insert, update or delete policy on these two, so the app can't grant itself Pro or reset
-- its own count. The server writes them with the service role, which bypasses row-level security.
create policy "Read your own plan" on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Read your own AI usage" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Privileges. Policies decide which rows; these decide which tables and verbs at all.
-- Signed-out visitors (`anon`) get nothing: the app works on the phone without an account, and
-- an account is what unlocks the server.
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on function public.join_trip(uuid, uuid) from public, anon;
revoke all on all functions in schema private from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.shares_trip_with(uuid) to authenticated;
-- Runs inside the expenses check constraint, as whoever is saving the expense.
grant execute on function private.sum_amounts(jsonb) to authenticated;
grant execute on function public.join_trip(uuid, uuid) to authenticated;

-- Updates are granted column by column: a row can't be re-keyed, handed to another owner, or
-- moved to another trip by an update, whatever the policies say.
grant select, update (display_name) on public.profiles to authenticated;

grant select, insert, delete on public.places to authenticated;
-- `id` is in the list because an upsert through the API writes every column it was sent, the key
-- included. It can only ever be set on your own row, and `user_id` stays out of reach.
grant update (
  id, name, city, country, country_code, category, lat, lng, address, note,
  source_url, source_platform, saved_at, visited_at, deleted_at
) on public.places to authenticated;

grant select, insert, delete on public.trips to authenticated;
grant update (name, city, day_count, currency, invite_token, deleted_at) on public.trips to authenticated;

grant select, insert, delete on public.trip_members to authenticated;
grant update (name, user_id, deleted_at) on public.trip_members to authenticated;

grant select, insert, delete on public.trip_stops to authenticated;
grant update (day, position, name, city, country_code, category, lat, lng, deleted_at)
  on public.trip_stops to authenticated;

grant select, insert, delete on public.expenses to authenticated;
grant update (
  title, category, spent_on, amount_minor, original, payers, split_mode, shares, stop, deleted_at
) on public.expenses to authenticated;

grant select, insert, delete on public.settlements to authenticated;
grant update (from_member, to_member, amount_minor, paid_on, deleted_at) on public.settlements to authenticated;

grant select on public.entitlements to authenticated;
grant select on public.ai_usage to authenticated;
