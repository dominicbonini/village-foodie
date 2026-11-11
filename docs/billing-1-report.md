# billing-1 — HatchGrab charges trucks: plans, the 0.99% and post-pay, built switched off (with your correction)

10 November 2026 · main, local · **not pushed, not deployed**. Commits:
- `af44ebce`: migration 1 (tables)
- `3fd1b086`: code
- `769842b0`: sweep fixes
- `560e0843`: first report
- `86617f10`: correction migration
- `b769d425`: plan history for test trucks
- `19e43458`: correction code
- this report

**In one line:** your correction is built. Plan fees are charged **in advance** and usage **in arrears**. The trial's end and upgrades are charged pro rata at once; downgrades wait for the 1st. Every plan change is recorded in a plan history. The late fee is per country, 0 everywhere. The fee plans for BR/MX/MY/SG/TH are prepared but held back.

**Proof:**
- the billing harness: **131/131**, with mutations proving it can fail;
- the real database, read only: **13/13**;
- the full sweep: **203 of 210 in a clean worktree at my commit; all 7 failures are outside billing (§9)**.

`platform_switches.billing_enabled` is still **false**, so the live app behaves exactly as before. Nothing has run against Stripe yet: this Mac only has the **live** key, so the Stripe test-mode run waits on hand step 1.

**Heads-up:** a second session (languages-world-1) is editing this same working tree and committing to main between my commits. I committed only my own files, by path. The sweep ran in a clean temporary worktree at my last commit, so none of that session's **uncommitted** edits were in it.

---

## 0. Diagnosis (recorded before anything changed — unchanged from the first pass)

- **Billing today.**
  - Plans are data (§81): `plans`, `plan_prices` and `plan_features`.
  - The trial is the `trial` plan plus `trucks.trial_expires_at`.
  - Manage › Billing only displays plans. There is no Stripe Customer, Subscription, Checkout or Invoice code.
  - 🔴 **OBSERVED:** the `trial` plan is flagged `is_internal`. This caught a bug, see §3.
- **The 0.99% is taken nowhere.**
  - `platform_fee_enabled` is false in all 44 countries.
  - `application_fee_amount` was never sent, and refunds never passed `refund_application_fee`.
  - There was no allowance meter.
  - OBSERVED: 17 online charges, with a fee total of 0.
- **Pay at Hatch.** `payAtHatchOn` (the plan flag, true everywhere) hides it in `/api/menu` and refuses it in `/api/orders/submit`. Decision 9 replaces the 2 Nov "trial only" idea.
- **Stripe test-mode access.** None: `STRIPE_SECRET_KEY` classifies as **live** (classified by Next's loader; only the word was printed). Billing therefore uses only `STRIPE_BILLING_TEST_SECRET_KEY` and refuses anything but `sk_test_`.
- **How I read your decisions** (none blocked the build):
  1. **Decision 2 vs the published wording.** Decision 2 charges the fee on every pre-order, including pay-at-the-truck ones. The pricing pages, FAQ, PDF and Terms §4 say "online card orders". They must change before switch-on; I made no change now.
  2. **The plan fee on model (a) trucks.** Model (a) trucks still get the monthly charge for their plan fee. Their card-paid fees are taken from each payment and never invoiced.
  3. ~~Plan fee timing~~ — **settled by your correction:** in advance.
  4. **BR/MX/MY/SG/TH offer only Unlimited today**, so their (b) usage bills nothing until Pay as you go or Pro is switched on (§5).
  5. **Model (a) needs `platformFeeOn(country)` too** (35.an-17). With it off, an (a) country's fees fall to the monthly invoice.
  6. **Terms §4** says billing in advance and a 7-day path. The new section (§11) replaces it.
  7. **Pizzeria Gusto** is `is_customer = true`, so it is billable once billing is on, and its trial ends **31 Dec 2026**. If billing is on then and Gusto has no card, its online ordering pauses. Today nothing changes (§9).

## 1. Your correction, item by item

| # | What you asked | What was built |
|---|---|---|
| 1 | **Plan fees in advance, usage in arrears**: one charge on the 1st = this month's plan (Pro, Unlimited, extra vans) + last month's billed usage + surcharge | The **monthly charge** (`runMonthly`) = this month's plan fee and extra vans + last month's billed fee + last month's post-pay surcharge + anything carried. **One per truck per month** (unique `(truck, month, 'monthly')`). `composeMonth` is gone; it is replaced by `planMonth` (the advance), `usageMonth` (arrears, each order at the plan it was placed under) and `settleCharge` (minimum and carry) in `lib/billing/rules.ts`. |
| 2 | **Trial ends mid-month**: charge the plan for the rest of that month, pro rata, that day; usage from then on, on the next 1st | A **`trial_end` charge**. The trial ends at 23:59:59 local on day D, so the month is billed from day D+1, at floor(plan × days left ÷ days in month). The run is now **hourly**, so it is charged within the hour of the trial's end, in the truck's own zone. Pre-orders after the trial are billed on the next 1st; pre-orders during it never count. Payment-method rules are unchanged. |
| 3 | **Plan changes**: upgrade → pro-rata difference now; downgrade → on the 1st; record plan history | `requestPlanChange`:<br>• **up**: applied at once, plus an **`upgrade` charge** = floor((new − already paid) × days left ÷ days in month), where the change day counts;<br>• **down**: held in `truck_billing.pending_plan_key/_from` until the 1st, then applied by that month's charge. **Nothing is refunded.**<br>**Plan history:** `truck_plan_history`, written by a trigger on `trucks.plan` / `trial_expires_at`. It records only while billing is on (or for a billing-test truck); a failed write never blocks a change. Each pre-order is priced at the plan in force when it was placed, and each month's "already paid" level is what its monthly charge actually charged. |
| 4 | **Late fee**: per country, fixed, local currency, once per invoice, only if still unpaid at the day-5 pause, added to that invoice; 0 everywhere | `country_billing.late_fee_minor`, default **0 in all 44** (OBSERVED). At the pause, `applyLateFees`:<br>• with **0**: records 0 on the invoice and does nothing else (proven);<br>• otherwise: **voids and re-issues that invoice** with a "Late payment fee" line, same charge and same due date (a finalised Stripe invoice cannot take a new line). Once per invoice.<br>Tested with a £3 test value, then at 0. Editable in Admin › Countries › Billing. |
| 5 | **Pay as you go and Pro in BR, MX, MY, SG, TH**: rows ready with `offered = false`, switched on with billing, not before | All 10 rows **already existed** from world-countries-1 at the research prices, with `offered = false` (OBSERVED, unchanged). What stopped them being offered is the world guard (fee plans where Stripe forbids application fees). It now allows an offered fee plan there **only when billing is switched on AND that country bills the fee monthly**, (b) or (c). "Not before" is enforced by the database. The SQL to switch them on is prepared in §10 and **not run**. |
| 6 | Update the terms and reminder-email drafts | §11 and §6 — short, plain English, nothing published |
| 7 | Re-run with the new scenarios; the sweep; Gusto byte-identical | §9 |

**Separate charges, flagged.** "One invoice per truck per month" holds for the monthly charge. The trial-end charge and upgrade differences are separate invoices raised at the time, because you asked for them "that day" and "immediately". Any of them under the country's minimum is carried into the next 1st instead.

## 2. The rules (`lib/billing/rules.ts`, pure — the one source)

- **Who is billed:**
  - only while the switch is on;
  - only in a country with a `country_billing` row;
  - never on demo or tester; the **trial plan is billable once it ends**;
  - only a customer truck, or a billing-test truck.
- **What counts:** every pre-order (`source = 'web'`) in status confirmed, modified, ready or collected, however it was paid. Walk-ups never count. The base is `food_minor`, less the refunded share. Only orders placed outside the trial count.
- **The month:** the calendar month in the truck's own time zone.
- **The fee and allowance:**
  - one allocation over the month's running total (the meter);
  - each order at **the plan in force when it was placed**: its `fee_bps`, and its allowance against the same meter;
  - JPY rounds down, other currencies half-up;
  - the capture path asks the same function.
- **How each order's fee share is collected:** by application fee only if one was actually taken (never invoiced again); otherwise on the next 1st.
- **The monthly charge (the 1st):**
  - this month's plan fee (promo overrides included), plus extra vans;
  - plus last month's billed fee, plus last month's post-pay surcharge (only when not 0);
  - plus the carried amounts;
  - under the country's minimum → **carried** to the next 1st.
- **Mid-month charges:**
  - **trial end**: plan × days left ÷ days in month;
  - **upgrade**: (new − already paid) × days left ÷ days in month;
  - a **downgrade** changes nothing until the 1st and refunds nothing;
  - under the minimum → carried.
- **Status, worked out from the facts:** trialling → paused (trial over, no valid payment method) → past due (an invoice unpaid) → paused (5 days after its due date) → active.
- **Paused means:** online ordering stops. Walk-ups, the kitchen and the account never ask billing.
- **Pay at Hatch:** during the trial, as today. After it, only for a post-pay truck with a valid payment method, not paused.
- **Late fee:** see item 4 above.

## 3. The fee taken from each payment (model (a)) and refunds — unchanged by the correction, except pricing by history
- **Capture:**
  - only when `billingSwitchOn()` is true does capture ask `applicationFeeAtCapture`;
  - the fee goes only to a billable truck past its trial, on (a), not post-pay, where `platformFeeOn(country)` holds, above the allowance, at the plan in force when the order was placed;
  - capture.ts asks `platformFeeOn` again itself;
  - the fee is capped at the captured amount;
  - with no fee, the Stripe call and its idempotency key are byte-identical.
- **Refund:** `refund_application_fee: true` only when the charge's ledger row carries a fee, checked every time. The fee's share is recorded proportionally.
- **Bug caught:** the trial plan is `is_internal`, so "never bill internal plans" would have exempted every trial truck forever. Fixed and pinned.

## 4. Running it (`lib/billing/engine.ts`, `app/api/cron/billing`, `app/api/webhooks/stripe-billing`)

- **Charges** (`billing_charges`): every charge computed — monthly, trial end, upgrade — is a row, unique (truck, month, kind, ref).
- **States:**
  - `invoicing` → `invoiced`;
  - `carried` (under the minimum; consumed by the next monthly charge via `carried_into`);
  - `nothing`.
- **One invoice per charge** (`billing_invoices.charge_id` unique). Stripe idempotency keys come from the charge: `billing:<truck>:<month>:<kind>[:<ref>]`, plus `:late` for a late-fee re-issue.
- **Never twice:**
  - the charge claim is an insert;
  - the invoice claim is an insert;
  - a crash half-way is completed by the next run under the same keys;
  - a usage month is billed by exactly one monthly charge, then frozen;
  - an application-fee order is never invoiced.
- **No payment method:** nothing is claimed; the next run retries. The status is paused.
- **The run** (`runBillingAll`), from `/api/cron/billing` **hourly** at :05, for each candidate truck:
  1. the monthly charge for its current month, once, as soon as that month has started in its zone;
  2. the mid-month charges for this month and the last;
  3. late fees;
  4. the status cache.
  With the switch off: `skipped: switch_off`, nothing touched. (`vercel.json` is committed and takes effect only when you deploy.)
- **Webhook** (platform-account events, `STRIPE_BILLING_WEBHOOK_SECRET`): verify, record, then handle. Paying resumes ordering at once. Live events are recorded and ignored. A voided original after a late-fee re-issue is ignored (`unknown`).
- **Customer:** one per truck owner, found by metadata; `preferred_locales` is the truck's language.

## 5. Payment methods — unchanged
- **Cards everywhere.**
- **Pix Automático in Brazil:** a SetupIntent with `pix.mandate_options` (maximum amount, BRL, monthly), refused outside BRL.
  - ⚠️ Whether Stripe Invoicing charges a Pix mandate automatically is unproven until the test key arrives. The fallback is an off-session PaymentIntent on the mandate.
  - Brazil's own rules schedule Pix charges a few days ahead.
- **SEPA later:** the type is allowed and mandate revocations are handled.

## 6. Trial end and the reminder emails (drafts — not built, not switched on)

**7 days before** — Subject: *Your free trial ends in 7 days*
> Hi {first name},
> Your HatchGrab free trial for {truck name} ends on {date}.
> To keep taking online orders after that, add a card in Manage › Billing{ — or Pix Automático, in Brazil}.
> From {next day} you'll be on {plan} at {price} a month. On that day we charge the rest of {month}: {amount}. After that, the plan is charged on the 1st of each month, in advance.
> Our 0.99% fee on pre-orders{ above {allowance}} is charged on the 1st, for the month before. Walk-up orders are always free.
> Small amounts under {minimum} are carried over to the next month.
> Prefer your customers to pay at the truck? Choose post-pay in Manage › Billing.
> Questions? Just reply.
> The HatchGrab team

**1 day before** — Subject: *Your free trial ends tomorrow*
> Hi {first name},
> Your free trial for {truck name} ends tomorrow.
> {No payment method:} Add a card in Manage › Billing. Without one, online ordering pauses until you do. Walk-up orders and your kitchen screen keep working.
> {Payment method on file:} You're all set. We'll charge {card ending 1234 / Pix Automático} {amount} for the rest of {month}.
> The HatchGrab team

(If the plan after the trial is Pay as you go, the "rest of the month" line drops out: there is no plan fee.)

## 7. Admin (the only UI added)
- **Admin › Countries › Billing:** one row per country with payment model, post-pay surcharge (%, monthly), minimum charge and **late fee** (0 = none). Each row saves on its own. (a) is greyed where Stripe forbids it. The panel shows the switch state but cannot set it.
- **`/admin/billing`:**
  - status now and status if switched on;
  - per truck: usage by month (arrears), **charges** (plan in advance, trial end, upgrades, carried in and out), invoices (late fee shown), plan history;
  - **Preview month** (saves nothing);
  - **Run billing for this truck (test)** and **Change plan (test)**, for billing-test trucks on Stripe test mode only.
- Both screens use only existing Tailwind classes (harness §16), so the public stylesheet is unchanged.

## 8. Not touched (your rules)
- No landing, pricing, customer or operator screen changed.
- No email switched on; no terms published.
- No live Stripe object created; nobody charged.
- No push, no deploy.
- No `.env*` file opened.
- No existing row updated or deleted by any migration.
- Pizzeria Gusto unchanged.

## 9. Proof

| Run | Result |
|---|---|
| `node scripts/billing-1.cjs` (sweep-listed; in-memory store and fake processor, the real rules, engine and gate) | **131 passed, 0 failed** |
| Mutation checks: ignoring what a month was paid at / charging the late fee twice / billing plans in arrears | 1, 1 and 2 failures, as they should; files restored byte for byte |
| `node scripts/billing-1-db-read.cjs` (by hand; the real database store and gate, **reads only**) | **13 passed, 0 failed.** The 8 billing tables have the same row counts before and after |
| `node scripts/billing-1-stripe-test.cjs` (by hand; Stripe **test mode**; now also the late-fee void and re-issue) | **Not run:** no test key (exit 2, by design). Hand step 1 |
| `npx tsc --noEmit`; eslint on the billing files | clean; clean |
| Full sweep, in a clean worktree at `19e43458` | **210 run · 203 passed · 7 failed** — none from billing; see below |

**203 of 210 passed; the 7 failures are not billing's.** Run in a clean worktree at `19e43458`. Each of the 7 was traced:
- **4 come from the other session's commits** (languages-world-1, the Spanish variants): `europe-languages-1` (de-CH "ß"), `cwv-2` (the Greek arrow / "no other language file changed"), `contact-1` (`messages/ns/es-CL/…` changed under a byte-identity pin) and `site-chrome-1` (`git show 7e1effa7^:messages/es-AR.json`, a file that commit added).
  - Proof: all four **pass at `560e0843`** (my first report, before those commits) and **still fail with my three correction commits reverted**.
  - `europe-languages-1`, `cwv-2` and `contact-1` already fail at `6baad30f`; `site-chrome-1` from `d7d6f946`.
- **3 need a `.next` build**, which a fresh worktree doesn't have (`event-types-render`, `pending-card-render`, `pending-card-buttons`: "no .next/static"). In the main tree, which has one, they pass (276/276 and 678/678; `event-types-render` passed on rerun after one flaky run, the class 35.ae names).
- **`billing-1.cjs`: 131/131 inside the sweep.**

I didn't touch the other session's files or harnesses. Its four failures are for that workstream to settle.

**What `billing-1.cjs` covers:**
1. **Switch off:** the gate and the capture fee read nothing but the switch. The monthly charge, mid-month charges, late fees, plan changes and the hourly run all skip. Nothing is written or sent. A failure in billing's own reads never pauses a truck.
2. **Who is billed:** test trucks only with `billing_test`; demo and tester never; **the trial plan is**; a country with no row is never billed.
3. **GB (a): the 1st's charge = November's Pro £29 in advance + October's fee £4.95 in arrears = £33.95.**
   - October's £3,000 online + £1,500 at the truck + £2,000 online, with walk-up, cancelled, pending and rejected orders ignored;
   - the 1980 taken by application fee at capture is never billed again;
   - the lines read "Pro plan — 2026-11" and "HatchGrab fee on pre-orders — 2026-10";
   - October's usage is frozen as billed.
4. **Refunds:** counted value and fee taken are net of the refund. `refund_application_fee` is sent only when the charge had a fee.
5. **BR on Pay as you go:**
   - 1 Nov: R$0 plan + R$1.49 → carried;
   - 1 Dec: R$39.60 + R$1.49 carried = **R$41.09**, and the carried charge points at it;
   - **MX on Pay as you go:** 0.99% of MX$20,000 = **MX$198.00** on 1 Nov;
   - Pix set-up, refused outside BRL; Unlimited R$149 in advance on Pix;
   - **the BR/MX/MY/SG/TH guard** (construct).
6. **MX trial ends 15 Oct:**
   - 1 Oct: nothing (in the trial); 15 Oct: nothing yet;
   - **the hour after the trial ends: Unlimited 16/31 days = MX$438.19 invoiced**, "from the end of your free trial";
   - the next hour: `already`;
   - 1 Nov: November's MX$849 in advance; October's usage counts only the post-trial pre-order.
7. **(c) country:** no card → paused, no Pay at Hatch; card → active, Pay at Hatch on; October's €9.90 billed on 1 Nov.
8. **FR post-pay:** no application fee. 1 Nov: Pro €29 + October's fee €9.90 + October's surcharge €26.00 = **€64.90**. A surcharge of 0 is not applied. Not post-pay → no Pay at Hatch after the trial.
9. **JPY:** ¥14 (rounded down) carried; then ¥1,188 + ¥14 = **¥1,202**.
10. **Trial:**
    - trialling, no card needed;
    - over with no card → paused; card added → resumed;
    - December (all trial) → nothing;
    - a trial ending in the month's last second leaves 0 days;
    - a plan change during the trial → `in_trial`;
    - the dashboard and KDS never import billing.
11. **Upgrade and downgrade** (Pay as you go truck):
    - 11 Nov → Pro: **£19.33 now** (20/30 days); the history holds the before-state and the change;
    - 21 Nov → Unlimited: **£13.33 more** (10/30);
    - 25 Nov → Pay as you go: **held until 1 Dec**, still Unlimited, nothing refunded;
    - 1 Dec: downgrade applied, £0 in advance; November's usage at each order's own plan (Pay as you go 990, Pro 0, Unlimited 0) → £9.90;
    - 🔴 10 Dec → Pro again: **£20.58** (22/31), from what December was *paid*, £0, not the old Unlimited;
    - a downgrade that cannot be charged yet (no card) keeps waiting.
12. **Failed payment and the late fee:**
    - November's Pro is invoiced in advance → declined → day 4 past due, no fee → **day 5 paused**;
    - **test late fee £3 → the invoice voided and re-issued at £32.00** with a "Late payment fee" line and the same due date; still paused; once only; the voided original's webhook is ignored;
    - new card, paid → **resumed**, active;
    - **at the real setting, 0:** paused, recorded as 0, nothing added or re-issued.
12b. **Never twice:**
    - a crash half-way, then completed under the same key; a third run is `already`; the next day's hourly run doesn't re-bill;
    - one invoice per charge; a billed usage month is never recomputed;
    - a live processor is refused, with nothing claimed;
    - no card → nothing claimed;
    - test cards only on test trucks.
13. **The key:** test only; `STRIPE_SECRET_KEY` is never read; truck language → Stripe locale.
14. **Constructs:** menu, submit and capture behind the gate; the gate asks the switch first; 35.an-17; the cron is **hourly**; no truck named.
15. **Migrations:**
    - no protected-table update or delete; no truck named;
    - the correction refuses non-empty billing tables;
    - the late fee defaults to 0;
    - charges are unique and there is one invoice per charge;
    - the history trigger is gated (switch, or test truck) and fail-safe;
    - all 22 currencies have a minimum.
16. **Admin's classes:** all already in the code.

**Pizzeria Gusto, byte-identical.**
- Against the real database: the real gate on Gusto answers exactly "billing off", and the real capture fee is none (`billing-1-db-read.cjs`).
- With the switch off, the menu, submit and capture paths are unchanged in behaviour by construction; harness §1 and §14 prove the switch is asked first. The trigger records nothing while billing is off: OBSERVED `truck_plan_history` has 0 rows.
- No billing table has a Gusto row.
- The older "byte-identical since …" pins (loyalty-1, cwv-2, costs-accounts-1) still compare every byte of the order and payment paths outside billing-1's named edits.

**Real data (read only):** `test-truck-us`'s 1 November as if billed: Pay as you go $0 + October's fee 69¢ (4 of 5 pre-orders counted) → carried under the $7 minimum.

## 10. Hand steps for you, in order
1. **A Stripe TEST key for billing.**
   - Stripe Dashboard → **Test mode** → Developers → API keys → copy the **Secret key** (`sk_test_…`).
   - Add it to `.env.local` as `STRIPE_BILLING_TEST_SECRET_KEY=sk_test_…`. Never in chat.
   - Then run `node scripts/billing-1-stripe-test.cjs`. It covers GBP, EUR, BRL, MXN and JPY, the declining → good card path, the late-fee re-issue, idempotency and the Pix set-up.
2. **Pix (test mode first):**
   - Settings → Payments → **Payment methods** (the platform's configuration) → **Pix** → **Turn on**.
   - If Pix Automático isn't offered, or step 1's Pix line fails "not activated", choose **Request access** there or ask Stripe support.
   - Live later.
3. **Billing settings:**
   - Settings → Billing → **Subscriptions and emails** / Manage failed payments:
     - **Smart Retries** on (e.g. 4 retries within 2 weeks);
     - if all retries fail → **leave the invoice past due**;
     - **Send emails when card payments fail**, **Send finalized invoices** and **Successful payments** on.
   - Settings → **Emails** → **Add a custom domain** hatchgrab.com, and add its DNS records.
   - Settings → Business → **Public details**: support email hello@hatchgrab.com.
   - **Branding:** logo and colour.
4. **The billing webhook:**
   - Developers → Webhooks → **Add endpoint** → `https://www.hatchgrab.com/api/webhooks/stripe-billing` → **Events on your account**.
   - Events: `invoice.finalized`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_method.detached`, `mandate.updated`.
   - Its signing secret goes into Vercel as `STRIPE_BILLING_WEBHOOK_SECRET` when you next deploy.
5. **Wise EUR and USD payout accounts:**
   - Settings → Business → **Bank accounts and currencies** → **Add bank account** → **EUR** → the Wise IBAN and BIC. Repeat for **USD**.
   - This covers HatchGrab's own balance only, not the trucks' Connect payouts. Other currencies still convert.
6. **The day you switch billing on (a later decision, in this order):**
   - your approved operator screens (§12);
   - the pricing pages, FAQ and PDF wording;
   - publish the terms (§11);
   - the live key in `lib/billing/processor.ts`;
   - `platform_fee_enabled` per (a) country;
   - the reminder emails;
   - a migration setting `billing_enabled = true`;
   - **then** Pay as you go and Pro in BR, MX, MY, SG, TH, prepared below and **not run**. The guard refuses this until billing is on.
   - Mind Gusto's 31 December trial end.

   ```sql
   -- ⏸ PREPARED, NOT RUN — the switch-on day only, AFTER billing_enabled = true (the world guard refuses it before).
   update public.plan_prices set offered = true
    where country_code in ('BR', 'MX', 'MY', 'SG', 'TH') and plan_key in ('payg', 'pro');
   ```
   It updates `plan_prices`, so it is a migration you approve at the time (`--approved-by-dominic`). Whether those countries' trial-end plan stays Unlimited is your decision then (`plan_prices.is_trial_end`).

## 11. Terms — one new section (draft, short plain English; not published or translated)

> **Paying HatchGrab**
>
> **What you pay.** Your plan's monthly fee, and our fee on pre-orders, in your local currency, as shown for your country on our pricing page. Walk-up orders are free.
>
> **Our fee on pre-orders.** A percentage of the food value of every pre-order placed through HatchGrab, above any amount your plan includes, whether your customer pays online or at the truck. It doesn't apply to tax, tips, service fees or surcharges, or to cancelled or rejected orders. If you refund a card payment, our fee goes down in proportion.
>
> **When we charge.**
> - **Plan fees are charged in advance**, on the 1st of each month. When your free trial ends, we charge the rest of that month on the day it ends.
> - **Our fee on pre-orders is charged in arrears**, on the 1st, for the month before. Where your country allows it, we take it from each online card payment instead.
> - **Upgrading?** We charge the difference for the rest of the month straight away.
> - **Downgrading?** It takes effect on the 1st of next month. We don't refund the current month.
>
> **Payment method.** You need a card on file when your free trial ends (or Pix Automático in Brazil). You authorise us to charge it automatically for the amounts above. Without one, online ordering pauses until you add one.
>
> **Small amounts.** If a charge is below your country's minimum, we carry it over and add it to the next 1st.
>
> **Post-pay.** You can let your customers pay at the truck. We then bill our fee monthly. Post-pay needs a payment method on file, and may carry a charge shown for your country.
>
> **Late payment.** If a payment fails, we retry and email you. If it's still unpaid 5 days later, online ordering pauses until it's paid. Walk-ups, your kitchen screen and your account keep working. Where your country shows a late payment fee, we add it once to that bill.
>
> **Changes.** We'll give you at least 30 days' notice of any change to our prices or fees.

(The 30 days is my placeholder; check it against the rest of your terms.)

## 12. What the operator screens will need (for your mockup)
- **Trialling:**
  - days left and the end date;
  - the plan after the trial and its price;
  - **what will be charged on the trial's last day** (the rest of that month);
  - "Add a card before {date}"; the post-pay choice.
- **Active:**
  - plan and price (with promo and its end date);
  - **next charge on the 1st:** next month's plan (in advance) + this month's fee so far (counted pre-orders, online and at the truck, allowance used, fee taken from payments, fee to be billed) + surcharge + carried; or "under {minimum} — carried".
- **Change plan:**
  - up: "You'll be charged {difference} now for the rest of {month}";
  - down: "Takes effect on 1 {month}; you keep {plan} until then";
  - a pending downgrade, with a way to cancel it (not built yet: setting the plan back to the current one clears it);
  - during the trial: how a truck pre-chooses its plan. **This is still to design**; the engine answers `in_trial`.
- **Past due:**
  - amount and failure reason; "We'll retry";
  - **online ordering pauses on {due + 5 days}**;
  - **"A late fee of {fee} is added if it's still unpaid then"** (only when the fee is not 0);
  - Update card; Pay now.
- **Paused:** why (unpaid, with amount and late fee if any; or no payment method); what still works; resumes as soon as paid.
- **Payment method:** brand •••• last four, or Pix Automático; Change and Remove; a pending state.
- **Post-pay toggle:** what it changes, the surcharge when not 0, and that it needs a payment method.
- **Invoices:** month, kind (monthly / end of trial / upgrade), amount (late fee shown), status, link.
- **Usage by month:** the ledger columns, with the pre-order lines on tap.
- **Banners:** trial ending (7 days, 1 day, ended without a card); paused (kitchen dashboard).
- Customers see only the existing "not taking orders" words. No new customer words are needed. Nothing has been added to `messages/` yet.

## 13. Files
- **New:**
  - `lib/billing/{rules,engine,gate,processor,store-types,store,memory-store}.ts`
  - `app/api/{cron/billing,webhooks/stripe-billing,admin/billing}/route.ts`
  - `app/(app)/admin/billing/page.tsx`, `components/admin/CountryBillingPanel.tsx`
  - `scripts/billing-1.cjs`, `billing-1-db-read.cjs`, `billing-1-stripe-test.cjs`, `_lp-billing-1.cjs`
  - migrations `20261085`, `20261086`, `20261087`
- **Changed:**
  - `lib/payments/{capture,refund,ledger,online}.ts`
  - the menu and submit routes, `components/admin/CountriesTab.tsx`, `vercel.json`, `scripts/harnesses.json`
  - the re-pinned harnesses `_moved-paths.cjs`, `_order-charges-us.cjs`, `legal-follow-ups.cjs`, `plans-data-model.cjs`, `site-chrome-1.cjs` (first pass, §9 of the first report's fixes, still in force)

## 14. Known limits and follow-ups
- **The 1st's downgrade is recorded when that hour's run applies it.** Orders between local midnight and that run (under an hour) are priced at the old plan's rate.
- **Extra vans** are charged in advance on the 1st. A van added mid-month is not charged pro rata.
- **Two captures at the allowance line at the same moment** can under-take, in the truck's favour, by at most one order's share.
- **Pix Automático through Invoicing** is unproven until hand step 1.
- **A trialling truck pre-choosing its plan** is not designed yet (§12).
- **Turning billing off again** after BR/MX/… fee plans are offered is not refused by the database (on purpose: you can always switch it off in an emergency). Those plans would then be offered with nothing collecting their fee.
- **The manual** (§27, §81, §82.11) needs a V16.16 entry. I haven't edited it in this workstream.
- **`truck_billing.status` is a cache for Admin**; the gate always works the status out from the facts.

## 15. SQL run (all three migrations, as committed, each run by `scripts/db-migrate.cjs` as one transaction, no error)

### Migration 1 — `20261085_billing_1.sql` (run 10 Nov, first pass; header comments omitted here)

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


### Migration 2 — `20261086_billing_1_correction.sql` (run 10 Nov, the correction)

```sql
-- supabase/migrations/20261086_billing_1_correction.sql — billing-1 correction (10 November 2026; docs/billing-1-report.md).
-- Dominic's correction: plan fees IN ADVANCE, usage IN ARREARS; the trial's end and upgrades charged pro rata at once, downgrades on
-- the 1st; plan history; a per-country late-payment fee (0 everywhere); Pay as you go / Pro prepared in BR, MX, MY, SG, TH.
--
--   • billing_charges (NEW)        — every charge HatchGrab computes for a truck: 'monthly' (on the 1st: this month's plan fee and
--                                    extra vans in advance + last month's billed usage + surcharge + anything carried), 'trial_end'
--                                    (the plan fee for the rest of the month the trial ends in) and 'upgrade' (the pro-rata
--                                    difference for the rest of the month). Unique (truck, month, kind, ref): a monthly charge once
--                                    per truck per month; each trial end / upgrade once. Under the minimum → carried (and later
--                                    consumed by one monthly charge: carried_into).
--   • billing_usage                — becomes the USAGE ledger only (the plan, carry and charge columns move to billing_charges);
--                                    state 'open' until a monthly charge bills it ('billed', charge_id).
--   • billing_invoices             — one per CHARGE (charge_id, unique) instead of one per month; + late_fee_minor (null = not yet
--                                    decided; 0 = decided, none) and replaced_stripe_invoice_id (a late fee re-issues the invoice).
--   • country_billing.late_fee_minor — a fixed late-payment fee in the local currency, once per invoice, only if it is still unpaid
--                                    when online ordering pauses. DEFAULT 0 = NONE ANYWHERE (Dominic: "set it to 0 in every country").
--   • truck_billing.pending_plan_key / pending_plan_from — a downgrade waiting for the 1st.
--   • truck_plan_history (NEW)     — every change of trucks.plan / trucks.trial_expires_at, recorded by a trigger ONLY WHILE BILLING
--                                    IS SWITCHED ON (before that nothing is billed, so nothing needs a history). The first change also
--                                    records the state before it (changed_at -infinity). A failure to record never blocks the change.
--   • plan_prices_world_guard      — an OFFERED plan that charges a fee where Stripe forbids application fees is now allowed ONLY when
--                                    billing is switched on AND that country bills the fee monthly (country_billing (b) or (c)). So
--                                    Pay as you go and Pro in BR, MX, MY, SG, TH — their rows already exist with offered = false
--                                    (OBSERVED 10 November) — can be switched on together with billing, and not before.
-- 🔴 NO ROW OF ANY EXISTING TABLE IS UPDATED OR DELETED; nothing is inserted. The billing tables being restructured are EMPTY — the
-- first block refuses to run otherwise. The new trigger on trucks does nothing while platform_switches.billing_enabled is false.

begin;

do $$
begin
  if exists (select 1 from public.billing_invoices) or exists (select 1 from public.billing_usage) or exists (select 1 from public.billing_usage_orders) then
    raise exception 'billing-1 correction: the billing tables are not empty — stop and look before restructuring them';
  end if;
end $$;

-- ── the late-payment fee, 0 everywhere ───────────────────────────────────────────────────────────────────────────────
alter table public.country_billing add column if not exists late_fee_minor integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'country_billing_late_fee_minor_check') then
    alter table public.country_billing add constraint country_billing_late_fee_minor_check check (late_fee_minor >= 0);
  end if;
end $$;

-- ── a downgrade waits for the 1st ────────────────────────────────────────────────────────────────────────────────────
alter table public.truck_billing add column if not exists pending_plan_key text references public.plans(key);
alter table public.truck_billing add column if not exists pending_plan_from date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'truck_billing_pending_plan_chk') then
    alter table public.truck_billing add constraint truck_billing_pending_plan_chk
      check ((pending_plan_key is null) = (pending_plan_from is null) and (pending_plan_from is null or extract(day from pending_plan_from) = 1));
  end if;
end $$;

-- ── charges ──────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.billing_charges (
  id                 uuid primary key default gen_random_uuid(),
  truck_id           text not null references public.trucks(id) on delete cascade,
  period             date not null check (extract(day from period) = 1),          -- the month the charge is FOR
  kind               text not null check (kind in ('monthly', 'trial_end', 'upgrade')),
  ref                text not null default '',                                     -- '' for monthly; the event for the others
  currency           text not null,
  plan_key           text not null,
  from_plan_key      text,
  plan_minor         integer not null default 0 check (plan_minor >= 0),
  plan_days          integer not null default 0 check (plan_days >= 0),
  period_days        integer not null check (period_days between 28 and 31),
  vans_minor         integer not null default 0 check (vans_minor >= 0),
  usage_period       date check (usage_period is null or extract(day from usage_period) = 1),
  usage_fee_minor    integer not null default 0 check (usage_fee_minor >= 0),
  surcharge_minor    integer not null default 0 check (surcharge_minor >= 0),
  carried_in_minor   integer not null default 0 check (carried_in_minor >= 0),
  amount_due_minor   integer not null default 0 check (amount_due_minor >= 0),
  charged_minor      integer not null default 0 check (charged_minor >= 0),
  carried_out_minor  integer not null default 0 check (carried_out_minor >= 0),
  carried_into       uuid references public.billing_charges(id),
  min_charge_minor   integer not null default 0 check (min_charge_minor >= 0),
  -- 'invoicing' (claimed; the invoice not finished) · 'invoiced' · 'carried' (under the minimum) · 'nothing' (0 owed)
  state              text not null check (state in ('invoicing', 'invoiced', 'carried', 'nothing')),
  inputs_digest      text not null,
  computed_at        timestamptz not null default now(),
  unique (truck_id, period, kind, ref),
  check (amount_due_minor = charged_minor + carried_out_minor),
  check ((kind = 'monthly') = (ref = ''))
);
create index if not exists billing_charges_carried_idx on public.billing_charges (truck_id) where state = 'carried' and carried_into is null;

-- ── billing_usage: the usage ledger only ─────────────────────────────────────────────────────────────────────────────
alter table public.billing_invoices drop constraint if exists billing_invoices_truck_id_period_fkey;
alter table public.billing_invoices drop constraint if exists billing_invoices_truck_id_period_key;
alter table public.billing_usage drop constraint if exists billing_usage_check1;
alter table public.billing_usage drop constraint if exists billing_usage_state_check;
alter table public.billing_usage
  drop column if exists plan_fee_minor, drop column if exists plan_days, drop column if exists extra_vans_minor,
  drop column if exists carried_in_minor, drop column if exists amount_due_minor, drop column if exists charged_minor,
  drop column if exists carried_out_minor, drop column if exists min_charge_minor;
alter table public.billing_usage add column if not exists charge_id uuid references public.billing_charges(id);
alter table public.billing_usage add constraint billing_usage_state_check check (state in ('open', 'billed'));
alter table public.billing_usage add constraint billing_usage_billed_chk check ((state = 'billed') = (charge_id is not null));
alter table public.billing_usage_orders add column if not exists plan_key text;
alter table public.billing_usage_orders add column if not exists fee_bps integer not null default 0 check (fee_bps >= 0);

-- ── billing_invoices: one per charge ─────────────────────────────────────────────────────────────────────────────────
alter table public.billing_invoices add column if not exists charge_id uuid not null unique references public.billing_charges(id);
alter table public.billing_invoices add column if not exists late_fee_minor integer check (late_fee_minor is null or late_fee_minor >= 0);
alter table public.billing_invoices add column if not exists replaced_stripe_invoice_id text;

-- ── plan history ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.truck_plan_history (
  id                bigserial primary key,
  truck_id          text not null references public.trucks(id) on delete cascade,
  plan_key          text not null,
  trial_expires_at  timestamptz,
  changed_at        timestamptz not null,
  source            text not null check (source in ('before_first_change', 'insert', 'update'))
);
create index if not exists truck_plan_history_truck_idx on public.truck_plan_history (truck_id, changed_at);

create or replace function public.trucks_record_plan_history() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Nothing is recorded while billing is switched off (nothing is billed, so nothing needs a history).
  if not coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false) then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'insert');
    elsif new.plan is distinct from old.plan or new.trial_expires_at is distinct from old.trial_expires_at then
      if not exists (select 1 from public.truck_plan_history h where h.truck_id = new.id) then
        insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
          values (old.id, old.plan, old.trial_expires_at, '-infinity', 'before_first_change');
      end if;
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'update');
    end if;
  exception when others then
    -- 🔴 a failure to record never blocks a plan change
    raise warning 'truck_plan_history: could not record % for %: %', tg_op, new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.trucks_record_plan_history() from public, anon, authenticated;
drop trigger if exists trucks_record_plan_history on public.trucks;
create trigger trucks_record_plan_history after insert or update of plan, trial_expires_at on public.trucks
  for each row execute function public.trucks_record_plan_history();

-- ── the world guard: fee plans where Stripe forbids an application fee — only with billing on and the fee billed monthly ─
create or replace function public.plan_prices_world_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare bad text;
begin
  -- a) an offered row that charges a fee where HatchGrab may not take one FROM THE PAYMENT — unless billing is switched on and
  --    that country bills the fee monthly instead (billing-1: country_billing (b) or (c))
  select string_agg(pp.country_code || ' (' || pp.plan_key || ')', ', ' order by pp.country_code, pp.plan_key) into bad
    from public.plan_prices pp join public.country_settings cs on cs.country_code = pp.country_code
   where pp.offered and pp.fee_bps > 0 and not cs.platform_fee_allowed
     and not (
       coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false)
       and exists (select 1 from public.country_billing cb where cb.country_code = pp.country_code and cb.payment_model <> 'fee_from_payment'));
  if bad is not null then
    raise exception 'plan_prices: these offered plans charge a platform fee where HatchGrab may not take one: %', bad
      using errcode = 'check_violation';
  end if;
  -- b) a switched-on country whose trial-end plan is not offered there
  select string_agg(cs.country_code, ', ' order by cs.country_code) into bad
    from public.country_settings cs
   where cs.enabled
     and not exists (
       select 1 from public.plan_prices pp
        where pp.country_code = cs.country_code and pp.offered
          and pp.plan_key = coalesce(
                (select t.plan_key from public.plan_prices t where t.country_code = cs.country_code and t.is_trial_end),
                (select p.key from public.plans p where p.is_expiry_fallback)));
  if bad is not null then
    raise exception 'country_settings: the plan a finished trial drops to is not offered in: %', bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.plan_prices_world_guard() from public, anon, authenticated;

-- ── security ─────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.billing_charges enable row level security;
alter table public.truck_plan_history enable row level security;
revoke all on public.billing_charges, public.truck_plan_history from anon, authenticated, public;
revoke all on sequence public.truck_plan_history_id_seq from anon, authenticated, public;

commit;

-- ── read-only checks after it runs ───────────────────────────────────────────────────────────────────────────────────
-- select count(*) filter (where late_fee_minor = 0), count(*) from country_billing;                   -- 44, 44
-- select tgname, tgenabled from pg_trigger where tgname = 'trucks_record_plan_history';
-- select count(*) from truck_plan_history; select count(*) from billing_charges;                    -- 0, 0
-- select plan_key, country_code, offered from plan_prices where country_code in ('BR','MX','MY','SG','TH') and plan_key <> 'unlimited';  -- all false
```

### Migration 3 — `20261087_billing_1_history_test_trucks.sql` (run 10 Nov)

```sql
-- supabase/migrations/20261087_billing_1_history_test_trucks.sql — billing-1 correction (10 November 2026; docs/billing-1-report.md).
-- The plan-history trigger (20261086) records only while billing is switched on. This lets it ALSO record for a billing TEST truck
-- (truck_billing.billing_test = true), so Admin's test tools (/admin/billing "Change plan (test)") price a mid-month change correctly
-- while the switch is off. No other truck is affected; nothing is updated, deleted or inserted by this file.
begin;

create or replace function public.trucks_record_plan_history() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Nothing is recorded while billing is switched off (nothing is billed, so nothing needs a history) — except for a billing
  -- TEST truck, which Admin's test tools bill on Stripe test mode.
  if not coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false)
     and not exists (select 1 from public.truck_billing tb where tb.truck_id = new.id and tb.billing_test) then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'insert');
    elsif new.plan is distinct from old.plan or new.trial_expires_at is distinct from old.trial_expires_at then
      if not exists (select 1 from public.truck_plan_history h where h.truck_id = new.id) then
        insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
          values (old.id, old.plan, old.trial_expires_at, '-infinity', 'before_first_change');
      end if;
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'update');
    end if;
  exception when others then
    -- 🔴 a failure to record never blocks a plan change
    raise warning 'truck_plan_history: could not record % for %: %', tg_op, new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.trucks_record_plan_history() from public, anon, authenticated;

commit;

-- read-only check: select position('billing_test' in prosrc) > 0 from pg_proc where proname = 'trucks_record_plan_history';   -- true
```

Read-only checks run afterwards (all as expected):

```sql
-- after 20261085
select billing_enabled, billing_pause_after_days from platform_switches;                       -- false, 5
select payment_model, count(*) from country_billing group by 1;                                -- fee_from_payment 39, billed_online 5
select count(*) from truck_billing; select count(*) from billing_usage; select count(*) from billing_invoices;   -- 0 0 0
-- before 20261086
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, offered, is_trial_end from plan_prices where country_code in ('BR','MX','MY','SG','TH') order by country_code, plan_key;
select conrelid::regclass t, conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('public.billing_invoices'::regclass, 'public.billing_usage'::regclass, 'public.truck_billing'::regclass) order by 1,2;
-- after 20261086: late fee 0 in 44/44; the trigger present; 0 history rows; 0 charges; the 10 fee plans offered = false;
-- billing_usage / billing_invoices columns as designed; RLS on, 0 grants; the guard reads billing_enabled
select (select count(*) filter (where late_fee_minor = 0) || '/' || count(*) from country_billing) late0,
 (select string_agg(tgname||':'||tgenabled::text, ',') from pg_trigger where tgname='trucks_record_plan_history') trg,
 (select count(*) from truck_plan_history) hist, (select count(*) from billing_charges) charges,
 (select string_agg(plan_key||'@'||country_code||'='||offered, ' ' order by country_code, plan_key) from plan_prices where country_code in ('BR','MX','MY','SG','TH') and plan_key <> 'unlimited') fee_plans,
 (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='billing_usage') usage_cols,
 (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='billing_invoices' and column_name in ('charge_id','late_fee_minor','replaced_stripe_invoice_id')) inv_cols,
 (select relrowsecurity from pg_class where relname='billing_charges') rls_c, (select relrowsecurity from pg_class where relname='truck_plan_history') rls_h,
 (select count(*) from information_schema.role_table_grants where table_name in ('billing_charges','truck_plan_history') and grantee in ('anon','authenticated')) grants,
 (select position('billing_enabled' in prosrc) > 0 from pg_proc where proname='plan_prices_world_guard') guard_new;
-- after 20261087
select position('billing_test' in prosrc) > 0 has_test, position('billing_enabled' in prosrc) > 0 has_switch from pg_proc where proname = 'trucks_record_plan_history';   -- true, true
```

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks. This removes every billing table, the plan history and its trigger, and the switch columns, and puts the world guard back as it was before billing-1.

```sql
-- ⛔ DO NOT RUN unless Dominic asks.
begin;
drop trigger if exists trucks_record_plan_history on public.trucks;
drop function if exists public.trucks_record_plan_history();
drop table if exists public.truck_plan_history;
drop table if exists public.billing_invoices;
drop table if exists public.billing_usage_orders;
drop table if exists public.billing_usage;
drop table if exists public.billing_charges;
drop table if exists public.truck_billing;
drop table if exists public.operator_billing;
drop trigger if exists country_billing_fee_allowed_guard on public.country_billing;
drop table if exists public.country_billing;
drop function if exists public.country_billing_fee_allowed_guard();
alter table public.platform_switches drop constraint if exists platform_switches_billing_pause_days_chk;
alter table public.platform_switches drop column if exists billing_pause_after_days;
alter table public.platform_switches drop column if exists billing_enabled;
-- then re-run the plan_prices_world_guard function body from supabase/migrations/20261054_world_countries_1_schema.sql (the
-- version without the billing exception) — the guarded query above refers to tables this block drops.
commit;
```
The code undo is reverting the billing-1 commits: `19e43458 b769d425 86617f10 769842b0 3fd1b086 af44ebce` (the migrations' files and the code).
