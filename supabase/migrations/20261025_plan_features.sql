-- 20261025_plan_features.sql — PER-PLAN FEATURE SWITCHES, INCLUDED VANS, TRIAL LENGTH (Stage A2 of the new pricing,
-- docs/plan-features-config-report.md).
--
-- ▶ RUN NOW — AFTER 20261024_plans.sql (it alters public.plans) and BEFORE the code that reads it is deployed.
--   It is additive for the Stage A code: that code selects named plan columns (the two new ones are ignored), never
--   reads plan_features, and does not enforce pay_at_hatch_allowed (which this file sets TRUE for every plan anyway).
--
-- WHAT IT DOES
--   1. plans.included_vans (int, ≥ 1, default 1) — vans included in the plan's monthly price; each van above it costs
--      plan_prices.extra_van_monthly_minor. Seeded 1 for every plan.
--   2. plans.trial_months (int, NULL unless is_trial, ≥ 1) — the trial's length. Seeded 4 for the trial plan. Signup
--      sets trucks.trial_expires_at to signup + trial_months, at the end of that day in the truck's time zone; existing
--      trucks' end dates are NOT changed.
--   3. Pay as you go: pay_at_hatch_allowed = TRUE (every plan is now true). The flag is ENFORCED from this stage: a plan
--      with it false hides Pay at Hatch from customers and refuses it at submit.
--   4. Plan descriptions (no numbers in them, so they cannot drift from prices): payg, pro, unlimited, trial.
--   5. public.plan_features (plan_key, feature, enabled) — a plan's feature switches. A feature with NO row for a plan
--      is ENABLED, so a new feature is on for every plan until a row switches it off. `feature` is a code Feature key
--      (lib/features.ts FEATURES): the loader refuses a catalogue that names an unknown one. Seeded: Pay as you go has
--      WhatsApp auto-replies, social media posts (schedule graphics: weekly and single-event posts, places posts) and
--      Messenger & Instagram auto-replies switched OFF. Every other plan has no rows: everything on.
--
-- SECURITY — mirrors public.plans (and country_settings) exactly: RLS on, NO policies, every grant revoked from anon,
-- authenticated and public, all privileges to service_role. No functions are created here.
--
-- VERIFY (read-only, after running):
--   select key, included_vans, trial_months, pay_at_hatch_allowed, description from public.plans order by sort_order;
--   select plan_key, feature, enabled from public.plan_features order by plan_key, feature;            -- 3 rows, payg
--   select relname, relrowsecurity, relacl::text from pg_class where relname in ('plans','plan_features');
--     -- both: true · {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ── 1 · plans: included vans and trial length ──────────────────────────────────────────────────────────────────────
alter table public.plans add column if not exists included_vans integer not null default 1;
alter table public.plans drop constraint if exists plans_included_vans_chk;
alter table public.plans add constraint plans_included_vans_chk check (included_vans >= 1);

alter table public.plans add column if not exists trial_months integer;
alter table public.plans drop constraint if exists plans_trial_months_chk;
alter table public.plans add constraint plans_trial_months_chk
  check (trial_months is null or (is_trial and trial_months >= 1));

update public.plans set trial_months = 4 where key = 'trial' and trial_months is null;

comment on column public.plans.included_vans is
  'Vans included in the plan''s monthly price (≥ 1). Each van above it costs plan_prices.extra_van_monthly_minor in the truck''s country.';
comment on column public.plans.trial_months is
  'A trial plan''s length in months (NULL unless is_trial). At signup, trucks.trial_expires_at = signup + trial_months, at the end of that day in the truck''s time zone (lib/plans.ts trialEndFor). Changing it does not move existing trucks'' end dates.';

-- ── 2 · Pay at Hatch on every plan, now enforced ───────────────────────────────────────────────────────────────────
update public.plans set pay_at_hatch_allowed = true where key = 'payg';
comment on column public.plans.pay_at_hatch_allowed is
  'ENFORCED (Stage A2): false hides Pay at Hatch from the truck''s customers and refuses it at submit (lib/plans.ts payAtHatchOn). True on every plan as seeded.';

-- ── 3 · descriptions (no numbers, so they cannot drift from prices) ────────────────────────────────────────────────
update public.plans set description = 'No monthly fee. You only pay when a customer pays online by card.' where key = 'payg';
update public.plans set description = 'Everything, including WhatsApp auto-replies and social media posts, with online orders included each month.' where key = 'pro';
update public.plans set description = 'Everything, with no fees on online orders, however busy you get.' where key = 'unlimited';
update public.plans set description = 'Every feature, free, while your trial runs.' where key = 'trial';

comment on table public.plans is
  'ONE row per plan. The ONLY source for the plan list, order, names, descriptions and flags (lib/plans.ts reads it; no plan name is hardcoded in code). Exactly one is_signup_default (new trucks), one is_expiry_fallback (a truck whose plan end date — trucks.trial_expires_at — has passed resolves to it, WITH ITS feature switches), one is_demo (demo trucks). A plan has every feature unless public.plan_features switches one off. included_vans, trial_months and pay_at_hatch_allowed (enforced) are read by code. SERVICE ROLE ONLY, like country_settings: RLS on, no policies, no grants to anon/authenticated.';

-- ── 4 · plan_features ──────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.plan_features (
  plan_key    text not null references public.plans(key) on update cascade on delete cascade,
  feature     text not null,
  enabled     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (plan_key, feature),
  constraint plan_features_feature_chk check (feature ~ '^[a-z][a-z0-9_]*$')
);

alter table public.plan_features enable row level security;
revoke all on public.plan_features from anon, authenticated, public;
grant all on public.plan_features to service_role;

comment on table public.plan_features is
  'A plan''s feature switches. A feature with NO row for a plan is ENABLED (a new feature is on for every plan until a row switches it off). `feature` is a key of the code''s Feature list (lib/features.ts FEATURES) — the loader refuses an unknown one. Access: a per-truck override (trucks.feature_overrides) wins; else the EFFECTIVE plan''s switch (an ended plan resolves to the expiry fallback, with its switches); else allowed. SERVICE ROLE ONLY, like plans.';

insert into public.plan_features (plan_key, feature, enabled) values
  ('payg', 'whatsapp_replies',            false),
  ('payg', 'schedule_graphics',           false),
  ('payg', 'instagram_messenger_replies', false)
on conflict (plan_key, feature) do nothing;
