-- Vaults: collections a person makes from their saves ("Cafés to try", "Goa weekend"), and the
-- ❤ mark on a place. See docs/ARCHITECTURE.md, 23.
--
-- A vault is one row with its place ids as an array, like an expense keeps its payers as JSON:
-- one record on the phone is one row here, so "last write wins" stays per vault. The ids are
-- references into the same person's `places`, which are private to them, so there is no foreign
-- key: a place deleted on one phone may still be listed by a vault on another until it syncs,
-- and the phone skips ids it doesn't have.

alter table public.places add column liked_at timestamptz;

grant update (liked_at) on public.places to authenticated;

create table public.vaults (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  emoji text check (char_length(emoji) between 1 and 16),
  place_ids uuid[] not null default '{}' check (cardinality(place_ids) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Sync pulls "my rows changed since X".
create index vaults_user_updated on public.vaults (user_id, updated_at);

create trigger vaults_touch before insert or update on public.vaults
  for each row execute function private.touch_updated_at();

alter table public.vaults enable row level security;

create policy "Your vaults are yours alone" on public.vaults
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.vaults from anon, authenticated;
grant select, insert, delete on public.vaults to authenticated;
-- `id` is listed because an upsert writes every column it was sent; `user_id` stays out of reach.
grant update (id, name, emoji, place_ids, created_at, deleted_at) on public.vaults to authenticated;
