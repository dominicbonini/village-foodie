# billing-2 — the Billing screens, notices and emails (behind the billing switch)

11 November 2026 · main, local · **not pushed, not deployed** · `billing_enabled` is still **false**.

Commits:
- `a87862cb` migration 20261088
- `d7bea4cd` migration 20261089
- `02d13209` the build
- `e41e86a4` the re-pin widening
- `2d73188b` two harness re-pins
- `c08f0d65` back-translations in 36 bases
- the language-phase-1d2 named-change record
- this report

## Summary

**Built:** Manage › Billing (eight states), Change plan, the five notices and the seven emails. All of it is in en-GB plus **36 language bases**. You only see it while billing is on or on a `billing_test` truck; every other truck, Pizzeria Gusto included, keeps today's tab with no notice and no email.

The pause rule is now **5 full days after the failure day**. Online ordering pauses at **00:00 truck time on the 7th day**, and the suspension-warning date is the pause date + 6.

**Proof:**
- billing-2: **72/72**;
- billing-1: **131/131**, re-pinned to the new rule;
- read-only database proof: **16/16**;
- **16 screenshots** in `docs/billing-2/`, taken on localhost in WebKit;
- translation-check: **0 structural** in all 36 bases;
- messages-parity: **1,001,306 / 0 failed**;
- the right-to-left check: **111/111**;
- full sweep: **211 run · 187 passed · 24 failed** at first. 4 were billing-2's and are fixed; the other **20 fail identically before billing-2** (§8).

---

## 0 · Flags and readings (nothing contradicted, so nothing stopped)

1. **The prompt arrived in two parts.** The first copy stopped mid-sentence in item 5 ("…to the same tone (and"). I flagged it; the full prompt arrived straight after, and I built from that one.
2. **iOS (App Store 3.1.1, manual §40) — I applied the manual's existing rule.** The rule is "facts about the product are permitted; instructions to buy are not", so inside the iOS app:
   - no "Add card", "Change", "Update card", "Pay {amount}", "Use a different card", "Pay now" or "Change plan" button;
   - no instruction sentence ("Add one to keep taking online orders…", "Update your card by…");
   - **no billing notice** at all, because each notice is one sentence that carries an instruction;
   - **still shown:** the plan, dates, amounts, the invoices table, Paid / Unpaid / Overdue, and "Online ordering is paused".
   - Android and the web get everything. If you want something different on iOS, say so; it is the single predicate `purchaseCtaAllowed()`.
3. **"How customers pay for pre-orders" writes billing-1's `truck_billing.post_pay`.** No pay-at-the-truck setting for pre-orders existed before this work: Pay at Hatch is the plan's to allow, and `trucks.online_payments_paused_at` is the kitchen's temporary card pause, not a mode. So no second setting was created.
   - With billing on, "At the truck, when they collect" now means it: that truck's customers are **not offered card payment** online, and the order page shows only pay-at-the-truck.
   - "Online" is hidden where the country's model is (c).
4. **Screenshots: on localhost, with the real components and fixture data.** No agent has a Manage sign-in for a test truck (manual 35.af), so the page can't be opened as an owner. `scripts/billing-2-screens.cjs` mounts the **real** `BillingScreen` with the real providers on a localhost server and photographs it in WebKit (Safari's engine). Every screen's data comes from the **real** engine and view for a `billing_test` truck.
5. **A `billing_test` truck sees the screens, notices and emails** — but its customers are never paused by billing. The ordering gate stays switch-only, as billing-1 built it. So a test truck's tab can say "paused" while its online ordering is not.
6. **"One invoice per truck per month" holds for the 1st's charge.** The trial-end charge and upgrades are separate invoices raised at the time ("that day", "immediately"). The Invoices card shows them as "Rest of November" and "Switch to Unlimited".
7. **No notice was defined for "trial over, no card".** Online ordering is paused, but none of A–E fits. The Billing tab's Payment method card says "No card added yet…". Tell me if you want a sixth notice.
8. **"Change plan" is hidden during the trial.** How a trialling truck pre-chooses its plan is still undesigned; billing-1's engine answers `in_trial`. After the trial the button shows.
9. **billing-1's hand step 3 said to turn Stripe's customer emails ON. That is now reversed:** turn them OFF (§6), so trucks get only our Brevo emails.
10. **Translations to check with a native speaker** (all structurally clean):
    - **"Post-pay charge for {month}"** (the post-pay surcharge, 0 everywhere): most agents rendered it as "fee for pre-orders paid at the truck", which is the right idea.
    - **Inflected `{month}`** (hr, sl, fi, et, lv, lt, el, hu): written as "(November)" or "Plan: {month}" so no case ending is needed.
    - **Pills that may be long:** de "Kostenlose Testphase", lt/bg the full trial name.
    - **The account word:** hr/sl "korisnički / uporabniški račun", because "račun" alone also means invoice.
    - **Hebrew and Arabic** use "←" for link arrows, as their files already do.
    - **Each language reused its own existing names for Manage › Billing** (e.g. Danish "Administrer › Abonnement").
    - **Latvian uses one verb, "apturēt", for both "paused" and "suspended"**, which blurs ordering paused and the account suspended. Worth a native check.
    - **Polish's plan row** reads "charged in advance for the current month", which says the same thing as "for the month ahead".

## 1 · Pause and suspension rule (billing-1 changed)

- **The rule** (`lib/billing/rules.ts` `failureTimeline`):
  - the first failed attempt's **local date** is the failure day;
  - + 5 full days = the last day to pay;
  - online ordering pauses at **00:00 truck time** the day after;
  - **suspend_warning_date** = pause date + `platform_switches.billing_suspend_warning_days` (6).
  - Example: fails 1 Jan → last day 6 Jan → paused from 00:00 on 7 Jan → "pay by 13 January".
- `billing_invoices.first_failed_at` is stamped **once**, when Stripe first reports a failure. A later retry never moves it.
- **Paying clears it at once:** the invoice is no longer unpaid, so the status, the notice and the email schedule all drop it.
- **The late fee** (0 everywhere) is applied at that same pause instant (`applyLateFees`).
- **Suspension: wording only.** No lock was built. **TODO (a later step): lock the account 7 days after the pause.**
- **Proven:** month ends, a leap year, the year end, London / Tokyo / Los Angeles, British Summer Time, and the exact millisecond (`billing-2.cjs` §1, §2).

## 2 · Manage › Billing (`components/manage/BillingScreen.tsx`, data from `lib/billing/view.ts`)

Shown only while billing is on or on a `billing_test` truck. Otherwise `/api/manage/billing` answers `{ visible: false }` and today's tab renders unchanged. "Compare plans" stays below.

| Card / state | Built as asked (en-GB) |
|---|---|
| **Your plan** | Plan name, with a "Free trial" pill on the trial (it names the plan the trial becomes). "Change plan" (not during the trial — §0.8). Trial line: "Your free trial ends on {date}. After that, {plan} is {price} a month." (a free plan: "…you’re on {plan}, with no monthly fee"). Pro: "Includes {allowance} of online orders a month. Then 0.99%." A held downgrade: "{plan} starts on {date}." |
| **Payment method** | No card: "No card added yet. Add one to keep taking online orders after your trial." + "Add card" (Brazil also "Use Pix Automático"). Card: "{Brand} ending {last4}" + "Change". After a failure: "Last payment failed" + "Update card". Stripe-hosted only: Checkout in setup mode, or Pix's hosted instructions page. **No card fields on our page.** |
| **What you pay** (trial) | "Your plan, charged on the 1st for the month ahead — {price}" · "Online orders over {allowance} a month, charged on the 1st for the month before — 0.99%" (Pay as you go: "Online orders, charged on the 1st for the month before — 0.99%") · "Walk-up orders — Free", then "When your trial ends on {date}, we charge {amount} for the rest of {month}. Then {price} on 1 {next month}." (Pay as you go: no plan row, no rest-of-month line.) |
| **Next payment · {date}** (paying) | "{plan} for {month} — {amount}" · "0.99% on {month}’s online orders over {allowance} (so far) — {amount}" · "Total so far — {amount}" · "Walk-up orders are always free." Extra rows appear only when not 0: extra vans, post-pay charge, carried over. |
| **How customers pay for pre-orders** | The two radios, word for word (§0.3). |
| **Invoices** | Date, For, Amount, Status. Pills: Paid (green), Unpaid (amber), Overdue (red). "Download" (the Stripe PDF) or "Pay now" (the Stripe hosted page). Rows read "December plan, November fees", "Rest of November", "Switch to Unlimited". "Late payment fee · {amount}" only above 0. None: "No invoices yet." |
| **Payment failed** (days 1–6) | Amber box: bold "Your payment of {amount} didn’t go through." then "We’ll try again. Update your card by {last day} to keep online ordering on." + "Update card". |
| **Paused** | Red box: bold "Online ordering is paused", "{amount} is overdue. Pay now and online ordering comes straight back on.", bold "Pay by {date} or your account may be suspended." + "Pay {amount}" and "Use a different card". |

- **Customers on the order page while paused** see the existing "not taking orders" state (billing-1's gate). No word about billing.
- **"Use a different card" / "Update card":** after Checkout returns (`?setup=cs_…`), the card is saved and **every unpaid invoice is tried on it at once** (`payOpenInvoices`). If it goes through, ordering comes straight back.
- **The billing webhook** now also handles `checkout.session.completed` (setup mode), so the same happens even if the owner never comes back to the tab.

## 3 · Change plan

- Title "Change plan"; "You’re on {plan}."
- Radio cards:
  - "Pay as you go — Free — 0.99% on online orders."
  - "Pro — {price} a month — {allowance} of online orders included. Then 0.99%."
  - "Unlimited — {price} a month — No fee on online orders."
  - The current plan carries a "Your plan" pill.
- **Up:** "Starts now." plus a box: "We’ll charge {amount} today for the rest of {month}. Then {price} on 1 {next month}."
- **Down:** "Starts on 1 {next month}. You keep {plan} until then."
- Buttons "Cancel" and "Switch to {plan}".
- The amount comes from `planChangePreview`, the same rule `requestPlanChange` charges by: the difference from what the month is already paid at. Screenshots: `change-plan-up-*.png` (£26.66 for the rest of November) and `change-plan-down-*.png`.

## 4 · Notices (the page's one strip mechanism; every tab but Billing; the owner only, never crew, the KDS or customers)

Most urgent first, one at a time (`noticeOf`): **E → D → B → A → C**. Every link opens Manage › Billing.

| | When | Words |
|---|---|---|
| A | trial ends in 2–7 days (or today), no card — dismissible | **Your free trial ends on {date}.** Add a card to keep online ordering on. — Add card → |
| B | trial ends tomorrow, no card | **Your free trial ends tomorrow.** Add a card or online ordering pauses. — Add card → |
| C | trial ending (≤ 7 days), card added — green, dismissible | **You’re all set.** {plan} starts on {date}. |
| D | payment failed, before the pause | **Your payment didn’t go through.** Update your card by {last day} to keep online ordering on. — Update card → |
| E | paused | **Online ordering is paused.** Pay {amount} by {suspend_warning_date} or your account may be suspended. — Pay now → |

Brazil with Pix says "payment method" instead of "card" in D, E and the emails.

## 5 · Emails (Brevo, From "HatchGrab" &lt;hello@hatchgrab.com&gt;, in the truck's language)

- **Each email is sent once per invoice** (or once per trial end): an insert into `billing_email_log` comes **before** the send. A failed send is reported and **never repeated**.
- **Each is sent only on its day.** A missed day is skipped, never sent late. Scheduled ones go from **08:00 truck time**; the failure email goes as soon as the failure is known.
- **Nothing is sent once the invoice is paid.**
- **Recipient:** the truck owner's address, greeted by first name. Links go to the tokenless `/manage?tab=billing` (the house pattern).
- **Switch off:** the hourly cron returns before any email.
- **No billing email has been sent** (OBSERVED: `billing_email_log` has 0 rows).

**The sequence for a failure on 1 Jan** (proven hour by hour; paying stops the rest):

| Day | Subject | Body (en-GB; every email opens "Hi {first name}," and ends "Questions? Just reply. / The HatchGrab team") |
|---|---|---|
| 1 Jan (at once) | Your HatchGrab payment didn’t go through | We couldn’t take {amount} for {truck} today. We’ll try again. / Please update your card by {last day} to keep online ordering on. If it stays unpaid, your account may be suspended. / **[Update card]** |
| 4 Jan | 2 days left to update your card | {amount} for {truck} is still unpaid. Update your card by {last day}, or online ordering pauses. If it stays unpaid, your account may be suspended. / **[Update card]** |
| 5 Jan | Update your card by tomorrow | {amount} for {truck} is still unpaid. Update your card by tomorrow, or online ordering pauses. If it stays unpaid, your account may be suspended. / **[Update card]** |
| 6 Jan | Last day to update your card | Today is the last day to pay {amount} for {truck}. If it’s still unpaid at midnight, online ordering pauses until you pay. If it stays unpaid, your account may be suspended. / **[Update card]** |
| 7 Jan | Online ordering is paused | Online ordering for {truck} is paused because {amount} is unpaid. Pay now and it comes straight back on. Pay by {suspend_warning_date} or your account may be suspended. / **[Pay now]** (the hosted invoice) |

**billing-1's two trial drafts — rewritten in the same tone, with the walk-up and kitchen-screen lines gone, and built:**

| Day | Subject | Body |
|---|---|---|
| trial end − 7 (no card only) | Your free trial ends in 7 days | Your free trial for {truck} ends on {date}. / Add a card in Manage › Billing to keep online ordering on. / After that, {plan} is {price} a month. When your trial ends we charge {amount} for the rest of {month}, then {price} on {1st}. *(free plan: "After that, you’re on {plan}, with no monthly fee.")* / Our 0.99% fee on online orders is charged on the 1st, for the month before. / **[Add card]** |
| trial end − 1 | Your free trial ends tomorrow | Your free trial for {truck} ends tomorrow. / *no card:* Add a card or online ordering pauses. **[Add card]** / *card on file:* You’re all set: {plan} starts on {date}. We’ll charge {amount} for the rest of {month} when your trial ends. |

**The wording rule:** no billing screen, notice or email says walk-ups or the kitchen screen keep working. Proven in every locale (§7).

## 6 · Stripe settings so Stripe sends NO emails of its own to trucks (test mode first, then live)

In the Stripe Dashboard (top-right mode switch: Test, then later Live):

1. **Settings → Billing → Subscriptions and emails**:
   - under **"Manage failed payments"**: turn **OFF** "Send emails when card payments fail" and "Send emails when bank debit payments fail";
   - under **"Manage invoices sent to customers"**: turn **OFF** "Email finalized invoices to customers" and "Email credit notes to customers";
   - under **"Expiring cards"** / **"Upcoming renewals"**: turn **OFF** "Send emails about expiring cards" and any renewal reminder email.
   - Leave **Smart Retries** ON and "If all retries for a payment fail" on **leave the invoice past due**.
2. **Settings → Business → Customer emails** (shown as **Settings → Emails** on some accounts): turn **OFF** "Successful payments" and "Refunds".
3. **Check one thing in test mode before go-live:** that Smart Retries apply to our **one-off** (non-subscription) invoices on your account. If the page offers retries only for subscriptions, tell me. The hourly run can then retry the payment itself (a small change in `runBillingAll`).

## 7 · Languages

- **The strings:**
  - 122 new en-GB strings in two new namespaces, `billing` and `emailBilling`;
  - **translated into all 36 language bases** (the 28, plus languages-world-1's tr, ko, zh-TW, id, vi, he, is, sr), each in its own file's terms and register;
  - inserted as text, so no other line of any file changed (37 files, insertions only);
  - regional files inherit from their base; en-US needs no override ("card" and the "$" forms come from the money format).
- **The checks:**

  | Check | Result |
  |---|---|
  | translation-check, 36 bases | 0 structural each (after the back-translations too) |
  | messages-parity | 1,001,306 passed, 0 failed |
  | languages-world-1-rtl | 111/111 |
  | messages-split | 205/205 |
  | ui-literals | no inline text |
  | `billing-2.cjs` §6 | in every base, the walk-up word appears only in the two "free" lines, and no billing string names the kitchen screen |
  | `billing-2.cjs` §7 | 12 locales × 7 emails composed in their own language; Arabic and Hebrew words with no bidi control characters |

- `lib/i18n/namespaces.ts` registers `billing` for Manage. `scripts/_messages-parity-1e.cjs` names both namespaces as new wording, as paperwork-1 did.

## 8 · Tests

| Run | Result |
|---|---|
| `node scripts/billing-2.cjs` (sweep-listed) | **72 passed, 0 failed** |
| mutations: the pause one day early / emails before 08:00 | 11 and 2 failures, as they should; files restored byte for byte |
| `node scripts/billing-1.cjs` | **131/131** (re-pinned: "6 Nov 23:59 still past due; 00:00 on 7 Nov paused + late fee") |
| `node scripts/billing-1-db-read.cjs` (real database, reads only) | **16/16**. Gusto's tab stays today's; the US test truck too; `billing_email_log` is empty; nothing written |
| `node scripts/billing-2-screens.cjs` (localhost, WebKit) | **16 screenshots, 0 problems** (no sideways scroll at 390 or 1280) |
| `node scripts/billing-1-stripe-test.cjs` | **not run:** no Stripe test key yet (billing-1 hand step 1); updated for the new pause instant |
| `tsc --noEmit`; eslint | clean; new files clean, changed files at HEAD's counts |
| Full sweep (main tree, with the build) | **211 run · 187 passed · 24 failed** at first. The 4 that were billing-2's now pass. The other 20 fail with the same checks at `69f822d7`, before billing-2 (below) |

**What `billing-2.cjs` covers:**
1. The 5-full-day rule across month ends and time zones.
2. `suspend_warning_date`.
3. **The email dry run, hour by hour for nine days:** which email on which day; stops on payment; each once; a failed send never repeated; the trial emails, with and without a card.
4. Each notice's conditions and priority.
5. The plan-change wording, up and down, with the en-GB sentences exact.
6. The wording rule in every locale.
7. Every email's words (en-GB exact; Pix; en-US; RTL).
8. **Switch off and not a test truck = nothing shown or sent.** A test truck is shown, but the live gate stays off for it. Post-pay → no card online.
9. Constructs: the new screen only when visible; Compare plans kept; iOS gating; no card fields; the one setting; the late fee only above 0; the order page has no billing words.

**Screenshots** (`docs/billing-2/`, each at 390 and 1280):

| State | Files |
|---|---|
| trial, no card | `trial-no-card-*.png` |
| trial, card added | `trial-card-*.png` |
| paying | `paying-*.png` |
| payment failed | `failed-*.png` |
| paused | `paused-*.png` |
| change plan, up | `change-plan-up-*.png` |
| change plan, down | `change-plan-down-*.png` |
| the five notices | `notices-*.png` |

**Pizzeria Gusto, byte-identical:**
- **Against the real database:** the gate is exactly "billing off", there is no capture fee, `loadBillingScreen` answers `visible: false`, and Gusto has no billing rows and no email log rows.
- **With the switch off:** the menu and submit routes are unchanged in behaviour (`cardPaymentsAllowed` is true while off).
- **Manage page:** Gusto's Billing tab renders today's JSX. The plan table moved into a constant used in the same place, so its output is the same. The notice strip renders nothing for Gusto.
- **The older "byte-identical since …" pins:** loyalty-1 passes. The re-pin module now takes back every `billing-N:` commit exactly, and still compares every other byte.

**The sweep, checked failure by failure:**
- **4 were caused by billing-2, and each now passes:**
  - `language-phase-1d2`: BillingTab gained a `token` prop. A named change, `billing-2-token-prop`, was added (the same mechanism as paperwork-1's), and the harness's own record of named changes was updated with it.
  - `schedule-graphics-places`: the two BillingTab lines I changed are now on its allowlist.
  - `france-1`: it needs a back-translation for every French key. **Back-translations for all 122 new keys were written in all 36 bases** (`docs/i18n/back/*.json`, insertions only), each saying what that language's own string says.
  - `event-types-render`: a load flake (35.ae); it passed on rerun.
- **The other 20 fail with exactly the same failing checks at `69f822d7` (before billing-2) as now:** europe-languages-1, language-phase-0, paperwork-1, features-list-1, reviews-weather-1, site-chrome-1, perf-1, cwv-2, compare-suits-1, compare-autopublish-1, badges-manual-1, costs-accounts-1, legal-languages-1, world-countries-3, faq-1, faq-3, faq-2, contact-1, tidy-1 and copy-truth-1.
  - I compared each one's list of failing checks, before against after: **no new failing check in any of them**. site-chrome-1, legal-languages-1 and tidy-1 crash the same way at both points.
  - They come from **languages-world-1's** new language files (new bases without older workstreams' strings, new legal files, the Greek arrow, the `ar-BH` / `id-ID` files…). That workstream's to settle; I touched none of its files.
- **Spotted on the way:** `docs/i18n/back/de-DE.json` lacks back-translations for 8 older `comparison.*` keys. That predates billing-2 and was left alone.

## 9 · Hand steps (in order)

1. **Add the Stripe test key** (billing-1 hand step 1): `STRIPE_BILLING_TEST_SECRET_KEY` in `.env.local`. Then run `node scripts/billing-1-stripe-test.cjs`.
2. **Stripe email settings: OFF** (§6). This reverses billing-1 step 3's "send failed-payment emails".
3. **Billing webhook** (billing-1 step 4): also tick **`checkout.session.completed`**.
4. **Stripe Checkout branding:** Settings → Branding (logo, colour). The hosted card page uses it.
5. Before switching billing on (later), as billing-1 listed, plus:
   - your sign-off on the iOS reading (§0.2);
   - the sixth notice question (§0.7);
   - the trial plan pre-choice design (§0.8);
   - a native check of the §0.10 terms.

## 10 · Terms draft — billing-1's section, updated (not published)

> **Late payment.** If a payment fails, we retry and email you. You have the rest of that day and 5 more full days to pay; if it's still unpaid after that, online ordering pauses at midnight (your local time) until it's paid. Where your country shows a late payment fee, we add it once to that bill. **If a payment is still unpaid 7 days after online ordering pauses, we may suspend your account.**

The rest of billing-1's draft is unchanged: plan fees in advance, our fee on pre-orders in arrears, upgrades and downgrades, the payment method, small amounts and post-pay. It no longer has any sentence about walk-ups or the kitchen screen still working.

## 11 · Files

- **New:**
  - `lib/billing/{view,emails,mailer,notify,screen-server}.ts`
  - `app/api/manage/billing/route.ts`
  - `components/manage/BillingScreen.tsx`
  - `scripts/billing-2.cjs`, `scripts/billing-2-screens.cjs`
  - `docs/billing-2/*.png`
  - `lib/i18n/catalog/{billing,emailBilling}.ts` and `messages/ns/*/{billing,emailBilling}.json` (generated)
- **Changed:**
  - `lib/billing/{rules,engine,gate,processor,store,store-types,memory-store}.ts`
  - the Manage page (the Billing tab switch, the notice, the token prop)
  - the menu and submit routes (`cardPaymentsAllowed`)
  - the cron (emails)
  - the billing webhook (`checkout.session.completed`)
  - `lib/i18n/namespaces.ts`
  - `messages/en-GB.json` + 36 bases
  - `scripts/{billing-1,billing-1-db-read,billing-1-stripe-test,_messages-parity-1e,_lp-billing-1}.cjs`
  - `scripts/harnesses.json`

## 12 · SQL run (both committed, each by `scripts/db-migrate.cjs` as one transaction, no error)

```sql
-- 20261088_billing_2.sql
begin;

alter table public.billing_invoices add column if not exists first_failed_at timestamptz;

alter table public.platform_switches add column if not exists billing_suspend_warning_days integer not null default 6;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_switches_billing_suspend_days_chk') then
    alter table public.platform_switches add constraint platform_switches_billing_suspend_days_chk
      check (billing_suspend_warning_days between 1 and 60);
  end if;
end $$;

create table if not exists public.billing_email_log (
  id           bigserial primary key,
  truck_id     text not null references public.trucks(id) on delete cascade,
  kind         text not null check (kind in ('payment_failed', 'two_days_left', 'one_day_left', 'last_day', 'paused',
                                              'trial_7_days', 'trial_1_day')),
  ref          text not null,
  locale       text not null,
  sent_at      timestamptz not null default now(),
  provider_id  text,
  unique (truck_id, kind, ref)
);

alter table public.billing_email_log enable row level security;
revoke all on public.billing_email_log from anon, authenticated, public;
revoke all on sequence public.billing_email_log_id_seq from anon, authenticated, public;

commit;
```

```sql
-- 20261089_billing_2_invoice_pdf.sql
begin;
alter table public.billing_invoices add column if not exists invoice_pdf_url text;
commit;
```

Read-only checks (all as expected: 6, false, 0 emails, RLS on, the columns present, 0 grants):

```sql
select (select billing_suspend_warning_days from platform_switches) days, (select billing_enabled from platform_switches) sw, (select count(*) from billing_email_log) emails, (select relrowsecurity from pg_class where relname='billing_email_log') rls, (select count(*) from information_schema.columns where table_name='billing_invoices' and column_name='first_failed_at') col, (select count(*) from information_schema.role_table_grants where table_name='billing_email_log' and grantee in ('anon','authenticated')) grants;
select column_name, data_type, is_nullable from information_schema.columns where table_name = 'billing_invoices' and column_name in ('invoice_pdf_url','first_failed_at') order by 1;
```

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks.

```sql
-- ⛔ DO NOT RUN unless Dominic asks.
begin;
drop table if exists public.billing_email_log;
alter table public.billing_invoices drop column if exists invoice_pdf_url;
alter table public.billing_invoices drop column if exists first_failed_at;
alter table public.platform_switches drop constraint if exists platform_switches_billing_suspend_days_chk;
alter table public.platform_switches drop column if exists billing_suspend_warning_days;
commit;
```
The code undo is reverting the billing-2 commits (`git log --grep=^billing-2:`): the build, the re-pins, the back-translations and the two migration files.
