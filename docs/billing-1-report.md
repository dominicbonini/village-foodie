# billing-1 — HatchGrab charges trucks: plans, the 0.99% and post-pay, built switched off

10 November 2026 · main, local · commits `af44ebce` (migration), `3fd1b086` (code), `769842b0` (sweep fixes), plus this report · **not pushed, not deployed**.

**In one line:** every rule in your ten decisions is built and proven against an in-memory store and a fake payment processor (110 checks), and against the real database read-only (11 checks). The full sweep is green: **210 of 210**. `platform_switches.billing_enabled` is **false**, so the live app behaves exactly as before. Nothing has run against Stripe yet: this Mac only has the **live** Stripe key, so the Stripe test-mode run is waiting on a test key from you (hand step 1).

---

## 0. Diagnosis (recorded before anything changed)

### What billing exists today
- **Plans are data** (§81): `plans` (payg, pro, unlimited, trial, demo, tester), `plan_prices` (per country: monthly, allowance, `fee_bps`, extra van, `offered`, `is_trial_end`), `plan_features`. The trial is the `trial` plan plus `trucks.trial_expires_at` (3 months, `plans.trial_months`). When the trial ends, the truck falls back to Pay as you go at read time. In BR, MX, MY, SG and TH it falls back to Unlimited instead.
- 🔴 **OBSERVED:** the `trial` plan is flagged `is_internal = true`. This matters: see the bug note under §3.
- **Manage › Billing** only shows the plan card and the plan table. "Upgrade" is a mailto link. There is **no** Stripe Customer, Subscription, Checkout, SetupIntent or Invoice code anywhere. `operators.stripe_customer_id` does not exist (§13, V9.4).
- **No paid plan is billed anywhere** (§81.6, §82.11). That is still true.

### Is the 0.99% taken anywhere? No.
- `platform_fee_enabled` is false in **all 44** countries. `platform_fee_allowed` is false in BR, MX, MY, SG and TH (OBSERVED).
- `application_fee_amount` was never sent: `authorize.ts` and `capture.ts` both record "absence, never zero". `lib/order-charge-rules.ts` works out a platform fee only behind `platformFeeOn(country)`, so it never fires.
- `refund.ts` did **not** pass `refund_application_fee`. Its own warning said a fee would quietly short-change the truck on every refund.
- There was **no month-to-date allowance meter**.
- `order_payments.application_fee_minor` and `application_fee_refunded_minor` exist, but no row has a value. OBSERVED: 17 online charges and 1 refund, with a fee total of 0.

### How Pay at Hatch is gated
`payAtHatchOn` in `lib/plans.ts` combines `plans.pay_at_hatch_allowed` (true on all 6 plans), the `online_ordering_pay_at_hatch` switch (no `plan_features` row exists) and the truck's override. `/api/menu` hides Pay at Hatch when that is off, and `/api/orders/submit` refuses it with `pay_at_hatch_unavailable`. The 2 Nov "trial only" idea (§81.7) was never built. Your decision 9 replaces it.

### Stripe test-mode access from this Mac: none
`STRIPE_SECRET_KEY` classifies as **live**. I checked it with Next's own env loader and printed only the word "live". The code reads no other Stripe key variable. So I built billing to use a **separate test-only variable**, `STRIPE_BILLING_TEST_SECRET_KEY`. Billing refuses any key that does not start `sk_test_` and never falls back to the live key. That is how "create no live Stripe objects" holds by construction. Hand step 1 is adding that key.

### Where the decisions and the code or manual disagree, and how I read each one
None of these blocked the build, and none forced a choice between two instructions. I stopped for none of them. Each one needs your eye:

1. **Decision 2 vs the published wording.** Decision 2 charges the fee on **every** pre-order, including pay-at-the-truck ones. Manual §81.1, the pricing pages, the plans PDF and Terms §4 all say the fee is on "online card orders". The build follows decision 2, behind the switch. **Before switching on**, the pricing pages, FAQ and terms must say the new rule. You asked for no pricing-page changes this time, so I made none. They are listed in §12.
2. **Step 3 lists "models b, c and post-pay", but decision 5 says every truck's plan fee is charged on the 1st.** Built per decision 5:
   - every billable truck gets one monthly charge (plan fee + billed usage);
   - for a model (a) truck, fees on card-paid pre-orders are taken from each payment and never invoiced;
   - its invoice holds only the plan fee, plus any pre-order whose fee was not taken that way.
3. **Plan fee timing: I read "monthly billing in arrears" (your step 7) as applying to the whole charge.** The 1 December charge covers November: November's plan fee plus November's usage. If you meant the plan fee **in advance** (December's plan fee on 1 December), that is a contained change in `composeMonth` (`lib/billing/rules.ts`). Tell me and I'll switch it.
4. **In BR, MX, MY, SG and TH only Unlimited is offered, at 0%.** Model (b) usage billing therefore bills nothing there today. It only matters if Pay as you go or Pro is offered there later. The plan fee (R$149, MX$849, …) is billed monthly as decided.
5. **Model (a) still needs the country's own platform-fee switch.** Rule 35.an-17 says no application fee without `platformFeeOn(country)`. That switch is off everywhere, so today an (a) country's fees fall to the monthly invoice. Turning billing on for (a) also means setting `platform_fee_enabled` per country (Admin › Countries, "Take our fee").
6. **Terms §4 today** says billing in advance and a 7-day payment path. Your decisions are in arrears with a 5-day pause. The new section in §11 replaces that wording when you publish it.
7. **Pizzeria Gusto** has `is_customer = true`, so it becomes billable the moment billing is switched on. Its trial ends **31 Dec 2026**. If billing is on by then and Gusto has no card on file, its **online** ordering pauses (walk-ups and the kitchen keep working). Its Pay at Hatch also turns off after the trial unless it chooses post-pay. Today nothing changes for Gusto (proven, §13).

---

## 1. Data model — migration `20261085_billing_1.sql` (committed `af44ebce`, run by me, one transaction, no error)

| Table / column | What it holds |
|---|---|
| `platform_switches.billing_enabled` | **The global switch, false.** `billing_pause_after_days` = 5. |
| `country_billing` (one row per country) | `payment_model` (`fee_from_payment` (a) / `billed_online` (b) / `billed_at_truck` (c)), `post_pay_surcharge_bps` (0), `post_pay_surcharge_fixed_minor` (0), `min_charge_minor` (about £5 in each currency). A trigger refuses (a) where Stripe forbids application fees. |
| `operator_billing` | The Stripe Customer per truck owner, on HatchGrab's platform account. |
| `truck_billing` | Per truck: `post_pay`, `billing_test` (lets a test truck be billed), payment-method state (`none`/`pending`/`valid`/`failed`), type (`card`/`pix`/`sepa_debit`), label (brand + last four), the cached `status` (`trialling`/`active`/`past_due`/`paused`) and its reason. No row means the defaults. |
| `billing_usage` (truck × month) | **The ledger:** pre-orders counted, value counted (online / at the truck), allowance and allowance used, fee rate, fee due, fee taken by application fee, fee billed, plan fee (days), extra vans, surcharge, carried in, amount due, charged, carried out, minimum, inputs digest. `state` is `open` (can be rebuilt from orders) until it is frozen: `invoiced` / `carried` / `nothing`. |
| `billing_usage_orders` | One line per counted pre-order: its counted value, the allowance before it, its fee, and how that fee was collected (`application_fee` / `invoice` / `none`). |
| `billing_invoices` | **Unique (truck, month): the double-billing guard.** Status, amount, currency, Stripe id, due date, attempts, last error, hosted link. |

Every new table has RLS on, no policy, and nothing granted to anon or authenticated. **No existing row anywhere was updated or deleted.** `country_billing` was filled by `INSERT … SELECT` from `country_settings`, which only reads it.

**Seeded:** (a) in 39 countries, (b) in BR MX MY SG TH, (c) nowhere. Minimums: GBP 500, EUR 600, USD 700, CAD 900, AUD 1000, NZD 1100, CHF 600, CZK 15000, DKK 4500, HUF 250000, NOK 7000, SEK 7000, PLN 2500, RON 3000, BRL 3500, MXN 13000, JPY 1000, SGD 900, HKD 5000, MYR 3000, AED 2500, THB 22000. All of these are editable in Admin › Countries.

**Verified read-only after the run (Supabase MCP):**
- `billing_enabled` is false, pause = 5;
- 44 `country_billing` rows (39 (a) + 5 (b) = BR MX MY SG TH);
- `truck_billing`, `billing_usage` and `billing_invoices` all have 0 rows;
- RLS is on for all 6 tables and there are 0 grants to anon or authenticated;
- minimums spot-checked: BR 3500, FR 600, GB 500, HU 250000, JP 1000, MX 13000, US 700.

The full SQL is in §15.

---

## 2. The rules (`lib/billing/rules.ts`, pure — the one source)

- **Who is billed:**
  - only while the switch is on;
  - only in a country with a `country_billing` row;
  - never on the demo plan or a non-trial internal plan (tester);
  - only a customer truck, or a test truck whose `truck_billing.billing_test` is set.
- **What counts:** every **pre-order** (`orders.source = 'web'`) in status confirmed, modified, ready or collected, however it was paid. Walk-ups (`source = 'manual'`) never count, and neither do pending, cancelled or rejected orders. The base is `food_minor`, less the refunded share of a card refund.
- **The month:** the calendar month in the truck's own time zone, decided by `placed_at`.
- **The allowance and fee, as one allocation:**
  - orders are taken in the order they were placed, and the running total is the month-to-date meter;
  - each order's fee is the plan's `fee_bps` on the part of it above `included_online_minor` (an order can straddle the line);
  - JPY rounds down (35.ao-6); two-decimal currencies round half-up, like the order engine;
  - the capture path and the month-end use the **same** function.
- **How each order's fee share is collected:**
  - by **application fee**, only if one was actually taken from the payment — that fee is never billed again;
  - otherwise on the **monthly invoice**.
- **The month's bill:**
  - the plan in force at the end of the month prices it, promo overrides included;
  - in the month a trial ends, the plan fee and extra vans are prorated by whole local days after the trial's last day, and only pre-orders placed after the trial count;
  - plus the billed usage, the post-pay surcharge (post-pay trucks only, and only when not 0), and anything carried in;
  - **under the country's minimum → carried forward**, with nothing charged.
- **Status, worked out from the facts every time:**
  - trialling → `trialling`;
  - trial over and no valid payment method → `paused`;
  - an unpaid invoice → `past_due`, becoming `paused` 5 days after its due date;
  - otherwise `active`.
- **Paused means:** online ordering stops, in the existing "not taking orders" state. The kitchen screen, walk-ups and the account never ask billing.
- **Pay at Hatch:** during the trial, as today. After it, only for a post-pay truck with a valid payment method that is not paused. A (c) truck is always post-pay.

## 3. The fee taken from each payment, model (a) — `lib/payments/capture.ts`, `lib/payments/refund.ts`

- **Capture:**
  - only when `billingSwitchOn()` is true does capture ask `applicationFeeAtCapture`;
  - that answers only for a billable truck past its trial, on model (a), not post-pay, where `platformFeeOn(country)` holds and the order is above the allowance;
  - capture.ts asks `platformFeeOn` again itself before sending anything;
  - the fee is capped at the amount being captured;
  - `application_fee_amount` is sent only through a conditional spread, so with no fee **the Stripe call and its idempotency key are exactly as before**;
  - the ledger records Stripe's own `application_fee_amount`. If the webhook wrote the row first, the fee is added to it, only where it is still empty.
- **Refund:**
  - when the charge's ledger row carries a fee, `refund_application_fee: true` is sent;
  - that check runs every time, so a fee taken before the switch went off is still given back;
  - the refunded share (fee × refund ÷ captured, rounded down) is recorded on the refund row;
  - with no fee, the refund call is unchanged.
- **Bug caught before it shipped:** the "never bill internal plans" rule would have exempted every truck still on `plan = 'trial'`, forever. The trial plan is `is_internal` live, and trucks keep that plan key after the trial ends. Fixed, and the harness checks it.
- **Known edge, recorded:** two captures racing at the allowance line can both see the same month-to-date total. Both then under-take, in the truck's favour, by at most one order's share. The month-end does not re-bill an order whose application fee was taken.

## 4. Monthly billing (`lib/billing/engine.ts`, `app/api/cron/billing`, `app/api/webhooks/stripe-billing`)

- **Customer:** one Stripe Customer per truck owner on the platform account. It is found by metadata before one is created (never a duplicate). `preferred_locales` is the truck's language (pt-BR, es-419, ja, fr, …; Arabic falls back to en-GB, which Stripe doesn't offer).
- **The run** (`runMonth`, one per truck per month):
  1. Compute the month into `billing_usage` and its lines.
  2. If the month owes nothing or is under the minimum, **freeze** it.
  3. Otherwise **claim** `billing_invoices (truck, month)` (an insert, so it can only happen once).
  4. Create a Stripe invoice: `collection_method = charge_automatically`, `auto_advance`, the truck's payment method, in the **truck's own currency**, one line each for plan / extra vans / pre-order fee / post-pay charge / carried over.
  5. Finalise it. Stripe collects automatically and Smart-Retries.
- **Never twice:**
  - a frozen month is never recomputed;
  - the claim is unique;
  - every Stripe call has a key built from truck, month and step;
  - a run that crashed half-way is completed by the next run under the same keys.
- **No payment method:** the month stays open and is retried daily. The status is `paused`.
- **Cron:** `/api/cron/billing`, daily at 12:00 UTC. By then the month has ended in every time zone from UTC−10 to UTC+13. Running every day also completes anything a failed run left. **With the switch off it returns `skipped: switch_off` and touches nothing.** Its `vercel.json` entry is committed; it takes effect only when you deploy.
- **Webhook (new endpoint, platform-account events, its own secret `STRIPE_BILLING_WEBHOOK_SECRET`):**
  - the house rules: verify first, record in `stripe_webhook_events` before handling, 500 → redeliver;
  - invoice events update our row and the truck's status, so **paying resumes online ordering immediately**;
  - `setup_intent.succeeded` / `setup_failed`, `payment_method.detached` and `mandate.updated` (inactive) update the payment method;
  - **live events are recorded and ignored** in this build.
  - `/api/webhooks/stripe` (Connect) is unchanged.

## 5. Payment methods
- **Card everywhere:** a SetupIntent with `usage: off_session` (`startPaymentMethodSetup`), waiting for the operator screen.
- **Pix Automático (BR only):** a SetupIntent with `payment_method_types: ['pix']` and `mandate_options` (maximum amount, BRL, monthly, reference "HatchGrab"). These fields are in the installed SDK (stripe@22.4.0). Non-BRL trucks are refused. Invoices then charge on the Pix method.
  - ⚠️ **Not yet proven against Stripe:** whether Stripe Invoicing will charge a Pix Automático mandate automatically on an invoice. If it won't, the fallback is an off-session PaymentIntent on the mandate. `scripts/billing-1-stripe-test.cjs` will show which.
  - Pix Automático also has Brazilian scheduling rules. The mandate starts at least 3 days ahead, and charges are scheduled ahead of the due date. Expect Brazil's charge to land a few days after the 1st.
- **SEPA Direct Debit later:** already allowed as a `payment_method_type`, and the processor's set-up and invoice code take a type. Its mandate revocations arrive as `mandate.updated` (handled). What remains is the operator screen and turning SEPA on in Stripe.

## 6. End of trial and reminder emails
- **The rule:** a payment method is needed only when the trial ends. With none, **online** ordering pauses until one is added. Walk-ups and the kitchen keep working. Proven in harness §10.
- **Reminder emails: not built and not switched on.** They are worded below for your approval. They would go from hello@hatchgrab.com through the existing Brevo sender, in the truck's language once approved and translated.

**7 days before** — Subject: *Your free trial ends in 7 days*
> Hi {first name},
> Your HatchGrab free trial for {truck name} ends on {date}.
> To keep taking online orders after that, add a card in Manage › Billing{, or set up Pix Automático — Brazil only}. It takes a minute.
> Your plan after the trial is {plan name}: {monthly price} a month{, plus 0.99% of pre-orders above {allowance} — or: plus 0.99% of pre-orders}. Walk-up orders are always free.
> Nothing is charged until the 1st of {month after the trial}, when we bill the month just gone. If the total is under {minimum}, we carry it over to the next month.
> If you'd rather your customers pay at the truck, choose post-pay in Manage › Billing: we bill the fee monthly instead{ — post-pay adds {surcharge}}.
> Questions? Just reply to this email.
> The HatchGrab team

**1 day before** — Subject: *Your free trial ends tomorrow*
> Hi {first name},
> Your free trial for {truck name} ends tomorrow, {date}.
> {If no payment method:} You haven't added a card yet. Without one, online ordering will pause after tomorrow until you add one. Walk-up orders and your kitchen screen will keep working. Add a card in Manage › Billing.
> {If a payment method is on file:} You're all set: {card brand ending 1234 / Pix Automático} is on file. Your first bill will be on the 1st of {month}.
> The HatchGrab team

## 7. Admin (the only UI added)
- **Admin › Countries › Billing** (`components/admin/CountryBillingPanel.tsx`): one row per country with payment model, post-pay surcharge (bps and monthly fixed amount) and minimum charge. Each row saves on its own and is stale-save guarded. (a) is greyed out where Stripe forbids it. The panel shows whether the switch is on or off; it **cannot** turn it on. Countries with no row are listed in red.
- **`/admin/billing`** (admin-only; not linked from the console, same pattern as `/admin/whatsapp-connections`):
  - every customer or billing-test truck, with its status now and its status if the switch were on;
  - per truck: its months (ledger), the open month's pre-orders, its invoices, **Preview month** (computes, saves nothing) and **Run month-end for this truck (test)** — billing-test trucks only, Stripe test mode only.
- Both screens use **only Tailwind classes already in the code** (harness §16: 75 of 75 found). The stylesheet the public pages share is unchanged.

## 8. What I did not touch (per your rules)
- The landing page, the pricing pages, Manage › Billing and every customer or operator screen: no visual change. The menu and submit routes gained the billing gate, which with the switch off returns today's answer before reading anything else.
- No email switched on. No terms published or translated. No live Stripe object. Nobody charged.
- No push and no deploy.
- No `.env*` file opened. Keys were classified only by Next's loader, inside a process.

## 9. Proof

| Run | Result |
|---|---|
| `node scripts/billing-1.cjs` (sweep-listed; in-memory store and fake processor, the real rules, engine and gate) | **110 passed, 0 failed** |
| Mutation check (a harness that cannot fail proves nothing, 35.y): billing application-fee orders twice / ignoring the switch in `billableOf` | 4 failures / 1 failure, as expected; `rules.ts` restored byte for byte (`cmp`) |
| `node scripts/billing-1-db-read.cjs` (by hand; the real database store and the real gate, **reads only**) | **11 passed, 0 failed.** The 6 billing tables have the same row counts before and after |
| `node scripts/billing-1-stripe-test.cjs` (by hand; the same engine on Stripe **test mode**) | **Not run:** no test key on this Mac (exit 2, by design). Hand step 1 |
| `npx tsc --noEmit` | clean |
| eslint, new files | clean |
| eslint, modified files | the same counts as HEAD for each (capture, refund, ledger, online, CountriesTab 0/0; menu 32/0; submit 16/5 — all pre-existing) |
| Full sweep `node scripts/run-harnesses.cjs` | **210 run · 210 passed · 0 failed** (second run, after the fixes below) |

**The first sweep failed 9 harnesses, and every one was caused by this work.** All 9 passed at `e0f8a787`, the commit before it, run in a temporary worktree that has since been removed. Fixed in `769842b0`:
- **whatsapp-background-jobs-harness.** It compiles with non-strict `tsc`, where `!x.billable` does not narrow the union. The two sites in `lib/billing/engine.ts` now read `=== false`.
- **currency-registry.** It bans "minor units" in app text, and I had used the phrase in two Admin sentences. Reworded to "the currency's smallest unit: pence, cents, whole yen".
- **order-charges** (`_order-charges-us.cjs`), **legal-follow-ups** and **plans-data-model.** Each pinned "no code sends `application_fee_amount`" or the old Pay at Hatch line. Re-pinned (marked ⚠️ RE-PINNED billing-1) to the new truth: only `capture.ts` sends the fee, only inside `if (await billingSwitchOn())`, and the plan's Pay at Hatch rule is ANDed with billing's gate.
- **loyalty-1, cwv-2 and costs-accounts-1.** Each pins payment/menu/submit paths "byte-identical since commit X". Re-pinned centrally, following gsc-index-2's precedent: `scripts/_lp-billing-1.cjs` reverse-applies exactly billing-1's committed diff (`patch -R`, no fuzz) inside `_moved-paths.cjs changedSince`. A file billing-1 created counts as absent. It throws if any other commit touched the file in between, or if the edits aren't there exactly. **Every other byte is still compared.** Proven: one stray comment line in `capture.ts` makes cwv-2 fail again (restored).
- **site-chrome-1.** It requires every page to be classified; `app/(app)/admin/billing/page.tsx` is now in group C, beside the other admin pages.

**What `billing-1.cjs` covers, scenario by scenario:**
1. **Switch off:** the gate and the capture fee read nothing but the switch. Month-end skips. Nothing is written or sent. A switch it cannot read counts as off. With the switch on, a failure in billing's own reads never pauses a truck.
2. **Who is billed:** test trucks only with `billing_test`. Demo and tester are never billed. **The trial plan is.** A country with no row is never billed.
3. **GB (a):**
   - month: £3,000 online + £1,500 at the truck + £2,000 online; walk-up, cancelled, pending and rejected orders ignored;
   - at capture: 0 for the first order; **1980** for the third, capped at the capture amount;
   - month-end: counted £6,500; allowance £4,000 used;
   - fee due 2475, of which **1980 already taken by application fee and not billed again**, so 495 billed;
   - charged **£33.95** in GBP; the month frozen.
4. **Refunds:** half of an order refunded → counted value and fee taken both net of the refund; `refund_application_fee` is sent only when the charge had a fee.
5. **BR (b), card:**
   - no application fee;
   - October R$1.49 → **carried** (under R$35);
   - November R$39.60 + R$1.49 carried in → **R$41.09 invoiced in BRL**, with the carried amount on its own line;
   - **Pix Automático:** set-up starts and is refused outside BRL; Unlimited R$149 is invoiced on a Pix method.
6. **MX (b):** the trial ends 15 Oct → MX's trial-end plan, Unlimited, **16 of 31 days = MX$438.19**, in MXN. Only the pre-order placed after the trial counts.
7. **(c) test country:** no payment method → paused and no Pay at Hatch; with a card → active, Pay at Hatch on; €1,000 at the truck → €9.90 billed.
8. **FR post-pay:**
   - no application fee, although FR's platform fee is on in the fixture;
   - fee €9.90 + surcharge 0.5% + €1 = €26.00 + plan €29 → **€64.90**;
   - a surcharge of 0 is not applied;
   - a truck that is not post-pay has no Pay at Hatch after the trial.
9. **JPY:** ¥1,515 × 0.99% = **¥14** (rounded down) → carried; then ¥1,188 + ¥14 = **¥1,202** invoiced. A Tokyo month is a Tokyo month.
10. **Trial:**
    - during it: trialling, Pay at Hatch on, no card needed;
    - trial over with no card → online ordering paused;
    - card added → resumed at once;
    - a month spent entirely in the trial bills nothing;
    - the dashboard and KDS never import billing.
11. **Failed payment:** declined (attempt 1, reason kept) → day 4 past due, still taking orders → **day 5 paused** → new card, paid → **resumed automatically**, status back to active. An invoice that isn't ours is ignored.
12. **Never twice:**
    - a crash half-way, then completed under the same key: 1 invoice at the processor;
    - a third run → `already`; the all-trucks run the next day doesn't re-bill;
    - the claim refuses a second row; a frozen month is never recomputed;
    - a **live** processor is refused;
    - no payment method → the month is left open;
    - test payment methods only on billing-test trucks.
13. **The key:** missing → refused; a live key in the billing variable → refused; only `sk_test_` is accepted. `processor.ts` never reads `STRIPE_SECRET_KEY`. Truck language → Stripe locale.
14. **Constructs:**
    - menu and submit use the gate (submit before any booking);
    - capture computes a fee only inside `if (await billingSwitchOn())` and asks `platformFeeOn` itself; the send and the idempotency key are conditional;
    - the gate asks the switch first;
    - 35.an-17 still holds;
    - the cron is at 12:00 UTC and does nothing while the switch is off;
    - no billing file names a truck;
    - the harness is registered.
15. **Migration:** no protected-table update or delete; the switch is false; RLS is on and nothing is granted; the unique key; the seeding; all 22 currencies have a minimum.
16. **Admin classes:** all 75 already exist.

**Pizzeria Gusto, unchanged.**
- Against the real database, the real gate on Gusto answers exactly "billing off": nothing paused, Pay at Hatch as its plan says. The real capture-fee function returns none.
- OBSERVED: Gusto has 0 rows in `truck_billing`, `billing_usage`, `billing_invoices` and `operator_billing`, and no fee row in `order_payments`. Its truck row is untouched (`plan = trial`, ends 31 Dec 2026, overrides `{}`).
- With the switch off, `/api/menu` and `/api/orders/submit` compute `X && true` and `if (false)`, and capture never reads the catalogue, the country or the fee. So every Gusto response and every Stripe call is byte-identical by construction.
- **Not done:** a live A/B fetch of Gusto's menu response from two servers. That would need a second dev server on the old commit; the construct proof above covers the same ground.

**Real-data check (read only):** `test-truck-us` has 5 October pre-orders and a direct count agrees. Computed in memory, as if its trial had ended on 30 September: 4 counted (one isn't confirmed yet), $70.00 counted, 0.99% = 69¢ → carried under the $7 minimum. Nothing was saved.

## 10. Hand steps for you, in order
1. **A Stripe TEST key for billing.**
   - Stripe Dashboard → switch on **Test mode** (top right) → Developers → API keys → reveal and copy the **Secret key** (`sk_test_…`).
   - Add it to `.env.local` as `STRIPE_BILLING_TEST_SECRET_KEY=sk_test_…`. Never paste it in chat.
   - Then run `node scripts/billing-1-stripe-test.cjs` (or ask me to). It invoices GBP, EUR, BRL, MXN and JPY on Stripe's test cards, runs the declining card → good card path, the idempotency replay and the Pix set-up.
2. **Pix (test mode first):**
   - Settings → Payments → **Payment methods** (the platform account's configuration, not "Connected accounts") → find **Pix** → **Turn on**.
   - If Pix Automático (recurring) is not offered there, or step 1's Pix line fails with "not activated", request access from the Pix entry ("Request access") or through Stripe support. It is newer than one-off Pix.
   - Repeat in live mode when we go live.
3. **Billing settings (test mode now, live later):**
   - Settings → Billing → **Subscriptions and emails** (or "Manage failed payments"):
     - **Smart Retries** on, e.g. up to 4 retries within 2 weeks. The 5-day pause is ours and doesn't depend on Stripe's schedule.
     - "If all retries for a payment fail" → **leave the invoice past due**, not "mark uncollectible", so it stays unpaid until paid.
     - Customer emails: **Send emails when card payments fail** on; **Send finalized invoices** on; **Successful payments** on.
   - Settings → **Emails** → **Add a custom domain**: hatchgrab.com, then add the DNS records it shows at your DNS host. Until it verifies, Stripe sends from its own address.
   - Settings → Business → **Public details**: support email hello@hatchgrab.com.
   - Settings → **Branding**: logo and colour for invoices.
4. **The billing webhook (test mode now; live at go-live):**
   - Developers → Webhooks → **Add endpoint** → `https://www.hatchgrab.com/api/webhooks/stripe-billing` → listen to **Events on your account**, not connected accounts.
   - Events: `invoice.finalized`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_method.detached`, `mandate.updated`.
   - Copy its signing secret into Vercel as `STRIPE_BILLING_WEBHOOK_SECRET` (Production) when you next deploy. Nothing reaches this endpoint until then.
5. **Your Wise EUR and USD accounts as payout accounts:**
   - Settings → Business → **Bank accounts and currencies** (Payouts) → **Add bank account** → currency **EUR** → your Wise EUR IBAN and BIC. Repeat with currency **USD** and your Wise USD account details.
   - Stripe then pays EUR and USD balances out in those currencies, with no conversion to GBP.
   - Two caveats: this covers money on **HatchGrab's own** balance (these invoices and application fees), not the trucks' Connect payouts. BRL, MXN, JPY and the rest are still converted at payout.
6. **Before switching billing on (a later decision):**
   - the operator Billing screens (§12, your mockup first);
   - the pricing pages, FAQ and plans PDF wording for decision 2;
   - publish the terms section (§11);
   - the live key in `lib/billing/processor.ts`;
   - `platform_fee_enabled` for each (a) country;
   - the reminder emails;
   - then a migration setting `billing_enabled = true`.
   - Mind Gusto's 31 December trial end (§0 point 7).

## 11. Terms — one new section (draft, English, not published or translated)

> **Paying HatchGrab**
>
> **How you pay.** We charge your plan's monthly fee and our fee on pre-orders in your local currency, as shown for your country on our pricing page. Walk-up orders are free.
>
> **What our fee covers.** Our fee is a percentage of the food value of every pre-order your customers place through HatchGrab, above any amount your plan includes. It applies whether your customer pays online or when they collect. Tax, tips, service fees and card surcharges are not included in the fee. If a pre-order is cancelled or rejected, no fee is due on it. If you refund a card payment, our fee is reduced in proportion.
>
> **When and how we take it.** Depending on your country and your choice:
> (a) where we can, we take our fee from each online card payment as it is made; or
> (b) we add up the month and charge it on the 1st of the following month, together with your plan's fee for that month; or
> (c) if your customers pay at the truck, or you choose post-pay, we bill the fee monthly in the same way.
> Monthly charges are made in arrears, on the 1st of each month, for the month just ended. In the month your trial ends, the plan fee is charged only for the days after it.
>
> **Payment method.** You need a payment method on file when your free trial ends: a card, or in Brazil Pix Automático. You authorise us to charge it automatically on the 1st of each month for the amounts above. If you don't add one, online ordering pauses until you do. Walk-up orders, your kitchen screen and your account keep working.
>
> **Small amounts.** If a month's total is below the minimum shown for your country, we don't charge it that month; we carry it forward and add it to the next charge.
>
> **Post-pay.** You can choose post-pay, so your customers pay when they collect and we bill our fee monthly. Post-pay needs a valid payment method on file. Where your country shows a post-pay charge, it is added to your monthly bill.
>
> **If a payment fails.** We, through our payment provider, will retry automatically and email you. If a charge is still unpaid 5 days after it was due, online ordering pauses until it is paid. Walk-up orders, your kitchen screen and your account keep working, and online ordering resumes automatically once the payment succeeds.
>
> **Changes.** We'll tell you at least 30 days before we change our prices or fees.

(The "30 days" notice period is my placeholder. Your current terms may already set one. Check before you publish.)

## 12. What the operator screens will need (for your mockup)

**Manage › Billing, one state at a time** (the status comes from `billingStatusOf`; the API fields already exist in `/api/admin/billing` for Admin, and an operator version will mirror them):
- **Trialling:** days left and the trial end date (`trucks.trial_expires_at`); the plan after the trial and its price; "Add a card before {date}"; whether a payment method is on file; the post-pay choice.
- **Active:**
  - plan, monthly price (promo override with its end date);
  - **this month so far:** pre-orders counted (online / at the truck), allowance used of included, fee so far, fee already taken from payments, fee to be billed, surcharge, carried in;
  - "Next charge on the 1st: about {amount}", or "under {minimum} — carried to next month".
- **Past due:** the amount, the failure reason (`billing_invoices.last_error`), "We'll retry automatically", **online ordering pauses on {due + 5 days}**, Update card, Pay now (the hosted invoice link).
- **Paused:**
  - why: *unpaid* → amount + Pay now; *no payment method* → Add a card;
  - what still works (walk-ups, kitchen screen, account);
  - "Online ordering resumes as soon as …".
- **Payment method:** brand •••• last four, or "Pix Automático"; Change / Remove; in Brazil the choice Card or Pix Automático; a pending state while a SetupIntent completes; failed set-up.
- **Post-pay toggle:** what it changes (customers pay at the truck, Pay at Hatch on, the fee billed monthly), the surcharge when it isn't 0, and that it needs a payment method. (c) countries: always on, with no toggle.
- **Invoices:** month, amount, status (paid / due / failed / retrying), paid date, link to the invoice and PDF.
- **Ledger by month:** the same columns as `billing_usage`, with the pre-order lines on tap.

**Elsewhere:**
- **Trial-ending banner** on the kitchen dashboard and Manage: 7 days, 1 day, ended without a card.
- **Paused banner** on the kitchen dashboard: "Online ordering is paused — {reason}. Walk-up orders still work."
- Customers already see the existing "not taking orders" state and the existing refusal sentences. No new customer words are needed.
- **Words to translate later:** every line above. None has been added to `messages/` yet.

## 13. Files

**New:**
- `lib/billing/rules.ts`, `engine.ts`, `gate.ts`, `processor.ts`, `store-types.ts`, `store.ts`, `memory-store.ts`
- `app/api/cron/billing/route.ts`, `app/api/webhooks/stripe-billing/route.ts`, `app/api/admin/billing/route.ts`
- `app/(app)/admin/billing/page.tsx`, `components/admin/CountryBillingPanel.tsx`
- `scripts/billing-1.cjs` (sweep), `scripts/billing-1-db-read.cjs` and `scripts/billing-1-stripe-test.cjs` (by hand, `operational_read_only`), `scripts/_lp-billing-1.cjs` (the re-pin module, `shared_modules`)
- `supabase/migrations/20261085_billing_1.sql`

**Changed:**
- `lib/payments/capture.ts` (fee at capture), `refund.ts` (fee refunds), `ledger.ts` and `online.ts` (optional fee columns)
- `app/api/menu/[truckId]/route.ts` and `app/api/orders/submit/route.ts` (the gate)
- `components/admin/CountriesTab.tsx` (mounts the panel)
- `vercel.json` (cron), `scripts/harnesses.json`
- the re-pinned harnesses: `scripts/_moved-paths.cjs`, `_order-charges-us.cjs`, `legal-follow-ups.cjs`, `plans-data-model.cjs`, `site-chrome-1.cjs`

## 14. Known limits and follow-ups
- **A truck moved off the trial mid-month by hand.** Admin sets `plan = 'pro'` and clears the end date, so that month bills the full plan fee because no plan history exists. When the operator plan choice is built, keep `trial_expires_at` as the start of billing, or add a `billing_starts_at`.
- **Two captures at the allowance line at the same moment** can under-take, in the truck's favour, by at most one order's share (§3).
- **Pix Automático through Invoicing** is unproven until hand step 1 runs (§5).
- **Several trucks under one owner in different currencies** share one Stripe Customer. Stripe supports a customer billed in several currencies, but this is untested here.
- **`truck_billing.status` is a cache** for Admin. The gate never reads it; it always works the status out from the facts.
- **Manual §81 / §82.11 / §27** need a V16.16 entry for billing-1. I haven't edited the manual in this workstream.

## 15. SQL run (migration `20261085_billing_1.sql`, as committed)

```sql
begin;

alter table public.platform_switches add column if not exists billing_enabled boolean not null default false;
alter table public.platform_switches add column if not exists billing_pause_after_days integer not null default 5;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_switches_billing_pause_days_chk') then
    alter table public.platform_switches add constraint platform_switches_billing_pause_days_chk
      check (billing_pause_after_days between 1 and 60);
  end if;
end $$;

create table if not exists public.country_billing (
  country_code                    text primary key references public.country_settings(country_code) on delete cascade,
  payment_model                   text not null check (payment_model in ('fee_from_payment', 'billed_online', 'billed_at_truck')),
  post_pay_surcharge_bps          integer not null default 0 check (post_pay_surcharge_bps between 0 and 10000),
  post_pay_surcharge_fixed_minor  integer not null default 0 check (post_pay_surcharge_fixed_minor >= 0),
  min_charge_minor                integer not null check (min_charge_minor >= 0),
  updated_at                      timestamptz not null default now(),
  updated_by                      text
);

insert into public.country_billing (country_code, payment_model, min_charge_minor, updated_by)
select cs.country_code,
       case when cs.platform_fee_allowed then 'fee_from_payment' else 'billed_online' end,
       case cs.currency
         when 'GBP' then 500    when 'EUR' then 600    when 'USD' then 700    when 'CAD' then 900
         when 'AUD' then 1000   when 'NZD' then 1100   when 'CHF' then 600    when 'CZK' then 15000
         when 'DKK' then 4500   when 'HUF' then 250000 when 'NOK' then 7000   when 'SEK' then 7000
         when 'PLN' then 2500   when 'RON' then 3000   when 'BRL' then 3500   when 'MXN' then 13000
         when 'JPY' then 1000   when 'SGD' then 900    when 'HKD' then 5000   when 'MYR' then 3000
         when 'AED' then 2500   when 'THB' then 22000
       end,
       'billing-1'
from public.country_settings cs
on conflict (country_code) do nothing;

create or replace function public.country_billing_fee_allowed_guard() returns trigger language plpgsql as $$
begin
  if new.payment_model = 'fee_from_payment'
     and exists (select 1 from public.country_settings cs where cs.country_code = new.country_code and not cs.platform_fee_allowed) then
    raise exception 'country_billing: % cannot take the fee from each payment — Stripe does not allow an application fee there (platform_fee_allowed = false)', new.country_code;
  end if;
  return new;
end $$;
drop trigger if exists country_billing_fee_allowed_guard on public.country_billing;
create trigger country_billing_fee_allowed_guard before insert or update on public.country_billing
  for each row execute function public.country_billing_fee_allowed_guard();

create table if not exists public.operator_billing (
  operator_id         uuid primary key references public.operators(id) on delete cascade,
  stripe_customer_id  text not null unique,
  livemode            boolean not null,
  created_at          timestamptz not null default now()
);

create table if not exists public.truck_billing (
  truck_id                   text primary key references public.trucks(id) on delete cascade,
  post_pay                   boolean not null default false,
  billing_test               boolean not null default false,
  payment_method_state       text not null default 'none' check (payment_method_state in ('none', 'pending', 'valid', 'failed')),
  payment_method_type        text check (payment_method_type is null or payment_method_type in ('card', 'pix', 'sepa_debit')),
  stripe_payment_method_id   text,
  stripe_setup_intent_id     text,
  payment_method_label       text check (payment_method_label is null or length(payment_method_label) <= 80),
  payment_method_updated_at  timestamptz,
  payment_method_livemode    boolean,
  status                     text check (status is null or status in ('trialling', 'active', 'past_due', 'paused')),
  status_reason              text,
  status_changed_at          timestamptz,
  updated_at                 timestamptz not null default now(),
  updated_by                 text
);

create table if not exists public.billing_usage (
  truck_id                 text not null references public.trucks(id) on delete cascade,
  period                   date not null check (extract(day from period) = 1),
  currency                 text not null,
  country_code             text not null,
  payment_model            text not null check (payment_model in ('fee_from_payment', 'billed_online', 'billed_at_truck')),
  post_pay                 boolean not null,
  plan_key                 text not null,
  preorder_count           integer not null default 0 check (preorder_count >= 0),
  counted_online_minor     integer not null default 0 check (counted_online_minor >= 0),
  counted_at_truck_minor   integer not null default 0 check (counted_at_truck_minor >= 0),
  counted_minor            integer not null default 0 check (counted_minor >= 0),
  allowance_minor          integer check (allowance_minor is null or allowance_minor >= 0),
  allowance_used_minor     integer not null default 0 check (allowance_used_minor >= 0),
  fee_bps                  integer not null default 0 check (fee_bps >= 0),
  fee_due_minor            integer not null default 0 check (fee_due_minor >= 0),
  fee_taken_minor          integer not null default 0 check (fee_taken_minor >= 0),
  fee_billed_minor         integer not null default 0 check (fee_billed_minor >= 0),
  plan_fee_minor           integer not null default 0 check (plan_fee_minor >= 0),
  plan_days                integer not null default 0 check (plan_days >= 0),
  period_days              integer not null check (period_days between 28 and 31),
  extra_vans_minor         integer not null default 0 check (extra_vans_minor >= 0),
  surcharge_minor          integer not null default 0 check (surcharge_minor >= 0),
  carried_in_minor         integer not null default 0 check (carried_in_minor >= 0),
  amount_due_minor         integer not null default 0 check (amount_due_minor >= 0),
  charged_minor            integer not null default 0 check (charged_minor >= 0),
  carried_out_minor        integer not null default 0 check (carried_out_minor >= 0),
  min_charge_minor         integer not null default 0 check (min_charge_minor >= 0),
  inputs_digest            text not null,
  state                    text not null default 'open' check (state in ('open', 'invoiced', 'carried', 'nothing')),
  computed_at              timestamptz not null default now(),
  primary key (truck_id, period),
  check (counted_minor = counted_online_minor + counted_at_truck_minor),
  check (amount_due_minor = charged_minor + carried_out_minor)
);

create table if not exists public.billing_usage_orders (
  order_key               uuid primary key,
  truck_id                text not null references public.trucks(id) on delete cascade,
  period                  date not null,
  placed_at               timestamptz not null,
  paid_online             boolean not null,
  food_minor              integer not null check (food_minor >= 0),
  counted_minor           integer not null check (counted_minor >= 0),
  allowance_before_minor  integer not null check (allowance_before_minor >= 0),
  fee_minor               integer not null check (fee_minor >= 0),
  fee_via                 text not null check (fee_via in ('application_fee', 'invoice', 'none')),
  fee_taken_minor         integer not null default 0 check (fee_taken_minor >= 0),
  foreign key (truck_id, period) references public.billing_usage(truck_id, period) on delete cascade
);
create index if not exists billing_usage_orders_period_idx on public.billing_usage_orders (truck_id, period);

create table if not exists public.billing_invoices (
  id                  uuid primary key default gen_random_uuid(),
  truck_id            text not null references public.trucks(id) on delete cascade,
  period              date not null,
  currency            text not null,
  amount_minor        integer not null check (amount_minor > 0),
  livemode            boolean not null,
  stripe_invoice_id   text unique,
  status              text not null default 'creating' check (status in ('creating', 'open', 'paid', 'failed', 'void', 'uncollectible')),
  due_at              timestamptz,
  attempt_count       integer not null default 0,
  last_error          text check (last_error is null or length(last_error) <= 500),
  hosted_invoice_url  text,
  created_at          timestamptz not null default now(),
  finalized_at        timestamptz,
  paid_at             timestamptz,
  updated_at          timestamptz not null default now(),
  unique (truck_id, period),
  foreign key (truck_id, period) references public.billing_usage(truck_id, period)
);
create index if not exists billing_invoices_unpaid_idx on public.billing_invoices (truck_id) where status in ('open', 'failed');

alter table public.country_billing enable row level security;
alter table public.operator_billing enable row level security;
alter table public.truck_billing enable row level security;
alter table public.billing_usage enable row level security;
alter table public.billing_usage_orders enable row level security;
alter table public.billing_invoices enable row level security;
revoke all on public.country_billing, public.operator_billing, public.truck_billing, public.billing_usage,
  public.billing_usage_orders, public.billing_invoices from anon, authenticated, public;
revoke all on function public.country_billing_fee_allowed_guard() from public, anon, authenticated;

commit;
```

Read-only checks run afterwards (all as expected; see §1):

```sql
select billing_enabled, billing_pause_after_days from platform_switches;
select payment_model, count(*) from country_billing group by 1;
select country_code from country_billing where payment_model = 'billed_online' order by 1;
select count(*) from truck_billing; select count(*) from billing_usage; select count(*) from billing_invoices;
```

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks. This removes every billing table, the switch columns and their data.

```sql
-- ⛔ DO NOT RUN unless Dominic asks.
begin;
drop table if exists public.billing_invoices;
drop table if exists public.billing_usage_orders;
drop table if exists public.billing_usage;
drop table if exists public.truck_billing;
drop table if exists public.operator_billing;
drop trigger if exists country_billing_fee_allowed_guard on public.country_billing;
drop table if exists public.country_billing;
drop function if exists public.country_billing_fee_allowed_guard();
alter table public.platform_switches drop constraint if exists platform_switches_billing_pause_days_chk;
alter table public.platform_switches drop column if exists billing_pause_after_days;
alter table public.platform_switches drop column if exists billing_enabled;
commit;
```
The code undo is `git revert 769842b0 3fd1b086` (code and sweep fixes) and `git revert af44ebce` (migration file).
