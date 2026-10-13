# Phase 3 foundations — tax, tips and fees in the engine and the database (no screens)

**10 October 2026 · branch `main` · checkpoint commit `3033a532` (local, not pushed) + the uncommitted Phase 3 tree · not pushed · not deployed · no SQL run · no `.env*` opened · no email sent · Pizzeria Gusto and `outreach_templates` untouched**

Every order now goes through one engine that works out its tax, tip, service fee and card surcharge, and stores a snapshot of them. The UK is unchanged: every order path writes exactly what it wrote before, plus the snapshot columns. On a UK order the only non-null new values are the four you named.

- **The method:** the same as every earlier phase.
  - Step 0 committed the whole tree as the checkpoint `3033a53` ("International phases 1–2D-2 and audit fixes (checkpoint)").
  - The BEFORE snapshot was then captured on that unchanged code (`scripts/fixtures/order-charges-before.json`). It covers eight GB order paths, each run end to end on the real routes.
  - AFTER, each path is byte-identical to BEFORE except named difference 1, which is checked value by value.
- **SQL:** one migration, `20261010_17_order_charges.sql`, **run now** (below). It only adds things, and it is safe to run twice.
- **Brief:** nothing arrived garbled, and no instruction contradicted another. Smaller choices are listed in §8 with the option taken.

---

## 1. The SQL — run now

`supabase/migrations/20261010_17_order_charges.sql`. **Run now, before this code is tested or deployed**: the new code selects the new columns by name and calls `place_order_atomic_v2`. The code live today reads none of them.

The full file is in the repository (`supabase/migrations/20261010_17_order_charges.sql`); paste it whole into the SQL editor. What it does:

| Table | Added | Defaults |
|---|---|---|
| `orders`, `order_drafts` | `food_minor`, `tax_minor`, `tax_rate_bps`, `tax_inclusive`, `tax_label`, `tip_minor`, `tip_pct_bps`, `service_fee_minor`, `service_fee_recipient`, `card_surcharge_minor`, `card_funding`, `card_fee_payer`, `application_fee_minor` | the four amounts `not null default 0`; everything else nullable. Existing orders keep NULL / 0 (no backfill) |
| `order_payments` | `application_fee_minor`, `application_fee_refunded_minor`, `card_funding` | refunded `default 0`; others nullable |
| `trucks` | `tax_rate_bps`, `tipping_enabled` (NULL = country default), `card_fee_payer` (default `'truck'`), `service_fee_enabled` (default false), `service_fee_bps`, `service_fee_fixed_minor`, `base_region_code` | as listed |
| `truck_events` | `tax_rate_bps` | nullable |
| `country_settings` | the seven new settings (§3) | all OFF; GB and US take the defaults |
| function | **`place_order_atomic_v2`** — the 20260804 function, plus the 13 snapshot columns and an explicit `total_minor` | service role only (revoked from public, anon and authenticated) |

**20 CHECKs**, each added only when missing:
- amounts ≥ 0;
- basis points between 0 and 10000;
- recipient in ('truck', 'hatchgrab');
- funding in ('credit', 'debit', 'prepaid', 'unknown');
- payer in ('truck', 'customer');
- `base_region_code ~ '^[A-Z]{2}$'`.

A NULL passes every one.

**What it never does:**
- drops nothing;
- does not touch `place_order_atomic` (the new code calls v2; the old one stays for any build still running);
- switches nothing on.

**Verify (read-only), after applying:** five queries are at the foot of the file, and they are also in the chat reply. They show:
- the 44 new columns, with nullability and defaults;
- the 20 CHECKs;
- that both functions exist and v2 is service-role only;
- that GB and US took the defaults;
- that no truck has anything switched on.

## 2. What each order stores

`total_minor` keeps its meaning: **the grand total the customer pays**.

> total_minor = food_minor + tax_minor + tip_minor + service_fee_minor + card_surcharge_minor

`total` (major units) is always derived from it, so the two are the same number by construction.

| Column | Meaning | UK order |
|---|---|---|
| `food_minor` | food after the discount, before tax, tip and fees. The platform-fee base (D18) | **= total_minor** |
| `tax_minor` | tax added on top, rounded once (D3) | 0 |
| `tax_rate_bps` | the rate used; NULL where tax is included | NULL |
| `tax_inclusive` | the country's rule at the time | **true** |
| `tax_label` | the tax's name at the time | **'VAT'** |
| `tip_minor` / `tip_pct_bps` | the online tip, and its percentage when a preset was chosen | 0 / NULL |
| `service_fee_minor` / `service_fee_recipient` | the online service fee; the recipient only when a fee applies | 0 / NULL |
| `card_surcharge_minor` | always 0 this phase | 0 |
| `card_funding` | not written this phase | NULL |
| `card_fee_payer` | the truck's setting | **'truck'** |
| `application_fee_minor` | not written this phase (D19: taken at capture) | NULL |

## 3. Country settings — the mapping

**Reused (already on `country_settings`), not added:**

| Setting in the brief | Column |
|---|---|
| prices include tax / the tax's name | `prices_include_tax`, `tax_label` |
| online service fee allowed (default off) | `service_fee_allowed` |
| tipping on by default / tip presets | `tipping_enabled_default`, `tip_presets_pct` (percent as written; the resolver turns 15 into 1500 bps) |
| the platform fee's rate | `platform_fee_pct` |
| surcharge rules (kept for Phase 4; the resolver ignores them) | `card_surcharge_allowed`, `card_surcharge_cap_pct`, `card_surcharge_credit_only`, `card_surcharge_excluded_regions` |

**Added (20261010_17):**

| Setting in the brief | Column | Default |
|---|---|---|
| who keeps the service fee | `service_fee_recipient` ('truck' / 'hatchgrab') | 'truck' |
| HatchGrab's amount when HatchGrab keeps it | `service_fee_hatchgrab_bps`, `service_fee_hatchgrab_fixed_minor` | NULL |
| the truck's maximum when the truck keeps it | `service_fee_truck_max_bps`, `service_fee_truck_max_fixed_minor` | NULL (= that part not allowed) |
| platform fee switched on | `platform_fee_enabled` | false |
| service fee and surcharge taxed | `fees_taxed` | false |

**Where they are wired:**
- Loader: `COUNTRY_SETTINGS_COLUMNS` and `mapCountryRow` in `lib/country-settings.ts`. Each value is typed and refused if unusable, like every other.
- Types: `lib/country-settings-types.ts`.
- Save code:
  - `lib/admin/country-form.ts`: carried by the form with full validation, plus "can't switch our fee on without a rate";
  - `lib/admin/country-actions.ts`: `valuesToColumns`.
- **No Countries page rows.** The form carries the values through a save untouched. Nothing renders them.

> ⚠️ **One value to know about.** The **US** row already had `service_fee_allowed = true` from its Phase 1 seed. It is reused as seeded, not changed. No fee can apply: the recipient defaults to 'truck', no truck has a fee on, and HatchGrab's amounts are NULL. The US is also still switched off.

## 4. The engine and the resolver

### `lib/order-charges.ts` — pure, integer minor units

**Input:** food after the discount, the resolved rules, the channel (`online_card` / `online_pay_at_truck` / `walk_up`) and the tip choice.

**Output:** food, tax, tip, service fee, surcharge, grand total, and the 13-column snapshot.

**Tax:**
- Tax-inclusive (the UK): tax is 0 and the stored rate is NULL.
- Tax on top: `round(base × rate)` **once**, half away from zero (`applyBps`, integer arithmetic). The base is food, plus the fee and surcharge only when the country says fees are taxed.

**Service fee:**
- online card only;
- dropped for pay at the truck (D25);
- never on a walk-up;
- percentage plus fixed, as one amount (D26).

**Tip:**
- online card only, and only when tipping is on;
- a preset percentage of food (D11), or a custom amount capped at 100 % of food (D12);
- never taxed.

**Surcharge:** supported, but the resolver always gives none (§8).

**Exported helpers:**
- `chargesForEdit`: an operator edit's re-price (§5).
- `chargesForHatchSwitch`: the pay-at-the-truck switch (§5).
- `wouldBeApplicationFeeMinor`: the would-be platform fee, called **only by the harness**.

### `lib/order-charge-rules.ts` — server only (`import 'server-only'`)

`loadChargeRules(supabase, truck, eventId)` reads the truck's country (the cached loader) and, only where tax is added on top, the event's `tax_rate_bps`. That read is scoped to the truck, so a GB order makes no new database read. `resolveChargeRules` decides:

- **Tax rate:** the event's, else the truck's (D1). Ignored where tax is included.
- **Tipping:** the truck's `tipping_enabled`, else the country's default. The presets are always the country's.
- **Service fee:** off unless the country allows it, **and** either:
  - HatchGrab keeps it: the country's amount, which trucks cannot change; or
  - the truck keeps it and has it on: each part clamped to the country maximum. A part with no maximum is not allowed.
- **Surcharge:** off this phase.
- **Card fee payer:** the truck's.
- **Platform fee:** only when the country has it switched on and has a rate.

**The browser sends only the tip choice** (`tip: { kind: 'none' | 'percent' | 'amount' }`). The submit route accepts it, and nothing in the browser sends it yet.

## 5. Threaded through (server only)

| Path | Change |
|---|---|
| **Submit** `app/api/orders/submit/route.ts` | `foodMinor` (`:690`) is what used to be the total. After the event is known (`:773`): resolve the rules, check the tip, call the engine. `serverTotalMinor` is its grand total. A malformed tip, or one the truck doesn't offer, on a card order is **refused (400, `tipInvalid`) before anything is written**. A tip on a pay-at-the-truck order is ignored (D13) |
| …card | the draft stores the snapshot (`:1004`); Stripe is authorised for the grand total. **No `application_fee_amount`** |
| …pay at the truck | `p_order` carries `total_minor` and the snapshot, and the call is **`place_order_atomic_v2`** (`:1262`) |
| **Drafts** `lib/payments/order-drafts.ts` | `DRAFT_ROW_COLUMNS` and `OrderDraftRow` gain the 13 columns. `NewOrderDraft.charges` is required, so every draft stores the snapshot |
| **Promotion** `lib/payments/promote-draft.ts:392` | copies the draft's snapshot **verbatim** (`chargeColumnsOf`) and never re-derives it, because the card was authorised for exactly those amounts |
| **Walk-up** `action/route.ts:1535` | the same engine, channel `walk_up`: taxed (D9), no fee, no tip |
| **Operator edit** `action/route.ts:822` | `chargesForEdit`, explained below |
| **Pay-at-the-truck switch** `lib/payments/ledger.ts` `recordCollectionPayment` → `switchToHatchCharges` | explained below |
| **Offline optimistic walk-up total** | **gap recorded**, not changed (§7) |
| **`update_event_deal`** `app/api/manage/route.ts:1248` | the bundle must also be this truck's. If not: 404 "Event not found" (the same answer as for another truck's event), and nothing written |
| **D22** | `lib/places.ts` `townDetails` reads `shortText` for a `zip_state` country and keeps it only when it is two capital letters. It flows through `BasePlace` → the signup and Where you trade request bodies → `checkTradeArea` → `trucks.base_region_code`, at signup (`provision-truck.ts:487`) and in `update_trade_area`. **The key exists only for a `zip_state` country**, so a GB answer, body and write are unchanged. Nothing displays it |

**The operator edit (`chargesForEdit`):**
- It re-prices.
- Tax uses the **order's own snapshot** (D4: its rate, label and rule).
- An online tip keeps its percentage, **capped at the original amount** (D14).
- **An edit never adds a charge the order didn't have.**

**The pay-at-the-truck switch (`switchToHatchCharges`):**
- When nothing has been paid and no hold is live (both callers skip or refuse a held order first), an order still carrying online-only charges has them dropped before the hatch collects (D25).
- Tax is recomputed on the food alone.
- Covers `collected*`, `mark_paid*` and the walk-up "paid at order" path.
- **GB and every walk-up: nothing to drop, nothing written.** The readOrder select gained the snapshot columns, so no extra read is made.

## 6. Proof

### New harness `scripts/order-charges.cjs` (registered; helper `scripts/_order-charges-us.cjs` listed as a shared module)

**255 checks, all passing.** It runs the real routes on an in-memory database that stores rows and records every write (`scripts/_fake-pg.cjs`):
- the submit route, for pay at the truck and card;
- `promoteDraft`, on the draft that submit just wrote;
- the dashboard action route: walk-up, edit, `collected` and `mark_paid_cash`.

Emails, push, Stripe authorise and capture are recorders.

**§1 — UK (GB fixtures), against BEFORE.** Eight paths:
- submit pay-at-the-truck, plain and with a 10 % code plus a meal deal and notes;
- card submit, then promotion;
- walk-up with a hand-set price;
- walk-up paid at order;
- edit of an order placed before Phase 3;
- collected;
- mark paid (cash).

For each path these are **byte-identical to BEFORE**, after the named difference is stripped: the response, every RPC argument, every write, every email (subject, HTML and text), push, the authorise amount, and capture. Named difference 1 is checked on each of the 7 order rows written:
- all 13 columns present;
- `food_minor` = `total_minor`;
- `tax_inclusive` true, `tax_label` 'VAT', `card_fee_payer` 'truck';
- the four amounts 0;
- the five others NULL;
- **the only non-null new values are exactly those four**.

Also checked:
- the pay-at-the-truck RPC is v2 and is passed `total_minor` = round(total × 100);
- the old function is never called;
- collected and mark-paid write nothing new;
- **no `application_fee_amount`**.

**Mutation controls:**
- an engine change that stored a GB `tip_pct_bps` of 0 → 8 failures;
- a 1p change to the submit total → failures on the snapshot, the response, the RPC and the emails.

**§2–4 — US fixtures (the US stays off):**

| Check | Result |
|---|---|
| $24.00 at 825 bps | tax **$1.98**, total **$25.98**: engine and route agree, emails show $25.98 |
| 15 % tip | **$3.60**, not taxed (tax stays $1.98), not in `food_minor` (2400); card authorised for food + tax + tip |
| Service fee kept by **HatchGrab** | 3 % + 30¢ = $1.02 → 'hatchgrab'; the truck's own numbers can't change it. Card authorised for **3060** = 2400 + 198 + 360 + 102 |
| Service fee kept by the **truck** | 5 % + $1 clamped to the country's 4 % + 50¢ = $1.46 → 'truck'. Within the maximum it is the truck's own |
| Fees taxed | not by default ($1.98); when the country says so, round((2400 + 102) × 8.25 %) = **$2.06**, rounded once |
| Walk-up | taxed $1.98; **no fee** (even with HatchGrab's on), no tip; total 2598 |
| Online → pay at the truck | the same truck's pay-at-the-truck order carries no fee. After a **released** hold, mark paid drops the tip and fee (3060 → **2598**) and collects 2598. A **live** hold is still refused (409) before anything is re-priced |
| Edit | $24 → $36: tax at the **order's** 825 bps, not today's 900 ($2.97). Tip 15 % = $5.40 **capped at $3.60**. Fee capped at $1.02. Total 4359. Down to $20: the tip keeps 15 % = $3.00 |
| Per-event rate | 900 bps over the truck's 825 bps, end to end: $2.16, total $26.16 |
| Unknown state | a not-two-letter or missing `shortText` stores no code; a typed town stores NULL; a GB place has no `regionCode` key at all, and a GB save no `base_region_code` key |
| Tips refused | a percentage not offered → **400**, nothing written or authorised; tipping off → refused; custom above 100 % → capped by the server |
| Rounding | half away from zero (0.5 → 1, 1.5 → 2, −1.5 → −2); $10.05 × 825 bps = 83, rounded once |
| Would-be platform fee | NULL when the switch is off; 0.99 % of 2400 = 24 when on. No route calls it |

**§6 — `update_event_deal`:**
- own event and own bundle: written as before;
- another truck's bundle: **404 "Event not found", nothing written**;
- an unknown bundle: the same refusal.

**§7 — the migration:**
- v2 writes all 13 columns, each read from `p_order`, and takes `total_minor` from `p_order`, falling back to `round(total × 100)`;
- with those additions removed, v2 is **the 20260804 function line for line**;
- the old function is not redefined, altered or dropped;
- nothing is dropped;
- every new column is nullable or has a default;
- it is safe twice;
- v2 is service-role only;
- no code sends `application_fee_amount`.

### The rest

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| eslint, the 18 touched and new files, per rule vs HEAD | ✅ no rule grew (counts identical; the two new files are clean) |
| `next build` | ✅ exit 0 |
| Client bundles after the build | ✅ no chunk holds the engine, the resolver, `place_order_atomic_v2`, `country_settings`, the new setting names, `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` |
| Harness sweep (108 files) | ✅ **108 / 108 passed** (`node scripts/run-harnesses.cjs`, re-run after the `printing-escpos-identity` fix below; the first run was 107 / 108) |
| `countries-api` | its in-memory table now mirrors the seven new columns and 20261010_17's three country_settings CHECKs. 75/75 |
| `_country-settings-gb.cjs` | the harnesses' GB and US rows now carry 20261010_17's defaults, **read from the migration file**, never typed out |
| `printing-escpos-identity` | **failed one check in the first sweep, and Phase 3 code is not the cause.** Its control said "without the fold, HEAD and the working tree differ" — true only while the D38 accent fold was uncommitted. The Step 0 checkpoint committed D38, so HEAD now folds too and the control could never pass again, on any tree. The harness now **reads HEAD's own `printableText`**: where HEAD folds, it compares HEAD and the working tree directly, and its controls prove the tree prints "Jose's" (never "Jos?'s") and that a changed name changes the bytes. Where HEAD doesn't fold, it behaves exactly as before. All 18 fixtures are byte-identical to HEAD |

**No visible change:**
- No screen, email, receipt, ticket, KDS, report or CSV file was edited.
- The emails, which are computed from the order, are byte-identical (§1 above).
- Tickets, KDS, reports and CSVs read the order's unchanged columns, and their existing parity harnesses pass in the sweep.

## 7. Gaps recorded (not changed)

1. **The offline walk-up's optimistic total.**
   - `components/dashboard/AddOrderPanel.tsx` builds the offline card's `total` from `calculateOrderTotal`, which is food only.
   - For a tax-on-top country, the card shows food without tax until the order syncs. The server then stores the grand total, and the card corrects itself on the round trip.
   - The fix: carry the truck's resolved rules (tax rule, rate, and the event override) in the dashboard snapshot, and call `computeOrderCharges(…, 'walk_up')` in the panel. The engine is pure, so it can run in the browser.
   - It was not done here because it changes the `/api/dashboard` payload and a screen, and this phase has no screens. **It must be done before a US truck takes walk-ups offline.** For the UK, food = total, so there is no gap.
2. **Demo orders** (`lib/seed-demo-orders.ts`) are inserted without the snapshot. Their columns take the defaults (`food_minor` NULL). They are demo-truck rows, wiped on re-provisioning, and nobody pays them.
3. **A draft written by the old code and promoted after deploy** carries no snapshot. The order then has the defaults, like any order placed before Phase 3. Drafts live about 30 minutes, so this is only the deploy window.
4. **`base_region_code` comes from the browser** (as `base_region` always has). It is checked for shape only. A later phase that uses it for money should re-derive it on the server from the place id.
5. **`place_order_atomic` (old) carries Postgres's default EXECUTE grant.** v2 is service-role only. The old one is left as found, as the brief says. To see whether a browser key can call it, run this (read-only):

   ```sql
   select has_function_privilege('anon', 'public.place_order_atomic(jsonb, text, text, uuid, text, date, jsonb)', 'execute') as anon_can_call_old;
   ```

   If it is true, a later phase could revoke it, once no build calls the old function.

## 8. Smaller choices made (UK identical, design singular)

| Choice | Taken | Why |
|---|---|---|
| Edit with a service fee | recomputed under today's rules, **capped at the original amount**, like the tip (D14) | an edit can never raise what the customer agreed online. The fee's own percentage isn't in the snapshot |
| Edit of an order with no online charges | priced as an in-person order (tax only), whatever today's rules say | an edit never adds a fee or tip the customer didn't agree to |
| A custom tip on an edit | keeps its amount, capped at 100 % of the new food and at the original. `tip_pct_bps` stays NULL for a custom tip | D12, and D14 speaks of a percentage |
| The hatch switch also drops an online tip | yes, along with the fee and surcharge (D25) | D13: no online tip on a pay-at-the-truck order |
| When the hatch switch fires | at collection, inside `recordCollectionPayment`, only when nothing is paid and no hold is live | the one place an in-person payment books the balance. It covers all three callers |
| A tip sent on pay at the truck | ignored | D13. Refusing would punish a client for a choice that can't apply |
| A tip not offered, on a card order | refused, 400, nothing written | never silently drop money the customer believes they're paying |
| `tax_rate_bps` on a US order with no rate set | NULL, tax 0 | store what was used |
| The event for the tax rate | the order's own event (`eventRow`), the one it is stored against | |
| `service_fee_recipient` | written only when the fee is above 0 | your answer: "only when a service fee actually applies" |
| A truck fee part with no country maximum | not allowed (0) | the safe reading of "within the country maximum" |
| `base_region_code` key | only for `zip_state` countries | GB bodies and writes unchanged |
| Rules for the edit and the switch | the order's snapshot wins for tax and card fee payer (D4) | |
| `platform_fee_enabled` without a rate | refused by the form | a switch with no rate is meaningless |
| v2's grants | service role only | the old function's default grant is reported, not copied |

## 9. Rules kept

| Rule | |
|---|---|
| Cursor never runs SQL; all SQL inline, marked | ✓ one file, **run now** |
| Pizzeria Gusto untouched; test only on Pizza Kitchen | ✓ fixtures only (`test-truck` / `test-kitchen`) |
| Never deploy or push; never kill processes by name | ✓ local checkpoint commit only, as Step 0 asked |
| No `outreach_templates`; no email sent | ✓ emails recorded in memory |
| Never drop a table, column or function; never delete an image | ✓ |
| No `.env*` opened | ✓ the Places test sets a stand-in key in its own process and restores it |
| No visible change | ✓ named difference 1 only, proven on every GB path |
