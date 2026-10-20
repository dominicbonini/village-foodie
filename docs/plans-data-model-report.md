# Plans data model — Stage A report

**Workstream:** plans-data-model (Stage A of the new pricing) · **Date:** 19 October 2026 · **Branch:** main (uncommitted, not pushed, not deployed)
**Read first:** docs/pricing-plans-diagnosis-report.md

## 1. Summary

Plans are now data. `public.plans` holds the plan list and its flags, and `public.plan_prices` holds each plan's price in each country. Code reads both through one module, `lib/plans.ts` (pure), which the server loads with `lib/plans-server.ts` and the browser receives through `components/PlanCatalogProvider.tsx`.

- Every active plan gets every feature. `canAccess(feature, overrides)` takes no plan and no end date; per-truck overrides still deny and grant.
- A truck whose end date (`trucks.trial_expires_at`) has passed resolves to the expiry-fallback plan, Pay as you go, with every feature. No truck loses a feature because a plan ended.
- These are gone: the tier machinery, the plan-based refusals, the upgrade prompts and their message keys.
- The old Starter/Pro/Max display survives in **one** frozen file, `lib/legacy-pricing-display.ts`. Its header reads "Stage B — awaiting mockup. Display only. Nothing may gate on this."
  - Only five display surfaces may import it.
  - `scripts/legacy-pricing-imports.cjs` fails if anything else does.
- Proofs: `scripts/plans-data-model.cjs` passes 141/141. GB and US landing, /features, /compare, the plans PDF and Billing's comparison table render byte-identical to the BEFORE capture.
- The migration trigger was proved in PGlite (23/23).
- tsc is clean. Lint has no new errors (one fewer than HEAD).
- Harness sweep: 140 of 142 pass. The 2 failures are a date-dependent fixture and a timing flake, both unrelated to Stage A and both green on rerun. `next build` passes (§8).

No live row was changed, and no database change was run. Every database change is in §5, marked NOT RUN.

## 2. Garbled input / contradictions

- The first brief was cut off at "Enabling a country with a missing plan_prices row is refused by the". I flagged it, and you resent the ending.
- I also flagged a contradiction: the brief asked both to remove the tier cells and to keep the public surfaces unchanged. You resolved it with the frozen display-only copy (answer 2).
- Pay at Hatch on payg: you resolved it as "build and seed, do not enforce" (answer 3).
- One remaining tension, resolved without choosing a product answer: the PROOF asks to set test-truck's end date in the past and to put a promo override on test-truck-us. But the hard rule says every database change comes to you as NOT RUN SQL, and `public.plans` does not exist live yet.
  - So both proofs run on **fixtures copied from the live rows**, which I read read-only on 19 October.
  - No live row was touched, so there was nothing to restore. Before/after is reported in §7.4.
  - If you want the same on the live rows after deploy, the SQL is in §5.4. It is NOT RUN and optional.

## 3. Data model (supabase/migrations/20261024_plans.sql)

### `public.plans`

Columns: key PK · name · description · sort_order · is_public · is_internal · is_trial · is_signup_default · is_expiry_fallback · **is_demo** · pay_at_hatch_allowed · active.

`is_demo` is a refinement of the briefed shape. It marks the plan a demo truck is provisioned on, so provisioning names no plan.

Constraints:
- the key must match `^[a-z][a-z0-9_]*$`;
- name must not be blank;
- a plan cannot be both public and internal;
- the fallback must be public, active and not a trial;
- the signup default must be active;
- demo must be internal and active.

Partial unique indexes on `((true)) where flag` allow at most one signup default, one expiry fallback and one demo plan. `catalogProblems()` and the loader refuse a catalogue without exactly one of each.

| key | name | order | public | internal | trial | signup default | expiry fallback | demo | pay_at_hatch_allowed |
|---|---|---|---|---|---|---|---|---|---|
| payg | Pay as you go | 10 | ✓ | | | | ✓ | | **false (not enforced)** |
| pro | Pro | 20 | ✓ | | | | | | true |
| unlimited | Unlimited | 30 | ✓ | | | | | | true |
| trial | Free trial | 40 | | ✓ | ✓ | ✓ | | | true |
| demo | Demo | 50 | | ✓ | | | | ✓ | true |
| tester | Tester | 60 | | ✓ | | | | | true |

No starter, no max.

### `public.plan_prices`

PK (plan_key → plans, country_code → country_settings). Columns: monthly_minor ≥ 0; included_online_minor (NULL = unlimited); fee_bps (0–10000); extra_van_monthly_minor ≥ 0. Seed for GB and US:

| plan | monthly | included online | fee | extra van |
|---|---|---|---|---|
| payg | 0 | 0 | 150 bps | 0 |
| pro | 2900 | 250000 | 99 bps | 2900 |
| unlimited | 6900 | NULL (unlimited) | 0 | 6900 |

### Security

Both tables mirror `country_settings` exactly: RLS on, no policies, `revoke all … from anon, authenticated, public`, and `grant all … to service_role`. The live ACL of country_settings is `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`, and the PGlite proof shows the new tables match it.

Both new functions are revoked from public, anon and authenticated in the same file. They are trigger functions and fire without EXECUTE. `scripts/migration-function-grants.cjs` passes 14/14.

### `trucks`

- **Live constraint read first.** It differs from the repo: `trucks_plan_check CHECK (plan = ANY (ARRAY['starter','pro','max','trial','demo','tester']))`. 'demo' and 'tester' were added by hand. It is recorded in `supabase/migrations/20261023_trucks_plan_check_live.sql`, which is already applied: file only, do not run.
- The CHECK is replaced by `trucks_plan_fkey` → `plans(key)` (on update cascade, on delete restrict).
- **Default: DROPPED.** The live default was `'starter'`, which no longer exists. Provisioning always writes the plan from the table: the signup default, or the demo plan.
- New columns: `plan_price_override_minor` (≥ 0), `plan_price_override_until` (date; requires a price), `plan_price_override_note`.
- The override expires to the standard price **at read time**. `truckPlanPrice` applies it while `until` is NULL or today or later (inclusive, the truck's local date), and only while the truck is on the plan it was given for.
- `trial_expires_at` is commented as the plan **end date**, for any plan. NULL means no end.

### `country_settings`

- `country_settings_enabled_needs_prices_chk` is dropped. The trigger `country_settings_require_plan_prices` (BEFORE INSERT/UPDATE) replaces it: a country can be switched on only if every active public plan has a plan_prices row. It raises `country_settings: XX cannot be switched on — no plan_prices row for: …` with check_violation.
- A statement-level guard, `plans_keep_enabled_countries_priced`, runs on plans (insert/update) and plan_prices (update/delete). It stops a plan being made public, or a price row deleted, while that would leave a switched-on country unpriced.
- The six old columns (starter/pro/max monthly, pro/max allowance, platform_fee_pct) are commented RETIRED and **not dropped**.
- `platform_fee_enabled` is unchanged and stays OFF (GB false, US false — read live).

### Demo trucks

The live demo trucks get `feature_overrides.batch_reservations = true`; no code names the demo plan any more. This is 4 trucks, none of which has the key today. An explicit `false` is left alone, which the PGlite proof checks.

## 4. Code

### 4.1 The one module

`lib/plans.ts` (pure, client-safe) is the only source for:
- the plan list and order (`plansInOrder`, `activePlans`, `publicPlans`, `planByKey`);
- validation (`isPlanKey`, plan is a string key validated against the table);
- the flags (`signupDefaultPlan`, `expiryFallbackPlan`, `demoPlan`, `catalogProblems`);
- `planEndDate` and `effectivePlan(truck, catalog, now)`;
- prices: `planPriceFor`, `truckPlanPrice` (standard price, promo override, monthly, included amount), `extraVanMonthlyMinor`;
- `payAtHatchAllowed` (exposed, **not enforced**);
- the row mappers.

Supporting files:
- `lib/plans-server.ts` provides `getPlanCatalog()` (service role, 60 s cache) and `truckPlanFeeBps()`. It **throws** on a read error or an unsound catalogue; it never invents a plan.
- `components/PlanCatalogProvider.tsx` provides `PlanCatalogProvider`, `usePlanCatalog` (throws outside a provider) and `useOptionalPlanCatalog`.
- `/api/manage` GET and `/api/admin` GET return the catalogue as `plans`.

### 4.2 Features

`lib/features.ts`:
- `canAccess(feature, featureOverrides?)`:
  - an override of `true` allows;
  - any other value under the key denies;
  - no override allows.
- `resolveBatchReservations(truck)` is override-only.
- Removed: PLAN_FEATURES, PRO/MAX/TRIAL_FEATURES, the 4-argument canAccess, hasFeature, getPlanFeatures, requiredPlan, maxVans, PLAN_META (now in the frozen file).
- "Coming soon" stays a display state. The frozen matrix's Messenger/Instagram cells read the new `MESSENGER_INSTAGRAM_LIVE = false` in `lib/whatsapp-live.ts`.
- Every call site is now `canAccess('x', truck.feature_overrides)`, and the harness proves no call passes a plan. The call sites are in:
  - routes: /api/manage, /api/events/action, /api/event-types, /api/menu, /api/orders/submit, /api/weekly-post, both WhatsApp webhooks;
  - pages: the dashboard, the Manage page, /domain;
  - modules: lib/orders/auto-accept, lib/useFeatures, lib/custom-domain/redirect-target;
  - components: PrintingSettings, CustomDomainSetup, FeatureGate.
- `useFeatures(truck)` returns `{ can }` from overrides only.
- `FeatureGate` takes `{ feature, overrides, children, fallback }`, with no plan and no upgrade prompt.
- The order page now refuses on the menu API's new `preordering_on` flag, not `hasFeature(plan)`.

### 4.3 Plan prompts removed (now unreachable)

- **Routes:** the five plan refusals (`preorders_pro`, `private_events_pro`, `event_types_max`, `social_media_plan`, `embed_not_on_plan`) are now `feature_switched_off` (403, no `upgrade: true`). They are reachable only through an override.
- **UI removed:**
  - the EventTypes Max badge and plan banner;
  - the private-events "Max only" label;
  - the SocialPosts upgrade gate;
  - the Reports "Pro feature" upsell;
  - the WhatsApp "included on Pro and Max / Upgrade →" text (now "switched off for your truck");
  - the branded-QR "higher plan" lock (now override-only, with "switched off" wording);
  - the van upgrade modal ("The Starter plan includes 1 van…").
- **Message keys removed:**
  - errorsManage.{preorders_pro, private_events_pro, event_types_max, social_media_plan, embed_not_on_plan};
  - weeklyPost.planRefusal;
  - eventTypes.{maxPlanFallback, maxPlanBody};
  - privateEvents.grid.maxOnly;
  - manageSettings.vanUpgrade.*;
  - manageReports.upsell.*;
  - manageWhatsApp.card.{notOnPlan, upgrade};
  - manageBilling.{upgradeToMax, choosePro, perTruckRenews, hideMatrix, compareAll}.
- **Message keys added:** errorsManage.feature_switched_off, errorsManage.plans_failed, manageShell.noPlans, manageWhatsApp.card.switchedOff, manageBilling.plan.{included, includedUnlimited, promo, promoUntil, ended}, manageBilling.changeYourPlan.
- **Message keys renamed:** onMax→onTrial, onMaxNoCta→onTrialNoCta.
- Coming-soon labels stay.

### 4.4 Provisioning

- `lib/provision-truck.ts`: profiles carry a `planRole: 'signupDefault' | 'demo'`, resolved through `getPlanCatalog()` (`signupDefaultPlan` / `demoPlan`).
- An explicit plan is validated with `isPlanKey(…, { activeOnly: true })`. VALID_PLANS is gone.
- The demo profile writes the `batch_reservations` override.

### 4.5 Admin

- **`/api/admin` POST:**
  - an `ADMIN_TRUCK_FIELDS` allowlist with a validator per field: plan via `isPlanKey` (active only), trial_expires_at, the three override fields, active, hide_pricing, show_on_vf/hg, order_link_vf/hg, excluded, feature_overrides, lifetime_discount_pct/note, scraper_rule;
  - an unknown field → 400 "These fields cannot be changed here: …";
  - an invalid value → 400; an empty patch → 400;
  - it updates only the patch.
- **The admin page:**
  - a plans table from the catalogue replaces the old matrix: flags plus per-country monthly · included · fee · extra van;
  - the plan filter, badges and modal plan buttons come from `activePlans`, in sort_order. A non-trial choice clears the end date;
  - trial presets show while the modal's plan is a trial plan and set only the end date;
  - "ended → Pay as you go" shows when the end date has passed;
  - the promo override fields (price, until, note, with the standard price as a hint) sit in the same modal, in the existing styling;
  - PLAN_ORDER, PLAN_BADGE and FEE_COLUMN_FOR are gone.
- **The admin countries editor** (`lib/admin/country-form.ts`, `country-actions.ts`, `components/admin/CountriesTab.tsx`):
  - it no longer shows, validates or writes the six retired columns, so their stored values are untouched;
  - the enable rule is the trigger's: `saveCountry` maps its refusal to "Can't switch on until every public plan has a price for this country (see Plans)" under the switch;
  - "Our fee needs a rate first" is gone, because the rate is the plan's fee_bps.

### 4.6 Manage › Billing (not redesigned)

- One data-driven plan card replaces the trial / starter / pro-max branches. It uses the trial branch's existing card styling and shows:
  - the effective plan's **name** and **description** (from the table);
  - the **price**: the promo override while it applies, through the existing mask `px`, with "Free" at 0 or for a trial;
  - "Special price until {date}." while a promo applies;
  - the **included amount**: "Includes £2,500 of online orders a month." or "Unlimited online orders included.";
  - "Your Pro plan ended on {date}. You're now on Pay as you go, with every feature." once an end date has passed;
  - the orange trial box, when the effective plan `isTrial`.
- Purchase buttons offer the other public plans in sort_order: "Pro — £29/mo" and so on. They go through a data-driven switch modal with a URL-encoded mailto.
- **Safe fallback:** demo and tester no longer render an empty tab. Internal plans get the card without purchase buttons.
- **iOS rule kept:** every purchase button, the panel, the reassurance block, "Choose a plan…" and the modal stay behind `purchaseCtaAllowed()`.
- **The footnote mask is keyed by id** (`f.id !== PRICE_FOOTNOTE_ID`, `'onlineFees'`), not by the number "2".
- **The comparison table beneath stays on the frozen copy, unchanged.** It is byte-identical in every trial and pro view.
  - The highlighted column is still "the column whose key is the truck's plan".
  - A payg or unlimited truck therefore highlights none, because the frozen columns are Starter/Pro/Max.
- Billing is visible to the owner on every plan. The tester hide is gone.

### 4.7 Elsewhere

- **The van flow:** the first van is included, and each further van costs the effective plan's `extra_van_monthly_minor`; a plan without one adds vans free. The van billing modal's sentence comes from the frozen copy (`legacyVanBillingVariant`).
  - The price stays fully masked ("TBD") while the truck's country is switched off, as the US was before.
  - The old trigger was "its plan prices are undecided"; it is now the country's own `enabled` switch. Without it, a US truck would have seen a real $29 once pricing is published, before the US is switched on.
- **PaymentsTab:** the trial reassurance shows on the effective plan's `isTrial` (prop `onTrial`), not on `plan === 'trial'`.
- **The trial popup and the default Billing tab** key on the effective plan's `isTrial`, so an ended trial no longer triggers them.
- **The platform fee rate** (`lib/order-charge-rules.ts`) is the effective plan's `fee_bps`, read only while `platform_fee_enabled` is on. It is off everywhere, so nothing changes. `platform_fee_pct` is no longer read.
- `/api/dashboard` and `/api/menu` send `plan` as the stored key (no `'starter'` default).

### 4.8 Frozen display copy (Stage B — awaiting mockup)

`lib/legacy-pricing-display.ts` holds:
- the old Starter/Pro/Max names (`PLAN_META`);
- every tier cell, the comparison rows and sections, and the landing-table helpers;
- the footnotes, now with ids;
- `legacyBillingColumns`, `legacyVanBillingVariant`;
- **every read of the retired price, allowance and platform_fee_pct columns** (`requirePlanPrice`, `planPricesDecided`, `withPlaceholderPlanPrices`, `planMonthlyMinor`, allowances, `platformFeeLabel`, …).

Deleted from it: `ROW_FEATURE_MAP` and `findPlanParityViolations` (the parity check and its tier mapping).

Allowed importers, and only these (enforced by `scripts/legacy-pricing-imports.cjs`):
- `app/landing/page.tsx` — the landing pricing cards;
- `components/landing/FeatureComparison.tsx` — /features;
- `app/compare/CostComparison.tsx` — /compare;
- `lib/plans-pdf.ts` — the plans PDF;
- `app/manage/[token]/page.tsx` — Billing's comparison table, plus `legacyVanBillingVariant` for the van billing modal. The check also fails if any other name from the file is used outside `BillingTab`.

Card fees moved to `lib/card-fees.ts` and `priceText` to `lib/price-text.ts`, so non-display code need not import the frozen file.

**Stage B — awaiting mockup.** These surfaces still show the old plans and read the retired columns: the landing pricing cards, /features, /compare and its calculator, the plans PDF (served by `app/landing/features-pdf/route.ts` and attached by `app/api/admin/outreach/attachments/route.ts` through `lib/plans-pdf.ts`), the van billing modal's sentence, and Billing's comparison table. The trial popup copy and terms §4 were not changed.

## 5. SQL — in run order (all NOT RUN)

**Deploy order:**
1. Run `20261024_plans.sql` (run now).
2. Deploy this code.
3. Nothing runs after deploy.

`20261023_trucks_plan_check_live.sql` is already applied: file only, do not run.

Why "run now" is safe for the code live today:
- the old code never reads the new tables;
- every live truck is on `trial` (7) or `demo` (4), both seeded (read live);
- old provisioning writes `trial` or `demo`;
- GB is priced before the trigger exists, and the US stays off.

The one visible effect before deploy: the old admin's Starter/Pro/Max buttons would be refused by the foreign key. Nobody is on those plans.

### 5.1 RUN NOW — before deploy (NOT RUN)

The full file `supabase/migrations/20261024_plans.sql` is reproduced verbatim below and in the chat reply. Its sections are explained in §3. Run it as one transaction in the SQL editor. Afterwards, the read-only VERIFY queries in its header confirm:
- 6 plans and 6 price rows;
- RLS and ACL matching country_settings;
- `trucks_plan_fkey` only, and no default;
- 3 triggers.

```sql
-- NOT RUN · ▶ RUN NOW — before deploying this code · supabase/migrations/20261024_plans.sql (verbatim)
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
```

### 5.2 RUN AFTER DEPLOY

None.

### 5.3 FILE ONLY — already applied, do not run

`supabase/migrations/20261023_trucks_plan_check_live.sql` records the hand-widened live CHECK.

### 5.4 Optional, only if you want the two proofs on the live rows after deploy (NOT RUN)

The harness proved these on fixtures. These touch test-truck and test-truck-us only:

```sql
-- NOT RUN · optional · after deploy · test-truck: past end date, then restore
update public.trucks set trial_expires_at = '2026-10-01T00:00:00Z' where id = 'test-truck';
-- (check Manage › Billing on test-truck: "Pay as you go", ended line, every feature, Pay at Hatch works)
update public.trucks set trial_expires_at = '2026-12-31T23:59:59Z' where id = 'test-truck';

-- NOT RUN · optional · after deploy · test-truck-us: promo override, then remove
update public.trucks set plan_price_override_minor = 1900, plan_price_override_until = '2026-12-31', plan_price_override_note = 'Stage A check' where id = 'test-truck-us';
update public.trucks set plan_price_override_minor = null, plan_price_override_until = null, plan_price_override_note = null where id = 'test-truck-us';
```

### 5.5 Undo (only if Dominic asks)

```sql
-- NOT RUN · undo of 20261024_plans.sql, in reverse order
update public.trucks set feature_overrides = feature_overrides - 'batch_reservations' where plan = 'demo';   -- the 4 demo trucks had no such key before
drop trigger if exists plan_prices_keep_enabled_countries_priced on public.plan_prices;
drop trigger if exists plans_keep_enabled_countries_priced on public.plans;
drop trigger if exists country_settings_require_plan_prices on public.country_settings;
drop function if exists public.plans_keep_enabled_countries_priced();
drop function if exists public.country_settings_require_plan_prices();
alter table public.country_settings add constraint country_settings_enabled_needs_prices_chk check ((not enabled) or (starter_monthly_minor is not null and pro_monthly_minor is not null and max_monthly_minor is not null and pro_allowance_minor is not null and max_allowance_minor is not null and platform_fee_pct is not null));
alter table public.trucks drop constraint if exists trucks_plan_fkey;
alter table public.trucks add constraint trucks_plan_check check (plan in ('starter','pro','max','trial','demo','tester'));   -- fails if any truck is on payg/unlimited
alter table public.trucks alter column plan set default 'starter';
alter table public.trucks drop constraint if exists trucks_plan_price_override_until_chk;
alter table public.trucks drop constraint if exists trucks_plan_price_override_chk;
alter table public.trucks drop column if exists plan_price_override_note, drop column if exists plan_price_override_until, drop column if exists plan_price_override_minor;
drop table if exists public.plan_prices;
drop table if exists public.plans;
-- (the column comments are informational and can stay)
```

The code must be rolled back **before** this undo. The deployed Stage A code reads `plans` and `plan_prices` and refuses to load without them.

### 5.6 Read-only SQL run (via the Supabase MCP)

```sql
select id, slug, plan, trial_expires_at, feature_overrides, country, hide_pricing from public.trucks where id in ('test-truck','test-truck-us') order by id;
select plan, count(*) as trucks, count(*) filter (where trial_expires_at is not null and trial_expires_at <= now()) as ended, count(*) filter (where coalesce(feature_overrides,'{}'::jsonb) ? 'batch_reservations') as with_batch_override from public.trucks group by plan order by plan;
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.trucks'::regclass and conname like 'trucks_plan%' union all select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.country_settings'::regclass and conname like '%needs_prices%' union all select 'default', column_default from information_schema.columns where table_schema='public' and table_name='trucks' and column_name='plan' union all select 'tables', string_agg(table_name, ',') from information_schema.tables where table_schema='public' and table_name in ('plans','plan_prices') union all select 'countries', string_agg(country_code || '=' || enabled::text || '/fee_on=' || platform_fee_enabled::text, ',') from public.country_settings;
select id, slug, plan, trial_expires_at, country, coalesce(feature_overrides,'{}'::jsonb) as overrides from public.trucks order by plan, id;
```

(Plus earlier in this workstream: the live `trucks_plan_check` and the `country_settings` ACL.)

## 6. Behaviour changes for non-Gusto trucks (live rows, read 19 October)

Pizzeria Gusto is not tested or changed. Its trial runs to 31 Dec 2026, and it sees the same Billing card changes as any running trial.

| Truck | Plan / end | Before | After deploy |
|---|---|---|---|
| **real-thai-food** | trial, ended 30 Sep 2026 | Expired trial: `canAccess` denied **every** feature; the Billing trial branch, the trial popup and Billing as the default tab | Resolves to **Pay as you go with every feature**. Billing shows "Pay as you go · Free" plus "Your Free trial plan ended on 30 September 2026…". No trial popup, no forced Billing tab. **No DB change; the code reads it differently.** |
| test-truck, test-truck-us, app-tester, tikka-tonic | trial to 31 Dec 2026 | Trial (Max set). Billing: "Upgrade to Max / Choose Pro" | Same features. Billing card is data-driven: buttons "Pay as you go — Free", "Pro — £29/mo", "Unlimited — £69/mo". Trial copy no longer mentions Max or "keep access" |
| village-spice | trial, no end (not started) | Same as running | Same as running. NULL = no end |
| 4 demo trucks (demo-…, test-truck-2, test-truck-3, tt3) | demo | Trial feature set; batch reservations through `plan='demo'`; Billing empty | Every feature; batch reservations through the backfilled override (unchanged behaviour); Billing renders a card with no purchase buttons. Demo trucks cannot reach /manage. |

These apply to every truck:
- **Vans:** the first is included, and further vans cost the plan's extra-van price. Trial, demo and tester have no price row, so their extra vans stay free, as trial's did.
- Pro had included 2 vans. Nobody is on Pro today.
- **Admin:** plan choices are the table's. Starter and Max are gone, and the promo fields are new.
- **Admin countries:** the six plan-price boxes are gone. Switching a country on now needs plan_prices rows, which GB and US both have once the migration runs.
- **US marketing pages and US Billing prices** still mask to "TBD": the frozen copy and Billing's mask read the retired columns, which are NULL for the US. This is Stage B.
- The platform fee is off everywhere, so nothing is charged.

## 7. Proof (localhost only)

### 7.1 `scripts/plans-data-model.cjs` — 141 passed, 0 failed

1. **Catalogue:** the migration's own seed (parsed from the SQL by `scripts/_plans-catalog-fixture.cjs`) is sound and in order; payg is the fallback, trial the signup default, demo the demo plan; there is no starter or max. A catalogue with two signup defaults is reported, and `signupDefaultPlan` throws.
2. **Every plan × every Feature (27):** each is allowed. An override `false` denies exactly that feature, and an override `true` grants it. Non-boolean override values deny, as before.
3. **Every gated surface and API:**
   - all canAccess calls in 22 files pass only the truck's overrides;
   - `useFeatures` and `FeatureGate` take no plan;
   - hasFeature, PLAN_FEATURES, requiredPlan, maxVans, INCLUDED_VANS, PLAN_ORDER, PLAN_BADGE, FEE_COLUMN_FOR, findPlanParityViolations, ROW_FEATURE_MAP, upgradeMessage, showUpgrade and the others are used nowhere;
   - TABLE_PLANS appears only in the frozen copy and its readers;
   - the five plan refusal codes are gone from code and messages;
   - no route answers with `upgrade: true`;
   - the plan-prompt keys are removed;
   - no code compares a plan to a literal key.
4. **test-truck past end date** (fixture of the live row):
   - BEFORE: `plan=trial end=2026-12-31T23:59:59+00:00 → effective trial`.
   - PAST END: `end=2026-10-01 → effective payg (Pay as you go), ended`. Every feature is allowed, **Pay at Hatch included**, and the promo does not apply to the fallback. Pay at Hatch is not enforced anywhere: no code calls `payAtHatchAllowed()` or reads `pay_at_hatch_allowed`, and the submit route reads no plan.
   - RESTORED: `end=2026-12-31 → effective trial`.
   - NULL means no end. An unknown key resolves to the fallback. The end date applies to every plan.
5. **Promo override** (test-truck-us fixture, US prices): applied to trial, demo, payg, pro and unlimited (1900, with the standard price kept beside it). It applies on its until date, lapses the day after, applies indefinitely without an until date, and is ignored once the plan has ended. Removed → the standard price. Pro: 2900 / 250000 / 99 bps / extra van 2900.
6. **Provisioning and admin:**
   - signup default from the table, and no plan key written;
   - POST validates against the table with an allowlist;
   - admin buttons come from `activePlans`;
   - the platform fee reads the plan's fee_bps.
7. **RENDERED Billing**, GB and US, for trial, demo, payg, pro, unlimited and tester, with and without a promo:
   - every plan renders with its name and the comparison table;
   - with a promo: "£19/mo" / "$19/mo" and "Special price until 31 December 2026." / "December 31, 2026.";
   - pro shows £29/mo and "Includes £2,500 of online orders a month."; unlimited shows "Unlimited online orders included."; payg shows "Free";
   - a lapsed promo goes back to £29/mo; a promo without an end shows "Special price.";
   - an ended plan shows "Pay as you go" and the ended line;
   - demo and tester are not empty and have no purchase panel;
   - the switch modal is data-driven with a URL-encoded mailto;
   - iOS shows no purchase panel;
   - the masked footnote is keyed by id.
8. **Byte-identical to BEFORE** (`scripts/fixtures/plans-data-model-before/`, captured on this tree before Stage A):
   - `pages`: all 16 GB views (landing, /features, /compare, metadata) and all 12 US views;
   - `parts`: all 26 GB views (the /compare calculator, the **plans PDF** HTML and print options, contact, legal chrome, footer, truck page, sitemap) and all 26 US views;
   - **Billing's comparison table:**
     - 22 BEFORE views are byte-identical, including every trial and pro view;
     - the 12 old starter and max views differ **only** in which column is highlighted, because those keys no longer exist and resolve to payg;
     - the new pro table equals BEFORE pro's byte for byte;
     - the payg, unlimited, demo and tester tables equal it with no column highlighted;
   - the import check passes.

### 7.2 `scripts/legacy-pricing-imports.cjs`

- PASS: 752 files scanned, and the importers are exactly the five allowed files.
- **Deliberate failing case:** I added `lib/__legacy-probe-fee.ts` (a static import) and `app/api/__legacy-probe/route.ts` (a relative dynamic import).
  - The check reported `✗ FAIL — 2 forbidden use(s)` and exited 1.
  - I removed both probes. The check went back to PASS, exit 0, and `git status` shows neither probe.

### 7.3 Trigger proof (PGlite, in-memory Postgres; never GB or US live)

`plans-trigger-proof.mjs` in the scratchpad passed 23/23 on the verbatim migration files:
- applies cleanly and idempotently;
- the scratch country **ZZ is refused** until all three public plans are priced, then switches on;
- **refused inside a rolled-back transaction**;
- deleting a price row of an enabled country is refused;
- making tester public is refused;
- the FK refuses 'starter' and accepts 'unlimited';
- the default is dropped and the override checks hold;
- the demo backfill leaves an explicit false alone;
- the ACL matches country_settings, and the trigger functions are not executable by anon or authenticated.

### 7.4 test-truck before/after

The proof ran on a fixture of the live row, so the live row is unchanged: before = after = `plan trial, trial_expires_at 2026-12-31 23:59:59+00`. In the fixture: before → trial; past end → payg, every feature, Pay at Hatch allowed; restored → trial.

## 8. Checks executed

- `npx tsc --noEmit -p .` — clean (0 errors).
- `npx eslint` on the 71 changed app/lib/components files, compared rule by rule with HEAD in a clean worktree. Totals: 503 errors now against 504 at HEAD. There are no new errors; the one fewer is a `react-hooks/rules-of-hooks` in BillingTab, because the `showMatrix` useState is gone. All errors are pre-existing (no-explicit-any etc.). The new files lint clean. `npm run lint` on the whole repo reports 2119 errors, all pre-existing, mostly `require()` in scripts.
- **`npx next build`** — exit 0, run after the last product edit.
- **Harness sweep** — `node scripts/run-harnesses.cjs`, 142 listed harnesses, including the two new ones. Result: **140 passed, 2 failed, both unrelated to Stage A and both green on rerun:**
  - `demo-rebuild-replace.cjs` (35/36): its fixture parks an "other" event on 2026-10-20, which is today, so the demo rebuild replaces it. With the clock set to 19 October through a Date preload it passes 36/36. `lib/provision-demo.ts` is unchanged. This is a date-dependent fixture: re-date it, or pin the code's clock.
  - `add-order-refresh-inputs.cjs`: real-time 5-second windows. It failed during a run in which the machine slept (65 minutes of wall clock at 1% CPU), and passes when rerun alone ("✅ every capacity input AND every status change invalidates the Add Order snapshot").
  - Every other harness passes, including `plans-data-model.cjs` (141/141) and `legacy-pricing-imports.cjs`.

### 8.1 Harnesses re-pinned (Stage A changed what they assert; none was weakened to prove nothing)

The first sweep after the code change failed 28. Each was re-pinned to assert the new state, with a `⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026)` comment at each change. No BEFORE capture was retaken.

- **Tier checks replaced by override checks:** batch-reservation-switch, event-pricing (the menu API's plan lines excused by count, with a companion check), plan-feature-order (now reads the frozen copy; the parity guard's absence is asserted), places-posts-gating, places-tab, social-posts, schedule-graphics-places, private-events, event-types, printing-copy, printing-gating, whatsapp-golive-parity-harness (a harness-local flag/cell rule replaces the deleted parity guard).
- **Country and pricing:** countries-api (the in-memory store models the new trigger; switching on ZZ is refused with the page's sentence and succeeds once its plan_prices rows exist), country-settings-parity (Stage A differences A1–A5 named, everything else byte-compared), signup-country, us-unpriced-country.
- **Charges and audit:** audit-fixes, order-charges (the platform fee from the plan's fee_bps; the retired column is proved unread), phase3-screens (Stage A hunks named precisely).
- **Language phases:**
  - language-phase-0, -1c, -1d, -1d2, -1e, -1e-tidy and -2;
  - their Billing views are proved by a structural check: the card names the effective plan, and the comparison table is BEFORE's byte for byte;
  - the marketing pages are still byte-identical, apart from the items already named;
  - reworded and removed keys are listed in `scripts/fixtures/plans-stage-a-messages.json`;
  - the opt-in overlay `HG_MESSAGES_STAGE_A=before` in `_lp2-frozen.cjs`.
- **messages-parity, midnight-events:** the fake database carries the seeded plan tables.
- During this, `manageSettings.vanUpgrade` turned out to survive as an en-US override. It is removed from `messages/en-US.json` too.

## 9. Every remaining hardcoded plan reference (code: app/, components/, lib/)

| Where | What | Why it stays |
|---|---|---|
| `lib/legacy-pricing-display.ts` (≈30 lines) | 'starter' / 'pro' / 'max' / 'trial' / 'tester' / 'demo' columns, PLAN_META names, TABLE_PLANS, the tier cells, `legacyBillingColumns`, `legacyVanBillingVariant` ('pro') | The frozen display-only copy (answer 2). Stage B deletes the file. |
| `app/landing/page.tsx` (8), `app/compare/CostComparison.tsx` (10), `components/landing/FeatureComparison.tsx:136`, `lib/plans-pdf.ts:161,169` | Starter/Pro/Max cells and prices on the public surfaces | Frozen surfaces, no reword (Stage B — awaiting mockup). |
| `app/manage/[token]/page.tsx` ≈14558, 14573, 14650–14652 | `p === 'trial'`, `row[p as 'starter'\|'pro'\|'max']` inside Billing's comparison table | The frozen table, unchanged by instruction. |
| `app/dev/ticket-preview/page.tsx:72` | `plan: 'pro'` in a dev-only fixture truck (was 'max') | A static preview fixture. The value is never read for access. |
| `lib/plans.ts:109`, `lib/provision-truck.ts:85,91,224,370,406` | 'demo' as a provisioning *kind* and a plan *role* (`'signupDefault' \| 'demo'`), and an error label | Not plan keys; the key comes from the table (`is_demo`). |
| `app/admin/page.tsx:97,578,2168,2199`, `app/api/admin/create-truck/route.ts:67`, `lib/provision-demo.ts:175`, `app/api/manage/route.ts` (via 'demo'), outreach and demo UI (`'demo'` namespace or logo target) | 'demo' meaning a demo *identity*, namespace or kind | Not plan keys. |
| `app/admin/page.tsx:1054–1063` | the words 'trial', 'demo', 'unlimited' as flag labels in the plans table | Labels of flags or NULL, not plan keys. |

Comments still describe history, and they now say "since Stage A". Harnesses under `scripts/` name plan keys as fixtures, which is expected.

## 10. Files changed (this workstream)

**New:**
- supabase/migrations/20261023_trucks_plan_check_live.sql, supabase/migrations/20261024_plans.sql
- lib/plans.ts, lib/plans-server.ts, components/PlanCatalogProvider.tsx
- lib/legacy-pricing-display.ts, lib/card-fees.ts, lib/price-text.ts
- scripts/plans-data-model.cjs, scripts/legacy-pricing-imports.cjs, scripts/_plans-catalog-fixture.cjs, scripts/fixtures/plans-data-model-before/{pages,parts,billing}.json.gz
- docs/plans-data-model-report.md

**Deleted:** lib/plan-features.ts, lib/landing-table.ts, lib/copy/weeklyPost.ts.

**Modified:**
- **Pages:** app/admin/page.tsx, app/manage/[token]/page.tsx, app/dashboard/[token]/page.tsx, app/trucks/[slug]/order/page.tsx, app/domain/page.tsx, app/dev/ticket-preview/page.tsx.
- **Frozen surfaces (imports only):** app/landing/page.tsx, app/compare/CostComparison.tsx, components/landing/FeatureComparison.tsx, lib/plans-pdf.ts.
- **API routes:** app/api/admin/route.ts, app/api/manage/route.ts, app/api/event-types/route.ts, app/api/events/action/route.ts, app/api/menu/[truckId]/route.ts, app/api/orders/submit/route.ts, app/api/dashboard/route.ts, app/api/weekly-post/route.ts, app/api/webhooks/meta/whatsapp/route.ts, app/api/webhooks/whatsapp/route.ts.
- **Components:** (CustomDomainSetup and PrintingSettings also lost their now-unused `plan` / `trialExpiresAt` props, and their callers stopped passing them) components/FeatureGate.tsx, components/admin/CountriesTab.tsx, components/dashboard/CustomDomainSetup.tsx, components/dashboard/types.ts, components/manage/DeleteAccountSection.tsx (comment), components/manage/EventTypes.tsx, components/manage/PaymentsTab.tsx, components/manage/SocialPosts.tsx, components/printing/PrintingSettings.tsx.
- **Libraries:** lib/features.ts, lib/useFeatures.ts, lib/provision-truck.ts, lib/order-charge-rules.ts, lib/orders/auto-accept.ts, lib/custom-domain/redirect-target.ts, lib/country-settings-types.ts, lib/admin/country-form.ts, lib/admin/country-actions.ts, lib/whatsapp-live.ts, lib/email-signup.ts (comment).
- **Messages:** messages/en-GB.json, messages/en-US.json, and the split files messages/ns/en-GB/{errorsManage, eventTypes, manageBilling, manageReports, manageSettings, manageShell, manageWhatsApp, privateEvents, weeklyPost}.json, messages/ns/en-US/manageBilling.json.
- **Harness re-pins** (all under scripts/):
  - harnesses.json (two new entries);
  - the harnesses named in §8.1;
  - their helpers: _lp1d-fixtures, _lp1d2-shell, _lp1c-fixtures/-setup/-demo, _lp1d-*, _lp1d2-*, _lp1e-named/-checks/-words, _lp2-extra/-named/-frozen, _language-phase-0-after, _order-charges-us, _phase3-screens-us, _midnight-manage, _messages-parity-1d/-1d2/-1e;
  - new fixtures: fixtures/plans-stage-a-messages.json and the regenerated fixtures/language-phase-1d(-2)-us-changed.txt.

(Some of these files also carry earlier, uncommitted workstreams' changes: the legal follow-ups and pending-card buttons.)

## 11. Decisions needed

1. **Pay at Hatch on payg.** `plans.pay_at_hatch_allowed` is seeded false for payg and true for the rest. Per your answer it is **not enforced**: Pay at Hatch works for every truck on every plan, an ended trial included. Should payg refuse Pay at Hatch, and from when? If so, how are existing payg trucks told, and should the customer see the option hidden or refused?
2. **Expired trials → Pay as you go with every feature.** This is now the rule, and **real-thai-food** gets it on deploy: today it is denied every feature. It is your rule ("no truck loses features because a plan ended"); this confirms you're happy for RTF specifically to switch on at deploy.
3. **Included vans per plan.** The model has only `extra_van_monthly_minor`, so today every plan includes one van and charges each extra. Old Pro included 2. Trial, demo and tester (no price row) add vans free. Do you want an `included_vans` column?
4. **Plan descriptions** (seeded, English only, shown on Billing and in the switch modal):
   - payg "No monthly fee. A platform fee on online card orders.";
   - pro "A monthly fee with online orders included each month, then a small fee.";
   - unlimited "A monthly fee and no platform fee on online orders.";
   - trial "Every feature, free, while the trial runs.";
   - demo "Prospect sandbox — never public.";
   - tester "Pre-launch tester — full access."
   Change the copy as you wish (it is data). They are not localised.
5. **Billing copy** (minimal rewording where the old words named Max or claimed "keep access"):
   - "You're on Max features…" → "You have every feature. Choose a plan before your trial ends.";
   - notStarted.body "every Max feature" → "every feature";
   - setUpPayment → "⏱ Choose a plan before your trial ends";
   - "Upgrade your plan" → "Change your plan";
   - the modal "Upgrade to {plan}" → "Switch to {plan}", with the mail subject, body and button to match.
   "renews automatically" (untrue) went with the old Pro/Max branch. The new lines: plan.included / includedUnlimited / promo / promoUntil / ended.
6. **The platform fee source** is now `plan_prices.fee_bps`, applied only while `platform_fee_enabled` is on (off everywhere). The engine still applies it to all online food, as the old one did; the included allowance is not modelled there yet. Decide before switching the fee on.
7. **US prices on Billing and marketing** still mask to "TBD" because the frozen display reads the retired US columns (NULL). The new plan card uses the same existing mask, so a US truck's card shows TBD although plan_prices has US rows. Fix in Stage B, or should the card ignore the retired-column check now?
8. **Comparison-table highlight.** A payg or unlimited truck highlights no column (the frozen columns are Starter/Pro/Max). This will be fixed by the Stage B redesign.
9. **trucks.plan default was dropped**, not set to the signup default. Provisioning always writes the plan; a NULL insert now fails loudly.
10. **The admin countries editor** no longer edits the retired columns. If you still want to adjust what the frozen pages show before Stage B, that is SQL.
