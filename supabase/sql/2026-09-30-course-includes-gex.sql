-- 2026-09-30: an Echelon membership carries D1 GEX as well as D1 LIT (D1: "tell people that you get the GEX indicator
-- along with the purchase"). Every member already held GEX as a manual comp; this makes it automatic for every new
-- membership (Stripe, the iOS purchase, a comp, a redeemed code), the same way LIT has worked since member_lit_sync:
--   * a course turning active grants each perk the member does not already hold, source 'member';
--   * a course ending revokes only the member-sourced perks and queues their TradingView access for removal;
--   * a perk bought or comped on its own that ends while the course is still active comes back as member-sourced.
-- The trigger keeps its name (member_lit_sync) so nothing that references it changes.

create or replace function public.member_lit_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  perks constant text[] := array['d1-lit', 'd1-gex'];   -- what a membership carries
  perk text;
  v_has boolean;
  v_has_course boolean;
begin
  -- Only course rows and perk rows matter here; the perk rows this function writes are inserts (or updates from a
  -- non-active state), which the last branch ignores, so the trigger cannot recurse.
  if new.product = 'course' then
    if new.status = 'active' then
      foreach perk in array perks loop
        select exists (
          select 1 from entitlements
           where lower(email) = lower(new.email) and product = perk and status = 'active'
        ) into v_has;
        if not v_has then
          perform grant_entitlement(p_email => new.email, p_product => perk, p_source => 'member');
        end if;
      end loop;
    elsif tg_op = 'UPDATE' and old.status = 'active' then
      foreach perk in array perks loop
        update entitlements
           set status = 'revoked', revoked_at = now()
         where lower(email) = lower(new.email)
           and product = perk and source = 'member' and status = 'active';
        update tv_access t
           set state = 'pending_revoke', actioned_at = null
         where lower(t.email) = lower(new.email)
           and t.product = perk
           and t.state in ('granted', 'pending_grant', 'needs_username')
           and not exists (
             select 1 from entitlements e
              where lower(e.email) = lower(new.email) and e.product = perk and e.status = 'active'
           );
      end loop;
    end if;
  elsif new.product = any (perks) and tg_op = 'UPDATE'
        and old.status = 'active' and new.status <> 'active' and new.source <> 'member' then
    -- a comp or a purchase of the perk ended, but they are still a member: the membership keeps it alive
    select exists (
      select 1 from entitlements
       where lower(email) = lower(new.email) and product = 'course' and status = 'active'
    ) into v_has_course;
    if v_has_course then
      perform grant_entitlement(p_email => new.email, p_product => new.product, p_source => 'member');
      update tv_access
         set state = case when tv_username is null then 'needs_username' else 'pending_grant' end,
             actioned_at = null
       where lower(email) = lower(new.email) and product = new.product and state = 'pending_revoke';
    end if;
  end if;
  return new;
end
$$;
