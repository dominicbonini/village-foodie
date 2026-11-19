-- 20261119_plans_everywhere_1.sql — plans-everywhere-1 (Dominic, 19 November 2026, docs/plans-everywhere-1-report.md):
-- ALL THREE PLANS ON SALE IN EVERY SWITCHED-ON COUNTRY, AND EVERY TRIAL ENDS ON PAY AS YOU GO.
--
-- ⛔ WRITTEN, NOT RUN. Dominic runs it ("I'll say when to run it, after I've approved the wording and deployed"). Deploy the pricing
--    wording first (the same commit): until then a monthly-billed country would show Pay as you go and Pro with the card-country fee
--    lines. Run with:
--      npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_1.sql --approved-by-dominic
--
-- WHAT IT DOES (one transaction; the world guard checks every statement — it is not deferrable):
--   1. plan_prices_world_guard, rule (a): an offered plan that charges a fee where HatchGrab may not take one FROM THE PAYMENT
--      (platform_fee_allowed false) is now allowed in a country whose fee is BILLED MONTHLY (country_billing.payment_model
--      'billed_online' or 'billed_at_truck') WHETHER OR NOT BILLING IS SWITCHED ON. Nothing is charged anywhere while
--      platform_switches.billing_enabled is false; once it is on, those countries are invoiced monthly as designed (billing-1).
--      A 'fee_from_payment' country, or one with NO country_billing row, is refused exactly as before. Rule (b) — a switched-on
--      country's trial-end plan must be on sale — is unchanged.
--   2. Pay as you go and Pro on sale (offered = true) in every switched-on billed_online / billed_at_truck country. No VAT
--      exclusion (Dominic: VAT-number capture is needed before BILLING is switched on, not before sale). Today: 164 countries,
--      328 rows (BR MY SG TH online; 160 at the truck). Prices, fees and allowances are the rows' own, unchanged.
--   3. is_trial_end moved off Unlimited in those countries, so a finished trial falls back to the plans table's expiry fallback,
--      Pay as you go (no monthly fee) — as in the 46 card countries. Today: 164 rows. Mexico (switched off) is left as it is.
--   Then it checks its own result and rolls back if any switched-on monthly-billed country is left without both plans on sale or
--   with a trial-end row still on Unlimited.
--
-- NOT CHANGED: prices, fees, allowances, country_billing, platform_switches (billing stays OFF), any 'fee_from_payment' country,
-- Mexico, any truck. Pizzeria Gusto and Le Roi du Churrasco are not named or touched.
--
-- VERIFY (read-only, after running):
--   select pp.plan_key, count(*) filter (where pp.offered) as on_sale, count(*) filter (where not pp.offered) as off,
--          count(*) filter (where pp.is_trial_end) as trial_end
--     from plan_prices pp join country_settings cs on cs.country_code = pp.country_code and cs.enabled group by 1 order by 1;
--   → payg 210 on / 0 off / 0 · pro 210 / 0 / 0 · unlimited 210 / 0 / 0
--
-- UNDO (only if Dominic asks) — in THIS order (the guard checks each statement):
--   begin;
--   update public.plan_prices pp set is_trial_end = true, updated_at = now()
--     from public.country_settings cs join public.country_billing cb on cb.country_code = cs.country_code
--    where pp.country_code = cs.country_code and cs.enabled and cb.payment_model in ('billed_online', 'billed_at_truck')
--      and pp.plan_key = 'unlimited' and not pp.is_trial_end;
--   update public.plan_prices pp set offered = false, updated_at = now()
--     from public.country_settings cs join public.country_billing cb on cb.country_code = cs.country_code
--    where pp.country_code = cs.country_code and cs.enabled and cb.payment_model in ('billed_online', 'billed_at_truck')
--      and pp.plan_key in ('payg', 'pro') and pp.offered;
--   -- then re-create plan_prices_world_guard() exactly as supabase/migrations/20261086_billing_1_correction.sql defines it
--   -- (rule (a)'s exception back to "billing switched on AND payment_model <> 'fee_from_payment'").
--   commit;

set lock_timeout = '3s';
begin;

-- ── 1 · the guard: rule (a)'s exception no longer waits for billing to be switched on ─────────────────────────────────
create or replace function public.plan_prices_world_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare bad text;
begin
  -- a) an offered row that charges a fee where HatchGrab may not take one FROM THE PAYMENT — unless that country's fee is billed
  --    monthly instead (country_billing billed_online / billed_at_truck; plans-everywhere-1: whether or not billing is switched on —
  --    nothing is charged while it is off)
  select string_agg(pp.country_code || ' (' || pp.plan_key || ')', ', ' order by pp.country_code, pp.plan_key) into bad
    from public.plan_prices pp join public.country_settings cs on cs.country_code = pp.country_code
   where pp.offered and pp.fee_bps > 0 and not cs.platform_fee_allowed
     and not exists (select 1 from public.country_billing cb
                      where cb.country_code = pp.country_code and cb.payment_model in ('billed_online', 'billed_at_truck'));
  if bad is not null then
    raise exception 'plan_prices: these offered plans charge a platform fee where HatchGrab may not take one: %', bad
      using errcode = 'check_violation';
  end if;
  -- b) a switched-on country whose trial-end plan is not offered there
  select string_agg(cs.country_code, ', ' order by cs.country_code) into bad
    from public.country_settings cs
   where cs.enabled
     and not exists (
       select 1 from public.plan_prices pp
        where pp.country_code = cs.country_code and pp.offered
          and pp.plan_key = coalesce(
                (select t.plan_key from public.plan_prices t where t.country_code = cs.country_code and t.is_trial_end),
                (select p.key from public.plans p where p.is_expiry_fallback)));
  if bad is not null then
    raise exception 'country_settings: the plan a finished trial drops to is not offered in: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.plan_prices_world_guard() from public, anon, authenticated;

-- ── 2 · Pay as you go and Pro on sale in every switched-on monthly-billed country ─────────────────────────────────────
update public.plan_prices pp
   set offered = true, updated_at = now()
  from public.country_settings cs
  join public.country_billing cb on cb.country_code = cs.country_code
 where pp.country_code = cs.country_code
   and cs.enabled
   and cb.payment_model in ('billed_online', 'billed_at_truck')
   and pp.plan_key in ('payg', 'pro')
   and not pp.offered;

-- ── 3 · a finished trial falls back to Pay as you go (the expiry fallback) there — AFTER step 2, or rule (b) refuses it ─
update public.plan_prices pp
   set is_trial_end = false, updated_at = now()
  from public.country_settings cs
  join public.country_billing cb on cb.country_code = cs.country_code
 where pp.country_code = cs.country_code
   and cs.enabled
   and cb.payment_model in ('billed_online', 'billed_at_truck')
   and pp.plan_key = 'unlimited'
   and pp.is_trial_end;

-- ── 4 · the result, checked ─────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare bad text;
begin
  select string_agg(cs.country_code, ' ' order by cs.country_code) into bad
    from public.country_settings cs join public.country_billing cb on cb.country_code = cs.country_code
   where cs.enabled and cb.payment_model in ('billed_online', 'billed_at_truck')
     and (    not exists (select 1 from public.plan_prices p where p.country_code = cs.country_code and p.plan_key = 'payg' and p.offered)
           or not exists (select 1 from public.plan_prices p where p.country_code = cs.country_code and p.plan_key = 'pro' and p.offered)
           or exists (select 1 from public.plan_prices p where p.country_code = cs.country_code and p.is_trial_end));
  if bad is not null then
    raise exception 'plans-everywhere-1: these switched-on monthly-billed countries are not as intended: %', bad;
  end if;
  if coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false) then
    raise notice 'plans-everywhere-1: billing is switched ON — these countries will be invoiced monthly from the next run';
  end if;
end $$;

commit;
