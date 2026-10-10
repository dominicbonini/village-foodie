# International readiness audit — US and English-speaking countries first

**Read-only. Nothing was created, edited or deleted except this file. No SQL run, no API called, no process touched, no git state changed.**

## 1. Header

| | |
|---|---|
| Branch | `main` |
| HEAD | `f4bd277` — "social media fixes" (2026-10-09 21:13 +0100) |
| Audit date | 2026-10-10 |
| `git diff --name-only main...HEAD` | 0 files (HEAD is main) |
| Working tree | `M docs/reference-manual.md` only (pre-existing; not read for this audit beyond the V14.6 locale entry) |
| Live schema (Dominic's paste, mid-audit) | `trucks.country text NOT NULL default 'GB'`, `trucks.currency text NOT NULL default 'GBP'`, `trucks.timezone text NULL`, `trucks.hide_pricing boolean NOT NULL default false`, `order_drafts.currency` / `order_payments.currency text NOT NULL default 'GBP'` — **confirmed-live** |

Legend: **S** = READ-FROM-SOURCE · **M** = READ-FROM-MANUAL · **L** = confirmed by Dominic's live-schema paste. "Anchor" is a function/const/unique string; line numbers are secondary and current at HEAD `f4bd277`.

Nothing in the brief arrived garbled and no instruction contradicted another. Dominic's mid-audit note ("also consider outreach and emails — we will need to know which country they are and ensure we send information with correct pricing") is covered in **§N**.

---

## 2. Executive summary — the ten biggest blockers

1. **Every plan price, allowance and card fee is a GBP constant** (`PLAN_MONTHLY_PENCE`, `PLAN_ONLINE_ALLOWANCE`, `CARD_FEES` in `lib/features.ts` / `lib/plan-features.ts`) with `£` hardcoded in their label helpers; there is no per-country table, no DB table, no admin panel. **S**
2. **`£` is written literally 466 times across 47 files**; no `Intl.NumberFormat` anywhere; `toFixed(2)` 156×; only one shared money pair (`toMinor`/`fromMinor`) and ~8 private `money = m => £…` closures. Every receipt, email, ticket, dashboard card, KDS footer and report prints `£`. **S**
3. **The customer order page lede and Manage → Billing print raw literals** ("Pro is £29 a month … Max is £49 … 0.99%", `px('£29/mo')`) that bypass the constants, so a per-country price table would leave them wrong. **S**
4. **Currency is defaulted to `'GBP'` at three independent sites** (`authorize.ts`, `ledger.ts`, `order-drafts.ts`); `trucks.currency` is **never read** by any TS file. `orders` has no currency column; `order_drafts`/`order_payments` carry `'GBP'` by DB default. **S + L**
5. **Time zone is `'Europe/London'` by default at 37 files / 90 sites**, two Supabase Edge Functions compute "now in London", and all Vercel/GitHub crons run on UTC wall-clock. `trucks.timezone` exists (NULL on every truck per `lib/whatsapp/usage.ts`) and is read at 8 sites, defaulting to London everywhere. **S + L**
6. **Phone validation is UK-only** (`isValidUKPhone` — `0/+44/44` + 9–11 digits) on the customer order form, setup wizard and setup API; three separate `+44` normalisers (`lib/email.ts`, `lib/whatsapp-hint.ts`, `lib/admin/truck-details.ts`). **S**
7. **Postcode geocoding is `api.postcodes.io`** (UK-only) and the AI geocoder appends `country || 'UK'`; the schedule-extract prompt teaches UK postcode shapes. **S**
8. **No tax layer at all** — zero VAT/sales-tax code or fields; Terms say "Prices are in pounds sterling and exclude VAT unless stated". US "tax on top" needs a new order-total line, new columns, new receipt/email/ticket rows. **S**
9. **The 14 UK/FSA allergens are the only vocabulary** (`ALLERGEN_VOCAB` in `components/manage/primitives.tsx`, duplicated verbatim in two AI prompts and consumed by go-live checks, ticket, menu import). The US "big nine" differs (no celery/mustard/lupin/sulphites/molluscs; adds sesame already present). **S**
10. **Outreach/emails have no country signal**: `discovery_trucks`, `outreach_prospects`, `venues` carry only `postcode`/`village`; the plans PDF attached to outreach is generated from the GBP constants; order emails hardcode `£`; the sender is `hello@villagefoodie.co.uk`. **S**

Also notable: Stripe connected accounts are created with `identity.country = trucks.country` (already correct in shape, **S**); `application_fee_amount` is never sent (**S**); no customer-facing fee/tip/surcharge exists (**S**); `html lang="en"` (not `en-GB`) (**S**); legal pages name HatchGrab Ltd, England & Wales, UK data-protection law (**S**).

---

## 3. Findings by section

### A. Money / plan pricing

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| A-01 | `lib/features.ts` `PLAN_MONTHLY_PENCE = { starter: 0, pro: 2900, max: 4900 }` | GBP pence, one price for every country | 1 const; read by `PLAN_META`, `app/compare/CostComparison.tsx` (5×) | Yes (const) | Keyed by country (or by truck) and currency | S |
| A-02 | `lib/features.ts` `planPriceLabel(pence)` → `` `£${pounds}/mo` `` | `£`, "/mo" English, 2-dp via `padStart` | 1 helper, feeds `PLAN_META.pro/max.price` | Yes | Currency-aware formatter | S |
| A-03 | `lib/features.ts` `PLAN_META` | prices are strings baked at module load | read in landing (6), manage (4), admin (6), `lib/plans-pdf.ts` (3), `components/landing/FeatureComparison.tsx` (2) | Yes | Resolve per request/truck, not at import | S |
| A-04 | `lib/plan-features.ts` `PLAN_ONLINE_ALLOWANCE` (pro 150000p, max 200000p) + `allowanceAmountLabel` (`'£' + manual thousands`) | GBP; `£1,500`/`£2,000` strings | 1 const + 1 helper; feeds `PLAN_ALLOWANCES`, `TRANSACTION_ROWS` | Yes | Per-country allowance amounts and formatter | S |
| A-05 | `lib/plan-features.ts` `PLATFORM_FEE_OVER_ALLOWANCE = { pct: 0.99 }` + `pctLabel` | One platform rate worldwide | 1 const; `app/admin/page.tsx:1017` `'0.99% + card fee'` and `:1501` repeat it **as literals** | No (2 admin literals) | Per-country rate; admin strings derived | S |
| A-06 | `lib/plan-features.ts` `CARD_FEES = { online:{1.5,20}, inPerson:{1.4,10}, tapToPaySurchargePence:10 }`; `feeLabel` → `"${pct}% + ${pence}p"` | Stripe UK pricing, "p" suffix, "UK-issued"/"UK/EEA" wording | 1 const, 3 labels; consumed by landing (5), `FeatureComparison` (2), `CostComparison` (7), `components/manage/PaymentsTab.tsx` (imports all three) | Yes | US Stripe rates (2.9% + 30¢ etc.), "¢" suffix, country wording | S |
| A-07 | `lib/plan-features.ts` `FOOTNOTES[0].text` "…on UK and EEA cards…"; `FOOTNOTES[1]` "Stripe Connect…"; landing `:567`, `:828`, `FeatureComparison.tsx:41` "on standard UK cards" | UK copy inside the shared pricing table | 4 prose sites | Partly (FOOTNOTES const + 3 page strings) | Per-country footnotes | S |
| A-08 | `app/landing/page.tsx:567` lede: "Pro is £29 a month with £1,500 … Max is £49 with £2,000. Anything above that is 0.99%" | **Raw literals** in prose (only the card fee is derived) | 1 site, 5 literals | **No** | Derive from the price table | S |
| A-09 | `app/manage/[token]/page.tsx` Billing tab `px('£29/mo')`, `px('£49/mo')`, `'£49/month'` (lines 14705–14876) | Raw literals | ≈9 literals, 1 file | **No** | Read `PLAN_META`/price table | S |
| A-10 | `lib/plans-pdf.ts` (`generatePlansPdf`) — reads `PLAN_META`, `TRANSACTION_ROWS`, `FOOTNOTES`, `PLAN_ALLOWANCES` | GBP PDF; same generator serves `/landing/features-pdf` **and** outreach attachments (`app/api/admin/outreach/attachments/route.ts:86`) | 1 generator, 2 consumers | Yes | Country parameter → per-country PDF | S |
| A-11 | `lib/pricing.ts` `PRICING_PUBLISHED = process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true'`; `NON_SECRET_PRICE` set; `maskPriceFor(hidePricing)`; `trucks.hide_pricing` | Masking is global + per-truck, not per-country | 1 module; `px(` used in manage (12), admin (1), `PricingPolicy` (1), plans-pdf (3) | Yes | Unchanged; mask must wrap the per-country label | S + L (env: **not checked — Dominic to confirm**) |
| A-12 | `TRANSACTION_ROWS` / `ROW_FEATURE_MAP` / `FEATURE_SECTIONS` (`lib/plan-features.ts`) | Row cells are pre-rendered GBP strings ("First £1,500…") | consumed by landing (4), manage (2), admin (5), `FeatureComparison` (3), plans-pdf (2) | Yes | Build rows from a country-resolved price table | S |
| A-13 | `VAN_ADDON_PRICE` | **Not present in source** (grep of `VAN_ADDON`, "per van", "extra van" in `lib/features.ts`/`lib/plan-features.ts` = 0). `PLAN_META.maxVans` starter 1 / pro 2 / else 999 only | — | — | If a van add-on is planned, it does not exist yet | S (M claim unverified) |
| A-14 | `/landing/cost` | **Does not exist**; the cost comparison is `app/compare/CostComparison.tsx` (derives all figures from constants; `OVERAGE = PLATFORM_FEE_OVER_ALLOWANCE.pct`, 30 `£`, mentions "Hatches Up at 4.5% + 20p") | 1 page | Yes | Per-country competitor + fee set | S |
| A-15 | `lib/copy/serviceSettings.ts` (10 `£`), `components/shared/PriceControls.tsx` (`add_gbp`/`sub_gbp`, "Nearest £1"), `components/PricingPolicy.tsx` | Event-pricing rule modes are named in GBP (`add_gbp`) and `MAX_PRICE_AMOUNT_GBP = 1000` (`lib/event-pricing/price.ts:480`) | 3 files; `add_gbp`/`sub_gbp` are **stored enum values** in `event_types.price_mode` | Partly | Rename/alias mode to currency-neutral; cap per currency | S |
| A-16 (A2) | `£` literal count | 466 across 47 files: manage 42, `lib/event-pricing/price.ts` 36, CostComparison 30, customer order page 27, AddOrderPanel 25, dashboard 24, OrderCard 20, `lib/email.ts` 19, `lib/printing/ticket.ts` 13, dashboard action route 11 … (full list §7.1). By area: customer (`app/trucks`, `app/order`) 29; operator (`app/dashboard`, `components/dashboard`, `app/manage`, `components/manage`) 155; KDS 4; email 19; admin 1; marketing (`app/landing`, `app/features`, `app/compare`) 38; API 25; lib (rest) ~95 | **No shared formatter** | One `formatMoney(minor, currency, locale)` and a sweep | S |
| A-17 (A2) | `fmtGBP(n)` at `app/manage/[token]/page.tsx:14914` — `` `£${n.toFixed(2)}` `` | Reports tab + CSV export | 15 call sites (:15166–15645) | Yes (file-local) | Currency-aware | S |
| A-18 (A2) | private `money = (m) => £${(m/100).toFixed(2)}` closures | `lib/email.ts` ×4 (:54, :89, :661, :746), `lib/printing/ticket.ts:368`, `components/dashboard/OrderCard.tsx:373`, `app/dashboard/[token]/page.tsx:2555, :6333`, KDS `:2910` | 9 closures | No | Replace with the shared formatter | S |
| A-19 (A2) | `toFixed(2)` 156 sites / 25 files; raw `*100` / `/100` 61 sites | Two decimals and 100 minor units (true for USD/CAD/AUD/NZD; false for JPY etc.) | see §7.3 | `toMinor`/`fromMinor` (`lib/order-repricing.ts`) + `toPence`/`toPounds` (`lib/event-pricing/price.ts:107/118`) exist but are not universal | Route all through the minor-unit pair | S |
| A-20 (A2) | `Intl.NumberFormat` | **0 occurrences** | — | — | Introduce | S |
| A-21 (A3) | Stripe Billing | **None**: no `subscriptions`, `prices`, `products`, `checkout.sessions`, `billingPortal`, no `price_`/`prod_` ids; "subscription" appears only in prose/Terms | — | — | Billing stack still to build; can be country-aware from day one | S |
| A-22 (A4) | DB table / admin panel for pricing by plan/country | **None.** Admin has only per-truck `lifetime_discount_pct` / `lifetime_discount_note` (`app/admin/page.tsx:41`, `:1478`); no migration creates a pricing/settings table | — | — | New `plan_prices(country, plan, …)` table + admin editor | S |

### B. Payments & order totals

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| B-01 | `trucks.country` / `trucks.currency` / `trucks.timezone` / `trucks.hide_pricing` | Columns exist (country `'GB'` NOT NULL, currency `'GBP'` NOT NULL, timezone NULL). **No migration in `supabase/migrations/` defines `country`, `currency` or `timezone`** (only `hide_pricing` — `20260805_trucks_hide_pricing.sql`); they were added outside the repo. `lib/weekly-post/locale.ts` header and manual V14.6 both say "trucks has no country column" — **stale** | readers of `.country`: `app/api/stripe/connect/route.ts:86,123,253`, `lib/weekly-post/{draw,caption-template,locale,render}.ts`, `components/manage/{SocialPosts,WeeklyPost,EventPost}.tsx` (all `?? 'GB'`); readers of `.currency`: **none**; readers of `.timezone`: `app/api/menu/[truckId]/route.ts:519`, `app/api/manage/route.ts:407,3105,3266`, `app/api/orders/submit/route.ts:690`, `app/api/webhooks/meta/whatsapp/route.ts`, `lib/whatsapp/usage.ts:20`, `app/manage/[token]/page.tsx:14973` (all default London); **writers: none** (`lib/provision-truck.ts` inserts no country/currency/timezone → DB defaults) | No | Signup/admin must set all three; `currency` must be read by authorize/ledger/drafts; migration files committed for the three columns | L + S (+M contradiction) |
| B-02 | `lib/stripe/connect.ts` `createConnectedAccount({ email, country, businessUrl })` → `identity: { country: (opts.country \|\| 'GB').toLowerCase() }`, `configuration.merchant.capabilities.card_payments.requested: true`, `dashboard: 'full'`, `fees_collector/losses_collector: 'stripe'` | Country comes from `trucks.country` (correct shape); fallback `'GB'`; only `card_payments` requested | 1 creator, 3 callers | Yes | Verify US-specific capability/requirements (e.g. `us_bank_account` not needed; `card_payments` suffices); `registerPaymentDomains` (`connect.ts:464-567`) registers `www.hatchgrab.com` (or `NEXT_PUBLIC_SITE_URL` host) — per-country landing domains would need adding | S |
| B-03 | `lib/payments/authorize.ts:119` `currency: (args.currency ?? 'GBP').toLowerCase()`; `lib/payments/ledger.ts:579` `currency: event.currency ?? 'GBP'`; `lib/payments/order-drafts.ts:213` `currency: draft.currency ?? 'GBP'`; `lib/payments/online.ts:112,168` pass `args.currency` (optional); `lib/payments/refund.ts:253` `currency: refund.currency` (from Stripe); `app/api/webhooks/stripe/route.ts:540,778` take `pi.currency` | Three fallbacks to GBP; nothing reads `trucks.currency`; **`orders` has no currency column** (grep of migrations = 0); `orders.total_minor` is integer minor units (`20260728_orders_total_minor_deal_savings.sql`), `amount_paid` numeric(8,2) | 3 defaults + 2 pass-throughs | No | One `currencyForTruck()` feeding authorize/draft/ledger; `orders.currency` snapshot; `livemode`/`account_is_test` logic unchanged | S + L |
| B-04 | `app/trucks/[slug]/order/page.tsx:1837` `elements.create('payment', { wallets: { applePay: 'auto', googlePay: 'auto' } })`; `payment_method_types: ['card']` in authorize; `loadStripeJs` `:139`; `app/api/payments/return/route.ts` | Card-only; sheet copy has no currency text (amounts shown via page `£` literals); Apple/Google Pay need domain registration per host | 1 mount | Yes | USD amounts via Stripe are automatic once `currency` is right; copy/`£` literals on the page (27) need the formatter | S |
| B-05 | `application_fee_amount` | **Never sent** — `lib/payments/capture.ts:47,261`, `authorize.ts:23-26,142` (no `on_behalf_of`, no `transfer_data`); `refund.ts:167-177` notes `refund_application_fee` must land in the same commit that introduces a fee | — | — | Platform fee / service fee / card-fee surcharge would all be new | S |
| B-06 | ORDER TOTAL MAP | see §4.2 | — | `calculateOrderTotal` (`lib/order-calculations.ts:76`) is the single arithmetic owner; `repriceOrder`/`toMinor` wrap it server-side | Tax line, service fee, tip, card-fee surcharge each need a slot in `OrderCalculation` **and** a stored column | S |
| B-07 | fee / surcharge / tip / gratuity / booking fee | **None customer-facing.** "surcharge" appears only as menu modifier price adjustments and `CARD_FEES.tapToPaySurchargePence` (marketing copy) | — | — | All new | S |
| B-08 | online vs walk-up discriminator | `order_drafts.order_type` `'collection' \| 'table'` (not channel); `orders` inserted by submit with `order_type: 'collection'`, `payment_status: 'unpaid'`; **Add Order** is `action === 'manual'` in `app/api/dashboard/action/route.ts:1254`; ledger `order_payments.channel` ∈ `'online' \| 'in_person_stripe' \| 'in_person_other'` (`lib/payments/ledger.ts:59`) and PaymentIntent metadata `source: 'hatchgrab_online_order'`; `source: 'web' \| 'native' \| 'offline_replay' \| 'system'` on ledger rows | No single `orders.channel` column — origin is inferred from ledger rows / which route inserted | No | An explicit `orders.channel` (`online`/`walk_up`/`pay_at_hatch`) so "service fee on online orders only" has a column to key on | S |

### C. Tax

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| C-01 | VAT / sales tax code | **Zero** matches in `app`, `lib`, `components`, `emails`, migrations (only `fcm.ts`/`apns.ts` false positives) | 0 | — | Tax engine, rate table by jurisdiction, `tax_minor` on drafts/orders/ledger, receipt/email/ticket rows | S |
| C-02 | `content/legal/terms-and-conditions.md:64` "Prices are in pounds sterling and exclude VAT unless stated."; `:48` "You are responsible … for VAT" | Plan prices ex-VAT, GBP; operator handles own VAT | 2 prose sites | Yes (one markdown) | Per-country terms; US plan price + sales tax where applicable | S |
| C-03 | Pricing pages | **No** "+VAT"/"inc VAT" wording anywhere in landing/features/compare/manage | 0 | — | Decide and state per country | S |
| C-04 | `lib/order-calculations.ts` `OrderCalculation` | fields: itemsTotal, dealsTotal, dealSavings, subtotal, discountAmt, total — no tax slot | 1 | Yes | Add `taxMinor` (and surfaces in §4.2) | S |

### D. Locale & formats

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| D-01 | `'en-GB'` literal | 70 sites / 40 files (manage 10, time-utils 3, schedule-extract 3, event-display 3, …; §7.4) | 70 | No | `localeForTruck()` | S |
| D-02 | `toLocaleDateString/TimeString/String(` | 54 sites; 1 with no locale arg (`app/dashboard/[token]/page.tsx:4835` `toLocaleTimeString()` → device locale) | 54 | No | Pass locale + `timeZone` | S |
| D-03 | manual `dd/mm/yyyy` builders | `app/manage/[token]/page.tsx:14931`, `:15151` (Reports/CSV) | 2 | No | Locale-aware | S |
| D-04 | 24-hour time | `lib/time-utils.ts` `formatTime = time.slice(0,5)` ("HH:MM"), `formatTimeRange` "HH:MM – HH:MM"; slots/events stored as `HH:MM:SS` | 1 helper, many callers | Yes | 12-hour display for US (storage can stay) | S |
| D-05 | `lib/weekly-post/locale.ts` `CountryCode = 'GB' \| 'US'`, `DEFAULT_COUNTRY = 'GB'`, `countryForTruck()` (`:108`, called `app/api/weekly-post/route.ts:969`); `draw.ts:638,764` `input.country ?? 'GB'` | Social-post date/number locale already GB/US aware — **the only locale table in the codebase** | 1 table, 9 readers | Yes | Promote to app-wide `localeForTruck` | S |
| D-06 | `lib/contact-validation.ts` `isValidUKPhone` (0/+44/44 + 9–11 digits) | UK numbers only | used by `app/trucks/[slug]/order/page.tsx` (customer form, error "valid UK mobile (e.g. 07700 900123)" `:3658`), `app/setup/page.tsx:115`, `app/api/setup/route.ts:75`; placeholders "07700 900123", `+44 7700 900000` (`manage:16010`) | 1 validator, 3 callers + 3 normalisers (`lib/email.ts:343` → `44…`, `lib/whatsapp-hint.ts:42` `0→44`, `lib/admin/truck-details.ts:166-170` `+44→0`) | No | E.164 with country default from `trucks.country`; libphonenumber-style validation | S |
| D-07 | postcode | "postcode" 266 mentions; `lib/utils.ts:27` `api.postcodes.io` lookup (UK-only); `lib/schedule-extract.ts:70-84` AI prompt "UK postcodes follow …", "UK venues"; `app/api/manage/geocode/route.ts:10` `country \|\| 'UK'`; `venues.postcode`, `subscribers.postcode` | UK address model (village/town + postcode, no state/county/ZIP) | widespread | No | ZIP/state fields, US geocoder, prompt variants | S |
| D-08 | `app/layout.tsx:146` `<html lang="en">` | neutral `en` (fine) | 1 | Yes | Optionally `en-US`/`en-GB` per host | S |
| D-09 | British spelling in UI copy | files containing: colour 76, cancelled 86, centre 45, optimis- 35, licence 11, realis- 9, customis- 8, favourite 7, organis- 5 (many are CSS/comments) | — | — | Copy decision; low priority | S |
| D-10 | "UK/Britain/England" in non-comment copy | 72 lines / 14 files: landing 9 (SEO titles "HatchGrab UK", "software for UK food trucks"), `lib/schedule-extract.ts` 5, `PaymentsTab.tsx` 4, features 3 (titles), plan-features 2, manage 2, menu-extract 1, DeleteAccountSection 1 ("as UK law requires"), FeatureComparison 1, order page 1, setup API 1, process-allergens 1, geocode 1 | 72 | No | Per-country copy | S |
| D-11 | `content/store-listing.md:81` "Free to try. UK based." | Store copy is UK | 1 | Yes | Per-storefront copy | S |

### E. Time zones

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| E-01 | `'Europe/London'` / `londonNow` | 90 sites / 37 files (§7.5): `lib/time-utils.ts` defaults (`getNowMinsInTz`, `getLocalDateInTz`, `localDateOfInstant`), `lib/slot-utils.ts:15,30`, `lib/slot-availability.ts:135`, `lib/orders/place-in-slot.ts`, `lib/orders/auto-accept.ts`, `app/api/slots/[truckId]`, `app/api/menu/[truckId]:519`, `app/api/orders/submit:690`, `app/api/manage:3105,3266`, `lib/whatsapp/usage.ts:17 DEFAULT_TRUCK_TZ`, `lib/weekly-post/week.ts:23 WEEK_TZ`, outreach ×12 (admin-only, fine to stay London), `provision-demo-event.ts`, `seed-demo-orders.ts` | London unless `trucks.timezone` set | 90 | Partly: `lib/time-utils.ts` is the helper, but each caller supplies its own default | Set `trucks.timezone` at signup; make the helpers' default come from the truck, not a literal | S + L |
| E-02 | `supabase/functions/auto-event-scheduler/index.ts:13 londonNow()`; `heartbeat-monitor/index.ts:12` `timeZone: 'Europe/London'` | Edge functions compute "today"/"now" in London for **all** trucks (auto-open/close, heartbeat auto-pause) | 2 | No | Per-truck tz in the query loop | S |
| E-03 | `vercel.json` crons (UTC): `demo-cleanup 0 * * * *`, `account-deletion-due 0 9`, `cancel-stale-authorizations */10`, `capture-stranded-authorizations */15`, `auto-reject-offline-orders */5`, `custom-domain-check 0 7`, `whatsapp-maintenance 0 3`, `outreach-replies */10`; GitHub: `daily_scrape 0 6`, `discovery_prune 30 3`, `hatchgrab_scrape` hourly | Wall-clock crons run at UTC; interval crons are tz-free | 11 | — | Only `account-deletion-due`/`whatsapp-maintenance` are date-sensitive; make their "today" per-truck | S |
| E-04 | `getHours()` 21 sites; `toISOString().slice(0,10)` 50 sites (UTC "today" floors) | UTC date = local date (false in US evenings) | 71 | No | Audit each; use `localDateOfInstant(tz)` | S |
| E-05 | `lib/weekly-post/week.ts` Monday–Sunday in `WEEK_TZ='Europe/London'` | Week boundary London; Monday-first (US convention is Sunday-first) | 1 | Yes | tz + week-start per country | S |
| E-06 | `lib/whatsapp/usage.ts` `monthStartIso(tz)` / `monthResetLocalDate(tz)` with `truckTimezone(truck.timezone)` — comment "`trucks.timezone` IS NULL ON EVERY TRUCK TODAY" | Correctly tz-aware already | 1 | Yes | Populate `trucks.timezone` | S |
| E-07 | `app/api/cron/demo-cleanup` — `expires_at` comparisons in UTC instants | tz-free (fine) | 1 | Yes | None | S |
| E-08 | `app/manage/[token]/page.tsx:14973` Reports "today" = `getLocalDateInTz(truck.timezone ?? 'Europe/London')`; dashboard `toLocaleTimeString()` `:4835` | Reports already truck-tz aware | 1 | Yes | Populate tz | S |
| E-09 | pg_cron | referenced only in `20260723_demo_sessions.sql` (no `cron.schedule(` calls found in migrations) | 0 | — | None | S |

### F. Allergens

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| F-01 | `components/manage/primitives.tsx` `ALLERGEN_VOCAB` (14: Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs) + `DIETARY_VOCAB`; comment "14 UK statutory allergens (FSA list)" | UK/EU regulated set | 1 const; consumers: `lib/go-live-checks.ts` (`allergens_unanswered`, `allergens_card_missing`, `allergens_items_unverified`), `lib/printing/ticket.ts`, `app/manage/[token]/page.tsx` (editor, variant copy), `AllergenWizardModal`/import wizard | Yes for UI; **No** for AI: list duplicated verbatim in `lib/menu-extract.ts:128` and `app/api/manage/process-allergens/route.ts:49` ("the 14 UK statutory allergens — use these EXACT names") | Country-keyed vocabulary (US FALCPA/FASTER "big nine": milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, sesame) and prompts that reference it; stored `menu_items.allergens[]` strings would need mapping | S |
| F-02 | "Natasha's Law" / FSA | No source mentions Natasha's Law; "FSA" only in the vocab comment | 0 | — | US has no PPDS equivalent; go-live gating wording per country | S |

### G. Legal / consent

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| G-01 | `content/legal/terms-and-conditions.md:7` HatchGrab Ltd, company 17381557, England & Wales, CB8 8PD; `:64` GBP ex-VAT; `:66` monthly in advance non-refundable; `:69` 30-day price-change notice | UK entity and law throughout (rendered by `app/(legal)/terms/page.tsx` via `renderLegalMarkdown`) | 1 doc | Yes | US terms/governing law decision | S |
| G-02 | `content/legal/privacy-policy.md:18-21` registered in England & Wales; `:125` "six years … as UK tax law requires"; `:135` "Under UK data protection law" | UK GDPR framing | 1 doc | Yes | US state privacy (CCPA/CPRA etc.) addendum | S |
| G-03 | `components/manage/DeleteAccountSection.tsx:280` "kept for six years, as UK law requires" | UK retention in UI copy | 1 | Yes | Per-country wording | S |
| G-04 | Cookie banner | **None found** (no cookie-consent component; "cookie" hits are session/auth code) | 0 | — | Depends on US state law; likely none needed | S |
| G-05 | `app/signup/page.tsx:13` marketing checkbox "GDPR/PECR … pre-ticked box is not consent" | UK consent model | 1 | Yes | Fine for US (opt-in is stricter) | S |
| G-06 | Email footers | `lib/email-config.ts` sender `HatchGrab <hello@villagefoodie.co.uk>` (TODO to move to hello@hatchgrab.com); `lib/email-signup.ts:25` reply-to `hello@hatchgrab.com`; **no physical address or unsubscribe footer** in transactional templates (`lib/email.ts`) | Transactional only | — | — | CAN-SPAM requires a physical address + opt-out on commercial email (marketing/outreach) | S |
| G-07 | SMS consent | No SMS sending exists (`lib/twilio.ts` is WhatsApp-only; "SMS order alerts" is `coming_soon` in `PLAN_FEATURES:447`); customer page has an `sms:` link only (`TruckClient.tsx:255`) | 0 | — | TCPA consent capture before any US SMS | S |
| G-08 | `content/store-listing.md` | "UK based" (`:81`) | 1 | Yes | Per-storefront | S |

### H. Messaging

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| H-01 | `lib/twilio.ts` `sendWhatsApp` from `TWILIO_WHATSAPP_NUMBER` (presence **not checked — Dominic to confirm**) | One WhatsApp sender for all countries | 1 | Yes | US WhatsApp Business number / Meta app review | S |
| H-02 | `app/api/webhooks/meta/whatsapp/route.ts:461` `digits.startsWith('44') ? '0'+… : null`; `lib/whatsapp-hint.ts:42`; `lib/whatsapp/connection-view.ts` | Customer/operator WhatsApp numbers are UK | 3 | No | E.164 throughout | S |
| H-03 | Email transport | `lib/email.ts` / `lib/email-signup.ts` POST to Brevo (`api.brevo.com`) — sender in G-06 | 2 | Yes | None technically; sender identity per region optional | S |
| H-04 | Push copy (`lib/fcm.ts`, `lib/apns.ts`, `lib/native/push.ts`) | No `£`/currency in push bodies | 0 | — | None | S |

### I. Native apps & printing

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| I-01 | `capacitor.config.ts` `appId com.hatchgrab.app`, `server.url https://www.hatchgrab.com/app`, `allowNavigation` host | One production host baked into the shell | 1 | Yes | A US landing domain must be in `allowNavigation` or the shell must stay on hatchgrab.com | S |
| I-02 | `ios/App/App/Info.plist` `CFBundleDevelopmentRegion = en`; `AndroidManifest.xml` `configChanges` includes `locale`; no `CFBundleLocalizations` | Neutral | 2 | — | None | S |
| I-03 | iOS commerce gates (`lib/commerce-policy.ts`, `lib/native/orderGate.ts`, manage `:10259` "DELIBERATELY NOT PLAN-GATED … OUTSIDE the `!isNativeApp()` wrapper") | Billing/upgrade hidden in native per Apple rules; no country logic | — | Yes | Unchanged | S |
| I-04 | `lib/printing/ticket.ts:406-427` `encode`: ASCII direct, **`£ → 0xA3` (Latin-1)**, other non-ASCII → `?`; totals `` `£${order.total.toFixed(2)}` `` (`:312,:323,:335,:346,:362`), `money` closure `:368` | Printer code page assumed to render 0xA3 as `£`; `$` is plain ASCII so **US is easier**, but the symbol is hardcoded | 1 encoder, 6 `£` sites | Yes (encoder) | Currency symbol from the formatter; drop the £-special-case or generalise | S |
| I-05 | `components/printing/TicketPreview.tsx`, `app/dev/ticket-preview` | `£` | 3 | — | formatter | S |

### J. Infra & domains

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| J-01 | `vercel.json` | **no `regions`** (functions default region; Supabase region unknown — Dominic to confirm) | — | — | Latency only; consider US edge/DB read replica later | S |
| J-02 | `lib/brand.ts` `www.villagefoodie.co.uk` / `www.hatchgrab.com`; `proxy.ts:117` villagefoodie.co.uk → hatchgrab.com redirect; `lib/custom-host.ts` examples `events.theirtruck.co.uk` | `.co.uk` legacy brand + custom hosts | 3 | Yes | Per-country landing hosts routed in `proxy.ts` | S |
| J-03 | Custom-domain DNS copy | `lib/custom-domain/copy.ts` (2 en-GB); no registrar-specific list found | — | — | None | S |
| J-04 | Geocoding | `lib/utils.ts:27` postcodes.io; `app/api/manage/geocode/route.ts` Gemini with `country \|\| 'UK'`; `components/MapView.tsx` centres on user location (no fixed UK centre), zoom by radius | 2 | No | US geocoder path; prompt country from `trucks.country` | S |
| J-05 | UK counties | `app/hire/page.tsx:6` "rural Suffolk" only | 1 | — | Copy | S |

### K. Discovery & marketing (summary)

| ID | Anchor | Note | Src |
|---|---|---|---|
| K-01 | `app/landing/page.tsx` titles/descriptions "HatchGrab UK", "UK food trucks and mobile catering" (`:76,:90,:119,:122,:128,:131,:236`); `app/features/page.tsx:50,:71,:80` | SEO metadata is UK-specific; per-country landing pages need their own metadata | S |
| K-02 | "Hatches Up" | 59 mentions / 10 files: `CostComparison.tsx`, outreach templates route, `lib/outreach.ts`, `lib/outreach-step.ts`, admin panels, `EventListCard.tsx`; seeded template `20260909_outreach_templates.sql:89` "Hatches Up at 4.5% + 20p … £[[X]] a year" | UK competitor; US comparison set differs | S |
| K-03 | Support | `app/contact/HatchGrabContact.tsx:109` hello@hatchgrab.com; no stated hours/time zone | S |
| K-04 | Discovery scrapers (`scripts/*scrape*`, `.github` crons) | UK venue sources; `discovery_events`/`venues` keyed by village + postcode | S |

### L. Signup / admin / onboarding

| ID | Anchor | Assumes | Sites | One owner? | US truck needs | Src |
|---|---|---|---|---|---|---|
| L-01 | `app/signup/page.tsx` fields: email, password, marketing, promo code; placeholder `you@yourtruck.co.uk` | No country/currency/timezone asked | 1 | — | Country question (or host-derived) | S |
| L-02 | `app/setup/page.tsx` + `app/api/setup/route.ts` | UK phone validation; no country/tz fields | 2 | — | Country-aware phone + tz | S |
| L-03 | `lib/provision-truck.ts` (`provisionTruck`) inserts `plan: 'trial' \| 'demo'`; **no country/currency/timezone** → DB defaults GB/GBP/NULL | Every new truck is GB | 1 | Yes | Write all three at provisioning | S + L |
| L-04 | `app/admin/page.tsx` truck editor | No country/currency/timezone field (only `lifetime_discount_pct/note`) | 1 | — | Admin fields | S |
| L-05 | `lib/provision-demo.ts` / `lib/provision-demo-event.ts` | Demo events built in Europe/London; demo truck plan `'demo'` | 2 | — | Demo per country | S |

### M. Anything else

| ID | Anchor | Note | Src |
|---|---|---|---|
| M-01 | `lib/weekly-post/locale.ts` header comment + `docs/reference-manual.md` V14.6 (≈line 545) "trucks has no country column yet" | **Wrong** per live schema; manual and comment should be corrected (not done — read-only) | M vs L |
| M-02 | `event_types.price_mode` enum values `add_gbp` / `sub_gbp` (`components/shared/PriceControls.tsx:229-231`) | Currency name baked into stored data | S |
| M-03 | `lib/whatsapp-classifier.ts` (6 `£`, en-GB ×2) | AI classifier prompt assumes GBP/UK dates | S |
| M-04 | `lib/payments/ledger.ts:165` test-mode detection `account_is_test && !livemode && channel==='online'` | Currency-agnostic (fine) | S |

### N. Outreach & emails — country and correct pricing (Dominic's mid-audit addition)

| ID | Anchor | Assumes | Sites | One owner? | US prospect needs | Src |
|---|---|---|---|---|---|---|
| N-01 | `discovery_trucks` columns (`20260522_discovery_schema.sql:35`): name, cuisine, phone, mobile, order_url, accepted_methods, website, … `hatchgrab_truck_id` — **no country/region/town**; `venues`: village, postcode (UK shape); `outreach_prospects` (`20260903_outreach_tracking.sql:38`): discovery_truck_id, stage, platform, whatsapp_number, … — **no country** | Every prospect is UK | 3 tables | — | `country` on `discovery_trucks` (derivable from phone prefix, website TLD, venue postcode/ZIP, scraper source) and surfaced on `outreach_prospects` | S |
| N-02 | `lib/outreach-template-render.ts` `TOKEN_DESCRIPTIONS` tokens: `truck_name, contact_name, first_name, last_name, demo_link, compare_link, website, order_url, next_event_*, signature, opt_out, lead_hu_ordering, lead_hu_map, lead_on_vf, lead_not_listed` — **no price/plan/fee token**; prices in outreach are typed into template bodies stored in `outreach_templates` / `outreach_snippets` (DB rows **not read** — rule) | Pricing text lives in hand-written DB bodies; seeded example `20260909_outreach_templates.sql:89` is GBP + Hatches Up | 1 renderer | Yes (renderer) | Price tokens (`{{pro_price}}`, `{{card_fee_online}}` …) resolved from the per-country table by prospect country; `compare_link` → per-country compare page | S (DB bodies: Dominic to confirm) |
| N-03 | `app/api/admin/outreach/attachments/route.ts:86-100` attaches `generatePlansPdf()` (`lib/plans-pdf.ts`, GBP from `PLAN_META`/`TRANSACTION_ROWS`/`FOOTNOTES`) — "the same document the admin toolbar downloads" | One GBP plans PDF for every prospect | 1 | Yes | `generatePlansPdf(country)` | S |
| N-04 | `lib/outreach-mail-config.ts` Namecheap mailbox `dominic@hatchgrab.com`; `lib/outreach-mail-message.ts` opt-out is a reply sentence, "No List-Unsubscribe" by design | UK-style B2B cold email | 1 | Yes | CAN-SPAM: physical postal address in every commercial message + working opt-out; opt-out-by-reply is acceptable but address is mandatory | S |
| N-05 | Outreach scheduling: `lib/outreach-send-rules.ts`, `outreach-sequence.ts`, `outreach-today.ts`, `outreach-workspace.ts` (×4) use `Europe/London` for send windows/"today" | Send windows computed in London | 12 outreach files | No | Prospect-local send window from prospect country/tz | S |
| N-06 | Transactional emails `lib/email.ts` (`formatConfirmationEmail`, `formatNewOrderEmail`, `sendRefundEmail`, `sendCancellationEmail`, `sendEventCancellationEmail`, `paymentNote`, `cancellationPaymentSentence`, `rejectionPaymentSentence`): 19 `£`, 16 `toFixed(2)`, 4 private `money` closures; totals come from **`params.total` passed by the caller** (submit route passes `serverTotal`; refund/cancellation pass minor units) | GBP everywhere; no currency param | 1 file | No | `currency` param on every formatter + the shared money formatter; a tax/fee/tip line | S |
| N-07 | `lib/email-signup.ts` `sendSignupVerificationEmail`, `sendOperatorWelcomeEmail` | No prices in body (trial copy deferred per comment `:168-173`) | 1 | Yes | Country-aware welcome copy when trial nomination ships | S |
| N-08 | `lib/email.ts:338-343` phone normalisation "`44…`" for WhatsApp links in emails | UK | 1 | — | E.164 | S |
| N-09 | Outreach replies classifier / timeline `en-GB` dates (`outreach-workspace.ts` ×3, `outreach-attention.ts` ×2, `outreach-timeline.ts`, `ComposeWindow.tsx` ×2) | Admin-side display; acceptable to stay en-GB | — | — | None required | S |

---

## 4. The two maps

### 4.1 PRICE SURFACE MAP (A1)

| Surface | File + anchor | Reads constants? | Raw literals? | Masked (`px`)? | Src |
|---|---|---|---|---|---|
| Landing pricing | `app/landing/page.tsx` — `PLAN_META` ×6, `PLAN_PRICES` ×5, `TRANSACTION_ROWS` ×4, `CARD_FEE_ONLINE_LABEL` ×5 | Yes | **Yes** — lede `:567` (£29, £1,500, £49, £2,000, 0.99%); `:828` "standard UK cards" | No | S |
| Landing feature table | `components/landing/FeatureComparison.tsx` — `PLAN_META` ×2, `TRANSACTION_ROWS` ×3, `CARD_FEE` ×2; footnote `'2'` string `:41` | Yes | "standard UK cards" prose | No | S |
| `/features` | `app/features/page.tsx` — no constants; metadata only ("HatchGrab UK") | — | No prices | — | S |
| `/compare` (cost comparison; `/landing/cost` does not exist) | `app/compare/CostComparison.tsx` — `PLAN_MONTHLY_PENCE` ×5, `CARD_FEE` ×7, `OVERAGE` from `PLATFORM_FEE_OVER_ALLOWANCE` | Yes, all seven figures | 30 `£` in formatting; "Hatches Up at 4.5% + 20p" competitor literal | No | S |
| Plans PDF (`/landing/features-pdf` + outreach attachment) | `lib/plans-pdf.ts` — `PLAN_META` ×3, `TRANSACTION_ROWS` ×2, `FOOTNOTES`, `PLAN_ALLOWANCES` | Yes | No | Yes (`px` ×3) | S |
| Manage → Billing | `app/manage/[token]/page.tsx:14705-14876` — `PLAN_META` ×4, `PLAN_PRICES` ×4, `TRANSACTION_ROWS` ×2 | Yes | **Yes** — `px('£29/mo')`, `px('£49/mo')`, `'£49/month'` ≈9 | Yes (`px` ×12) | S |
| Manage → Payments | `components/manage/PaymentsTab.tsx:35` imports `CARD_FEE_ONLINE_LABEL`, `CARD_FEE_IN_PERSON_LABEL`, `TAP_TO_PAY_SURCHARGE_LABEL`; 4 "UK" lines | Yes | UK wording | — | S |
| Admin | `app/admin/page.tsx` — `PLAN_META` ×6, `PLAN_PRICES` ×2, `TRANSACTION_ROWS` ×5 | Yes | **Yes** — `:1017` `'0.99% + card fee'`, `:1501` "0.99% transaction fee" | `px` ×1 | S |
| Signup / setup wizards | `app/signup/page.tsx`, `app/setup/page.tsx` | No prices shown | — | — | S |
| Demo creation | `lib/provision-demo.ts` | No prices | — | — | S |
| Outreach token/snippet CODE | `lib/outreach-template-render.ts` | **No price tokens**; prices only in DB-stored bodies (not read) | seeded migration body has "4.5% + 20p", "£[[X]]" | — | S |
| Emails | `lib/email.ts`, `lib/email-signup.ts` | No plan prices; order amounts in `£` | 19 `£` | — | S |
| Native views | `components/native/*`, `app/app` | No plan/price rendering (billing hidden in native) | 0 | — | S |
| Policy copy | `components/PricingPolicy.tsx:41` doc-comment example `px('£29/mo')` | comment only | — | — | S |

**Owner summary:** monthly price → `PLAN_MONTHLY_PENCE` (1 const, but **3 pages re-type it**: landing lede, manage Billing, admin); allowance → `PLAN_ONLINE_ALLOWANCE` (1 const, re-typed in landing lede); platform % → `PLATFORM_FEE_OVER_ALLOWANCE` (1 const, re-typed in landing lede + admin ×2); card fees → `CARD_FEES` (1 const, **never re-typed** — the model to copy).

### 4.2 ORDER TOTAL MAP (B6)

`calculateOrderTotal(items, deals, menuItems, discountCode)` → `{ itemsTotal, dealsTotal, dealSavings, subtotal, discountAmt, total }` in pounds (float). Server wraps it in `repriceOrder` and `toMinor` → `orders.total_minor` (integer pence, authoritative), `orders.total` numeric, `orders.amount_paid` numeric(8,2). Ledger `order_payments.amount_minor` is integer; balance = `total_minor − paid`.

| Surface | File + anchor | Recomputed or stored? | Currency handling | Src |
|---|---|---|---|---|
| Basket (customer) | `app/trucks/[slug]/order/page.tsx` — calls `calculateOrderTotal` client-side; 27 `£`, 23 `toFixed(2)` | **Recomputed** (preview); server is authoritative | `£` literal | S |
| Payment sheet | same page `:1837` Payment Element; amount from PaymentIntent created by `lib/payments/authorize.ts` (`amount` = draft `total_minor`, `currency ?? 'GBP'`) | **Stored** (draft) | `'GBP'` default | S |
| Submit (server) | `app/api/orders/submit/route.ts:670` `serverTotalMinor = toMinor(repriced.calculation.total)`; inserts `subtotal/total` `:957-1010`; `place_order_atomic` RPC derives `total_minor = round(total*100)` (`20260728_…sql`) | **Recomputed server-side, then stored** | none (no `orders.currency`) | S |
| Draft → order | `lib/payments/order-drafts.ts` (`subtotal, discount_amt, total, total_minor, currency`), `lib/payments/promote-draft.ts:369` | **Stored** copy of draft | `draft.currency ?? 'GBP'` | S |
| Confirmation page / customer manage page | `app/order/[id]/manage/page.tsx:229,:235` `£{(unit_price*qty).toFixed(2)}`, `£{order.total.toFixed(2)}` | **Stored** `order.total`; line totals **recomputed** (`unit_price × quantity`) | `£` literal | S |
| Customer emails | `lib/email.ts` `formatConfirmationEmail` (`params.total` `:400,:451`), line rows `:174` recomputed `unit_price × quantity`, `renderOrderLinesHtml`; `sendRefundEmail` / cancellation / rejection sentences use minor units via `money` closures `:54,:89,:661,:746` | **Stored** total passed in; lines **recomputed** | `£` literal ×19 | S |
| Operator new-order email | `lib/email.ts` `formatNewOrderEmail` `:528,:536` `total.toFixed(2)` | **Stored** (param) | `£` | S |
| Dashboard order card | `components/dashboard/OrderCard.tsx:74` line `price × quantity`; `:373` `money(minor)`; balance derived once (`:310` "one derivation, one place") from `total_minor`/ledger | lines **recomputed**, total/balance **stored** | `£` ×20 | S |
| Dashboard page | `app/dashboard/[token]/page.tsx:4803` `£{Number(o.total)}`; edit modal `:6502-6506` `editTotal` via `calculateOrderTotal` (`:81` import); cancel/reject `:6318,:6406`; `money` `:2555,:6333` | mixed | `£` ×24 | S |
| Add Order (operator) | `components/dashboard/AddOrderPanel.tsx:545` `calculateOrderTotal` → `manualTotal`; server `app/api/dashboard/action/route.ts:1254 action==='manual'` → `:1504 toMinor(priced.calculation.total)` | **Recomputed client + server** | `£` ×25 | S |
| Edit order | `app/api/dashboard/action/route.ts:802` `newTotalMinor = toMinor(...)`, `:909` stores `total_minor`; `recalcOrderPayment` only writer of `payment_status`/`amount_paid` (`:34`) | **Recomputed server, stored** | none | S |
| KDS | `app/dashboard/[token]/kds/page.tsx:2910` `£{(bal.balanceMinor/100).toFixed(2)} due`; money-display toggle `:2852` | **Stored** balance | `£` ×4 | S |
| Printed ticket (BLE + wired) | `lib/printing/mapOrderToTicket.ts` → `lib/printing/ticket.ts:312` line `unit_price × quantity`, `:362` `TOTAL £{order.total}`, `:368` `money(minor)` for TO PAY/held | lines **recomputed**, total **stored** | `£` → 0xA3 | S |
| Reports + CSV | `app/manage/[token]/page.tsx` `fmtGBP(o.total)` `:15166`, `:15547`; `revenueBreakdown` sums `:15370-15407` | **Stored** totals, sums **recomputed** | `fmtGBP` | S |
| Refunds | `lib/payments/refund.ts` `amountMinor`, `refund.currency` from Stripe; `components/dashboard/PaymentActionsModal.tsx` (2 `£`) | **Stored** (ledger) | Stripe currency | S |
| Ledger rollup | `lib/payments/ledger.ts` (`balance_minor` SQL view; `currency` column default GBP) | **Stored** | `'GBP'` default | S |
| Offline outbox / replay | `lib/native/outbox.ts` — queues actions; totals not recomputed there (no `total`/`£` hits); replayed through the same action route (`source: 'offline_replay'`) | server **recomputes** on replay | none | S |
| Native apps | same web routes in Capacitor shell; `lib/native/menuSnapshot.ts`/`truckSnapshot.ts` cache menu; dashboard `:3912` "Menu saved on this tablet … Check prices before taking payment" | — | — | S |
| Seeded demo orders | `lib/seed-demo-orders.ts:726` `total_minor: toMinor(total)` | **Recomputed** | — | S |

**Where a tax / service fee / tip / card-fee surcharge would need to land:** `OrderCalculation` (+ `taxMinor`, `feeMinor`, `tipMinor`), `order_drafts` + `orders` columns, `place_order_atomic` RPC, `authorize.ts` amount, every surface row above (14 display sites), `lib/email.ts` rows, `ticket.ts` rows, Reports sums, refund proration, and the ledger `kind` enum.

---

## 5. Facts only Dominic can confirm

1. Whether `NEXT_PUBLIC_PRICING_PUBLISHED` is set in Vercel/`.env` (**not checked** — only observed as missing in this shell's environment).
2. Whether `TWILIO_WHATSAPP_NUMBER`, Brevo sender domains, and Stripe keys are configured per environment (**not checked**).
3. Which migration (or dashboard action) added `trucks.country`, `trucks.currency`, `trucks.timezone` — none exists in `supabase/migrations/`; the repo cannot reproduce the schema from migrations alone.
4. The current bodies of `outreach_templates` / `outreach_snippets` rows (not read): how many contain GBP prices, "Hatches Up", "+20p" etc.
5. Stripe platform account country and whether US connected accounts are enabled on the platform (dashboard setting).
6. Supabase project region (latency for US trucks).
7. Whether any live truck already has `timezone` non-NULL or `country <> 'GB'` (SQL §6 answers this).
8. The intended US plan prices, allowance amounts, platform %, and whether US plan prices are quoted ex-tax.
9. Which Apple/Google developer storefronts the apps are published in.

---

## 6. Read-only SQL (information_schema / SELECT only — not executed)

```sql
-- 6.1 The locale columns as they exist today (confirms Dominic's paste; adds any I did not see)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and column_name in ('country','currency','timezone','hide_pricing','locale','tax_rate','tax_minor','service_fee_minor','tip_minor','channel')
order by table_name, column_name;

-- 6.2 How many trucks deviate from the GB/GBP/NULL defaults
select country, currency, timezone, plan, count(*) as trucks
from trucks
group by country, currency, timezone, plan
order by trucks desc;

-- 6.3 Any non-GBP money already in the ledger or drafts
select 'order_payments' as src, currency, livemode, count(*) from order_payments group by currency, livemode
union all
select 'order_drafts', currency, null, count(*) from order_drafts group by currency;

-- 6.4 Does orders carry any currency/tax column at all?
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and (column_name ilike '%currenc%' or column_name ilike '%tax%' or column_name ilike '%fee%' or column_name ilike '%tip%' or column_name ilike '%channel%');

-- 6.5 Stored event-pricing modes that embed the currency name
select price_mode, count(*) from event_types group by price_mode order by 2 desc;

-- 6.6 Outreach: is there any geography on prospects/discovered trucks today? (schema only — no bodies read)
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('discovery_trucks','outreach_prospects','venues','outreach_contacts')
order by table_name, ordinal_position;

-- 6.7 Allergen strings actually stored (to size a US vocabulary mapping)
select a as allergen, count(*) from menu_items, unnest(allergens) as a group by a order by 2 desc;
```

---

## 7. Appendix

### 7.1 Files containing `£` (count) — 466 total
`app/manage/[token]/page.tsx` 42 · `lib/event-pricing/price.ts` 36 · `app/compare/CostComparison.tsx` 30 · `app/trucks/[slug]/order/page.tsx` 27 · `components/dashboard/AddOrderPanel.tsx` 25 · `app/dashboard/[token]/page.tsx` 24 · `components/dashboard/OrderCard.tsx` 20 · `lib/email.ts` 19 · `lib/printing/ticket.ts` 13 · `app/api/dashboard/action/route.ts` 11 · `lib/copy/serviceSettings.ts` 10 · `components/shared/PriceControls.tsx` 10 · `app/api/event-types/route.ts` 10 · `lib/plan-features.ts` 8 · `components/dashboard/DealsModal.tsx` 8 · `lib/payments/ledger.ts` 7 · `lib/features.ts` 7 · `lib/whatsapp-classifier.ts` 6 · `lib/menu-extract.ts` 6 · `components/manage/ExtrasEditor.tsx` 5 · `app/landing/page.tsx` 5 · `components/manage/EventTypes.tsx` 4 · `components/dashboard/OrderLineItem.tsx` 4 · `app/dashboard/[token]/kds/page.tsx` 4 · `app/api/orders/submit/route.ts` 3 · `lib/plans-pdf.ts` 2 · `lib/order-calculations.ts` 2 · `lib/event-pricing/read.ts` 2 · `components/dashboard/PaymentActionsModal.tsx` 2 · `app/order/[id]/manage/page.tsx` 2 · `app/dev/ticket-preview/page.tsx` 2 · 1 each: `lib/weekly-post/ttf-metrics.ts`, `lib/seed-demo-orders.ts`, `lib/payments/stranded-authorisations.ts`, `lib/payments/refund.ts`, `lib/payments/held-authorisation.ts`, `lib/outreach-mail-poll-rules.ts`, `lib/order-completion-label.ts`, `lib/event-types/resolve.ts`, `lib/event-pricing/lock-in.ts`, `components/printing/TicketPreview.tsx`, `components/PricingPolicy.tsx`, `app/landing/layout.tsx`, `app/features/page.tsx`, `app/compare/page.tsx`, `app/api/menu/[truckId]/route.ts`, `app/admin/page.tsx`.

### 7.2 Currency-code / money-helper sites
`lib/payments/authorize.ts:119` · `lib/payments/ledger.ts:579` · `lib/payments/order-drafts.ts:213` · `lib/payments/online.ts:112,168` · `lib/payments/refund.ts:253` · `app/api/webhooks/stripe/route.ts:540,778` · `app/manage/[token]/page.tsx:14914 fmtGBP` · `lib/order-repricing.ts toMinor/fromMinor` · `lib/event-pricing/price.ts:107 toPence /118 toPounds /480 MAX_PRICE_AMOUNT_GBP` · `lib/features.ts:277 planPriceLabel` · `lib/plan-features.ts allowanceAmountLabel / feeLabel`.

### 7.3 `toFixed(2)` by file (156 total)
order page 23 · dashboard 23 · AddOrderPanel 18 · manage 18 · email 16 · OrderCard 10 · DealsModal 8 · ticket 7 · whatsapp-classifier 4 · OrderLineItem 4 · draw.ts 3 · PriceControls 3 · PaymentActionsModal 3 · submit 3 · ExtrasEditor 2 · order manage 2 · 1 each: plans-pdf, refund, order-calculations, price.ts, serviceSettings, EventTypes, kds, CostComparison, dashboard action.

### 7.4 `'en-GB'` by file (70 total, 40 files)
manage 10 · time-utils 3 · schedule-extract 3 · outreach-workspace 3 · event-display 3 · admin/outreach-shared 3 · whatsapp-classifier 2 · utils 2 · outreach-template-render 2 · outreach-attention 2 · custom-domain/copy 2 · admin/screenshot-log 2 · SchedulePlaces 2 · FontPicker 2 · AddOrderPanel 2 · ComposeWindow 2 · api/events 2 · 1 each: whatsapp/copy, seed-demo-orders, schedule-graphics/places, provision-demo-event, outreach-timeline, outreach-sequence, outreach-mail-message, email, EventCancelModal, SocialPosts, DeleteAccountSection, ScreenshotsPanel, ProspectTimeline, EventRowCells, EmailReadingPanel, TruckListCard, MapView, EventListCard, landing, api/inbound-schedule, api/demo/save-email, admin/whatsapp-connections, admin.

### 7.5 `Europe/London` / `londonNow` by file (90 sites, 37 files)
time-utils 6 · heartbeat-monitor 4 · auto-event-scheduler 4 · outreach-workspace 4 · meta/whatsapp webhook 4 · whatsapp/usage 3 · slot-utils 3 · orders/place-in-slot 3 · weekly-post/week 2 · slot-availability 2 · provision-demo-event 2 · orders/auto-accept 2 · event-display 2 · order page 2 · api/slots 2 · api/menu 2 · api/manage 2 · 1 each: seed-demo-orders, outreach-today, outreach-timeline, outreach-sequence, outreach-send-rules, outreach-mail-message, outreach-mail-format, outreach-mail-config, outreach-attention, admin/screenshot-log, DayLoadStrip, AddOrderPanel, ProspectWorkspace, ProspectTimeline, OutreachPanel, EmailReadingPanel, ComposeWindow, manage, dashboard, submit.

### 7.6 UK phone files (12)
`app/api/setup/route.ts`, `app/api/webhooks/meta/whatsapp/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/manage/[token]/page.tsx`, `app/setup/page.tsx`, `app/trucks/[slug]/order/page.tsx`, `components/DemoGetStarted.tsx`, `lib/admin/truck-details.ts`, `lib/contact-validation.ts`, `lib/email.ts`, `lib/whatsapp-hint.ts`, `lib/whatsapp/connection-view.ts`.

### 7.7 `trucks.country` / `.currency` / `.timezone` readers
country: `app/api/stripe/connect/route.ts:86,123,253`; `lib/weekly-post/draw.ts:638,764`; `lib/weekly-post/caption-template.ts:318,368`; `lib/weekly-post/locale.ts:109,167`; `lib/weekly-post/render.ts:128,233`; `components/manage/SocialPosts.tsx:936`; `components/manage/WeeklyPost.tsx:194`; `components/manage/EventPost.tsx:234`. currency: none. timezone: `app/api/menu/[truckId]/route.ts:519`; `app/api/manage/route.ts:407,3105,3266`; `app/api/orders/submit/route.ts:690`; `app/api/webhooks/meta/whatsapp/route.ts:91,137,187,558`; `lib/whatsapp/usage.ts:20,87`; `app/manage/[token]/page.tsx:14973`. Writers: none in TS (DB defaults).

### 7.8 "UK/Britain/England" non-comment copy files (14)
`app/landing/page.tsx` 9 · `lib/schedule-extract.ts` 5 · `components/manage/PaymentsTab.tsx` 4 · `app/features/page.tsx` 3 · `lib/plan-features.ts` 2 · `app/manage/[token]/page.tsx` 2 · 1 each: `lib/menu-extract.ts`, `lib/admin/screenshot-events.ts`, `components/manage/DeleteAccountSection.tsx`, `components/landing/FeatureComparison.tsx`, `app/trucks/[slug]/order/page.tsx`, `app/api/setup/route.ts`, `app/api/manage/process-allergens/route.ts`, `app/api/manage/geocode/route.ts`.

### 7.9 Crons
`vercel.json`: demo-cleanup `0 * * * *` · account-deletion-due `0 9 * * *` · cancel-stale-authorizations `*/10` · capture-stranded-authorizations `*/15` · auto-reject-offline-orders `*/5` · custom-domain-check `0 7` · whatsapp-maintenance `0 3` · outreach-replies `*/10`. GitHub: daily_scrape `0 6` · discovery_prune `30 3` · hatchgrab_scrape hourly · process-next-truck disabled. Supabase Edge: auto-event-scheduler, heartbeat-monitor (both London).

### 7.10 Rules kept
Read-only (only this file written) · no SQL executed · no external API called · no `.env*` read (env var observed by name/presence in the shell only) · no outreach_templates row read · no process touched · no git state changed · branch `main` audited as checked out.
