# Plan features config — Stage A2 report

**Workstream:** plan-features-config (Stage A2 of the new pricing) · **Date:** 20 October 2026 · **Branch:** main (uncommitted, not pushed, not deployed)
**Builds on:** docs/plans-data-model-report.md (Stage A)

## 1. Summary

Plans now switch features off through data. A new table, `public.plan_features`, works as a list of exceptions: a missing row means the feature is on.

**Access rule.** The rule is applied once, in `lib/features.ts` (`canAccess` and `featureBlock`), in this order:
1. the per-truck override;
2. otherwise the truck's EFFECTIVE plan's switch;
3. otherwise allowed.

**Ended plans.** An ended plan resolves to Pay as you go, with Pay as you go's switches.

**Pay as you go switches off three features:**
- WhatsApp auto-replies;
- social media posts;
- Messenger & Instagram replies.

**Upgrade prompt and refusal.**
- In the UI, a feature switched off by the plan shows one data-driven prompt ("WhatsApp auto-replies are included on Pro.").
- The server refuses it with `feature_not_on_plan`, naming the same plan.
- A feature switched off by an override keeps the "switched off for your truck" wording.

**Pay at Hatch** is now enforced. It is true on every plan, so nothing changes today.

**Other changes:**
- Plans gain `included_vans` (1 for every plan) and `trial_months` (4 for trial).
- Signup now starts the trial: the end date is signup + `trial_months`, at the end of that day in the truck's time zone.
- Admin shows one "Start trial: N months" button.
- The Billing plan card takes its prices from `plan_prices`, with the van modal's masking rule.

**Proofs.**
- `scripts/plan-features-config.cjs`: 79/79, on real routes and renders.
- `scripts/plans-data-model.cjs`: 140/140, re-pinned to the A2 rules. Its byte-identical checks on the frozen pages still pass.
- The legacy import check passes.
- tsc is clean, and there are no new lint errors.
- Sweep: 142 of 143 pass; the one failure is a test fixture dated today, not A2. The build passes (§8).

I ran no database change and changed no live row. You ran `20261025_plan_features.sql` yourself on 20 October, and I verified it read-only. The remaining change (real-thai-food) is in §5, marked NOT RUN.

## 2. Garbled input, contradictions, the live database

- **Garbled input:** nothing arrived garbled.
- **First brief:** I stopped once, with three questions (Stage A not on the database I can read; where the trial starts; the admin presets). Your reply answered all three. I am now writing questions as plain text in chat, as you asked.
- **Live database:** project `ffphgwonshgxamtvefcv`. When I re-read it after your reply, it has Stage A applied:
  - 6 plans and 6 `plan_prices` rows (as seeded);
  - RLS on, ACL `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` on `plans`, `plan_prices` and `country_settings`;
  - `trucks_plan_fkey`, and the 3 triggers;
  - the four demo trucks carry `batch_reservations: true`.

  Everything here is built and proved against those rows (fixtures copied from them) and the migration files.
- **Order:** A2's SQL is labelled to run after `20261024_plans.sql`, which is already live.
- **Chat format:** "In chat, only a two-line summary" sits beside the hard rule "every database change also in chat". I followed both as in Stage A: the two-line summary, plus the NOT RUN SQL blocks. Undo is in this report only.

## 3. Data (supabase/migrations/20261025_plan_features.sql — ▶ RUN NOW, after 20261024_plans.sql)

| Change | Detail |
|---|---|
| `plans.included_vans` | int not null default 1, CHECK ≥ 1. Every plan is 1. Each van above it costs `plan_prices.extra_van_monthly_minor`. |
| `plans.trial_months` | int, NULL. CHECK: NULL, or `is_trial` and ≥ 1. trial is 4. |
| `plans.pay_at_hatch_allowed` | payg is set TRUE (every plan is true). Now ENFORCED. |
| descriptions | payg: "No monthly fee. You only pay when a customer pays online by card."<br>pro: "Everything, including WhatsApp auto-replies and social media posts, with online orders included each month."<br>unlimited: "Everything, with no fees on online orders, however busy you get."<br>trial: "Every feature, free, while your trial runs."<br>demo and tester unchanged. |
| `public.plan_features` | (plan_key FK plans on update cascade on delete cascade, feature text CHECK `^[a-z][a-z0-9_]*$`, enabled bool, PK both). RLS on, no policies, `revoke all … from anon, authenticated, public`, `grant all … to service_role`: plans' security exactly. No functions are created, so there is nothing to revoke. |

**Feature validation.** `feature` is checked against the code's Feature list (`lib/features.ts FEATURES`, now a runtime array). If a row names an unknown key, the loader refuses the catalogue (`catalogProblems`). The harness proves this.

### Feature keys switched off on Pay as you go (and why)

| Key | Why |
|---|---|
| `whatsapp_replies` | WhatsApp auto-replies, as briefed. |
| `schedule_graphics` | The ONE key for the whole social-media area: the Social media tab, the weekly post, single-event posts and their graphics, and Google/places posts ("Make post", `sg_place_usual_type`). There is no separate key per post type. |
| `instagram_messenger_replies` | Messenger & Instagram auto-replies. ⚠️ No surface or route gates this key today, because the product is "coming soon". The switch is stored and will apply the day a surface reads it. |

**Considered and left ON** (not social media): `embed_schedule` (your schedule on your own website), `discovery_map` (the map listing), `branded_qr_code`. No key was ambiguous enough to switch off "to be safe".

**Other plans:** pro, unlimited, trial, demo and tester have no rows, so they have everything.

## 4. Code

### Resolution and data
- **`lib/features.ts`:**
  - `FEATURES` is a runtime array.
  - `canAccess(feature, overrides, planAllows)` requires the effective plan's switch as its third argument, so tsc caught every call site.
  - New: `featureBlock` (returns `'override' | 'plan' | null`) and `isFeature`.
- **`lib/plans.ts`:**
  - Switches: `planAllowsFeature` (no row = on; `pay_at_hatch_allowed = false` also switches off `online_ordering_pay_at_hatch`, so they are one rule), `planFeatureSwitch`, `truckPlanSwitch` (the effective plan's switch).
  - The prompt's plan: `upgradePlanFor`, the first active public plan in sort order that has the feature.
  - Access: `featureAccess` returns `{allowed, block, upgradeTo}`; `truckCan`; `payAtHatchOn`; `planBlocks` (server-sent to surfaces without the catalogue); `promptPlan`.
  - Vans and trial: `includedVans`, `trialEndFor`, `addMonthsYmd` (clamps to month end), `trialMonthsOf`.
  - `effectivePlan` documents the A2 rule. Stage A's unenforced `payAtHatchAllowed()` is gone.
- **`lib/plans-server.ts`** also loads `plan_features`. It adds `readPlanCatalog(client)` for code that runs on a client it is given (promote-draft).
- **`lib/plan-refusal.ts`** (new): `featureRefusal` returns `feature_not_on_plan` with `{feature, many, plan}` in the truck's language, or `feature_switched_off`.

### Server
- **Rewired to the effective plan:** every gate.
  - `/api/manage`: pre-orders, private events, embed, places posts (`gateFeature`), and `can_embed`.
  - `/api/event-types`, `/api/events/action`, `/api/weekly-post` (`gated`, now async).
  - Both WhatsApp webhooks.
  - `/api/menu` and `/api/orders/submit` (pre-orders); `lib/orders/auto-accept.ts`, which gets a new `planAllows` argument from submit and from promote-draft.
  - The custom-domain redirect and `/domain`.
- **`/api/manage/whatsapp-signup`** gains a `whatsapp_replies` gate before any Meta exchange.
- **New refusal text:** `errorsManage.feature_not_on_plan` reads "{feature} are/is included on {plan}." (ICU select on the feature's grammatical number).

### The one upgrade prompt (UI)
- **`components/PlanPrompt.tsx`** uses the old FeatureGate prompt's exact styling: the slate panel, the plan line "{plan} · {price} · {description}", and the teal "Upgrade →" to Billing.
  - On iOS (`purchaseCtaAllowed`) it shows text only.
  - The feature's name comes from the messages (`planPrompt.features.<key>`, for all 27 features). The plan's name, description and price come from the catalogue.
- **`components/FeatureGate.tsx`** takes `{feature, truck, fallback}`. It shows the feature, or the prompt when the PLAN is why, or `fallback` when an override is.
- **`lib/useFeatures.ts`:** `useFeatures(truck)` / `featureAccessView(...)` returns `{can, block, upgradeTo}`. It reads the catalogue on Manage, or the server's `plan_blocks` on the kitchen dashboard and KDS (`/api/dashboard` sends them).
- **Where it shows:**
  - Social media (the tab is now visible to a plan-off truck and opens on the prompt; it stays hidden for an override);
  - Settings › WhatsApp card;
  - Payments › Online payments (Pay at Hatch);
  - Printing settings (dashboard);
  - the custom domain card.
  - The Schedule "Make post" shortcut stays hidden for a plan-off truck: it is a shortcut into the Social tab, which carries the prompt.

### Pay at Hatch (enforced)
- **Customer:** `/api/menu` sends `pay_at_hatch_on`. When it is false, the order page shows no pay-at-the-truck choice (card only). With no card option either, the menu sets `ordering_available = false`: the existing "not taking orders" state, never a dead checkout.
- **Submit:** refuses a pay-at-the-truck order with `errorsCustomer.pay_at_hatch_unavailable` (403), before any booking, stock or money path. A card order is unaffected.
- **Operator:** there is no Pay at Hatch setting to show "not on your plan" on. Customers are offered it whenever the plan allows it. So Manage › Payments › Online payments shows:
  - the one prompt when the plan switches it off;
  - "Pay at Hatch ordering is switched off for your truck" for an override.
  - With the seed, neither line ever shows. See decision 2.

### Included vans, trial length, Billing, Admin
- **Vans:** the van flow charges `extra_van_monthly_minor` for each van at or above `included_vans` (`includedVans`).
- **Signup starts the trial (your answer 2):** `lib/provision-truck.ts` sets `trial_expires_at = trialEndFor(the provisioned plan, now, the truck's zone)`.
  - `trialEndFor` gives `trial_months` after signup, at 23:59:59 on that day in the truck's time zone.
  - Any non-trial plan, including the demo plan, gets NULL.
  - Today, before this change, signup wrote NULL ("not started"), and nothing else ever set the date.
  - Existing trucks are not touched. village-spice keeps NULL and the existing "not started" wording.
- **Admin modal (your answer 3):** one button, "Start trial: N months" (N = `trial_months`, the same end-of-day rule in the truck's zone), and the date picker. `/api/admin` now selects `timezone`.
- **Billing plan card (your answer 7):**
  - Its amounts (price, promo, included amount, the "Change your plan" buttons, the switch modal) come from `plan_prices` through `usePlanPriceMask`.
  - Amounts are masked when the country is switched off, pricing is unpublished, or hide_pricing is set.
  - It no longer reads the retired columns' "decided" check. The frozen comparison table below is unchanged.
  - A trial shows "A 4-month free trial." The trial popup title is "You’re on a 4-month free trial" (data). A plan without a length keeps "You’re on a free trial".
- **Admin plans table:** new "Vans · trial" and "Features off" columns, read-only. Editing is SQL for now. The "(not enforced)" label is gone.

## 5. SQL — in run order (all NOT RUN)

### Deploy order
1. `20261025_plan_features.sql` — ✅ **ALREADY RUN** by Dominic on 20 October 2026 (it unblocked local Manage, which reads the live database). Verified read-only afterwards:
   - `included_vans` is 1 on every plan, and trial has `trial_months` 4;
   - `pay_at_hatch_allowed` is true on all six plans;
   - `plan_features` holds payg's three rows, and has RLS on and ACL `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}` like `plans`.

   It is safe for the code running today: Stage A code selects named plan columns, never reads `plan_features`, and does not enforce Pay at Hatch. The new code requires it.
2. The real-thai-food statement — **run now**, independent of the deploy.
3. Deploy the code.
4. Nothing runs after deploy.

⚠️ **The "Invalid or expired token" you saw locally before running it:** the A2 code's catalogue loader failed on the missing columns, `/api/manage` answered 500 `plans_failed`, and Manage fell back to its "Invalid or expired token" screen. That screen shows for ANY failed first load, which predates this work (decision 7).

### 5.1 ✅ ALREADY RUN (20 October 2026) — after 20261024_plans.sql, before deploy

```sql
-- ✅ ALREADY RUN by Dominic, 20 October 2026 (verified read-only) · supabase/migrations/20261025_plan_features.sql (verbatim, for the record)
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
```

### 5.2 ▶ RUN NOW — real-thai-food

real-thai-food goes on **payg**. It is the free public plan with no monthly fee, which is what a non-customer discovery listing is; it is also what the truck already resolves to (demo is a throwaway prospect sandbox, and tester is internal full access). The end date is cleared, so Billing doesn't say "Your Pay as you go plan ended".

```sql
-- NOT RUN · ▶ RUN NOW · real-thai-food: not a customer; a discovery listing on Pay as you go
update public.trucks set is_customer = false, plan = 'payg', trial_expires_at = null where id = 'real-thai-food';
```

### 5.3 RUN AFTER DEPLOY

None.

### 5.4 Undo (only if Dominic asks)

```sql
-- NOT RUN · undo of 20261025_plan_features.sql (roll the code back FIRST — it reads these columns and this table)
drop table if exists public.plan_features;
update public.plans set description = 'No monthly fee. A platform fee on online card orders.' where key = 'payg';
update public.plans set description = 'A monthly fee with online orders included each month, then a small fee.' where key = 'pro';
update public.plans set description = 'A monthly fee and no platform fee on online orders.' where key = 'unlimited';
update public.plans set description = 'Every feature, free, while the trial runs.' where key = 'trial';
update public.plans set pay_at_hatch_allowed = false where key = 'payg';
alter table public.plans drop constraint if exists plans_trial_months_chk;
alter table public.plans drop column if exists trial_months;
alter table public.plans drop constraint if exists plans_included_vans_chk;
alter table public.plans drop column if exists included_vans;
-- (comments are informational and can stay)

-- undo of the real-thai-food statement (its values as read on 20 October 2026)
update public.trucks set is_customer = true, plan = 'trial', trial_expires_at = '2026-09-30 00:00:00+00' where id = 'real-thai-food';
```

### 5.5 Read-only SQL run (Supabase MCP)

```sql
select key, name, description, sort_order, is_public, is_internal, is_trial, is_signup_default, is_expiry_fallback, is_demo, pay_at_hatch_allowed, active from public.plans order by sort_order;
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from public.plan_prices order by country_code, plan_key;
select id, plan, trial_expires_at, country, coalesce(feature_overrides,'{}'::jsonb) as overrides from public.trucks order by plan, id;
select relname, relrowsecurity, relacl::text from pg_class where relname in ('plans','plan_prices','country_settings') union all select 'fkey', null, pg_get_constraintdef(oid) from pg_constraint where conname = 'trucks_plan_fkey' union all select tgname, null, null from pg_trigger where not tgisinternal and tgname like '%plan%';
select n.nspname as schema, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname in ('plans','plan_prices') union all select 'trucks_plan_check', pg_get_constraintdef(oid) from pg_constraint where conname = 'trucks_plan_check' union all select 'trucks.plan default', column_default from information_schema.columns where table_schema='public' and table_name='trucks' and column_name='plan' union all select 'override cols', string_agg(column_name, ',') from information_schema.columns where table_schema='public' and table_name='trucks' and column_name like 'plan_price_override%';
select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='trucks' and (column_name ilike '%customer%' or column_name ilike '%listing%' or column_name in ('plan','excluded','show_on_vf','show_on_hg','active','plan_price_override_minor')) order by column_name;
select 'price' as k, plan_key || '/' || country_code || ' ' || monthly_minor || '/' || coalesce(included_online_minor::text,'null') || '/' || fee_bps || '/' || extra_van_monthly_minor as v from public.plan_prices union all select 'acl ' || relname, relrowsecurity::text || ' ' || relacl::text from pg_class where relname in ('plans','plan_prices','country_settings') and relkind = 'r' union all select 'con ' || conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('trucks_plan_check','trucks_plan_fkey') union all select 'trigger', tgname from pg_trigger where not tgisinternal and tgname like '%plan%' union all select 'truck ' || id, plan || ' end=' || coalesce(trial_expires_at::text,'null') || ' cust=' || is_customer::text || ' ov=' || coalesce(feature_overrides,'{}'::jsonb)::text || ' ' || country from public.trucks order by 1, 2;
```

(The first four ran before Stage A was applied: plans and plan_prices did not exist yet. The next three ran after you applied it. I also ran `list_migrations` and `get_project_url`.)

Afterwards, to diagnose the local "Invalid or expired token" and to confirm the A2 migration:

```sql
select id, slug, plan, active from public.trucks where dashboard_token = 'test-abc123def456';
select 'col ' || column_name as k from information_schema.columns where table_schema='public' and table_name='plans' and column_name in ('included_vans','trial_months') union all select 'table ' || table_name from information_schema.tables where table_schema='public' and table_name = 'plan_features';
select 'plan ' || key || ' vans=' || included_vans || ' trial=' || coalesce(trial_months::text,'null') || ' hatch=' || pay_at_hatch_allowed::text as v from public.plans union all select 'feature ' || plan_key || ':' || feature || '=' || enabled::text from public.plan_features union all select 'acl ' || relname || ' ' || relrowsecurity::text || ' ' || relacl::text from pg_class where relname in ('plans','plan_features') and relkind = 'r' order by 1;
```

## 6. Live trucks whose features change at deploy

These come from the live rows read on 20 October 2026, resolved as of 21 October 2026 (harness §3).

| Truck | Plan / end | At deploy |
|---|---|---|
| **real-thai-food** | trial, ended 30 Sep 2026 | Resolves to payg WITH payg's switches. **Loses `whatsapp_replies`, `schedule_graphics`, `instagram_messenger_replies`.** If §5.2 runs, it is on payg directly, with the same three switched off. |
| pizzeria-gusto, test-truck, test-truck-us, test-truck-3-2 (app-tester), tikka-tonic | trial to 31 Dec 2026 | No feature change. Billing shows "A 4-month free trial." and the trial popup title gains "4-month". |
| village-spice | trial, no end | No feature change. It keeps NULL and the "not started" Billing wording. Its popup title says "4-month" too (the plan's length). |
| the 4 demo trucks | demo | No change. |

Nothing else changes for any live truck: all their plans allow Pay at Hatch, and all have 1 included van (the old rule was also "first van included").

**New signups** get a dated trial: 4 months at the end of that day.

## 7. Proof (localhost only)

### `scripts/plan-features-config.cjs` — 79 passed, 0 failed

1. **The catalogue,** from both migrations' seed:
   - payg switches off exactly the three, and no other plan has rows;
   - payg Pay at Hatch is true; trial is 4 months; every plan has 1 van; descriptions are as briefed and contain no digits;
   - an unknown feature key and `trial_months` on a non-trial plan are refused by the loader;
   - RLS and grants mirror plans, and no function is created.
2. **Every plan × all 27 features:**
   - payg is refused exactly the three, each with the plan-block prompt naming **Pro**;
   - pro, unlimited, trial, demo and tester have everything;
   - an override `true` wins on payg, and an override `false` wins on pro (block "override", no plan named);
   - the prompt skips a plan that switches the feature off.
3. **test-truck fixture:**
   - BEFORE: trial, nothing refused.
   - PAST END (2026-10-01): payg, refused exactly payg's three.
   - RESTORED: trial, nothing refused.
   - The live row is untouched.
   - At deploy, **only real-thai-food** loses features, and exactly the three.
4. **Server, real routes on the in-memory database:**
   - GET `/api/weekly-post` → 403 `feature_not_on_plan` "Social media posts are included on Pro.";
   - POST `/api/manage sg_place_usual_type` (places posts) → the same;
   - POST `/api/manage/whatsapp-signup` → 403 "WhatsApp auto-replies are included on Pro.", before any write;
   - payg with override true passes the gate; pro with override false → `feature_switched_off`;
   - pro, unlimited, trial, demo and tester pass;
   - an ENDED trial is refused like payg.
5. **UI** (FeatureGate and PlanPrompt rendered with the catalogue providers):
   - payg → "Social media posts are included on Pro.", in the old FeatureGate panel classes, with "Pro · £29/mo · Everything, including WhatsApp auto-replies and social media posts, with online orders included each month." and "Upgrade →" to Billing;
   - WhatsApp → "WhatsApp auto-replies are included on Pro."; on iOS, the text with no link;
   - pro, unlimited, trial, demo and tester → the feature itself; override-off → the fallback, never the prompt; override-on payg → the feature;
   - without the catalogue, the server's `plan_blocks` give the same prompt;
   - source checks: the WhatsApp card and the Social tab rule.
6. **Trial length,** real `/api/setup create_truck`, clock fixed:
   - GB, 20 Oct 2026 10:00 → `2027-02-20T23:59:59.000Z` (end of day, London);
   - US (Chicago), same instant → `2027-02-21T05:59:59.000Z` (end of day, Chicago);
   - 20 Oct 23:30 UTC (already 21 Oct in London) → `2027-02-21T23:59:59.000Z`;
   - `trial_months` changed to 2 → `2026-12-20T23:59:59.000Z`;
   - the existing truck (village-spice, NULL) is not written;
   - 31 Oct + 4 → 28 Feb (and 29 Feb in a leap year); a non-trial plan → no end date;
   - Admin has one "Start trial: N months" button, and the 1/3 chips are gone.
7. **Pay at Hatch:**
   - every seeded plan allows it;
   - a fixture plan with it false: not offered, and the prompt names payg;
   - real `/api/orders/submit`: allowed → placed; false → 403 `pay_at_hatch_unavailable` with no booking and no write; a card order on that plan is not refused;
   - real `/api/menu`: `pay_at_hatch_on` true or false, and false with no card → `ordering_available` false;
   - the order page renders the choice only when it is on;
   - Payments shows the prompt or "switched off".
8. **Billing card prices and the founder offer:**
   - US switched ON → "$29/mo"; US switched OFF → "TBD"; GB → "£29/mo"; GB with hide_pricing → "TBC";
   - the card uses `cardPx` and not `px`;
   - **founder offer:** unlimited with `plan_price_override_minor = 4900`, until 31 Dec 2026, → 4900 on 31 Dec and the standard 6900 on 1 Jan, shown as "£49/mo" then "£69/mo".

### `scripts/plans-data-model.cjs` (Stage A, re-pinned to A2) — 140 passed, 0 failed
Every gate passes overrides plus the effective plan's switch. Non-payg plans have every feature; payg has all but its three. An ended plan has payg's switches. Pay at Hatch is enforced at submit.

**Frozen surfaces, unchanged from Stage A:** GB and US landing, /features, /compare, the plans PDF and Billing's comparison table are byte-identical to the capture (§8 of that harness). `scripts/legacy-pricing-imports.cjs` passes.

## 8. Checks executed

- `npx tsc --noEmit -p .` — clean.
- **ESLint** on all 78 changed app/lib/components files, rule by rule against HEAD: no new errors.
  - The two files newly touched in this stage (`whatsapp-signup` route, `promote-draft`) carry the same pre-existing `no-explicit-any` counts as at HEAD (1 and 3).
  - The Manage page has one fewer error than HEAD.
- **`npx next build`:** exit 0, after the last product edit.
- **Harness sweep** (`node scripts/run-harnesses.cjs`, 143 listed harnesses, including the new `plan-features-config.cjs`): **142 passed, 1 failed.**
  - The failure is `demo-rebuild-replace.cjs` (35/36). Its fixture parks an "other" event on 2026-10-20, which is today, so the rebuild replaces it. It is not from Stage A2: run with the clock at 19 October (a Date preload), it passes 36/36. It stops failing once today's date passes.
  - Every other harness passes, including `plan-features-config` (79/79), `plans-data-model` (140/140, re-pinned), `legacy-pricing-imports` and `messages-parity`.
- **Re-pins.** The first sweep after the code change failed 29. Each was re-pinned to assert the A2 rule (§10), with `⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026)` beside each change. No BEFORE capture was retaken.
  - The language-phase proofs still show the marketing pages and Billing's comparison table byte-identical, and their Billing proof now also checks "A 4-month free trial.".
  - Fixture trucks on the removed `max` key now use `unlimited` (Stage A's mapping). Otherwise they would resolve to payg and lose Social, Make post and the WhatsApp card.

## 9. Remaining hardcoded plan references (code)

Unchanged from Stage A §9:
- the frozen display copy and its five surfaces (Stage B);
- Billing's frozen comparison table;
- the dev-only fixture `app/dev/ticket-preview/page.tsx:72` (`plan: 'pro'`);
- `'demo'` as a provisioning kind or plan role.

New in A2, and not plan references:
- `lib/plans.ts PAY_AT_HATCH_FEATURE = 'online_ordering_pay_at_hatch'` is a feature key, which may live in code.
- Admin's "month"/"months" plural is English wording, not a plan.

No plan name, tier or number is written in A2 code. The only seed values are the SQL seeds (data).

## 10. Files changed (Stage A2)

**New:**
- supabase/migrations/20261025_plan_features.sql
- lib/plan-refusal.ts, components/PlanPrompt.tsx, components/usePlanPriceLabel.ts
- messages/ns/en-GB/planPrompt.json, messages/ns/en-US/planPrompt.json, lib/i18n/catalog/planPrompt.ts (generated)
- scripts/plan-features-config.cjs
- docs/plan-features-config-report.md

**Modified:**
- **Libraries:** lib/features.ts, lib/plans.ts, lib/plans-server.ts, lib/useFeatures.ts, lib/provision-truck.ts, lib/orders/auto-accept.ts, lib/payments/promote-draft.ts, lib/custom-domain/redirect-target.ts, lib/email-signup.ts (comment), lib/i18n/namespaces.ts.
- **API routes:** app/api/manage/route.ts, app/api/manage/whatsapp-signup/route.ts, app/api/event-types/route.ts, app/api/events/action/route.ts, app/api/weekly-post/route.ts, app/api/webhooks/whatsapp/route.ts, app/api/webhooks/meta/whatsapp/route.ts, app/api/menu/[truckId]/route.ts, app/api/orders/submit/route.ts, app/api/dashboard/route.ts, app/api/admin/route.ts.
- **Pages:** app/manage/[token]/page.tsx, app/dashboard/[token]/page.tsx, app/trucks/[slug]/order/page.tsx, app/domain/page.tsx, app/admin/page.tsx.
- **Components:** components/FeatureGate.tsx, components/dashboard/CustomDomainSetup.tsx, components/dashboard/types.ts, components/manage/PaymentsTab.tsx, components/manage/SocialPosts.tsx, components/printing/PrintingSettings.tsx.
- **Messages:** messages/en-GB.json, plus the split files messages/ns/en-GB/{errorsCustomer, errorsManage, manageBilling, manageShell}.json.
- **Harnesses:** scripts/harnesses.json (one new entry), scripts/_plans-catalog-fixture.cjs (applies 20261025), scripts/_lp1c-fixtures.cjs (planTables gains `plan_features` and the two columns), scripts/plans-data-model.cjs (re-pinned), plus the A2 re-pins:
  - batch-reservation-switch, event-pricing, places-posts-gating, places-tab, social-posts, schedule-graphics-places, weekly-post;
  - private-events, event-types, printing-gating, whatsapp-golive-parity-harness, time-dates-parity;
  - country-settings-parity, us-unpriced-country, audit-fixes, order-charges, phase3-screens (+ _phase3-screens-us), pending-card-buttons, midnight-events (+ _midnight-fixtures/-customer/-engine/-public/-manage);
  - language-phase-0/1a/1b/1c/1d/1d2/1e/2 and messages-parity, with their helpers _language-phase-0-after, _lp1b-dashboard, _lp1b-printing, _lp1c-fixtures, _lp1c-setup, _lp1d-fixtures (FIXTURE_PLAN), _lp1d-named, _lp1d2-api, _lp1d2-payments, _lp1d2-named, _lp2-named, _lp2-frozen, _messages-parity-1e;
  - new fixture scripts/fixtures/plans-stage-a2-messages.json.

## 11. Decisions for you

1. **Unknown feature keys break the catalogue loudly.** A `plan_features` row with a typo makes the loader throw, so Manage, the menu and submit fail until it is fixed. This is consistent with Stage A's "fails loudly", but it is site-wide. The alternative is to ignore the row and log it. Which do you want?
2. **There is no operator Pay at Hatch setting.** Customers are offered it whenever the plan allows it. I put the "not on your plan" prompt in Manage › Payments › Online payments. The dashboard's "Card payments" switch (cards off → customers pay at the hatch) does not warn when a plan has Pay at Hatch off. Do you want a warning there, so a truck can't switch cards off with nothing left for customers to pay with?
3. **The Social media tab is now visible to payg trucks** and opens on the prompt. Before, a truck without the feature saw no tab, because "a tab that opens a refusal is worse than no tab". It is still hidden when an override switched it off. Keep it visible?
4. **Trial copy left as it was** (your instruction):
   - the trial popup's offer line still says "Full Max features + Pay at Hatch ordering — completely free*";
   - the welcome email has no trial paragraph, and its old "you choose which event starts your free trial" sentence would now be false anyway.

   Both are copy decisions for you.
5. **Messenger & Instagram:** the payg switch is stored, but nothing gates on it yet (coming soon). The day the feature ships, its surfaces must read `instagram_messenger_replies`.
6. **Two Pay at Hatch switches, one rule:** `plans.pay_at_hatch_allowed` and a `plan_features` row for `online_ordering_pay_at_hatch` both switch it off. Keep both, or retire the column in favour of the table later?
7. **"Invalid or expired token" for any failed first load.** Manage shows this whenever its first load fails, including a server error such as `plans_failed`. It predates A2. Should it show the real reason (the error toast already carries it)?
8. **One copy fix made during re-pinning:** `manageBilling.plan.ended` read "…You’re now on {now}, with every feature.", which is no longer true (an ended plan has payg's switches). It now reads "Your {plan} plan ended on {date}. You’re now on {now}." Reword if you want something else.
