# Pricing plans — read-only diagnosis

19 October 2026. Workstream: pricing-plans. **Read-only.** No code, config or data was changed. No `.env*` file was
opened. Pizzeria Gusto was only read. No `outreach_templates` row was touched. Nothing was deployed.

The live database was read through the Supabase MCP connection; every query is in the "SQL run" section at the end.
The code was read with file:line references. Three read-only search passes did the wide reads, and I re-checked the
facts this report leans on hardest: the footnote "2" mask, the absent `application_fee_amount`, `INCLUDED_VANS`, the
expired-trial branch, the flat platform fee, the admin POST and the mailto.

**Result in brief.**
- **The money side is closer than the plan side.** Prices, allowances and the platform-fee percentage already live in
  `country_settings`. Online card orders are direct charges with manual capture, and every capture goes through one
  function, so a fee has one place to hook in.
- **But nothing charges a platform fee today.** The per-country switch is off in GB, and the engine hard-codes
  `application_fee_minor: null`. There is no monthly-allowance meter, and refunds don't pass `refund_application_fee`.
- **The plan model is the big job.** Starter / Pro / Max and the feature tiers are hardcoded in about 40 places: the
  `Plan` type, `PLAN_FEATURES`, the feature matrix, Billing's branches, FeatureGate and the server refusals, and the
  admin lists. All of them have to move to Pay as you go / Pro / Unlimited with every feature on every plan.
- **The data side is easy.** No truck is on Starter, Pro or Max. All 11 trucks are `trial` (7) or `demo` (4). One truck
  has two vans, and one operator has two trucks (both test).

---

## 1 · `country_settings`: plan, price, allowance, fee and switch columns

| Column | Type | Null | Default | GB | US |
|---|---|---|---|---|---|
| `enabled` | boolean | no | false | **true** | **false** |
| `currency` | text | no | — | GBP | USD |
| `prices_include_tax` | boolean | no | — | true | false |
| `tax_label` | text | no | — | VAT | Sales tax |
| `starter_monthly_minor` | integer | yes | — | 0 | NULL |
| `pro_monthly_minor` | integer | yes | — | 2900 | NULL |
| `max_monthly_minor` | integer | yes | — | 4900 | NULL |
| `pro_allowance_minor` | integer | yes | — | 150000 (£1,500) | NULL |
| `max_allowance_minor` | integer | yes | — | 200000 (£2,000) | NULL |
| `platform_fee_pct` | numeric | yes | — | 0.99 | NULL |
| `platform_fee_enabled` | boolean | no | false | **false** | **false** |
| `fees_taxed` | boolean | no | false | false | false |
| `card_fee_online_pct` / `_fixed_minor` | numeric / integer | no | — | 1.50 / 20 | 2.90 / 30 |
| `card_fee_in_person_pct` / `_fixed_minor` | numeric / integer | no | — | 1.40 / 10 | 2.70 / 5 |
| `tap_to_pay_fixed_minor` | integer | no | — | 10 | 10 |
| `card_surcharge_allowed` | boolean | no | false | false | true |
| `card_surcharge_cap_pct` | numeric | yes | — | NULL | 3.00 |
| `card_surcharge_credit_only` | boolean | no | true | false | true |
| `card_surcharge_excluded_regions` | text[] | no | `{}` | `{}` | `{CT,MA,PR}` |
| `service_fee_allowed` | boolean | no | false | false | true |
| `service_fee_recipient` | text | no | 'truck' | truck | truck |
| `service_fee_hatchgrab_bps` / `_fixed_minor` | integer | yes | — | NULL | NULL |
| `service_fee_truck_max_bps` / `_fixed_minor` | integer | yes | — | NULL | **400 / 50 (4% + 50¢)** |
| `tipping_enabled_default` / `tip_presets_pct` | boolean / numeric[] | no | false / `{}` | false / `{}` | true / `{10,15,20}` |

Also in the table: identity and format columns, `competitor_*` and `distance_unit` (retired; kept, not dropped), and
`support_hours`.

**The constraint that stops the US being switched on:** `country_settings_enabled_needs_prices_chk`:

```
CHECK ((NOT enabled) OR ((starter_monthly_minor IS NOT NULL) AND (pro_monthly_minor IS NOT NULL)
  AND (max_monthly_minor IS NOT NULL) AND (pro_allowance_minor IS NOT NULL)
  AND (max_allowance_minor IS NOT NULL) AND (platform_fee_pct IS NOT NULL)))
```

It names the Starter / Pro / Max columns, so it has to be rewritten for the new plans. The admin form adds the same rule
(`lib/admin/country-form.ts:79, 106, 391`; `components/admin/CountriesTab.tsx:268-275`). Other checks: price columns
must be ≥ 0, `platform_fee_pct` between 0 and 100, service-fee bps between 0 and 10000, and the recipient must be
`truck` or `hatchgrab`.

**Against the target design:**
- GB's Pro allowance is **£1,500** today; the target is 2,500.
- The 0.99% maps onto Pro's overage fee.
- Max (£49) has no target equivalent; Unlimited is 69.
- There is no column for the Pay-as-you-go 1.5%.
- There is no per-truck promotional price column.

---

## 2 · The plan model in code

| Item | Where | Reads `country_settings`? |
|---|---|---|
| `Plan` = `'starter' \| 'pro' \| 'max' \| 'trial' \| 'tester' \| 'demo'` | `lib/features.ts:9` | Hardcoded |
| `Feature` union (23 keys) | `lib/features.ts:11-41` (the section comments are stale) | Hardcoded |
| `PRO_FEATURES` (21), `MAX_FEATURES` (+5), `TRIAL_FEATURES` (= Max) | `lib/features.ts:62-166` | Hardcoded |
| `PLAN_FEATURES` | `lib/features.ts:169-191` | Hardcoded. Starter = 10 core features including Pay at Hatch. Pro = 21 (**not** Pay at Hatch). Max = Pro + ticket_printing, multi_device_kds, cook_screen, embed_schedule, event_types. trial and demo = Max; tester = Max |
| `hasFeature(plan, f)` | `lib/features.ts:194-201` | Hardcoded. **Ignores overrides and trial expiry** |
| `canAccess(plan, f, overrides, trialExpiresAt)` | `lib/features.ts:219-251` | Hardcoded. Override wins. Trial with NULL expiry = full trial. **Expired trial → every feature denied (:246)**, including core ones; the "fall back to Starter?" question is still open (comment :240-243) |
| `PLAN_META` | `lib/features.ts:283-297` | Names hardcoded ("Starter", "Pro", "Max", …); descriptions from `planMeta.description.*` (`messages/en-GB.json:5736`). No price |
| `planMonthlyMinor`, `planPriceParts`, `planPrice` | `lib/features.ts:273-325` | **Yes**, via `requirePlanPrice`, which throws on NULL |
| `maxVans(plan)` | `lib/features.ts:328-332` | Hardcoded (1 / 2 / 999). **No caller** |
| `requiredPlan(feature)` | `lib/features.ts:335-339` | Hardcoded. Used only by `components/FeatureGate.tsx:46` |
| `PLAN_ONLINE_ALLOWANCE`, `PLATFORM_FEE_OVER_ALLOWANCE`, `PLAN_MONTHLY_PENCE`, `VAN_ADDON_PRICE` | **Gone since 10 Oct.** Old values: £0 / 29 / 49; allowance 1,500 / 2,000; 0.99%; van add-on 0 / 29 / 49 | Replaced by the functions below |
| `planOnlineAllowance(s)` | `lib/plan-features.ts:135-142` | **Yes** for Pro and Max. The kinds are hardcoded: trial `unlimited`, starter `none` |
| `platformFeeOverAllowance`, `platformFeeLabel`, `allowanceAmountLabel`, `allowanceMinorFor`, `planAllowances` | `lib/plan-features.ts:146-180` | **Yes** |
| `vanAddonMonthlyMinor(plan, s)` (replaces `VAN_ADDON_PRICE`) | `lib/plan-features.ts:184-186` | **Yes**: the plan's own monthly price for Pro and Max, else 0 |
| `transactionRows(s)` | `lib/plan-features.ts:233-246` | Amounts from settings; row shape and words (0% walk-up, Free, Pay at Hatch, Unlimited) hardcoded |
| `FEATURE_SECTIONS` / `SECTION_DATA` | `lib/plan-features.ts:249-668` | Hardcoded. **33 rows** in sections starter (9) / pro (16) / max (8), each with a starter/pro/max cell. 6 rows are "coming soon" |
| Footnotes (`footnotes(s)`; no `PLAN_FOOTNOTES` constant) | `lib/plan-features.ts:673-792`; text at `messages/en-GB.json:5709-5716` | Fees from settings. **Footnote "2"** is the platform-fee and Stripe footnote |
| `ROW_FEATURE_MAP` | `lib/plan-features.ts:805-875` | Hardcoded; 6 rows unmapped |
| `findPlanParityViolations()` | `lib/plan-features.ts:879-929` | Hardcoded. Checks every mapped matrix cell against `canAccess` for starter / pro / max. **Runs at module load and throws outside production** (:934-943) |
| `PLAN_ORDER` = `['starter','trial','tester','demo','pro','max']` | `app/admin/page.tsx:190` (and `FEE_COLUMN_FOR` :203, `PLAN_BADGE` :220, `OVERRIDEABLE_FEATURES` :212) | Hardcoded |
| `INCLUDED_VANS` = `{ starter:1, pro:2, max:999, trial:999 }` | `app/manage/[token]/page.tsx:11799` | Hardcoded; duplicates `maxVans`; not enforced on the server |
| `TABLE_PLANS` = `['trial','starter','pro','max']` | `lib/landing-table.ts:36` | Hardcoded |
| Price helpers | `lib/country-settings-types.ts:92-135`: `requirePlanPrice` (:101), `planPricesDecided` (:120), `withPlaceholderPlanPrices` (:130) | — |

**Other places that branch on a plan name:**
- `lib/useFeatures.ts:10, 25-32`
- `lib/provision-truck.ts:178, 217, 333, 392, 483, 499` (new trucks are `trial`, expiry NULL)
- `lib/plans-pdf.ts:169`
- `components/manage/PaymentsTab.tsx:432`
- Manage page: :1059, :1072-1085, :1233, :11809, :14363, :14599-14611, :14743, :14826, :14953, :14998-15007
- Admin: :831, :1042, :1096-1101
- Client `hasFeature` gates (overrides and expiry ignored): `app/trucks/[slug]/order/page.tsx:2553`;
  `app/dashboard/[token]/page.tsx:2013, 4075`
- Server `canAccess` gates:
  - `app/api/manage/route.ts`: 1034, 1087, 1124, 1183, 1267, 1422, 1471, 1668, 3383
  - `app/api/event-types/route.ts`: 112, 129
  - `app/api/menu/[truckId]/route.ts`: 539
  - `app/api/weekly-post/route.ts`: ~231
  - WhatsApp webhooks (`webhooks/whatsapp/route.ts:60`, `webhooks/meta/whatsapp/route.ts:522`)
  - `app/api/events/action/route.ts:150`
  - `lib/orders/auto-accept.ts:81`
  - `lib/custom-domain/redirect-target.ts:55`
  - `app/domain/page.tsx:144-149`
  - `components/dashboard/CustomDomainSetup.tsx:93`
  - `components/printing/PrintingSettings.tsx:155`
  - `app/dashboard/[token]/page.tsx:3590`
  - `app/api/orders/submit/route.ts:733`

**The plan check constraint (live):**
```
CHECK ((plan = ANY (ARRAY['starter','pro','max','trial','demo','tester'])))
```
- The repo's last migration (`supabase/migrations/20260521_plans_and_trial.sql:12-13`) allows only
  starter/pro/max/trial. **`demo` and `tester` were added by hand** and no migration records them.
- The column default is `'starter'`, but app code always writes `trial` or `demo`.

---

## 3 · Every surface that shows or uses plans or prices

| Surface | Where (file:line) | Numbers from | Undecided (NULL) price |
|---|---|---|---|
| **Landing page** pricing: summary, trial banner, 3 cards (Starter :647-687, Pro :691-793, Max :797-839) | `app/landing/page.tsx:629-901` (re-exported by `app/[country]/page.tsx:13`) | Settings via `planMonthlyMinor` / `allowanceMinorFor` / `platformFeeLabel`. Names from `PLAN_META` (hardcoded). Words `landing.pricing.*` (`en-GB.json:5382`) | **Not handled; not masked** (no `PRICING_PUBLISHED`, no `hide_pricing`, `app/landing/layout.tsx:51-53`). Safe only because a country with NULL prices can't be switched on, so the page never resolves to it |
| **/features** matrix: Trial / Starter / Pro / Max columns, fees block, 33 rows, footnotes | `components/landing/FeatureComparison.tsx:84-149`; `lib/landing-table.ts:36-131`; metadata names "Starter, Pro and Max" `app/features/page.tsx:76, 92, 101` | `transactionRows`, `featureSections`, `trialFeatureValue` | Not handled. Footnote 2 is **replaced, not masked** (`featuresPage.footnote2`, `en-GB.json:5750`, drops the platform fee) |
| **/compare** calculator | `app/compare/CostComparison.tsx:87-108` (`pricingFrom`; **names hardcoded `'Pro'` :91, `'Max'` :97**), questions :288-850, maths :357-411, `AOV = 15` :112, UK savings bands :245-255 | Settings | Not handled |
| **Plans PDF** | `app/landing/features-pdf/route.ts:44-54` (admin only); `lib/plans-pdf.ts:66-172` (`'always-real'` prices, unmasked); outreach attachment `app/api/admin/outreach/attachments/route.ts:98-121` (prospect's country) | Settings | **Throws** on NULL. A US prospect gets "could not be generated" |
| **Manage › Billing** (`BillingTab`) | `app/manage/[token]/page.tsx:14538-15067` | Settings; mask via `PricingPolicyProvider` (:1378) | Handled: `pricesDecided` (:14561), placeholder (:14562), forced mask (:14563) |
| ↳ plan-string branches | trial :14826-14950 (Upgrade to Max / Choose Pro buttons :14879-14894); **starter :14953-14995 with `'Pro'`/`'Max'` literals :14977, :14983**; **pro \|\| max :14998-15023 with the name literal at :15004** | — | — |
| ↳ **missing fallback** | No branch for `demo` (renders an empty `<div>`) or `tester` (tab hidden at :1233). Name fallback is `PLAN_META[plan]?.name ?? plan` (:14816, :14832, :14959) | — | — |
| ↳ **footnote "2" price mask** | `:14771` `{pricesVisible \|\| f.number !== '2' ? f.text : t('footnote2Masked')}`. `pricesVisible = pricesPublished && pricesDecided` (:14564); text `manageBilling.footnote2Masked` (`en-GB.json:4723`). **The number is load-bearing**: renumbering silently unmasks (`lib/plan-features.ts:670-672, 786-790`). Admin prints footnote 2 unmasked (`app/admin/page.tsx:1117`) | — | Masked |
| ↳ **upgrade mailto** | `:15051`: `mailto:${SUPPORT_EMAIL}?subject=…&body=…`. `SUPPORT_EMAIL` comes from `NEXT_PUBLIC_SUPPORT_EMAIL`, falling back to `hello@villagefoodie.co.uk` (:14536). Words `manageBilling.upgradeModal.mailSubject/mailBody` (`en-GB.json:4753-4754`). Plan name literal `'Max'/'Pro'`. **Subject and body are not URL-encoded.** Target type is `'pro' \| 'max'` (:14608) | — | Price via `px` (masked) |
| ↳ trial reminder popup | `:1071-1085` trigger, `:1611-1664` render; `manageShell.trialPopup.*` (`en-GB.json:4710`) **promises a fallback to "the free Starter tier" that is not built** | — | — |
| **Van billing modal** | Price `:11785-11798` (`vanAddonMonthlyMinor`, masked `vanPx`); `INCLUDED_VANS` :11799; click logic :11801-11817 (Starter → upgrade modal; tester/demo add vans free); billing modal :14357-14387 (`manageSettings.vanBilling.*`); Starter upgrade modal :14390-14420 | Settings | Handled (forced mask) |
| **FeatureGate** and "upgrade to X" prompts | `components/FeatureGate.tsx:46-79`: `requiredPlan`; **hardcoded English "This feature requires the {plan} plan"** (:53) and "Upgrade →" (:77). Uses: branded QR (manage :13624, :13674), Social posts (`components/manage/SocialPosts.tsx:834-842`), WhatsApp "not on plan" (:14210-14216), event types Max badge (`components/manage/EventTypes.tsx:370-380, 1078, 1104-1107, 1343`), Reports upsell (:15901-15911). Server refusals `errorsManage.preorders_pro`, `private_events_pro`, `event_types_max`, `social_media_plan`, `embed_not_on_plan` (`en-GB.json:2966-3058`) | Settings | FeatureGate checks `planPricesDecided` (:57) |
| **Admin › Countries** | `components/admin/CountriesTab.tsx`: switched on :268-275; Starter/Pro/Max price :280-282; Pro/Max allowance :283-284; platform fee % :285; "Take our fee" :288-299; extra van note :301; Stripe fees :303-312. Saved by `lib/admin/country-actions.ts:36-37` | — | Blocks switching on |
| **Admin › truck edit** | `app/admin/page.tsx`: plan buttons :1435-1449; trial presets / date :773-785, :1451-1478; `hide_pricing` :1493-1503; lifetime discount :1509-1541; GB-only plan matrix :849-1118. **`POST /api/admin` writes the body straight to `trucks`** (`app/api/admin/route.ts:89, 106`); there is no field allowlist and no plan check, only the database constraint | GB settings | Admin matrix is always GB |
| **Signup and setup** | No plans or prices shown; only free-month text (`auth.signup.subtitle`, `demoGetStarted.freeMonth`, `demo.signupOffer`). The truck is created by `app/api/setup/route.ts:132`, then `lib/provision-truck.ts` (plan `trial`, `trial_expires_at` NULL). `app/api/signup/route.ts` creates no truck | — | — |
| **iPad / iPhone / Android apps** | A Capacitor shell over the web pages (`capacitor.config.ts:27-28`); no plan code of their own. `purchaseCtaAllowed()` (`lib/commerce-policy.ts:39-46`) removes every purchase button, link and the mailto **on native iOS only**. Prices themselves still show on iOS (the masking is the global flag plus `hide_pricing`, not the platform) | — | — |
| **Emails** | `lib/email*.ts` hold no plan names or prices. No trial-expiry or billing email exists. Outreach attaches the plans PDF (above). Seed outreach templates mention rates as placeholders (data, not touched) | — | — |
| **Legal terms** | `content/legal/terms-and-conditions.md:62-82` (§4 "Plans, fees and trials", moving to "the free plan") | — | — |

**Message namespaces with plan names or price words** (`messages/en-GB.json`):
- **Pricing and plans:** `planFeatures` (:5556), `planMeta` (:5736), `landing.pricing` (:5382), `featuresPage` (:5746),
  `compare` (:5752), `plansPdf` (:176).
- **Manage:** `manageBilling` (:4719), `manageShell.trialPopup` (:4710), `manageSettings.vanBilling` / `vanUpgrade` / `qr.locked*`,
  `manageReports.upsell`, `manageWhatsApp.card.notOnPlan`, `managePayments.trialNote`.
- **Elsewhere:** `weeklyPost.planRefusal`, `eventTypes.maxPlan*`, `privateEvents.grid.maxOnly`, `errorsManage.*_pro`
  / `*_max` / `*_plan`, `walkthrough.stops.billing`, `demo.signupOffer`, `demoGetStarted.freeMonth`,
  `auth.signup.subtitle`.
- **Masked price:** "TBC" in en-GB (:5729), "TBD" in en-US (`en-US.json:912`).

---

## 4 · Live data

**Trucks by plan:**

| Plan | Trucks | Active | `is_customer` | Trial expiry set | Trial in future | Lifetime discount | `hide_pricing` | Feature overrides |
|---|---|---|---|---|---|---|---|---|
| demo | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| trial | 7 | 7 | 2 | 6 | 5 | 0 | 0 | 2 |

**No truck is on starter, pro, max or tester.**

The 7 trial trucks:

| id | Country | Customer | Trial ends | Note |
|---|---|---|---|---|
| `pizzeria-gusto` | GB | yes | 31 Dec 2026 | **Read only. Plan `trial`, no lifetime discount, no note, `hide_pricing` false, no overrides.** One van |
| `real-thai-food` | GB | yes | **30 Sep 2026 (expired)** | Under `canAccess` an expired trial loses **every** feature. The manual records it as a test truck with a wrong `is_customer` flag |
| `test-truck` | GB | no | 31 Dec 2026 | Overrides: batch_reservations, places_posts_preview (inert key), whatsapp_setup_preview. **2 vans** |
| `test-truck-3-2`, `tikka-tonic` | GB | no | 31 Dec 2026 | — |
| `test-truck-us` | US | no | 31 Dec 2026 | Same overrides as `test-truck` |
| `village-spice` | GB | no | **NULL** (counts as "not started", so the full trial runs indefinitely) | — |

**Vans and businesses:**
- **Vans** are `truck_vans` rows (`truck_id`, name, KDS token, capacity and offline settings) with **no plan or billing
  column**. Billing is per truck today; an extra van costs the plan's own monthly price on Pro and Max.
- **Trucks with more than one van:** 1 (`test-truck`, 2 vans). Every other truck has 1.
- **Businesses:** a business is an `operators` row, which holds the Stripe account (`stripe_account_id`); its trucks link
  through `trucks.operator_id`. 9 operators own trucks; **1 owns 2** (the most). `truck_users` is empty.
- **Online orders have no reliable van:** `orders.van_id` is KDS routing only, and `order_payments` has no van column.
  Per-van billing would need an attribution rule.

**For sizing the Pro allowance** (read only). Gusto's web-placed orders, which today are paid at the truck rather than
by online card, totalled this much food:

| Month (Europe/London) | Web orders, food |
|---|---|
| Jun | £176 (part month) |
| Jul | £3,738 |
| Aug | £3,381 |
| Sep | £944 |
| Oct to date | £1,112 |

As online card sales, July and August would pass a £2,500 allowance.

**Payments ledger:**
- **Online card charges:** 17 rows (£164.50 in all) and 1 refund, **all test mode**. There are no live online card
  payments yet.
- **In-person rows:** 631 recorded (card, cash and unspecified).
- **Application fees:** not one row has an application fee.

---

## 5 · Money path

**Creating the PaymentIntent** (authorize, then capture):
- Submit computes the charges (`app/api/orders/submit/route.ts:800-806`), creates the draft (:1005) and calls
  `authorizeDraft` (:1052).
- `lib/payments/authorize.ts:118-168` runs `stripe.paymentIntents.create({ amount, currency, capture_method: 'manual',
  metadata, payment_method_types: ['card'] }, { stripeAccount: operator.stripe_account_id, idempotencyKey })`.
- It is a **direct charge on the truck's connected account**. No `application_fee_amount`, `on_behalf_of` or
  `transfer_data` is sent, by design: "absence, never zero" (`authorize.ts:23-26, 145`).

**Capture:**
- **One function**, `captureOnConfirmation`, does it with `paymentIntents.capture(pi, isPartial ? { amount_to_capture } : {})`
  (`lib/payments/capture.ts:272-289`).
- It is reached from pay-at-hatch auto-accept (`submit/route.ts:1338`), card auto-accept (`lib/payments/promote-draft.ts:472`),
  manual confirm and time-adjust (`app/api/dashboard/action/route.ts:338, 2285`), and the stranded sweep
  (`lib/payments/stranded-authorisations.ts:165`, a cron every 15 minutes).
- **Partial capture is used:** it captures `min(balance, hold)` (`capture.ts:245-246`). An edit that raises the total
  never raises the capture (:230-234).
- There is **no `paymentIntents.update` anywhere**.

**Can `application_fee_amount` be set?**
- Yes, on create and on capture. The header at `capture.ts:47-49` says it is accepted at capture and "deliberately not
  sent".
- **Capture is the right place.** It is the one point all paths meet, and the only point where the captured amount
  (possibly partial) and the month-to-date total are known.
- The fee must be computed on the captured food portion, not the hold.

**The per-country switch:**
- Read in one place: `lib/order-charge-rules.ts:79` (`platformFee: country.platformFeeEnabled && country.platformFeePct
  !== null ? { bps } : null`).
- **Effect today: none.** The engine writes `application_fee_minor: null` (`lib/order-charges.ts:71, 214`).
  `wouldBeApplicationFeeMinor` (:224-226) already computes `applyBps(foodMinor, bps)` on **food after discount**, which
  excludes tax, tip, the service fee and the surcharge, exactly as the target says. Only the harness calls it.
- **The fee is flat, not plan-aware:** no plan, allowance or monthly volume is consulted.
- The columns exist and are empty: `orders` / `order_drafts` / `order_payments.application_fee_minor`, and
  `order_payments.application_fee_refunded_minor` (migration `20261010_17_order_charges.sql:56, 70, 75-76`).

**Refunds and cancellations:**
- **Refunds:** `refundOrder` (`lib/payments/refund.ts:127`, called only from `app/api/dashboard/action/route.ts:1190`)
  calls `stripe.refunds.create` **without `refund_application_fee`** (:204-219).
  - The code warns that on a direct charge Stripe would then keep the platform fee, so it must be set in the same commit
    that introduces the fee (:191-203).
  - `application_fee_refunded_minor` is never read or written.
- **An uncaptured hold** on customer cancel, operator cancel, reject, an abandoned draft or a superseded basket is
  **cancelled, never captured**:
  - `releaseHoldForTerminalOrder` (`lib/payments/release-hold.ts:57`) → `cancelAuthorization` (`authorize.ts:223-251`).
  - Callers: `app/api/orders/cancel/route.ts:152`, `dashboard/action/route.ts:434`, `lib/orders/reject-order.ts:93`,
    `app/api/cron/cancel-stale-authorizations/route.ts:82`, `submit/route.ts:983`.
  - So no fee is ever taken on those. A refund after capture is the one case that needs a fee refund.

**A truck's or van's monthly online card sales, in the truck's timezone:**
- **Nothing computes it today.**
- **The building blocks:**
  - the `order_payments` ledger, which has `truck_id` "denormalised so per-truck fee/allowance rollups never need to
    join" (`supabase/migrations/20260729_order_payments_ledger.sql:56-83`), `channel 'online'` and `livemode`, and is
    the stated "allowance history" (`lib/payments/online.ts:14-21`);
  - truck-local month boundaries already exist for WhatsApp usage: `monthStartIso(tz, now)` and `readMonthlyUsage`
    (`lib/whatsapp/usage.ts:25, 42, 74`);
  - `truckTimeZone(truck)` (`lib/truck-time.ts:39`).
- **Three gaps:**
  1. **Ledger amounts are totals** (food + tax + tip + fees). The allowance needs **food only**, so either store the food
     portion on the ledger row or join `orders.food_minor`.
  2. **No index** on `order_payments (truck_id, created_at)`.
  3. **No van column**, so per-van totals would need an attribution rule.

---

## 6 · The customer service fee

**Where it is configured:**
- **Country rules:** `country_settings.service_fee_allowed`, `service_fee_recipient`, `service_fee_hatchgrab_*` and
  `service_fee_truck_max_*` (migrations `20261010_02:73`, `20261010_17:100-104`).
- **Truck choice:** `trucks.service_fee_enabled` / `service_fee_bps` / `service_fee_fixed_minor` (`20261010_17:85-87`).
- **Resolver:** `lib/order-charge-rules.ts:53-65` clamps each part to the country's maximum.
- **Engine:** `lib/order-charges.ts:163-168`. The fee applies to online card orders only, on food after discount, and is
  taxed only if `fees_taxed`.
- **Manage UI:** Manage › Payments › "Tax, tips and fees" (`components/manage/ChargesCard.tsx:77, 132-167`, rendered at
  manage page :1591).
- **Server validation of the maximum:** `lib/charge-settings.ts:93-119` (`charges_fee_over_pct` at :107, fixed at :116),
  called by `update_charges` (`app/api/manage/route.ts:1989-2005`).

**Who keeps it:**
- It is recorded as `orders.service_fee_recipient` and is part of the total captured on the **truck's** account.
- **A `'hatchgrab'` recipient is not collected:** no application fee is sent, so 100% lands with the truck, although
  Manage's copy says "HatchGrab adds a {fee} service fee" (`manageCharges.fee.hatchgrab`).
- Both live countries use `recipient = 'truck'`, so the target "truck keeps 100%" is today's behaviour.

**The current maximum:**
- The US is **4% + 50¢**: bps 400, fixed 50, set on 18 Oct. The test twin charges 3% + 30¢.
- The target's open item says "max 3%", so the maximum and possibly the fixed part would change.

**How customers see it:**
- **Menu notice** beside the tax notice: "Online card orders include a service fee of {fee}."
  (`app/trucks/[slug]/order/page.tsx:1710-1715`; `order.serviceFeeNotice`). Pay-at-truck orders show "No service fee."
- **Line label:** "Online service fee" for customers and "Service fee" for the kitchen (`charges.serviceFeeCustomer` /
  `serviceFee`; en-US has no override), built by `lib/order-charge-lines.ts:78`.
- **Where it appears:** checkout and confirmation (`components/ChargeRows.tsx`), customer emails (`lib/email.ts:242,
  250`), the printed ticket (`lib/printing/mapOrderToTicket.ts:130`), the dashboard card and Reports ("Service fees").
- **Basket:** it is folded into "Tax & fees" / "Tax, fees & tip".

**Is the truck's US state stored?** Yes:
- `trucks.base_region_code`: two letters, CHECK `^[A-Z]{2}$`, US only. The twin holds `NJ`. Written by setup and Manage
  › Where you trade.
- `trucks.base_region`: free text, e.g. "New Jersey".
- `truck_events.region`: per event, nullable; **live since 19 Oct** (the migration file's header still says "NOT
  APPLIED"; the column exists).

**Switching the fee off by state:**
- **Nothing does it today.** The US `card_surcharge_excluded_regions {CT,MA,PR}` list exists but is never applied (the
  surcharge is forced off, `order-charge-rules.ts:77`).
- There is no service-fee equivalent. **ME** is in the target's list but not in the existing surcharge list.
- The natural place is `resolveChargeRules` (`order-charge-rules.ts:46`). It would need `base_region_code` added to
  `TruckChargeFields` (:30-39), and possibly the event's region for a truck trading out of state (open).

---

## 7 · Proposed build plan, in small stages

Each stage is a separate prompt and is proven by harnesses, with GB byte-identical except named changes. **No stage
charges real money until stage 6.** Database changes go to Dominic as fenced SQL marked NOT RUN; none is written here.

### Stage 0 — decisions (Dominic)

1. **Allowance and price per truck or per business** (operator). Today billing is per truck, the Stripe account is per
   operator, and only 1 operator has 2 trucks (test). Per-van totals have no reliable attribution today.
2. **The US customer "online ordering fee":** the maximum (3%? a fixed part?), the excluded states (CT, MA, ME, PR), and
   whether the base state, the event's state or both decide.
3. **What happens when a trial ends:** the target makes Pay as you go a natural fallback (no monthly fee). Today an
   expired trial loses every feature, and the popup and terms promise "the free Starter tier".
4. **`demo` and `tester`:** keep as internal plans (all features, no fee), or retire `tester` (no truck uses it).
5. **Pizzeria Gusto:** its plan, its promotional price (for example the GBP 49 Unlimited for 12 months), and from when.
   **Needs Dominic's decision; no migration step includes it.**
6. **`real-thai-food`** (expired trial, flagged as a customer, recorded as a test truck): fix the flag, extend, or retire.

### Stage 1 — database (additive only; run before the code that reads it)

- **Changes:**
  - `country_settings`: add `payg_fee_pct` (1.5), `pro_overage_fee_pct` (or reuse `platform_fee_pct` as Pro's 0.99),
    `unlimited_monthly_minor`, and `service_fee_excluded_regions text[]`.
  - Repoint `pro_allowance_minor` to 250000 for GB.
  - Rewrite `country_settings_enabled_needs_prices_chk` for the new columns, and leave `starter_*` / `max_*` in place,
    commented as retired (they are not dropped).
  - `trucks`: allow `payg` and `unlimited` in `trucks_plan_check` (keeping the old values until stage 5).
  - `trucks`: add a promotional price, `plan_price_override_minor` plus `plan_price_override_until` (date); or a small
    `truck_plan_terms` table if history matters.
  - Record the hand-added `demo` / `tester` in a migration, so the repo matches the live constraint.
  - `order_payments`: add `food_minor` (the allowance base) and an index on `(truck_id, created_at)`.
  - Every new function revoked from public, anon and authenticated in the same file (the sweep enforces it).
- **Files:** `supabase/migrations/*`, `lib/country-settings.ts`, `lib/country-settings-types.ts`.
- **Risk:** low (additive). **No mockup.**

### Stage 2 — the fee engine (no UI; behind `platform_fee_enabled`, which stays off)

- **Changes:**
  - A plan-aware `platformFeeFor(truck, plan, foodMinor, monthToDateFoodMinor)`:
    - Pay as you go: 1.5% of food;
    - Pro: 0 until month-to-date food passes the allowance, then 0.99% of the part above it (the crossing order is split);
    - Unlimited and trial: 0;
    - walk-up: always 0.
  - A month-to-date meter on the ledger, in the truck's timezone (reuse `monthStartIso`).
  - Set `application_fee_amount` **at capture only**, on the captured food portion, and write `application_fee_minor`.
  - **In the same commit:** `refund_application_fee: true` with a proportional fee refund, and write
    `application_fee_refunded_minor`.
  - Decide how concurrent captures near the allowance edge are serialised (a locked row or an accepted small drift).
- **Files:** `lib/order-charge-rules.ts`, `lib/order-charges.ts`, `lib/payments/capture.ts`, `lib/payments/refund.ts`,
  `lib/payments/online.ts`, a new `lib/plan-allowance.ts`, harnesses.
- **Risk: highest.** It is real money on connected accounts, and test cards can only be run with Stripe test keys on
  localhost (`.env.local` holds live keys). The terms must describe the fee before it is switched on (stage 4).
  **No mockup.**

### Stage 3 — the plan model (every plan gets every feature)

- **Changes:**
  - The `Plan` type becomes `payg | pro | unlimited | trial | demo (| tester)`.
  - `canAccess` grants every feature to every plan; overrides stay for demos and previews. Decide the expired-trial rule
    (stage 0).
  - Retire `PLAN_FEATURES` tiers, `requiredPlan`, `maxVans` / `INCLUDED_VANS` (vans are a pricing question now), the
    parity check, and the `hasFeature` / `canAccess` split (`hasFeature` ignores overrides and expiry).
  - Price helpers for three plans plus the promotional override.
  - Provisioning's default plan; admin `PLAN_ORDER`, `PLAN_BADGE` and `FEE_COLUMN_FOR`.
  - Validate `plan` in `POST /api/admin` (it writes the body straight to `trucks` today).
  - The server refusals `*_pro` / `*_max` become unreachable and are removed with their messages.
- **Files:** `lib/features.ts`, `lib/plan-features.ts`, `lib/useFeatures.ts`, `lib/provision-truck.ts`,
  `lib/landing-table.ts`, `app/admin/page.tsx`, `app/api/admin/route.ts`, about 25 `canAccess` / `hasFeature` call sites
  (section 2), `components/FeatureGate.tsx`.
- **Risk:** medium (wide but mechanical). Harness: every gated surface renders for every plan. **No mockup** (it removes
  gates).

### Stage 4 — the surfaces (mockups first, every one)

- **Changes:**
  - Landing pricing cards; /features (the 33-row tier matrix becomes "everything included" plus a three-plan fee table);
    /compare (`pricingFrom`, the hardcoded names, the US examples); the plans PDF (including undecided-price handling for
    a prospect's country).
  - Manage › Billing:
    - three plan branches plus a fallback for demo and tester;
    - the promotional price shown;
    - the footnote mask keyed by id, not by "2";
    - the upgrade mailto URL-encoded and its plan names taken from messages;
    - the iOS purchase rule kept.
  - The van billing and upgrade modals (depends on decision 1); the trial popup's copy; FeatureGate prompts removed;
    admin Countries (the new fields, the switch-on rule).
  - Terms §4 and the plan words in `messages/en-GB.json` (planFeatures, planMeta, landing.pricing, compare, manageBilling,
    manageSettings.van*, errorsManage), and the en-US overrides.
- **Files:** the surfaces in section 3.
- **Risk:** medium; a visible GB change, named and proven. **Mockups needed:** landing pricing, /features, /compare,
  Billing, the van modal, the trial popup, the plans PDF. Admin Countries can follow the existing form.

### Stage 5 — moving existing trucks

- **The data today:** no truck is on starter, pro or max, so nothing needs translating.
  - The 4 `demo` trucks stay demo.
  - The test trial trucks (`test-truck`, `test-truck-3-2`, `test-truck-us`, `tikka-tonic`, `village-spice`) follow the
    stage 0 trial rule; `village-spice` has no trial end.
  - Then `starter` / `max` are removed from `trucks_plan_check`, and the column default changes from `'starter'`.
- **Not included:** `pizzeria-gusto` (**needs Dominic's decision**) and `real-thai-food` (decision 6).
- **Risk:** low. Proposed as NOT RUN SQL in that stage's report.

### Stage 6 — switching on

- GB: set `platform_fee_enabled` (with the stage 2 fee engine deployed and the terms updated first).
- US: set prices and the fee rules, then `enabled` (after the Stripe question on US connected accounts, and US card
  payments tested with test keys).
- **Risk:** live money, so go one country at a time, with the first month watched.

### Cross-cutting risks

- **Charging before disclosing:** the terms (§4), Billing and the plans PDF must state the new fees before stage 6.
- **The hand-added plan constraint:** the live constraint differs from the repo, so read it before changing it.
- **The footnote "2" magic string:** renumbering the footnotes silently unmasks a price.
- **A "hatchgrab" service-fee recipient is not collected:** keep it unused, or route it through the application fee in
  stage 2.
- **The allowance base is food:** the ledger holds totals, so the meter would be wrong without stage 1's `food_minor`.

---

## SQL run (all read-only, through the Supabase MCP connection)

1. `country_settings` columns (types, nullability, defaults): 53 columns, listed in section 1.
2. `country_settings` constraints: listed in section 1, including `country_settings_enabled_needs_prices_chk`.
3. GB and US values: section 1's table.
4. `trucks` plan-related columns: `plan` (text, not null, default 'starter'), `trial_expires_at`, `lifetime_discount_pct`,
   `lifetime_discount_note`, `hide_pricing`, `feature_overrides`, `service_fee_*`, `base_region`, `base_region_code`,
   `country`, `timezone`, `operator_id`.
5. `trucks` constraints: `trucks_plan_check` (starter, pro, max, trial, demo, tester), `trucks_service_fee_chk`.
6. Trucks by plan with flags: section 4.
7. Pizzeria Gusto's plan row (read only): trial, ends 31 Dec 2026, no discount, `hide_pricing` false, no overrides.
8. The 7 trial trucks: section 4.
9. `truck_vans` columns: no plan or billing column.
10. Vans per truck: only `test-truck` has 2.
11. `truck_users` and `operators` columns; `truck_users` roles: no rows.
12. Owners with more than one truck in `truck_users`: 0. Through `trucks.operator_id`: 1 of 9 operators has 2 trucks.
13. `order_payments` by kind, channel and state: online card rows are all test mode; no application fee anywhere.
14. `orders` fee and money columns: `food_minor`, `tax_minor`, `tip_minor`, `service_fee_minor`,
    `service_fee_recipient`, `application_fee_minor`, `card_surcharge_minor`, `total_minor`, `van_id`, …
15. Gusto's web-placed food by London month (read only): section 4.
16. US and service-fee trucks: only `test-truck-us` (NJ, 3% + 30¢).
17. `truck_events.region`: exists, nullable text.

The exact queries are in the chat reply.

## Undo (only if Dominic asks)

Nothing to undo: no change was made.
