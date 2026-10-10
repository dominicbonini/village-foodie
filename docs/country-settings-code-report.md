# Country settings — Part B: the app reads the one table

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck's data changed**

Every price, allowance, platform fee, card fee and competitor figure the app shows now comes from `public.country_settings`, through one server-only loader. The money path takes its currency from the truck, the draft or the order, never a `'GBP'` literal. **A UK truck sees exactly what it saw before, with the one accepted change:** the in-person card wording "UK and EEA cards" now reads "UK cards". This is proved surface by surface in §2, including three public pages rendered through the real loader against the live GB row.

Nothing in the brief arrived garbled, and no instruction contradicted another. **One tension is recorded, not stopped on:** the manual (V11.38) warns that a locale formatter is not deterministic across runtimes, and the brief asks for one built on `Intl.NumberFormat`. I built it on Intl as asked and **measured** the risk: the same labels are identical in Node, Chromium and WebKit (§2.5).

**Not done by me: the test-mode card order.** It needs an operator session for Pizza Kitchen, and the standing rule is that no manage token is provided and I do not look for one. Exact steps and the read-only SQL are in §5. Until that has been run against real rows, **this is not ready to deploy** (manual §35: money code is unverified until exercised against rows).

---

## 0. What was built, item by item

| # | Item | Done | Where |
|---|---|---|---|
| 1 | One server-only loader | ✅ | `lib/country-settings.ts`: `import 'server-only'`, service role (imported lazily), explicit column list, typed mapping that refuses any value it cannot type, 60-second in-memory cache, `clearCountrySettingsCache()`, `getCountrySettings(code)`, `countrySettingsForTruck(truck)`, `getCountrySettingsMany(codes)`. A missing row throws; a truck object without `country` throws; a NULL plan price throws where it is used for a price (`requirePlanPrice`) |
| 2 | One client-safe formatter | ✅ | `lib/money-format.ts`: pure, no imports, Intl-based. `formatWholeAmount` ("£1,500"), `formatAmount` ("£29" / "£29.50"), `perMonthLabel` ("£29/mo", "£29/month"), `pctLabel` ("0.99%"), `smallFeeLabel` ("20p", "30¢"), `feeLabel` ("1.5% + 20p"), `currencySymbol`, `minorDigits` / `toMajor` |
| 3 | Replace the constants | ✅ | §1. Feature lists, plan gates and `findPlanParityViolations` stay in code, and the guard still runs at module load on every route that imported `lib/plan-features.ts` before. The footnote-2 mask (`f.number !== '2'`) is unchanged |
| 4 | Every price surface reads it | ✅ | §1.3 |
| 5 | Card wording | ✅ | Online: "standard " + label → "standard UK cards" (unchanged). In person: label → **"UK cards"** (the one change) |
| 6 | Money path | ✅ code · ⏳ **row test is yours** | §3, §5 |
| 7 | New trucks | ✅ | `provisionTruck` requires `country`; writes `country`, `currency`, `timezone` from the settings row; all three callers pass `'GB'` explicitly. No existing truck touched |
| 8 | Currency-neutral price modes | ✅ | §4 |

---

## 1. The constants → functions of a settings object

### 1.1 What replaced what

| Was (module constant) | Now (function of `CountrySettings`) | File |
|---|---|---|
| `PLAN_MONTHLY_PENCE` | `planMonthlyMinor(tier, s)` | `lib/features.ts` |
| `planPriceLabel(pence)` | `perMonthLabel(minor, fmt)` | `lib/money-format.ts` |
| `PLAN_META[p].price` | `planPrice(plan, s)`. `PLAN_META` keeps name + description only | `lib/features.ts` |
| `PLAN_PRICES` | `planPrices(s)` | `lib/plan-features.ts` |
| `PLAN_ONLINE_ALLOWANCE` (`pence`) | `planOnlineAllowance(s)` (`minor`) | ″ |
| `PLATFORM_FEE_OVER_ALLOWANCE`, `PLATFORM_FEE_LABEL`, `pctLabel` | `platformFeeOverAllowance(s)`, `platformFeeLabel(s)`, `pctLabel(pct, fmt)` | ″ |
| `allowanceAmountLabel(pence)`, `allowancePenceFor(tier)` | `allowanceAmountLabel(minor, s)`, `allowanceMinorFor(tier, s)` | ″ |
| `PLAN_ALLOWANCES` | `planAllowances(s)` | ″ |
| `CARD_FEES`, `feeLabel`, `CARD_FEE_ONLINE_LABEL`, `CARD_FEE_IN_PERSON_LABEL`, `TAP_TO_PAY_SURCHARGE_LABEL` | `cardFees(s)`, `feeLabel(fee, fmt)`, `cardFeeOnlineLabel(s)`, `cardFeeInPersonLabel(s)`, `tapToPaySurchargeLabel(s)`, plus `cardRegionOnline(s)` / `cardRegionInPerson(s)` | ″ |
| `TRANSACTION_ROWS` | `transactionRows(s)` | ″ |
| `FOOTNOTES` | `footnotes(s)`: same five, same numbers, same order | ″ |
| `PLAN_PRICE_LABEL` | `planPriceLabels(s)` | `lib/landing-table.ts` |
| `VAN_ADDON_PRICE` (raw pounds, in the manage page) | **deleted**; `vanAddonMonthlyMinor(plan, s)` = the plan's monthly price (pro/max), 0 otherwise | `lib/plan-features.ts` |

The words `'Free'`, `'Free trial'`, `'Lifetime'`, `'Demo'`, `'Pay at Hatch'`, `'Unlimited'`, `'—'` and `'0%'` are still literals, because `lib/pricing.ts`'s `NON_SECRET_PRICE` matches them by exact string. A starter tier priced above 0 would render as an amount and be masked like any price.

### 1.2 How values reach a client component, which never reads the table

| Surface | How |
|---|---|
| Landing (server component) | `getCountrySettings(MARKETING_COUNTRY)` in the page |
| `/features` → `FeatureComparison` (server component) | prop from the page |
| `/compare` → `CostComparison` (client) | prop from the server page |
| Manage → Billing, Payments, the van add-on, `FeatureGate` (client) | `/api/manage` returns `countrySettings` for the truck's own country (fatal 500 if it cannot be read). The page mounts `CountrySettingsProvider` (`components/CountrySettingsProvider.tsx`). `useCountrySettings()` **throws** outside a provider; there is no default currency |
| Admin (client) | `/api/admin` (behind `verifyAdmin`) returns `countrySettings` keyed by code: the marketing country plus every truck's own. `country` was added to its explicit truck select |
| Plans PDF (server) | `generatePlansPdf(country)`, a required argument |

`MARKETING_COUNTRY = 'GB'` is named once, in `lib/marketing-country.ts`, with the note that the visitor's country picker comes later. Landing, `/features`, `/compare` and Admin's plan matrix use it.

### 1.3 Every surface from the PRICE SURFACE MAP

| Surface | Change |
|---|---|
| Landing `app/landing/page.tsx` | Reads GB settings. **The lede's raw literals are gone**: £29 / £1,500 / £49 / £2,000 / 0.99% and "standard UK cards" are now `formatAmount(planMonthlyMinor(…))`, `allowanceAmountLabel(…)`, `platformFeeLabel(s)`, `cardFeeOnlineLabel(s)` and `cardRegionOnline(s)`. The pricing-card asterisk line likewise |
| `components/landing/FeatureComparison.tsx` | `settings` prop; the footnote-2 override's "standard UK cards" literal is now derived |
| `lib/landing-table.ts` | `planPriceLabels(s)` |
| `lib/plans-pdf.ts` | `buildPlansPdfHtml(s)`, `generatePlansPdf(country)` |
| `/landing/features-pdf` and the outreach attachment route | Each passes `'GB'` explicitly, with a comment that prospects have no country yet |
| Manage → Billing | Every `px('£29/mo')`, `'£49/mo'`, `'£49/month'`, `'£29/month'` (including both inside the mailto body) is gone. Prices, rows and footnotes come from the truck's settings, still through `px` |
| Manage → Settings, the van add-on | `VAN_ADDON_PRICE` deleted; `vanAddonMonthlyMinor` + `perMonthLabel`, still through `vanPx` |
| Manage → Payments | Fees, tap-to-pay and both region phrases from the truck's settings |
| `FeatureGate` | Upgrade line's price from `planPrice(needed, settings)`, still through `px` |
| Admin | Plan matrix from GB settings ('…' until `/api/admin` answers, never a guessed figure). The truck modal's "0.99% transaction fee…" is now that **truck's** country's `platformFeeLabel`. No raw "0.99%" remains, including in comments |
| `/compare` | Plan, card and overage figures from settings (`toMajor`, not `/ 100`). Competitor prefill from `competitor_pct` / `competitor_fixed_minor`; **a NULL `competitor_name` leaves both boxes empty** (asserted) |

**The mask is unchanged everywhere.** Billing, the van add-on and FeatureGate still pass every price through `usePriceMask()`. The PDF still uses its `always-real` mode. Landing, `/features`, `/compare` and Admin still render unmasked, exactly as before. The parity harness renders Billing with prices published and with `hide_pricing` on, and both match the old output. That includes the documented, dormant defect where footnote 1's card figures stay visible under `hide_pricing` (§44). That defect is **preserved, not fixed**, because identical output was the requirement.

---

## 2. The proof — the V11.38 method

`scripts/country-settings-parity.cjs` (new, registered in `scripts/harnesses.json`). **The "before" snapshot was captured from the unchanged code, before the first edit**, and is committed as `scripts/fixtures/country-settings-before.json`. The GB figures the "after" side uses are **parsed out of `20261010_03_country_settings_seed_gb.sql`**, not typed into the harness (`scripts/_country-settings-gb.cjs`).

### 2.1 The one allowed difference
` on UK and EEA cards` → ` on UK cards`, matched exactly. Every other byte must be identical. "Cards issued outside the UK and EEA cost more." is a different phrase and did not move. The harness also fails if the allowed change *didn't* happen.

### 2.2 Results (final run)

| Section | What it is | Result |
|---|---|---|
| modules | Every exported price/fee value of `lib/features.ts`, `lib/plan-features.ts`, `lib/landing-table.ts`, plus the helpers on in-use and neighbouring inputs, the van add-on labels and `findPlanParityViolations()` | **291 identical, 1 allowed** (footnote 1); parity `[]` |
| pdf | The plans PDF's HTML as text | **83 identical, 1 allowed** |
| billing | Manage → Billing **rendered**: trial / starter / pro / max × upgrade target pro / max × `hide_pricing` off / on × prices published / unpublished, with the matrix open and the upgrade modal (and its mailto) shown | **32 identical, 32 allowed** (footnote 1 inside the matrix) |
| payments | Manage → Payments rendered, loaded state, four plans | **4 allowed**, nothing else differs |
| admin | Admin's plan matrix and one truck's edit modal, rendered | **9 identical, 1 allowed** |
| compare | `/compare`'s **results** rendered on both paths at four inputs (the initial render shows no figures) | **40 identical** |
| pages (HG_PAGES=1) | `/`, `/features`, `/compare` fetched from the dev server with the HatchGrab host, **through the real loader, reading the live GB row** | **40 identical, 1 allowed** (`/features`) |
| formatter (HG_BROWSERS=1) | 17 GB and US labels in **Node, Chromium and WebKit** | **identical in all three** |

🔴 **So the live GB row equals the constants it replaces.** The landing and `/features` render the pro and max prices, both allowances, the platform fee, the online and in-person fees, the tap-to-pay fee and the region label. `/compare` renders the competitor's 4.5 / 20 as input values, and Starter's "Free" proves `starter_monthly_minor` is 0. All of it came through `getCountrySettings('GB')` against the live table and matched. **No GB value differed, so no STOP was needed.**

⚠️ **Two notes on method, both stated in the harness:**
- **Pages.** React's SSR puts a `<!-- -->` separator between adjacent text nodes, which reads as a space. Where a literal became an interpolation, the landing read "£2,000 ." against the old "£2,000." — the browser renders neither space. The pages comparison therefore ignores whitespace **before closing punctuation only**. Measured: the landing differed by exactly four such spaces and was otherwise byte-identical.
- **The formatter's two known differences are on inputs nothing renders:** a monthly price of £1,000 or more is now grouped ("£1,000/mo"), where the old helper printed "£1000/mo"; and a fixed fee of a whole unit or more is now an amount ("£1.20"), where the old helper printed "120p". Every value the app renders today, and its neighbours (£29.50/mo, £9.99/mo, £999, 2.25%, 99p), is identical.

### 2.3 US output, for the record (not rendered anywhere: US is disabled)
`$29/mo` · `$1,500` · `2.9% + 30¢` · `5¢` · `$` · `2.7%`.

### 2.4 The country_settings data and the loader are absent from client bundles
After `next build`, all 92 files under `.next/static` were searched:

| Searched for | Files |
|---|---|
| `card_fee_online_pct` (a column name) | **0** |
| `country_settings` (the table name) | **0** |
| the loader's own strings (`refusing to fall back…`, `countrySettingsForTruck`, `getCountrySettingsMany`, `clearCountrySettingsCache`) | **0** |
| `£29`, `£49`, `£1,500`, `PLAN_MONTHLY_PENCE`, `tapToPaySurchargePence` | **0**. The manual recorded `/compare`'s public JS chunk carrying £29/£49; it no longer does |

The build also passing proves no client module reaches `import 'server-only'`. (`Hatches Up` appears in three chunks: pre-existing outreach-admin lead-type labels, not settings data.)

### 2.5 The manual's ICU warning (V11.38)
"A locale formatter is not deterministic across runtimes" was written against a trimmed-ICU build host. Node 22 here, Vercel's Node runtime and every browser ship full ICU. **The harness now measures this every time it runs with `HG_BROWSERS=1`.** A disagreement would fail it, and would otherwise show as a hydration mismatch on every price.

### 2.6 tsc, lint, build, harnesses

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| eslint, the 37 baseline files + 10 new/touched | **no rule count grew in any file.** Totals 442→443 errors, 132→132 warnings; the +1 is the pre-existing `upsell_rules?: any[]` in `components/dashboard/types.ts`, newly in the linted set. One new `exhaustive-deps` warning in `CostComparison` was fixed, not waived |
| `npx next build` | **compiled successfully** |
| `node scripts/run-harnesses.cjs` | **98 of 99 passed** on the first sweep, the new parity harness among them. The one failure, `schedule-graphics-places.cjs`, is the guard that every line of the manage page since `719ac91` still exists unless accounted for. My 19 deliberate Billing / van-add-on line changes were not yet listed. They are now accounted entries, each **tied to its replacement, which must exist**, and it passes standalone. `subtab-row.cjs` sits outside the sweep (it needs a build and two browsers) and passes standalone, 90/90 |

### 2.7 Harnesses changed, and why
| Harness | Change |
|---|---|
| `event-pricing.cjs` | §7 now reads **`20261010_08`** for the price-mode CHECK, on **both** `event_types` and `truck_events`. It asserts the allowed set equals the new names plus the legacy aliases. Two new checks: code writes only the new names, and a stored old name prices exactly like the new one. Tables now use `add_amount` / `sub_amount`. **132/132** |
| `subtab-row.cjs` | The option lists are **lifted** from `lib/copy/serviceSettings.ts` (GB symbol substituted) instead of hand-typed, and every mode value is checked against the widened CHECK in **`20261010_08`**. **90/90, both engines** |
| `compare-no-system.cjs` | Passes GB settings (from the seed). The "no literal" check is re-aimed at the settings functions and forbids the old figures. New check: GB prefills 4.5 / 20 and a NULL competitor leaves both boxes empty. **50/50** |
| `whatsapp-golive-parity-harness.cjs` | Reads `footnotes(GB)`. **37/37** |
| `outreach-reply-attach.cjs` | Both PDF callers now `generatePlansPdf('GB')` |
| `event-types.cjs` | Compiles the two new modules; the event-price note check expects the truck's currency symbol. **185/185** |
| `schedule-graphics-places.cjs` | 19 accounted edits for the Billing / van-add-on lines this change replaced (raw £29/£49, `VAN_ADDON_PRICE`, the old constant names), each checked against its replacement |

---

## 3. The money path (B-03)

| Site | Before | Now |
|---|---|---|
| `lib/payments/ledger.ts` `recordPaymentEvent` | `currency: event.currency ?? 'GBP'` (optional) | **Required**; `ledgerCurrency()` upper-cases and validates **before** the insert, and throws on anything else |
| `ledger.ts` `recordCollectionPayment` (cash / own card machine) | no currency → `'GBP'` | **`orders.currency`** (`readOrder` now selects it) |
| `ledger.ts` undo reversal | no currency → `'GBP'` | inherited from the row it reverses |
| `lib/payments/refund.ts:253` (the source of the one `'gbp'` row) | Stripe's lower case, stored as received | `ledgerCurrency(refund.currency)` → `'GBP'` |
| `lib/payments/capture.ts` | no currency → `'GBP'` | the **draft's** currency (the one the hold was authorised in) |
| `app/api/webhooks/stripe/route.ts` payment / refund | the intent's / refund's currency, else `undefined` → `'GBP'` | the intent's / refund's, else the **order's** / the **charge row's**. Never a literal |
| `lib/payments/order-drafts.ts` | `draft.currency ?? 'GBP'` | **required**, validated |
| `app/api/orders/submit/route.ts` | no currency passed | `currency: truck.currency` into `createOrderDraft`; `authorizeDraft` gets the **draft's** |
| `lib/payments/authorize.ts` | `(args.currency ?? 'GBP').toLowerCase()` | **required**; `stripeCurrency()` lower-cases for Stripe |
| `lib/payments/promote-draft.ts` | (the trigger would fill it) | `currency: draft.currency` written explicitly onto the order; `country` left to the trigger |

`lib/payments/currency.ts` is the one place a code is normalised: `ledgerCurrency` (UPPER, for our tables) and `stripeCurrency` (lower, for Stripe). **No `'GBP'` literal remains** anywhere under `lib/payments`, `app/api`, `lib/stripe`, `app/dashboard`, `lib/email.ts` or `lib/printing` (one hit, in a doc comment).

Readers that need an order's currency use `orders.currency`: the ledger's collection path does. The display readers (emails, tickets, KDS, reports) still print `£` — that is the £ sweep, not this part (§6).

---

## 4. Price modes

- `PRICE_MODES` is now `['none', 'add_amount', 'add_pct', 'sub_amount', 'sub_pct']`, and that is what code **writes**.
- `LEGACY_PRICE_MODE_ALIASES` reads `add_gbp` → `add_amount` and `sub_gbp` → `sub_amount`. **Every read** goes through `normalisePriceMode()`: `applyPriceRule`, the row→setup mapper, `describeRule`, the lock-in, and the event-types GET. The event-types write path stores the new name **even when an older client sends the old one**.
- `MAX_PRICE_AMOUNT_GBP` → **`MAX_PRICE_AMOUNT`** (1000, major units of the truck's currency).
- `amountUnitFor(mode, currencySymbol)` returns '%' or the truck's symbol.
- `lib/copy/serviceSettings.ts`: `priceModeChoices(symbol)` ("+ £", "− £") and `priceRoundingChoices(symbol)` ("Nearest £1"), plus `PRICE_MODE_VALUES`. `eventPriceOwnNote(…, symbol)` now takes the symbol: **no typed £ left in that file's labels.** `PriceModeSelect` / `PriceRoundingSelect` / `PriceAmountInput` take a required `currencySymbol`. `EventTypes` passes the truck's, from the provider. The dashboard passes `currencySymbol({ currency: truck.currency, locale: 'en' })`, which gives '£' / '$'. It has no country settings, and a truck object with no currency (an old offline snapshot) gets **no symbol** rather than a guessed one.

---

## 5. 🔴 The money-path test against real rows — YOURS TO RUN, BEFORE DEPLOY

I could not drive this. Refunding needs Pizza Kitchen's operator session, and the standing rule is that I do not look for a token.

**Preconditions (not checked — Dominic to confirm):** the dev server on `localhost:3000` is running **this working tree** with **test-mode** Stripe keys (`pk_test_` / `sk_test_`). Pizza Kitchen's Manage → Payments shows a connected **test** account with online card payments on. Pizza Kitchen has an event **today** with ordering open.

1. Open `http://localhost:3000/trucks/test-kitchen/order` in a private window.
2. Add one item. Fill in name and email. Choose **Pay by card**.
3. In the card form enter `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Press **Pay**.
4. You land on the order confirmation. Note the **order number**. (A draft was created in GBP, a hold authorised in `gbp`, and the draft promoted to an order.)
5. Open Pizza Kitchen's dashboard. If the order is **pending**, press **Accept / Confirm**. This captures the hold and writes the ledger **charge** row. If the truck auto-accepts, it has already captured.
6. On that order, open **payment actions → Refund order #N**, refund the **full** amount and confirm. (Alternatively **Cancel order**, tick **Refund £X to their card**.) This runs `refund.ts`, the path that wrote the lower-case `'gbp'`.
7. Run the SQL in §5.1. Every currency must read **`GBP`** in upper case: the draft, the order and **both** ledger rows. The refund row's `external_ref` starts `re_`.
8. Then run §5.2. When it returns **0**, run `20261010_09_order_payments_currency_upper_check.sql`.

### 5.1 The draft, the order and the ledger for the latest Pizza Kitchen card order

```sql
-- READ ONLY. test-truck only. The most recent card order's draft, order and ledger rows, with currencies.
with d as (
  select order_key, currency, total_minor, payment_intent_id, livemode, created_at
    from order_drafts
   where truck_id = 'test-truck'
   order by created_at desc
   limit 1
)
select 'draft'                       as row_kind,
       d.order_key,
       d.currency,
       null::text                    as country,
       d.total_minor                 as amount_minor,
       d.payment_intent_id           as ref,
       d.livemode,
       d.created_at
  from d
union all
select 'order', o.order_key, o.currency, o.country, o.total_minor, o.id, null::boolean, o.created_at
  from orders o join d using (order_key)
union all
select 'ledger ' || p.kind || '/' || p.channel, p.order_key, p.currency, null::text, p.amount_minor,
       p.external_ref, p.livemode, p.created_at
  from order_payments p join d using (order_key)
order by created_at;
```

### 5.2 Ready for migration 09?

```sql
-- READ ONLY. Must be 0 before 20261010_09 is run.
select count(*) as lower_case_rows from order_payments where currency <> upper(currency);
```

### 5.3 For the record, after deploy

```sql
-- READ ONLY. Currencies across the money tables, and the price modes now stored.
select 'order_payments' as tbl, currency, livemode::text as mode, count(*) from order_payments group by 2, 3
union all select 'order_drafts', currency, null, count(*) from order_drafts group by 2
union all select 'orders', currency || '/' || country, null, count(*) from orders group by 2
order by 1, 2;

select 'event_types' as tbl, price_mode, count(*) from event_types group by 2
union all select 'truck_events', price_mode, count(*) from truck_events group by 2
order by 1, 2;

-- The GB and US rows the app now reads.
select country_code, enabled, currency, starter_monthly_minor, pro_monthly_minor, max_monthly_minor,
       pro_allowance_minor, max_allowance_minor, platform_fee_pct, card_fee_online_pct,
       card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
       tap_to_pay_fixed_minor, card_fee_region_label, competitor_name, competitor_pct, competitor_fixed_minor
  from country_settings order by country_code;
```

---

## 6. Deploy order, and what is deliberately not in this part

**Deploy order.** Part A's 01–08 are already applied, which this code needs (`country_settings`, `orders.currency`). Then: (1) run §5 on localhost; (2) deploy; (3) §5.2 returns 0; (4) run `20261010_09`.

**Not in this part, flagged:**
- **The wider `£` sweep.** Emails, tickets, KDS, OrderCard, Reports (`fmtGBP`), the dashboard, `PriceCell`'s `£` prefix and diff (`components/shared/PriceControls.tsx:268, :365, :398`), and `describeRule`'s `money()` / "nearest £1" (`lib/event-pricing/price.ts:414, :418`). `orders.currency` is now there for them to read.
- **`PaymentsTab`'s "Cards issued outside the UK and EEA cost more."** (twice) is unchanged. Moving it would be a second visible UK change, but it is UK copy a US truck would see. It needs a wording decision, or a column.
- **`provisionTruck` now refuses a country whose `enabled` is false.** That is the column's documented meaning ("can trucks sign up from here"), and a US truck would have no price to show. It is a small behaviour beyond the brief's wording and is stated here. Every caller passes `'GB'`, which is enabled.
- **No admin editor** for `country_settings` (Part C). `clearCountrySettingsCache()` is exported for it.
- Landing / `/features` SEO copy ("HatchGrab UK", "UK food trucks") is unchanged.

---

## 7. Files

**New:** `lib/country-settings.ts` (loader, server-only) · `lib/country-settings-types.ts` (the shape, `requirePlanPrice`, `moneyFormatOf`) · `lib/money-format.ts` (formatter) · `lib/marketing-country.ts` · `lib/payments/currency.ts` · `components/CountrySettingsProvider.tsx` · `scripts/country-settings-parity.cjs` · `scripts/_country-settings-gb.cjs` · `scripts/fixtures/country-settings-before.json`

**Changed:** `lib/features.ts` · `lib/plan-features.ts` · `lib/landing-table.ts` · `lib/plans-pdf.ts` · `app/landing/page.tsx` · `app/landing/features-pdf/route.ts` · `app/features/page.tsx` · `components/landing/FeatureComparison.tsx` · `app/compare/page.tsx` · `app/compare/CostComparison.tsx` · `app/manage/[token]/page.tsx` · `app/api/manage/route.ts` · `components/manage/PaymentsTab.tsx` · `components/FeatureGate.tsx` · `app/admin/page.tsx` · `app/api/admin/route.ts` · `app/api/admin/outreach/attachments/route.ts` · `lib/payments/{ledger,online,refund,capture,order-drafts,authorize,promote-draft}.ts` · `app/api/orders/submit/route.ts` · `app/api/webhooks/stripe/route.ts` · `lib/provision-truck.ts` · `app/api/setup/route.ts` · `app/api/admin/create-truck/route.ts` · `lib/provision-demo.ts` · `lib/event-pricing/{price,lock-in}.ts` · `app/api/event-types/route.ts` · `lib/copy/serviceSettings.ts` · `components/shared/PriceControls.tsx` · `components/manage/EventTypes.tsx` · `app/dashboard/[token]/page.tsx` · `components/dashboard/types.ts` · seven harnesses + `scripts/harnesses.json`

---

## 8. Rules

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ The dev server already running on :3000 was used, not restarted |
| No SQL run | ✓ All SQL is above, read-only, not executed |
| No `.env*` or secret opened or printed | ✓ |
| Only Pizza Kitchen; no truck's data changed; not Gusto | ✓ Nothing was written to any truck. The live reads were GETs of three public pages |
| No outreach_templates, no emails | ✓ |
| Stop on a GB value that differs | Checked, live: none differed |
