# Country settings — Part A: the database (SQL files only)

**9 migration files written · no SQL run · no app code changed · not pushed · not deployed · branch `main` at `f4bd277`**

Every file is in `supabase/migrations/`, dated 20261010 and numbered in run order. Files 01–08 are safe to run now and change nothing a UK truck sees or does. **File 09 is deploy-coupled**: it goes in only after Part B's one-line refund fix ships (§3.6).

Nothing in the brief arrived garbled. **One stop was taken**, as the brief requires: `card_fee_region_label` could not be mapped exactly (the code has two UK wordings), and Dominic chose **`'UK cards'`** (§2).

---

## 1. Run order

| # | File | What it does | Classification |
|---|---|---|---|
| 01 | `20261010_01_trucks_locale_columns.sql` | `trucks.country` / `currency` / `timezone`, defined exactly as they exist live | ✅ **Safe now.** A no-op on live; it lets the repo reproduce the schema |
| 02 | `20261010_02_country_settings.sql` | The table: 40 columns, 17 CHECKs, RLS on, **no policies**, grants revoked from anon/authenticated/public | ✅ **Safe now.** Nothing reads it until Part B |
| 03 | `20261010_03_country_settings_seed_gb.sql` | GB row, enabled, every value from today's code (§2) | ✅ **Safe now** (after 02). `ON CONFLICT DO NOTHING` |
| 04 | `20261010_04_country_settings_seed_us.sql` | US row, **disabled**, six plan price columns NULL | ✅ **Safe now** (after 02). The enabled check blocks switching it on until prices exist |
| 05 | `20261010_05_trucks_country_fk.sql` | FK `trucks.country → country_settings`, NOT VALID then VALIDATE | ✅ **Safe now** (after 03). All 14 trucks are GB, and new trucks take the GB default |
| 06 | `20261010_06_currency_upper_case.sql` | Upper-cases the one `'gbp'` row (guarded); upper-case CHECK on `order_drafts` and `trucks` | ✅ **Safe now.** It refuses and rolls back if the live ledger has a trigger, rule, policy or forced RLS, or more than one lower-case row |
| 07 | `20261010_07_orders_currency_country.sql` | `orders.currency` / `orders.country` NOT NULL, existing rows filled by DEFAULT and the defaults then dropped; BEFORE INSERT fill trigger; upper-case CHECK | ✅ **Safe now, with no code change.** ⚠️ Takes a brief ACCESS EXCLUSIVE lock on `orders` (`lock_timeout` 3s), so run it outside trading hours. If it times out, run it again |
| 08 | `20261010_08_price_mode_currency_neutral.sql` | Widens **both** price-mode CHECKs (`event_types` and `truck_events`) to accept `add_amount` / `sub_amount` | ✅ **Safe now.** It is a superset of the old check; no data is renamed |
| 09 | `20261010_09_order_payments_currency_upper_check.sql` | Upper-case CHECK on `order_payments` | 🔴 **Deploy-coupled. Run AFTER Part B's `refund.ts` fix is deployed, and after 06** (§3.6) |

Every file is idempotent: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, catalogue-guarded `DO` blocks, and a `VALIDATE` that does nothing on an already-valid constraint. Every file runs in a single `begin … commit`, so a failure leaves nothing half-applied.

⚠️ **File-name order versus the existing files.** `20261010_01…09` sort before the two existing `20261010_capacity…` / `20261010_event_types_offline` files and before `20261011…20261022`. Neither depends on the other, **except 08**: it replaces constraints that `20261011_event_pricing.sql` creates. On live, 20261011 has already run, so 08 is correct. On a fresh replay in name order, 08's guards skip (the column does not exist yet) and 20261011 then recreates the narrow checks. In that case, run 08 again after 20261011. The file says so in its header.

---

## 2. The GB row: each value beside its source

| Column | GB value | Source (HEAD `f4bd277`) |
|---|---|---|
| `starter_monthly_minor` | 0 | `lib/features.ts` `PLAN_MONTHLY_PENCE.starter` |
| `pro_monthly_minor` | 2900 | `lib/features.ts` `PLAN_MONTHLY_PENCE.pro` |
| `max_monthly_minor` | 4900 | `lib/features.ts` `PLAN_MONTHLY_PENCE.max` |
| `pro_allowance_minor` | 150000 | `lib/plan-features.ts` `PLAN_ONLINE_ALLOWANCE.pro` `{kind:'amount', pence:150000}` |
| `max_allowance_minor` | 200000 | `lib/plan-features.ts` `PLAN_ONLINE_ALLOWANCE.max` `{kind:'amount', pence:200000}` |
| `platform_fee_pct` | 0.99 | `lib/plan-features.ts` `PLATFORM_FEE_OVER_ALLOWANCE.pct` |
| `card_fee_online_pct` | 1.50 | `lib/plan-features.ts` `CARD_FEES.online.pct` |
| `card_fee_online_fixed_minor` | 20 | `CARD_FEES.online.pence` |
| `card_fee_in_person_pct` | 1.40 | `CARD_FEES.inPerson.pct` |
| `card_fee_in_person_fixed_minor` | 10 | `CARD_FEES.inPerson.pence` |
| `tap_to_pay_fixed_minor` | 10 | `CARD_FEES.tapToPaySurchargePence` |
| `card_fee_region_label` | `'UK cards'` | **Dominic's decision, 10 Oct 2026.** The code has two wordings: online *"standard UK cards"* (landing :567, :828; `FeatureComparison.tsx:41`; `FOOTNOTES` 2 at `plan-features.ts:633`; `PaymentsTab.tsx:510`) and in person *"UK and EEA cards"* (`FOOTNOTES` 1 at `plan-features.ts:626`; `PaymentsTab.tsx:758`). One column could hold neither exactly |
| `competitor_name` | `'Hatches Up'` | `app/compare/CostComparison.tsx:265` (prefill comment; manual §21) |
| `competitor_pct` | 4.50 | `CostComparison.tsx:270` `useState('4.5')` |
| `competitor_fixed_minor` | 20 | `CostComparison.tsx:271` `useState('20')` |
| everything else | as fixed in the brief | `'United Kingdom'`, GBP, `en-GB`, 24h, dmy, monday, `'44'`, postcode, `{Europe/London}`, tax incl. / `'VAT'`, no surcharge (cap NULL, credit_only false, excluded `{}`), no service fee, no tipping, presets `{}`, `uk14`, support_hours NULL |

⚠️ **The `'UK cards'` decision is what Part B will render.** If Part B builds the card-fee sentences from this column, UK operators will see *"UK cards"* where they now read *"standard UK cards"* and *"UK and EEA cards"*. Part A changes nothing, because nothing reads the column yet. That wording change belongs to Part B.

---

## 3. Item by item

### 3.1 Truck columns (01)
The live definitions are reproduced exactly: `country text not null default 'GB'`, `currency text not null default 'GBP'`, `timezone text`. A grep of all 169 existing migrations confirms that none creates these three columns.

### 3.2 `country_settings` (02)
- All columns as specified. CHECKs: code `^[A-Z]{2}$`; currency `^[A-Z]{3}$`; phone `^[1-9][0-9]{0,2}$` (the brief's "digits only"); the five enumerations; `default_timezone = any(timezones)`; each percentage 0–100, with tip presets checked element-wise and NULL elements refused; one combined `*_minor >= 0` check; and **`enabled ⇒ all six plan price columns NOT NULL`**.
- **RLS: enabled with no policies.** Also `revoke all … from anon, authenticated, public`. In the house pattern (`20261009_event_types.sql`), enabling RLS alone leaves Supabase's default grants in place, so the revoke is what actually removes access. `service_role` is granted explicitly. The table comment names V12.1 as the reason and says not to add a policy.
- Not added because not asked: an `updated_at` bump trigger. Part B's admin editor should set `updated_at` and `updated_by` on save.

### 3.3 US seed (04)
All values as given. The six plan price columns are NULL and `enabled = false`. The header gives a rollback-only probe proving the enabled check refuses `enabled = true` today.

### 3.4 FK (05)
`trucks_country_fkey`, `ON DELETE RESTRICT ON UPDATE RESTRICT`. `lib/provision-truck.ts` sends no country, so every truck the current code creates takes the `'GB'` default and satisfies the FK.

### 3.5 Currency case (06) — where the `'gbp'` came from
🔎 **It was not the webhook.** The webhook upper-cases both currencies (`app/api/webhooks/stripe/route.ts:540` for the PaymentIntent, `:778` for the Refund). **The writer is the synchronous refund path:**

```
lib/payments/refund.ts:253      currency: refund.currency ?? undefined      ← Stripe returns 'gbp'
  → recordOnlineCardRefund      lib/payments/online.ts:168
  → recordPaymentEvent          lib/payments/ledger.ts:579   currency: event.currency ?? 'GBP'
```

It writes the refund row first under the `stripe_re:` idempotency key, so the webhook's upper-case copy of the same refund collides and is dropped. Its `livemode` is taken from the key's mode (`refund.ts:252`), which matches the one row being `livemode = false`. **Part B upper-cases at `refund.ts:253`, or once in `recordPaymentEvent`.**

**Is the ledger append-only?** Not in this repository. `order_payments` has no trigger, no rule and **zero policies** (RLS on, by design: `20260729_order_payments_ledger.sql`), and it is mutable by design, since an undo **deletes** a collect row. The live database already holds things the repo does not (the truck columns), so the file checks the live catalogue rather than trusting the repo. If it finds any user trigger, rewrite rule, policy or forced RLS on `order_payments`, it raises `STOP: …` and the transaction rolls back with nothing updated. It also refuses if it finds more than one lower-case row, or any with `livemode = true`, because the brief allows exactly one data change.

### 3.6 Why the `order_payments` CHECK is split into 09
With the CHECK live and `refund.ts` unfixed, the next synchronous refund's ledger insert would fail. `refund.ts` catches that error (the *"REFUNDED BUT NOT RECORDED"* branch, `:259-266`) and returns `balance: null` to the operator. The webhook writes the row seconds later. **No money is lost, but what a UK operator sees after a refund changes**, which Part A must not cause. So 09 waits for Part B. The `order_drafts` and `trucks` CHECKs in 06 have no lower-case writer: `order_drafts.currency` comes only from `order-drafts.ts:213` (`?? 'GBP'`), its one caller passes no currency, and `trucks.currency` has no app writer at all.

### 3.7 `orders.currency` / `orders.country` (07)
- **Existing rows are filled by `ADD COLUMN … NOT NULL DEFAULT`, which on Postgres 11+ only changes the catalogue.** No row is rewritten or updated. **DDL fires no row trigger**, so `orders_set_updated_at` (`20260703`, BEFORE UPDATE) does not run and **`updated_at` does not change**. `lib/orders/mergeOrders.ts`'s version guard therefore sees every order as before, and no realtime UPDATE is emitted. `DROP DEFAULT` also only changes the catalogue and keeps the stored missing value, so old rows still read `'GBP'` / `'GB'`. (Supabase's own DDL event triggers, `pgrst`/`graphql`, react to DDL and touch no rows.) The verify block has a before/after `max(updated_at)` check.
- **The trigger is created before the defaults are dropped, all in one transaction.** `orders_fill_currency_country` is `BEFORE INSERT FOR EACH ROW`, `SECURITY DEFINER` with a pinned `search_path` (anon holds no access to `trucks` since V12.1), and it fills only fields the insert left NULL. **It never overrides a supplied value.** A missing truck raises `23503` rather than storing a currencyless order. Execute is revoked from public/anon/authenticated.
- **orders → truck column: `truck_id`**, as used by `place_order_atomic`'s insert (`20260804:74-80`) and the `orders (truck_id, status, created_at desc)` index (`20260520_kds_foundation.sql:42`).
- **Every path that inserts into `orders`. None sends `currency` or `country`, so all get the truck's values from the trigger with no code change:**

| Path | Where | truck_id comes from |
|---|---|---|
| Customer pay-at-hatch | `place_order_atomic` RPC (`20260804_place_order_atomic_placed_at.sql`), called at `app/api/orders/submit/route.ts:1207` | `p_truck_id` |
| Online card order (draft → order) | `lib/payments/promote-draft.ts:343` direct insert | `draft.truck_id` |
| Add Order, offline replay with client key | `app/api/dashboard/action/route.ts:1722` upsert `ON CONFLICT DO NOTHING` (BEFORE INSERT still fires on the proposed row; a discarded row discards its fill) | `truck.id` |
| Add Order, online | `app/api/dashboard/action/route.ts:1730` insert | `truck.id` |
| Demo seeding | `lib/seed-demo-orders.ts:993` | the demo truck |

No Edge Function, script or other SQL function inserts into `orders` (the other three `insert into orders` hits are superseded versions of `place_order_atomic`).

### 3.8 Price modes (08)
Two constraints use the same vocabulary, not one: `event_types_price_mode_check` **and `truck_events_price_mode_check`** (both from `20261011_event_pricing.sql:122-125, 171-174`). The dashboard's "Prices for this event" sheet copies a type's setup onto `truck_events`. If only `event_types` were widened, that copy would fail the day a type holds `add_amount`. **I widened both identically.** This goes slightly beyond the brief's wording and is stated here. New check: `price_mode is null or price_mode in ('none','add_gbp','add_pct','sub_gbp','sub_pct','add_amount','sub_amount')`. The `event_types.price_mode` column comment is rewritten to name the new values (its other wording is unchanged). No data is renamed.

---

## 4. Corrections to `docs/international-audit-report.md`

| Audit claim | What is true |
|---|---|
| **A-13:** `VAN_ADDON_PRICE` "not present in source" | **Wrong.** `app/manage/[token]/page.tsx:11420` `const VAN_ADDON_PRICE = { starter: 0, pro: 29, max: 49, trial: 0 }` holds **raw pounds**, used at `:11433`, `:14213` (`£${…}/month`), `:14234` (`£${…}/mo`). The audit only grepped `lib/`. ⚠️ **`country_settings` has no column for it.** Part B must either derive it from `pro/max_monthly_minor` (today they are equal) or Dominic adds a column |
| **B-03 / summary:** lists `refund.ts:253` as "currency: refund.currency (from Stripe)" | It is the **lower-case defect itself** (§3.5). The brief's expectation that the webhook wrote it is also wrong |
| **A-15 / M-02:** "`add_gbp`/`sub_gbp` are stored enum values"; labels at `components/shared/PriceControls.tsx:229-231` | They are *allowed* values that **no live row stores**. The labels are at **`lib/copy/serviceSettings.ts:229-231`**, not PriceControls. The audit also **missed `truck_events.price_mode`** (same vocabulary) and the harness assertion at `scripts/event-pricing.cjs:731` |
| **B-08:** orders inserted by "submit" and "Add Order" | Incomplete: also `promote-draft.ts:343` (direct insert) and the Add Order **upsert** at `action/route.ts:1722`. Full list in §3.7 |
| **B-01:** "trucks.country … NOT NULL, 'GB' … no migration" | Correct, and now closed by 01 |

---

## 5. Part B: every site that must read `country_settings`

### 5.0 The structural constraint first
The table is **service-role only**, and most consumers are **client components** (`'use client'`: `app/manage/[token]/page.tsx`, `app/admin/page.tsx`, `components/landing/FeatureComparison.tsx`, `app/compare/CostComparison.tsx`, `components/manage/PaymentsTab.tsx`). They import module-level constants today. In Part B, one server-side loader (`lib/country-settings.ts`, service role, **loud failure on a missing row or a NULL price — never a GB fallback**) must feed them via server components or API responses (e.g. `/api/manage`'s truck payload). It must never be fetched from the browser. `lib/pricing.ts`'s `NON_SECRET_PRICE` matches on rendered strings (`'Free'` …), so any new label must still pass through `px`/`maskPriceFor`.

### 5.1 The constants (the owners to replace)
| File:line | Anchor |
|---|---|
| `lib/features.ts:266` | `PLAN_MONTHLY_PENCE` |
| `lib/features.ts:274` | `planPriceLabel` (`£`, `/mo`) |
| `lib/features.ts:287` | `PLAN_META.pro/max.price` (derived at import) |
| `lib/plan-features.ts:76` | `PLAN_ONLINE_ALLOWANCE` |
| `lib/plan-features.ts:85` | `PLATFORM_FEE_OVER_ALLOWANCE`, `pctLabel`, `PLATFORM_FEE_LABEL` |
| `lib/plan-features.ts` | `allowanceAmountLabel` (`'£'` + grouping), `allowancePenceFor`, `PLAN_ALLOWANCES`, `PLAN_PRICES`, `TRANSACTION_ROWS` |
| `lib/plan-features.ts:148` | `CARD_FEES`, `feeLabel` (`p` suffix), `CARD_FEE_ONLINE_LABEL`, `CARD_FEE_IN_PERSON_LABEL`, `TAP_TO_PAY_SURCHARGE_LABEL` |
| `lib/plan-features.ts:626, :633` | `FOOTNOTES` 1 and 2 card wording (→ `card_fee_region_label`) |

### 5.2 The surfaces (from the PRICE SURFACE MAP, re-anchored at HEAD)
| File | Lines | What |
|---|---|---|
| `app/landing/page.tsx` | :38, :161, :581, :638, :730 | `PLAN_PRICES`, `PLAN_ALLOWANCES` |
| | **:567** | **raw literals** £29 / £1,500 / £49 / £2,000 / 0.99% + "standard UK cards" |
| | :828 | "standard UK cards" |
| `components/landing/FeatureComparison.tsx` | :26, :71, :92, :129; **:41** literal "standard UK cards" | footnote override, table |
| `lib/landing-table.ts` | :25, :36 | `PLAN_PRICE_LABEL` |
| `lib/plans-pdf.ts` | :19, :118, :123, :145, :148 | PDF. ⚠️ also attached to outreach (`app/api/admin/outreach/attachments/route.ts:86-100`) and served at `/landing/features-pdf`, so it needs a country argument |
| `app/manage/[token]/page.tsx` | :37, :14471, :14499, :14589, :14654, :14784 | Billing via constants |
| | **:14705, :14711, :14800, :14806, :14830, :14865, :14866** | **raw `px('£29/mo')` / `'£49/mo'` / `'£49/month'`** |
| | **:11420, :11433, :14213, :14234** | **`VAN_ADDON_PRICE`** raw pounds (no column — §4) |
| | :14914 | `fmtGBP` (Reports/CSV) |
| `app/admin/page.tsx` | :14, :1001, :1029, :1075 | constants |
| | **:1017, :1501** | **raw "0.99%"** |
| `app/compare/CostComparison.tsx` | :33-39, :81, :87, :93-95 | plan, card and overage constants |
| | :270-271 | competitor prefill `'4.5'` / `'20'` (→ `competitor_*`) |
| `components/manage/PaymentsTab.tsx` | :35, **:510** "standard UK cards", **:758-759** "UK and EEA cards" | card-fee copy |

### 5.3 The money path (B-03): currency from the truck/order, not a literal
| File:line | Today | Part B |
|---|---|---|
| `lib/payments/refund.ts:253` | `refund.currency` (lower case) | **upper-case: prerequisite for migration 09** |
| `lib/payments/ledger.ts:579` | `event.currency ?? 'GBP'` | require a currency, or upper-case here (one fix covers every writer) |
| `lib/payments/authorize.ts:119` | `(args.currency ?? 'GBP').toLowerCase()` | pass the truck's / draft's currency; keep `.toLowerCase()` for Stripe |
| `lib/payments/order-drafts.ts:213` | `draft.currency ?? 'GBP'` | set from the truck |
| `app/api/orders/submit/route.ts:938` | `createOrderDraft` passes no currency | pass `truck.currency` |
| `lib/payments/online.ts:112, :168` | pass-through | — |
| `app/api/webhooks/stripe/route.ts:540, :778` | already upper-cases | keep |
| Orders | — | `orders.currency` / `country` now exist and are trigger-filled. Readers should use the order's own values, not the truck's |

### 5.4 Price modes
`lib/event-pricing/price.ts:50` `PRICE_MODES`, `:66` unit (`'£'`), `:178-182`, `:413-414`, `:480` `MAX_PRICE_AMOUNT_GBP`; `lib/copy/serviceSettings.ts:229-231`; harnesses `scripts/event-pricing.cjs:204-205, :232-235, :274, :731` (**it asserts 20261011's narrow check text and that every `PRICE_MODES` value appears in 20261011, so it must read 20261010_08 once the code adds `add_amount`**), `:1201`, `:1218`; `scripts/subtab-row.cjs:141`.

### 5.5 Not in scope of "comes from country_settings" but next in line
The formatter sweep: 466 `£` literals across 47 files (audit §7.1), 156 `toFixed(2)`, and 9 private `money` closures (audit A-18).

---

## 6. Things Dominic should know

1. **`prices_include_tax` means menu prices**, not HatchGrab's plan prices. GB `true` matches VAT-inclusive menus, but the Terms say plan prices "exclude VAT unless stated". The column comment says this.
2. **`VAN_ADDON_PRICE` has no column** (§4).
3. **Migration 07's lock:** `ALTER TABLE orders` needs a brief ACCESS EXCLUSIVE lock, so run it when no truck is trading. The 3s `lock_timeout` makes it fail fast rather than queue behind a long transaction.
4. **Migration 06 may stop.** If its guard finds anything on the live `order_payments`, the error starts with `STOP:` and nothing is changed. Send me the message; do not work around it.
5. **Harnesses run against the new files:** `scripts/outreach-schema-census.cjs` (it parses every migration) passes **42/42**, and `scripts/event-pricing.cjs` (it reads `20261011_event_pricing.sql` by name) passes **130/130**. Neither touches a database.

---

## 7. Rules kept

| Rule | |
|---|---|
| Main as checked out, no push, no deploy | ✓ |
| No SQL run; no app code changed | ✓ Nine new `.sql` files and this report are the only writes |
| No `.env*` or secret opened | ✓ |
| No drop, no row deletion | ✓ The only data change is 06's guarded upper-casing of one test-mode row |
| Pizzeria Gusto, `outreach_templates` | Not touched. No file names a truck |
| Safe to run twice | ✓ Every file |
| Stop on an unmappable value | ✓ Stopped once (card label); answered "UK cards" |

## 8. Files written
`supabase/migrations/20261010_01_trucks_locale_columns.sql` · `…_02_country_settings.sql` · `…_03_country_settings_seed_gb.sql` · `…_04_country_settings_seed_us.sql` · `…_05_trucks_country_fk.sql` · `…_06_currency_upper_case.sql` · `…_07_orders_currency_country.sql` · `…_08_price_mode_currency_neutral.sql` · `…_09_order_payments_currency_upper_check.sql` · `docs/country-settings-sql-report.md`
