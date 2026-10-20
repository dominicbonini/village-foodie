-- 20261024_plans.sql — PLANS AND THEIR PRICES ARE DATA (Stage A of the new pricing, docs/plans-data-model-report.md).
--
-- ▶ RUN NOW — BEFORE the code that reads it is deployed. It is additive for the code running today:
--   • the old code never reads `plans` / `plan_prices`;
--   • the old code always writes trucks.plan explicitly ('trial' at signup, 'demo' for demos) and every live truck is on
--     'trial' or 'demo', both seeded below, so the foreign key accepts every existing and every newly provisioned row;
--   • the old admin screen still OFFERS 'starter' / 'pro' / 'max' buttons: after this file those three are refused by the
--     foreign key (nobody is on them; Stage A's admin offers the table's plans instead);
--   • country_settings_enabled_needs_prices_chk is replaced by a trigger with the new rule (below). GB is switched on and
--     gets its plan_prices rows here, before the trigger exists; the US stays switched off.
--
-- WHAT IT DOES
--   1. public.plans — one row per plan. key, name, description, order, and the flags the code reads instead of
--      hardcoding a plan name: is_public, is_internal, is_trial, is_signup_default (exactly one), is_expiry_fallback
--      (exactly one), is_demo (exactly one — the plan a demo truck is provisioned on; a refinement of the briefed shape),
--      pay_at_hatch_allowed (stored and exposed, NOT ENFORCED in Stage A), active.
--   2. public.plan_prices — a plan's price in one country: monthly_minor, included_online_minor (NULL = unlimited),
--      fee_bps (the platform fee on online food above the included amount), extra_van_monthly_minor.
--   3. trucks: plan → plans.key (foreign key, replacing trucks_plan_check); the column default ('starter', a plan that
--      no longer exists) is DROPPED because provisioning always writes the plan; a per-truck promotional monthly
--      price (plan_price_override_minor / _until / _note).
--   4. country_settings: "a country can be switched on only if every active public plan has a plan_prices row for it",
--      as triggers (a CHECK cannot read another table). The six old plan-price columns are commented RETIRED, not
--      dropped. platform_fee_enabled is unchanged (still the per-country switch, still OFF).
--   5. Demo trucks: batch reservations become a per-truck override instead of `plan = 'demo'` in code.
--
-- SECURITY — mirrors public.country_settings exactly: RLS on, NO policies, every grant revoked from anon,
-- authenticated and public, all privileges to service_role. The app reads both tables server-side with the service
-- role. Every function below is revoked from public, anon and authenticated in this file; they are trigger functions,
-- and a trigger fires without its function's EXECUTE privilege.
--
-- VERIFY (read-only, after running):
--   select key, is_public, is_internal, is_trial, is_signup_default, is_expiry_fallback, is_demo, pay_at_hatch_allowed, active
--     from public.plans order by sort_order;                                                   -- 6 rows
--   select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor
--     from public.plan_prices order by country_code, plan_key;                                 -- 6 rows (GB, US × 3)
--   select relname, relrowsecurity, relacl::text from pg_class where relname in ('plans','plan_prices','country_settings');
--     -- all three: true · {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.trucks'::regclass
--     and conname in ('trucks_plan_check','trucks_plan_fkey');                                   -- trucks_plan_fkey only
--   select column_default from information_schema.columns where table_name = 'trucks' and column_name = 'plan';  -- NULL
--   select tgname from pg_trigger where tgname like '%plan_prices%' and not tgisinternal;       -- 3 triggers

-- ── 1 · plans ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.plans (
  key                  text primary key,
  name                 text not null,
  description          text not null default '',
  sort_order           integer not null,
  is_public            boolean not null default false,
  is_internal          boolean not null default false,
  is_trial             boolean not null default false,
  is_signup_default    boolean not null default false,
  is_expiry_fallback   boolean not null default false,
  is_demo              boolean not null default false,
  pay_at_hatch_allowed boolean not null default true,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint plans_key_chk check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint plans_name_chk check (length(btrim(name)) > 0),
  constraint plans_public_xor_internal_chk check (not (is_public and is_internal)),
  constraint plans_expiry_fallback_chk check (not is_expiry_fallback or (is_public and active and not is_trial)),
  constraint plans_signup_default_chk check (not is_signup_default or active),
  constraint plans_demo_chk check (not is_demo or (is_internal and active))
);
create unique index if not exists plans_one_signup_default on public.plans ((true)) where is_signup_default;
create unique index if not exists plans_one_expiry_fallback on public.plans ((true)) where is_expiry_fallback;
create unique index if not exists plans_one_demo on public.plans ((true)) where is_demo;

alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated, public;
grant all on public.plans to service_role;

comment on table public.plans is
  'ONE row per plan. The ONLY source for the plan list, order, names, descriptions and flags (lib/plans.ts reads it; no plan name is hardcoded in code). Exactly one is_signup_default (new trucks), one is_expiry_fallback (a truck whose plan end date — trucks.trial_expires_at — has passed resolves to it, with every feature), one is_demo (demo trucks). Every active plan gets every feature. pay_at_hatch_allowed is stored and exposed but NOT ENFORCED yet (Stage A). SERVICE ROLE ONLY, like country_settings: RLS on, no policies, no grants to anon/authenticated.';

insert into public.plans (key, name, description, sort_order, is_public, is_internal, is_trial, is_signup_default, is_expiry_fallback, is_demo, pay_at_hatch_allowed, active) values
  ('payg',      'Pay as you go', 'No monthly fee. A platform fee on online card orders.',                      10, true,  false, false, false, true,  false, false, true),
  ('pro',       'Pro',           'A monthly fee with online orders included each month, then a small fee.',  20, true,  false, false, false, false, false, true,  true),
  ('unlimited', 'Unlimited',     'A monthly fee and no platform fee on online orders.',                       30, true,  false, false, false, false, false, true,  true),
  ('trial',     'Free trial',    'Every feature, free, while the trial runs.',                                40, false, true,  true,  true,  false, false, true,  true),
  ('demo',      'Demo',          'Prospect sandbox — never public.',                                          50, false, true,  false, false, false, true,  true,  true),
  ('tester',    'Tester',        'Pre-launch tester — full access.',                                          60, false, true,  false, false, false, false, true,  true)
on conflict (key) do nothing;

-- ── 2 · plan_prices ────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_prices (
  plan_key                 text not null references public.plans(key) on update cascade on delete restrict,
  country_code             text not null references public.country_settings(country_code) on update cascade on delete restrict,
  monthly_minor            integer not null,
  included_online_minor    integer,
  fee_bps                  integer not null,
  extra_van_monthly_minor  integer not null,
  updated_at               timestamptz not null default now(),
  primary key (plan_key, country_code),
  constraint plan_prices_monthly_chk   check (monthly_minor >= 0),
  constraint plan_prices_included_chk  check (included_online_minor is null or included_online_minor >= 0),
  constraint plan_prices_fee_chk       check (fee_bps between 0 and 10000),
  constraint plan_prices_extra_van_chk check (extra_van_monthly_minor >= 0)
);

alter table public.plan_prices enable row level security;
revoke all on public.plan_prices from anon, authenticated, public;
grant all on public.plan_prices to service_role;

comment on table public.plan_prices is
  'A plan''s price in one country, in that country''s currency (minor units). monthly_minor; included_online_minor = online food sales included each month (NULL = unlimited); fee_bps = the platform fee on online food above the included amount (food subtotal only — never tax, tips or the customer service fee); extra_van_monthly_minor. Internal plans (trial, demo, tester) have no rows: they charge nothing. A country can be switched on only when every active public plan has a row for it (trigger country_settings_require_plan_prices). SERVICE ROLE ONLY, like country_settings.';
comment on column public.plan_prices.included_online_minor is 'Online food sales included each month before fee_bps applies. NULL = unlimited (no fee at any volume).';
comment on column public.plan_prices.fee_bps is 'Platform fee in basis points (150 = 1.5%) on online food above included_online_minor. Not charged while country_settings.platform_fee_enabled is false (it is false everywhere at Stage A).';

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'GB',    0,      0, 150,    0),
  ('pro',       'GB', 2900, 250000,  99, 2900),
  ('unlimited', 'GB', 6900,   null,   0, 6900),
  ('payg',      'US',    0,      0, 150,    0),
  ('pro',       'US', 2900, 250000,  99, 2900),
  ('unlimited', 'US', 6900,   null,   0, 6900)
on conflict (plan_key, country_code) do nothing;

-- ── 3 · trucks ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.trucks add column if not exists plan_price_override_minor integer;
alter table public.trucks add column if not exists plan_price_override_until date;
alter table public.trucks add column if not exists plan_price_override_note  text;
alter table public.trucks drop constraint if exists trucks_plan_price_override_chk;
alter table public.trucks add constraint trucks_plan_price_override_chk
  check (plan_price_override_minor is null or plan_price_override_minor >= 0);
alter table public.trucks drop constraint if exists trucks_plan_price_override_until_chk;
alter table public.trucks add constraint trucks_plan_price_override_until_chk
  check (plan_price_override_until is null or plan_price_override_minor is not null);

alter table public.trucks drop constraint if exists trucks_plan_check;
alter table public.trucks alter column plan drop default;
alter table public.trucks drop constraint if exists trucks_plan_fkey;
alter table public.trucks add constraint trucks_plan_fkey
  foreign key (plan) references public.plans(key) on update cascade on delete restrict;

comment on column public.trucks.plan is
  'The truck''s plan: a public.plans key (foreign key). No default: provisioning always writes the signup-default plan (plans.is_signup_default), or the demo plan (plans.is_demo) for a demo truck.';
comment on column public.trucks.trial_expires_at is
  'The END DATE of the truck''s plan (any plan, not only the trial — the name is historical). NULL = no end. Once it has passed, the truck resolves to the expiry-fallback plan (plans.is_expiry_fallback) at read time, with every feature (lib/plans.ts effectivePlan).';
comment on column public.trucks.plan_price_override_minor is
  'A per-truck promotional monthly price for its plan, in its country''s minor units (e.g. 4900 = GBP 49 Unlimited). NULL = the standard price (plan_prices.monthly_minor). Applies while plan_price_override_until is NULL or not yet past; after that the standard price, at read time.';
comment on column public.trucks.plan_price_override_until is 'Last day the promotional price applies (inclusive). NULL = until changed.';
comment on column public.trucks.plan_price_override_note is 'Why the promotional price was given (admin note; never shown to the operator).';

-- ── 4 · country_settings: switched on only when every active public plan is priced there ───────────────────────────
alter table public.country_settings drop constraint if exists country_settings_enabled_needs_prices_chk;

create or replace function public.country_settings_require_plan_prices() returns trigger
language plpgsql set search_path = public as $$
declare missing text;
begin
  if new.enabled then
    select string_agg(p.key, ', ' order by p.sort_order) into missing
      from public.plans p
     where p.active and p.is_public
       and not exists (select 1 from public.plan_prices pp where pp.plan_key = p.key and pp.country_code = new.country_code);
    if missing is not null then
      raise exception 'country_settings: % cannot be switched on — no plan_prices row for: %', new.country_code, missing
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.country_settings_require_plan_prices() from public, anon, authenticated;

drop trigger if exists country_settings_require_plan_prices on public.country_settings;
create trigger country_settings_require_plan_prices
  before insert or update on public.country_settings
  for each row execute function public.country_settings_require_plan_prices();

-- The same rule from the other side: a plan made public/active, or a price row deleted or moved, must not leave a
-- switched-on country unpriced.
create or replace function public.plans_keep_enabled_countries_priced() returns trigger
language plpgsql set search_path = public as $$
declare bad text;
begin
  select string_agg(cs.country_code || ' (' || p.key || ')', ', ' order by cs.country_code, p.sort_order) into bad
    from public.country_settings cs cross join public.plans p
   where cs.enabled and p.active and p.is_public
     and not exists (select 1 from public.plan_prices pp where pp.plan_key = p.key and pp.country_code = cs.country_code);
  if bad is not null then
    raise exception 'plans: a switched-on country would have no plan_prices row for: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.plans_keep_enabled_countries_priced() from public, anon, authenticated;

drop trigger if exists plans_keep_enabled_countries_priced on public.plans;
create trigger plans_keep_enabled_countries_priced
  after insert or update on public.plans
  for each statement execute function public.plans_keep_enabled_countries_priced();
drop trigger if exists plan_prices_keep_enabled_countries_priced on public.plan_prices;
create trigger plan_prices_keep_enabled_countries_priced
  after delete or update on public.plan_prices
  for each statement execute function public.plans_keep_enabled_countries_priced();

comment on column public.country_settings.enabled is
  'Can trucks sign up from this country. Cannot be true unless every active public plan has a plan_prices row for this country (trigger country_settings_require_plan_prices; it replaced country_settings_enabled_needs_prices_chk on 20261024).';
comment on column public.country_settings.starter_monthly_minor is
  'RETIRED as a plan source (20261024): plan prices live in plan_prices. Read only by lib/legacy-pricing-display.ts (Stage B — awaiting mockup; display only) until Stage B deletes that file. Kept, not dropped.';
comment on column public.country_settings.pro_monthly_minor is
  'RETIRED as a plan source (20261024) — see starter_monthly_minor. Kept, not dropped.';
comment on column public.country_settings.max_monthly_minor is
  'RETIRED as a plan source (20261024) — see starter_monthly_minor. Kept, not dropped.';
comment on column public.country_settings.pro_allowance_minor is
  'RETIRED as a plan source (20261024): the included amount is plan_prices.included_online_minor. Display-only reader until Stage B. Kept, not dropped.';
comment on column public.country_settings.max_allowance_minor is
  'RETIRED as a plan source (20261024) — see pro_allowance_minor. Kept, not dropped.';
comment on column public.country_settings.platform_fee_pct is
  'RETIRED as a plan source (20261024): the platform fee is plan_prices.fee_bps. Display-only reader (lib/legacy-pricing-display.ts) until Stage B. Kept, not dropped. platform_fee_enabled is unchanged and remains the per-country switch.';

-- ── 5 · demo trucks: batch reservations as a per-truck override ────────────────────────────────────────────────────
-- Until now `plan = 'demo'` switched batch reservations on in code (lib/features.ts resolveBatchReservations). The
-- override already existed for every other truck; demo trucks get it written so no code names the demo plan. New demo
-- trucks are provisioned with it (lib/provision-truck.ts, demo profile). Touches the demo trucks only.
update public.trucks
   set feature_overrides = coalesce(feature_overrides, '{}'::jsonb) || '{"batch_reservations": true}'::jsonb
 where plan = 'demo'
   and not (coalesce(feature_overrides, '{}'::jsonb) ? 'batch_reservations');
