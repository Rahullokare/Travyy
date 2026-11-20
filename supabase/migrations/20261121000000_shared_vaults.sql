-- Shared vaults: friends build one vault together ("Goa weekend", "Cafés to try"). See
-- docs/ARCHITECTURE.md, 24.
--
-- Saved places are private, so a shared vault can't point into one person's `places`. Like a
-- trip's stops, each spot in a shared vault is a copy (`vault_spots`): name, coordinates and
-- category, nothing personal. Every phone in the vault adds the spots to its own saves and keeps
-- its own visited and ❤ marks.

-- Whoever holds this can join the vault. Rotating it cancels old invite links.
alter table public.vaults add column invite_token uuid not null default gen_random_uuid() unique;

create table public.vault_members (
  vault_id uuid not null references public.vaults (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);

create index vault_members_user on public.vault_members (user_id);

-- The owner or someone who joined. Runs with definer rights so policies on these tables can ask
-- without recursing into themselves.
create function private.is_vault_member(vault uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.vaults v where v.id = vault and v.user_id = (select auth.uid()))
    or exists (
      select 1 from public.vault_members m where m.vault_id = vault and m.user_id = (select auth.uid())
    );
$$;

create function private.owns_vault(vault uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.vaults v where v.id = vault and v.user_id = (select auth.uid()));
$$;

create table public.vault_spots (
  id uuid primary key,
  vault_id uuid not null references public.vaults (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  city text check (char_length(city) <= 120),
  country text check (char_length(country) <= 120),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  category text not null check (
    category in ('food', 'cafe', 'nightlife', 'sight', 'nature', 'stay', 'shopping', 'activity', 'other')
  ),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text check (char_length(address) <= 300),
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Sync pulls "this vault's spots changed since X".
create index vault_spots_vault_updated on public.vault_spots (vault_id, updated_at);

create trigger vault_spots_touch before insert or update on public.vault_spots
  for each row execute function private.touch_updated_at();

-- Joining by invite link. Joining twice, or joining your own vault, is not an error: links get
-- tapped more than once.
create function public.join_vault(token uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  vault uuid;
  owner uuid;
begin
  if me is null then
    raise exception 'Sign in to join a vault' using errcode = '28000';
  end if;

  select v.id, v.user_id into vault, owner
  from public.vaults v
  where v.invite_token = token and v.deleted_at is null;
  if vault is null then
    raise exception 'This invite link is no longer valid' using errcode = 'P0002';
  end if;

  if owner <> me then
    insert into public.vault_members (vault_id, user_id) values (vault, me) on conflict do nothing;
  end if;
  return vault;
end;
$$;

alter table public.vault_members enable row level security;
alter table public.vault_spots enable row level security;

-- The owner's policy on `vaults` (all verbs) stays; this adds reading for the people in it.
create policy "People in a shared vault can see it" on public.vaults
  for select to authenticated
  using (private.is_vault_member(id));

create policy "People in a vault can see who's in it" on public.vault_members
  for select to authenticated
  using (private.is_vault_member(vault_id));

-- Leave, or (the owner) remove someone. Joining only happens through `join_vault`.
create policy "Leave a vault, or remove someone from yours" on public.vault_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.owns_vault(vault_id));

create policy "People in a vault can see its spots" on public.vault_spots
  for select to authenticated
  using (private.is_vault_member(vault_id));

create policy "People in a vault add spots as themselves" on public.vault_spots
  for insert to authenticated
  with check (private.is_vault_member(vault_id) and added_by = (select auth.uid()));

-- Anyone in the vault can take a spot out (a soft delete), as on a shared list.
create policy "People in a vault can take spots out" on public.vault_spots
  for update to authenticated
  using (private.is_vault_member(vault_id))
  with check (private.is_vault_member(vault_id));

revoke all on public.vault_members, public.vault_spots from anon, authenticated;
revoke all on function public.join_vault(uuid) from public, anon;
revoke all on function private.is_vault_member(uuid), private.owns_vault(uuid) from public, anon;

grant execute on function private.is_vault_member(uuid) to authenticated;
grant execute on function private.owns_vault(uuid) to authenticated;
grant execute on function public.join_vault(uuid) to authenticated;

grant select, delete on public.vault_members to authenticated;
-- Inserts never overwrite (the phone sends "on conflict do nothing"), and only `deleted_at` can
-- change afterwards: a spot can't be moved to another vault or reattributed.
grant select, insert on public.vault_spots to authenticated;
grant update (deleted_at) on public.vault_spots to authenticated;
-- The owner can rotate the invite link (stop sharing).
grant update (invite_token) on public.vaults to authenticated;
