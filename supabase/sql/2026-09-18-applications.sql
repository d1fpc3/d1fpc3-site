-- The landing page takes applications instead of selling: name, email, and how much
-- the person is willing to invest. Nobody can read the table but admins. The public
-- writes through one function that validates, dedupes by email and rate-limits.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  invest text not null check (invest in ('under_500', '500_1000', '1000_2500', '2500_5000', '5000_plus')),
  ref text,
  status text not null default 'new' check (status in ('new', 'contacted', 'accepted', 'passed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists applications_email_key on public.applications (lower(email));
create index if not exists applications_created_idx on public.applications (created_at desc);

alter table public.applications enable row level security;
revoke all on public.applications from anon, authenticated;
grant select, update, delete on public.applications to authenticated;
drop policy if exists applications_admin on public.applications;
create policy applications_admin on public.applications for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.submit_application(p_name text, p_email text, p_invest text, p_ref text default null)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ref text := nullif(upper(left(btrim(coalesce(p_ref, '')), 24)), '');
  v_label text;
  v_new boolean;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Enter your name.'; end if;
  if v_name ~* '(https?:|www\.|<|>)' then raise exception 'Enter your name.'; end if;
  if char_length(v_email) > 160 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Enter a real email.'; end if;
  if p_invest not in ('under_500', '500_1000', '1000_2500', '2500_5000', '5000_plus') then raise exception 'Pick a range.'; end if;
  -- a flood guard: the whole site takes at most 40 applications in any 10 minutes
  if (select count(*) from applications where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Too many applications right now. Try again in a few minutes.';
  end if;

  insert into applications (name, email, invest, ref) values (v_name, v_email, p_invest, v_ref)
  on conflict (lower(email)) do update set name = excluded.name, invest = excluded.invest, updated_at = now()
  returning (xmax = 0) into v_new;

  if v_new then
    v_label := case p_invest when 'under_500' then 'under $500' when '500_1000' then '$500 to $1,000'
      when '1000_2500' then '$1,000 to $2,500' when '2500_5000' then '$2,500 to $5,000' else '$5,000+' end;
    insert into notifications (user_id, kind, body)
    select e.user_id, 'system', 'New application: ' || v_name || ', ' || v_label
    from admins e;
  end if;
  return case when v_new then 'received' else 'updated' end;
end $$;

revoke all on function public.submit_application(text, text, text, text) from public;
grant execute on function public.submit_application(text, text, text, text) to anon, authenticated;
