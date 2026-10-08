-- Owner money (D1, 10-07: "save all this in an echelon page in admin or somewhere even more secure").
--
-- owner_money   D1's own finances, summarised from his statements: one snapshot row per refresh, the
--               newest one is what Admin > Money > Personal shows. The figures go in from the Management
--               API, never from this repo, and carry no account or routing numbers.
--
-- Tighter than the rest of the admin: not is_admin() but the owner's own login, so a second admin added
-- later still sees nothing. Anon gets no grant at all. The page may update a row only to tick its plan.

create table if not exists public.owner_money (
  id bigint generated always as identity primary key,
  as_of date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_money enable row level security;

revoke all on public.owner_money from anon, authenticated;
grant select, update (data, updated_at) on public.owner_money to authenticated;

-- d1fpc3@gmail.com, the only owner login (public.admins row added 2026-08-07)
drop policy if exists owner_money_read on public.owner_money;
create policy owner_money_read on public.owner_money for select to authenticated
  using (auth.uid() = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'::uuid);

drop policy if exists owner_money_tick on public.owner_money;
create policy owner_money_tick on public.owner_money for update to authenticated
  using (auth.uid() = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'::uuid)
  with check (auth.uid() = '4d6829d5-c685-404b-9dbd-d5f3e1f7be3f'::uuid);
