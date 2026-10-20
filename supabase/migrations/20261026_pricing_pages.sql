-- 20261026_pricing_pages.sql — THE NEW PRICES AND THE TWO DISPLAY FIELDS THE PUBLIC PRICING PAGES READ (Stage B of the
-- new pricing, docs/pricing-pages-report.md).
--
-- ▶ RUN NOW — after 20261024_plans.sql and 20261025_plan_features.sql (both live). The code running today does not read
--   the two new columns, and the changed values only reach a visitor once the Stage B code reads them:
--   • Stage A2 code (if deployed) reads plan_prices for Billing and the van modal — the new fee and included amount are
--     the intended prices; it reads plan_features (payg event_types off: see the report for who is affected — no live
--     truck is on payg) and trial_months (the trial popup / Billing "A {N}-month free trial" line, signup's end date).
--
-- WHAT IT DOES
--   1. plan_prices: Pay as you go's fee 0.99% (fee_bps 99), GB and US. Pro includes 400000 minor units of online orders a
--      month (£4,000 / $4,000), GB and US. Unlimited unchanged (6900, NULL = unlimited, 0).
--   2. plan_features: Pay as you go has event_types (custom event types & pricing) switched OFF. Private events stay on
--      for every plan (no row).
--   3. plans.trial_months: the trial is 3 months (was 4). Existing trucks' end dates are NOT changed.
--   4. plans.is_highlighted (boolean, at most one): the plan the pricing pages mark "MOST TRUCKS" and colour — Pro.
--   5. plans.subtitle (text): the short line under a plan's name on the pricing cards ("Seasonal & part-time traders").
--
-- SECURITY: no new table, no new function. plans / plan_prices / plan_features keep their RLS and grants.
--
-- VERIFY (read-only, after running):
--   select key, is_highlighted, subtitle, trial_months from public.plans order by sort_order;
--   select plan_key, country_code, monthly_minor, included_online_minor, fee_bps from public.plan_prices order by country_code, plan_key;
--   select plan_key, feature, enabled from public.plan_features order by plan_key, feature;   -- 4 rows, payg

-- ── 1 · prices ─────────────────────────────────────────────────────────────────────────────────────────────────────
update public.plan_prices set fee_bps = 99 where plan_key = 'payg' and country_code in ('GB', 'US');
update public.plan_prices set included_online_minor = 400000 where plan_key = 'pro' and country_code in ('GB', 'US');

-- ── 2 · feature switches ───────────────────────────────────────────────────────────────────────────────────────────
insert into public.plan_features (plan_key, feature, enabled) values ('payg', 'event_types', false)
on conflict (plan_key, feature) do update set enabled = excluded.enabled, updated_at = now();

-- ── 3 · trial length ───────────────────────────────────────────────────────────────────────────────────────────────
update public.plans set trial_months = 3 where key = 'trial';

-- ── 4 · the highlighted plan ───────────────────────────────────────────────────────────────────────────────────────
alter table public.plans add column if not exists is_highlighted boolean not null default false;
create unique index if not exists plans_one_highlighted on public.plans ((true)) where is_highlighted;
alter table public.plans drop constraint if exists plans_highlighted_chk;
alter table public.plans add constraint plans_highlighted_chk check (not is_highlighted or (is_public and active));
update public.plans set is_highlighted = (key = 'pro') where is_highlighted is distinct from (key = 'pro');
comment on column public.plans.is_highlighted is
  'The plan the public pricing pages mark "MOST TRUCKS" and colour (the card, its button, the /features column). At most one; public and active only.';

-- ── 5 · the card subtitle ──────────────────────────────────────────────────────────────────────────────────────────
alter table public.plans add column if not exists subtitle text;
update public.plans set subtitle = 'Seasonal & part-time traders' where key = 'payg';
update public.plans set subtitle = 'Trucks taking regular pre-orders' where key = 'pro';
update public.plans set subtitle = 'Busy trucks & festivals' where key = 'unlimited';
comment on column public.plans.subtitle is
  'The short line under the plan''s name on the public pricing cards ("Seasonal & part-time traders"). NULL = none. Data, so a new plan carries its own.';
