# plans-everywhere-2 — a clearer post-pay note, FAQ answers for pay-at-the-truck countries, Tap to Pay hidden there

19 November 2026. **Committed locally on main as `1ad9b83b`. Not pushed, not deployed.** docs/ is left uncommitted.

- **Nothing was written to the database.** Both migrations are committed and **not run**:
  - `20261119_plans_everywhere_1.sql` (all three plans on sale);
  - the new `20261119_plans_everywhere_2_faq.sql`.
- `content/legal` is untouched. No .env file was opened. No Stripe or live-billing script was run.

## Summary

- **The "How you pay us here" note is now a box like the trial banner:** its orange wash, border and rounded corners, normal-size text and a bold lead-in.
  - It appears on the landing pricing section, under the plan table on /features, and in the plans PDF.
  - Both versions (at the truck / online) now end **"You’ll need a card on file when your free trial ends."**, in every language.
- **"Take payment on your phone" (Coming soon)** is hidden where trucks can't take online card payments (billed_at_truck), with "Online payments".
- **FAQ:** two new show-in values, decided in code from each country's payment model:
  - **`card_payments`**: fee_from_payment or billed_online;
  - **`pay_at_truck`**: billed_at_truck.
- **The FAQ migration** (not run, on your Q2 A) moves …0002 / …0006 / …0007 / …0011 to `card_payments` and adds their pay-at-the-truck versions, with the wording you approved (Q1 B).
- **When to run it:** **after you deploy.** The deployed code doesn't know the new values, and running it first would hide those four answers on every FAQ page.

## 0 · Prompt check and decisions

- **Garbled spans:** none.
- **I stopped once, as the brief allows,** and asked two questions:
  - **Q1 (the English):** you answered **B**. …1007 now ends "for walk-up orders you take payment the way you do today."; the other three are as shown.
  - **Q2 (when to write the rows):** you answered **A**: commit now, you deploy, then the migration runs and the translator fills the languages.
- **Small choices, stated:**
  - The new answers use the FAQ's curly apostrophes (plan’s, there’s).
  - …1002 has no single-plan answer, so it reads the same where only Unlimited is offered.
  - …1011's question is your "How do I get paid?"; the card version keeps "How do I get paid for online orders?".
- **The FAQ's banned-wording rule:** it refuses "pay at the truck" and "pay when they collect" (faq-3). Your two answers say "pay **you** at the truck" and "…at the truck when they collect". Those don't contain the banned phrases, so the check accepts them. I mention it because the rule's intent was to keep pay-at-the-truck wording out of the FAQ.
- **`pay_at_truck`** is coded as the exact opposite of `card_payments`: not offersOnlineCardPayments, so billed_at_truck, plus a country with no country_billing row, of which there are none. A question with one of the pair never shows beside the other.

## 1 · The note as a box

| Where | Before (plans-everywhere-1) | Now |
|---|---|---|
| Landing pricing (`components/pricing/PricingSection.tsx`, `landing.css .monthly-note`) | small grey text (`price-note`) | box: `--orange-wash` background, `--orange-line` border, 12px corners, .92rem ink text, bold lead-in, under the cards (phone: still under the cards) |
| /features (`app/(public)/(site)/features/page.tsx`) | a line in the small print | the same box, under the table, above the small print |
| Plans PDF (`lib/plans-pdf.ts .mnote`) | grey line | styled like the PDF's trial banner (#FFF7EE / #F3D3AE) |

- It still shows only where the fee is billed monthly **and** an offered plan charges a fee. A country offering only Unlimited keeps today's page until `20261119_plans_everywhere_1.sql` runs.

**The added sentence:**
- en-GB: "You’ll need a card on file when your free trial ends."
- It is written in all 59 message files (en-GB, 56 bases, es-CO, es-PA), using each language's existing billing words for "card" and "trial" (`billing.tab.payment.none`).
- Each file was checked so that only `pricing.monthlyNote.*` changed; the catalogue was regenerated.

## 2 · FAQ

**Code (committed):**
- `lib/faq/live-values.ts`: `isShowIn` accepts `card_payments` / `pay_at_truck`, and `shownIn` decides them with `offersOnlineCardPayments(country.settings)`.
- `lib/faq/check.ts`: Admin › FAQ's Show in choices gain "Where trucks take online card payments" and "Where customers pay at the truck (no online card payments)".
- No translation is invalidated: a translation's hash covers only the question and answers, not show_in.

**The migration `supabase/migrations/20261119_plans_everywhere_2_faq.sql` (NOT RUN; run after the deploy):**

```sql
set lock_timeout = '3s';
begin;
alter table public.faq_items drop constraint if exists faq_items_show_in_chk;
alter table public.faq_items add constraint faq_items_show_in_chk
  check (show_in = 'all' or show_in = 'apps' or show_in = 'card_payments' or show_in = 'pay_at_truck' or show_in ~ '^plan:[a-z][a-z0-9_]*$');
-- the four card answers → card countries only (guarded: exactly 4 published rows on 'all', or it rolls back)
update public.faq_items set show_in = 'card_payments', updated_at = now(), updated_by = 'plans-everywhere-2'
 where id in ('fa000002-0000-4000-8000-000000000002','fa000002-0000-4000-8000-000000000006',
              'fa000002-0000-4000-8000-000000000007','fa000002-0000-4000-8000-000000000011')
   and show_in = 'all' and status = 'published';
-- their pay-at-the-truck versions, published, in the twin's section and position (then checked: exactly 4 'pay_at_truck' rows)
insert into public.faq_items (id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status, published_at, note, updated_by)
select v.id::uuid, t.section_id, t.position, v.question_en, v.answer_en, null, 'pay_at_truck', 'published', now(), v.note, 'plans-everywhere-2'
  from (values …the four rows below…) as v(id, twin, question_en, answer_en, note)
  join public.faq_items t on t.id = v.twin::uuid;
commit;
```

| New id | Question | Answer (English, as approved) |
|---|---|---|
| …1002 | What do I pay on each order? | Walk-up orders are free. On pre-orders you pay only your plan’s fee, charged to your card once a month. Customers pay you at the truck, so there’s no card processing fee. |
| …1006 | How long does it take to set up? | Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, and add where and when you’re trading. We then switch your ordering page on. |
| …1007 | Do I need an iPad, card reader or special equipment? | No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: for walk-up orders you take payment the way you do today. {apps.sentence} |
| …1011 | How do I get paid? | Customers pay you at the truck when they collect, so the money is yours straight away. |

- **No other FAQ row is changed.**
- **The undo** (delete the four new rows and their translations, set the four back to `all`, restore the old CHECK) is in the file's comments.

**Your steps after the deploy:**
1. Run `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_2_faq.sql`. It touches no table the runner protects, so it needs no approval flag.
2. The hourly FAQ translator (`.github/workflows/faq-translate.yml`, :25 each hour) translates the four new questions into every language base. A non-English FAQ page lists a question only once its translation is in.

⚠️ **/tz/faq is a 404 today, live and in the preview.** No Swahili FAQ translations exist yet: the translator on GitHub runs the pushed code, which predates sw-TZ. After the deploy, the translator's next run should write Swahili for every question, and /tz/faq will appear. That is my reading of the workflow; I haven't seen it run.

## 3 · Tap to Pay

`lib/plan-offer.ts` `CARD_ONLY_ROWS = ['online_payments', 'tap_to_pay']`. "Take payment on your phone" now leaves the plan table (/features, Manage › Billing, PDF) wherever trucks can't take online card payments. On /jm/features neither "Take payment on your phone" nor "Online payments" appears; card countries keep both.

## 4 · Screenshots — `docs/plans-everywhere-2/`

**How they were made:**
- A local dev server on the live data, with two in-memory preloads (nothing written):
  - `scripts/_plans-everywhere-1-onsale-preload.cjs` (TZ's plans on sale);
  - `scripts/_plans-everywhere-2-faq-preload.cjs`, which shows the FAQ as it will be after the migration, using rows read from the migration file itself.
- Sizes: phone 390 and laptop 1280. Each page's text is saved alongside. The FAQ shots have every answer opened.

**Files:**

| Files | Shows |
|---|---|
| `tz-phone.png`, `tz-laptop.png` | /tz pricing: the note as a box under the cards, with the new sentence |
| `tz-faq-phone.png`, `tz-faq-laptop.png` | /tz/faq: **404 "Ukurasa haukupatikana"**. No Swahili answers appear (none are translated yet; the live page is a 404 too) |
| `jm-features-phone.png`, `jm-features-laptop.png` | /jm/features table: no "Take payment on your phone", no "Online payments" |
| `jm-faq-phone.png`, `jm-faq-laptop.png` | /jm/faq (English, pay at the truck): the four pay-at-truck answers, **none** of the four card answers |
| `uk-faq-phone.png`, `uk-faq-laptop.png` | /uk/faq (unchanged): the four card answers, none of the pay-at-truck ones |

**Checked:**
- no page errors, no sideways scroll, no raw keys;
- **/uk/faq matches the live www.hatchgrab.com/uk/faq line for line.** The only differences are the five section headings, which CSS capitalises.

**English back-translations of every new line** (the only non-English shot with new lines is /tz pricing):

| /tz (Swahili) | English back-translation |
|---|---|
| **Jinsi unavyotulipa hapa:** Wateja wanakulipa wanapochukua oda. Mara moja kwa mwezi tunatoza kadi yako kwa ajili ya mpango wako na ada yetu ya oda za mapema za mwezi uliopita. Oda za papo hapo ni bila malipo kila wakati. **Utahitaji kadi iliyosajiliwa jaribio lako la bila malipo litakapoisha.** | **How you pay us here:** Customers pay you when they collect their order. Once a month we charge your card for your plan and our fee on last month's pre-orders. On-the-spot orders are always free of charge. **You will need a registered card when your free trial ends.** |
| 0.99% kwa oda za mapema, hutozwa kila mwezi (unchanged from -1) | 0.99% on pre-orders, charged every month |
| Oda za mapema za hadi TSh 2,500,000 zimejumuishwa kila mwezi. Kisha 0.99%, hutozwa kila mwezi (unchanged from -1) | Pre-orders of up to TSh 2,500,000 are included every month. Then 0.99%, charged every month |

/jm/faq's new lines are the English answers in §2, word for word.

## 5 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| ESLint, changed files | same as HEAD (`lib/plans-pdf.ts` 4/0 before and after; the rest 0/0); new scripts clean; faq-1's 5 warnings are HEAD's |
| `split-messages --check` | matches (121 namespaces) |
| `messages-parity` | 1,381,881 passed, 0 failed |
| **FAQ harnesses** | faq-1 208/0 (re-pinned), faq-2 170/0, faq-3 195/0, faq-4 108/0 |
| **Pricing harnesses** | pricing-copy-1 1410/0, pricing-copy-2 654/0, pricing-copy-4 1151/0, pricing-pages 145/0, plans-data-model 154/0, plan-features-config 80/0, plan-feature-order 34/34, native-prices 53/0, world-countries-1 178/0, trial-column-1 45/0 (re-pinned), outreach-reply-attach passes |
| The 105 swept harnesses that read the changed files | all pass except the 8 that fail identically on HEAD: event-types-render, france-1, cwv-2 (43/1), costs-accounts-1 (76/2), tidy-1, contact-1, language-phase-1b (392), compare-suits-1 |

**Not run, as asked:** billing-1-stripe-test, billing-1-db-read, and any other hand-run script that calls Stripe or reads live billing tables.

**Re-pins**, each with a dated note:
- **`faq-1`:** names `20261119_plans_everywhere_2_faq.sql` precisely as allowed. That means the CHECK change, exactly the four card ids moved to `card_payments`, exactly four `pay_at_truck` inserts, and no faq_sections / faq_translations writes outside comments. Any other later FAQ write still fails.
- **`trial-column-1`:** through `scripts/_named-plans-everywhere-2.cjs` + `scripts/fixtures/plans-everywhere-2-code-edits.json`, which take this round's code edits back exactly. They are chained before `_named-plans-everywhere-1.cjs`.

## 6 · Read-only SQL this round

```sql
select id, section_id, position, show_in, status, question_en, answer_en, answer_single_plan_en from faq_items
 where id in ('fa000002-0000-4000-8000-000000000002','fa000002-0000-4000-8000-000000000006','fa000002-0000-4000-8000-000000000007','fa000002-0000-4000-8000-000000000011') order by position;
select id from faq_items order by id;
```

## 7 · Order of the remaining steps

1. You approve this wording and deploy (this commit and plans-everywhere-1's).
2. Run `20261119_plans_everywhere_2_faq.sql`; the translator fills the languages within the hour.
3. When you say: run `20261119_plans_everywhere_1.sql` (all three plans on sale; it needs `--approved-by-dominic`).
4. The terms, in their separate step (draft in `docs/plans-everywhere-1/terms-draft.md`).

## 8 · Hard rules

- No deploy and no push.
- No database writes; only the two SELECTs above.
- The landing page changed only in the pricing note (its style and one sentence).
- Pizzeria Gusto and Le Roi du Churrasco were not touched or read.
- No .env file was opened; `content/legal` is unchanged.
- The local dev server (port 3477) is stopped, and nothing under docs/ was rewritten by the sweep.
