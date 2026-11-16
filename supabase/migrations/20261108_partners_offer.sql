-- 20261108_partners_offer.sql — the partner programme's offer (partners-3 report §0, Dominic 16 November 2026): NOTHING ABOUT THE
-- OFFER IS DECIDED, so nothing has a default. A code is created by hand in the partner's drawer, with its deal and its commission.
--
--   partner_codes.deal_type      extra_trial_months | percent_off | fixed_price            (+ fixed_price)
--   partner_codes.deal_plan_key  the plan a percent_off / fixed_price deal is for (null = any paid plan; fixed_price needs one)
--   partner_codes.deal_currency  fixed_price only: the currency of deal_value (the monthly price, in minor units)
--   partner_codes.pct_year1 / pct_year2   NO DEFAULT any more — every code states its commission
--   partner_code_redemptions     + the deal's plan / currency as they stood, and when the price reached a paid plan
--
-- Decision 1 = A: a percent_off / fixed_price deal is applied when the truck MOVES ONTO A PAID PLAN (the plan it names, or any paid
-- plan), for N months from that day, through the existing promotional price (trucks.plan_price_override_minor / _until). The code
-- does that (lib/partner-codes-server.ts applyPartnerPrice); this file only stores it.
-- 🔴 ADDITIVE: no code exists (select count(*) from partner_codes = 0), so no row changes meaning.
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261108_partners_offer.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

alter table public.partner_codes
  alter column pct_year1 drop default,
  alter column pct_year2 drop default,
  add column if not exists deal_plan_key text references public.plans(key) on delete restrict,
  add column if not exists deal_currency text check (deal_currency is null or deal_currency ~ '^[A-Z]{3}$');

alter table public.partner_codes drop constraint if exists partner_codes_deal_type_check;
alter table public.partner_codes add constraint partner_codes_deal_type_check
  check (deal_type in ('extra_trial_months', 'percent_off', 'fixed_price'));

alter table public.partner_codes drop constraint if exists partner_codes_deal_shape;
alter table public.partner_codes add constraint partner_codes_deal_shape check (
  (deal_type = 'extra_trial_months' and deal_value <= 24 and deal_months is null and deal_plan_key is null and deal_currency is null)
  or (deal_type = 'percent_off' and deal_value <= 100 and deal_months is not null and deal_currency is null)
  or (deal_type = 'fixed_price' and deal_months is not null and deal_plan_key is not null and deal_currency is not null)
);

comment on column public.partner_codes.deal_value is
  'extra_trial_months: months added; percent_off: the percentage (1–100); fixed_price: the monthly price in minor units of deal_currency.';
comment on column public.partner_codes.deal_plan_key is
  'percent_off / fixed_price: the plan the deal is for (null = any paid plan; fixed_price always names one).';

alter table public.partner_code_redemptions
  add column if not exists deal_plan_key    text,
  add column if not exists deal_currency    text,
  add column if not exists price_applied_at timestamptz,
  add column if not exists price_plan_key   text;

comment on column public.partner_code_redemptions.price_applied_at is
  'When a percent_off / fixed_price deal reached a paid plan (trucks.plan_price_override_* set from that day for deal_months).';

commit;

notify pgrst, 'reload schema';

-- VERIFY (read-only):
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.partner_codes'::regclass and conname like 'partner_codes_deal%';
-- select column_name, column_default from information_schema.columns where table_name = 'partner_codes' and column_name like 'pct_year%';
