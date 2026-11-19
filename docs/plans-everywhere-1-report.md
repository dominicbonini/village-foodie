# plans-everywhere-1 — post-pay wording on the pricing pages, and the migration that puts all three plans on sale (prepared, NOT run)

19 November 2026. **Committed locally on main as `ddb0c317`. Not pushed, not deployed.** docs/ is left uncommitted.

- **Nothing went on sale.** The migration is written and committed, not run.
- **No database writes.** Only read-only SELECTs were run; they are listed in §8.
- **No .env file opened.**

## Summary

- **The new wording.** Where a country's `country_billing.payment_model` is **`billed_at_truck` or `billed_online`** (read from the data by the new helper `monthlyFeeBilling`, never a list), these show:
  - Pay as you go reads **"0.99% on pre-orders, billed monthly"**.
  - Pro reads **"First {included} of pre-orders included each month. Then 0.99%, billed monthly"**.
  - The plan table's fee row reads **"HatchGrab fee on pre-orders, billed monthly"**.
  - The **"How you pay us here: …"** note sits under the cards.
- **Where it appears:** the landing pricing section, /features (table and note), and the plans PDF. Manage › Billing shares the table.
- **Languages:** written in en-GB and all 56 language bases, plus es-CO / es-PA's "en línea". translation-check is structural 0 everywhere.
- **Card-country lines:** the "Online payments" table row is hidden where trucks can't take online card payments. Some FAQ answers also describe card payments; those are data and are listed in §3 for your decision.
- **Countries that take the fee from the payment** (GB, US, the EU and the rest of the 46) render exactly as before.
- **The migration** (`supabase/migrations/20261119_plans_everywhere_1.sql`, **not run**):
  - relaxes the world guard so Pay as you go and Pro may be on sale in monthly-billed countries while billing is off;
  - puts both plans on sale in all 164 such countries, with no VAT exclusion;
  - moves every trial end to Pay as you go;
  - checks its own result; the undo is in its comments.

## 0 · Prompt check, and the readings I chose

- **Garbled spans:** none.
- **Contradictions:** none. "Show the SQL inline in chat" is done in the chat before the final reply, and the final reply stays two lines.
- **My readings of the wording** (each is yours to change):
  1. **Pro's line.** I kept the included amount as its own sentence and made your words the second sentence: "First **{included}** of pre-orders included each month. Then **{fee}**, billed monthly".
     - "online orders" became "pre-orders", to match the Pay as you go line.
     - "Walk-up orders are always free." moved from both cards into the note, as in your Pay as you go wording.
  2. **The note.** "How you pay us here:" is a bold lead-in in both forms. The billed_online note reads "How you pay us here: customers can pay online or at the truck. …"
  3. **The asterisk.** It stays on the fee only where the Stripe card-fee footnote shows (billed_online, e.g. Brazil). billed_at_truck countries have no asterisk and no footnote, as pricing-copy-4 set.
  4. **The note shows only while an offered plan charges a fee.** You deploy before running the migration. Until then those 164 countries offer only Unlimited (0%), where "our fee on last month's pre-orders" would be untrue, so their pages stay exactly as today until the migration runs. The table's fee-row label follows the same rule.
  5. **"At the truck" in other languages.** Most languages say "when they collect" / "at pickup" (each language's existing pre-order wording), not a literal "at the truck". The back-translations in §2 show it.
- **"The signup plan picker" doesn't exist.** Signup (`app/(app)/signup`) shows no plans or fees; it reads only the trial length. Nothing to change there.

## 1 · What changed (code)

| File | Change |
|---|---|
| `lib/country-settings-types.ts` | `monthlyFeeBilling(s)` → `'at_truck'` / `'online'` / null, from `paymentModel` only. A country with no row, `fee_from_payment`, or a fixture without the field → null (unchanged). |
| `components/pricing/PricingSection.tsx` | Pay as you go / Pro fee lines in monthly-billed countries; the note `<p class="price-note monthly-note">` under the cards. |
| `app/(public)/(site)/landing/landing.css` | One rule: on a phone the note keeps its place under the cards (`order: 2`) instead of joining the footnote at the end. |
| `components/pricing/PlanTable.tsx` | The fee row's label (`planTable.pay.feeMonthly`, same asterisk rule); the card-only row filter. |
| `app/(public)/(site)/features/page.tsx` | The note at the top of the small print under the table. |
| `lib/plans-pdf.ts` | The same fee lines, fee-row label, note under the cards (`.mnote`) and row filter. |
| `lib/plan-offer.ts` | `CARD_ONLY_ROWS = ['online_payments']`; `tableGroups({ cards })` leaves them out when `cards === false`. Called with no argument it behaves as before. |
| `messages/*.json` + `messages/ns/*` | 5 keys: `pricing.fee.feeOnlyMonthly`, `pricing.fee.includedMonthly`, `pricing.monthlyNote.{atTruck,online}`, `planTable.pay.feeMonthly`. In en-GB and 56 bases, plus es-CO / es-PA (`monthlyNote.online` only). Each file was checked to have only additions. The catalogue was regenerated. |
| `supabase/migrations/20261119_plans_everywhere_1.sql` | The migration (§5), **not run**. |
| `scripts/_plans-everywhere-1-onsale-preload.cjs` | LOCAL dev server only. Marks plans on sale **in memory** for the named countries, for the screenshots. Nothing written. |

**en-GB wording:**
- `feeOnlyMonthly`: "<b>{fee}</b> on pre-orders, billed monthly"
- `includedMonthly`: "First <b>{included}</b> of pre-orders included each month. Then <b>{fee}</b>, billed monthly"
- `monthlyNote.atTruck`: "<b>How you pay us here:</b> customers pay you at the truck. Once a month we charge your card for your plan and our fee on last month’s pre-orders. Walk-up orders are always free."
- `monthlyNote.online`: "<b>How you pay us here:</b> customers can pay online or at the truck. Once a month we charge your card for your plan and our fee on last month’s pre-orders. Walk-up orders are always free."
- `planTable.pay.feeMonthly`: "HatchGrab fee on pre-orders, billed monthly{mark}" ({mark} = "*" in a card country)

**Translations:**
- They use each language's existing words for "pre-orders", "walk-up orders" and the monthly charge (from `pricing.base.preorders`, the fee lines and `billing.tab.preorders.atTruckHint`).
- They keep the register of each language's pricing banner: German Sie, French vous, Spanish/Dutch tú/je, Hungarian Ön, Romanian dvs, Russian Вы.

## 2 · Screenshots — `docs/plans-everywhere-1/`

**How they were made:**
- A local dev server on the live data, with the in-memory preload marking Pay as you go and Pro **on sale for TZ and BR** (nothing written).
- Each shot is the `#pricing` section cut from a full-page screenshot; the section's text is saved alongside.
- Sizes: phone 390 and laptop 1280.

**Files:**
- `pricing-tz-phone.png`, `pricing-tz-laptop.png` (+ `.txt`): Tanzania, Swahili, billed_at_truck.
- `pricing-br-phone.png`, `pricing-br-laptop.png` (+ `.txt`): Brazil, Portuguese, billed_online.
- `pricing-uk-phone.png`, `pricing-uk-laptop.png` (+ `.txt`): United Kingdom, **unchanged** (fee_from_payment). The old lines are there, with no note.

**Checked on every shot:**
- three plan cards;
- no raw key, "undefined" or NaN;
- no sideways scroll;
- no page errors;
- on /tz and /br, the note sits straight under the cards and above the "cheapest" bar and the trial banner, on both sizes.

**Back-translations of every new line:**

| /tz (Swahili) | English back-translation |
|---|---|
| **0.99%** kwa oda za mapema, hutozwa kila mwezi | **0.99%** on pre-orders, charged every month |
| Oda za mapema za hadi **TSh 2,500,000** zimejumuishwa kila mwezi. Kisha **0.99%**, hutozwa kila mwezi | Pre-orders of up to **TSh 2,500,000** are included every month. Then **0.99%**, charged every month |
| **Jinsi unavyotulipa hapa:** Wateja wanakulipa wanapochukua oda. Mara moja kwa mwezi tunatoza kadi yako kwa ajili ya mpango wako na ada yetu ya oda za mapema za mwezi uliopita. Oda za papo hapo ni bila malipo kila wakati. | **How you pay us here:** Customers pay you when they collect their order. Once a month we charge your card for your plan and our fee on last month's pre-orders. On-the-spot orders are always free of charge. |
| /tz/features fee row: Ada ya HatchGrab kwa oda za mapema, hutozwa kila mwezi | HatchGrab fee on pre-orders, charged every month |

| /br (Portuguese, Brazil) | English back-translation |
|---|---|
| **0,99%*** nos pedidos antecipados, cobrada mensalmente | **0.99%*** on pre-orders, charged monthly |
| Os primeiros **R$ 8.000** em pedidos antecipados por mês estão incluídos. Depois, **0,99%***, cobrada mensalmente | The first **R$8,000** of pre-orders per month are included. After that, **0.99%***, charged monthly |
| **Como você nos paga aqui:** os clientes podem pagar online ou na retirada. Uma vez por mês, cobramos no seu cartão o seu plano e a nossa taxa sobre os pedidos antecipados do mês anterior. Pedidos no balcão são sempre grátis. | **How you pay us here:** customers can pay online or at pickup. Once a month, we charge your card for your plan and our fee on the previous month's pre-orders. Counter orders are always free. |
| /br/features fee row: Taxa do HatchGrab em pedidos antecipados, cobrada mensalmente* | HatchGrab fee on pre-orders, charged monthly* |

**The same server's /features pages:**

| Page | Fee row | Note | "Online payments" row |
|---|---|---|---|
| /tz/features | new | yes | **hidden**; no "Stripe" on the page |
| /br/features | new, with * | yes | kept (card country) |
| /uk/features | unchanged | none | kept |
| /jm/features (not marked on sale) | unchanged | none | **hidden** |

**The plans PDF** (fixture renderer, GB set to each model in memory):
- `fee_from_payment` and no row: the old lines.
- `billed_online`: the new lines with *, and the online note.
- `billed_at_truck`: the new lines, no *, the at-truck note, and no "Online payments" row.

## 3 · Card-payment promises on monthly-billing-only pages (billed_at_truck)

Checked on /jm (an English billed_at_truck country, Jamaica) through the local server: the landing page, /features, /faq and /compare, plus the PDF. pricing-copy-4 had already made the landing pricing section, its banner, footnote and asterisks follow the rule; nothing there promised card payments.

| Where | Line | Done |
|---|---|---|
| /features table (also Manage › Billing, PDF) | **"Online payments — Take card payment upfront when customers order online, via Stripe."** | **Hidden** where `offersOnlineCardPayments` is false (`CARD_ONLY_ROWS`). |
| /features table | "Take payment on your phone — Take card payments on a supported phone…" (shown as **Coming soon**) | **Listed, not hidden.** It is in-person Tap to Pay, not online, so it's outside the brief's "online card payments". Note that it would also need Stripe for trucks, which these countries don't have. Your call. |
| FAQ `…0002` "What do I pay on each order?" | "Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us." | **Listed, not changed.** The sentence is inside a database answer, so it can't be hidden without a data change. |
| FAQ `…0006` "How long does it take to set up?" | "…and connect Stripe so customers can pay online." | same |
| FAQ `…0007` "Do I need an iPad, card reader…?" | "…customers can pay for pre-orders online by card…" | same |
| FAQ `…0011` "How do I get paid for online orders?" | "Card payments go straight into your own Stripe account…" (the whole answer) | same |
| /compare | "Card processing of 0% + $0 per order applies whichever provider you use" | Not a promise (it's a cost line, 0% there). Left. |

The FAQ's show-in rule only knows `all` / `apps` / `plan:<key>`. Hiding those four needs one of:
- a new show-in value (e.g. card countries only), which is a schema and data change;
- monthly-billing-only wording written in Admin › FAQ.

Neither is allowed in this brief, so it is a **decision for you** (§7).

## 4 · Terms draft — `docs/plans-everywhere-1/terms-draft.md`

Before/after paragraphs of the English terms. `content/legal` is untouched and nothing is published. It covers:
1. **The fee on all pre-orders:** paid online or at the truck; not on walk-ups.
2. **Monthly invoicing where the fee can't be taken from the payment:**
   - "When we charge" (plan fees in advance, trial-end pro rata, upgrades, downgrades);
   - a new "How we collect our fee on pre-orders" paragraph and the payment-method sentence;
   - §5's "deducted at the point of the transaction" made conditional.
3. **The 5-day pause:** retried, emailed, the rest of the day plus 5 full days, then online ordering pauses at midnight local time until paid. Pause only, with no suspension (your decision 5). No sentence says walk-ups or the kitchen screen keep working (rule 35.ar-2).
4. **The trial ending on Pay as you go:** in "Plans", "Free trial" and "Cancellation".
5. **30 days' notice**, now covering "how we collect our fee in your country" too.

## 5 · The migration — `supabase/migrations/20261119_plans_everywhere_1.sql` (NOT RUN)

One transaction. The world guard checks every statement; it isn't deferrable, so the order matters.

1. **Guard, rule (a) only.** An offered fee plan where `platform_fee_allowed` is false is now allowed when the country's `payment_model` is `billed_online` / `billed_at_truck`, **whether or not billing is on**.
   - `fee_from_payment`, or no `country_billing` row, is refused as before.
   - Rule (b) (the trial-end plan must be on sale) is copied unchanged from the live definition (read back, matching 20261086).
2. **`offered = true`** for `payg` and `pro` in every enabled billed_online / billed_at_truck country, with no VAT exclusion. Today that is 164 countries, 328 rows.
3. **`is_trial_end = false`** on Unlimited in those countries: 164 rows. Trials then fall back to `plans.is_expiry_fallback` = **payg** (read back). It runs after step 2, or rule (b) refuses it. Mexico (switched off) is untouched.
4. **A self-check:** the transaction rolls back if any such enabled country lacks either plan on sale or still has a trial-end row. It notes if billing happens to be on.

- **Run with:** `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_1.sql --approved-by-dominic`, after you approve the wording and deploy.
- **Verify** (in the file): payg 210 / pro 210 / unlimited 210 on sale in enabled countries, 0 trial-end rows.
- **Undo:** in the file's header comments, in the required order:
  1. restore the trial-end rows;
  2. take the two plans off sale;
  3. re-create the 20261086 guard.

**What isn't changed:** prices, fees, country_billing, platform_switches (billing stays off), trucks.

## 6 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| ESLint, changed files | same as HEAD (`lib/plans-pdf.ts` 4/0 before and after; the rest 0/0); new scripts clean |
| `split-messages --check` | matches (121 namespaces) |
| `messages-parity` | 1,381,881 passed, 0 failed |
| `translation-check`, the 56 bases with the new keys | Structural 0 in all 56; no flag on the new keys |
| **pricing-copy-4** | **1151 / 0** (re-pinned: the /features fee row in monthly-billed fixtures reads `planTable.pay.feeMonthly`) |
| **plans catalogue**: plans-data-model 154/0, plan-features-config 80/0, plan-feature-order 34/34 (re-pinned), pricing-pages 145/0, native-prices 53/0, world-countries-1 178/0 | pass |
| pricing-copy-1 1410/0, pricing-copy-2 654/0, trial-column-1 45/0 (re-pinned), billing-2 72/0, billing-3 51/0, faq-1 to -4, admin-countries-1, currency-registry | pass |
| pricing-copy-3 33/1 | **the same failure on HEAD** (si-LK, ta-LK from the languages session) |
| The 103 swept harnesses that read the changed files | all pass except these, each **failing identically on HEAD** (checked in a temporary worktree, now removed): event-types-render, france-1, cwv-2 (43/1), costs-accounts-1 (76/2), tidy-1, contact-1, language-phase-1b (392), compare-suits-1. `outreach-reply-attach` failed on its pin of the PDF's `tableGroups()` call; re-pinned, now passes. |
| billing-1 130/1 | known HEAD failure |

**Re-pins**, each with a dated note:
- `plan-feature-order` and `outreach-reply-attach`: `tableGroups()` may take `{ cards: … }`.
- `pricing-copy-4`: the monthly-billed fee row.
- `trial-column-1`: through the new exact-undo module `scripts/_named-plans-everywhere-1.cjs` + `scripts/fixtures/plans-everywhere-1-code-edits.json`, generated from the diff and proven to restore HEAD byte for byte.
- `_messages-parity-1e`: the 5 keys registered as new wording.

⚠️ **Two harnesses I ran by mistake** (they matched my file pattern; they are hand-run, not swept):
- `billing-1-stripe-test` made calls to **Stripe's test mode**: 26/26, no live data and no money.
- `billing-1-db-read` **read** the database, including Pizzeria Gusto's billing rows: 15/1, read-only, nothing written. I didn't re-run it to investigate the 1.

From now on I'll run only the swept list.

## 7 · Your decisions still needed

1. **The four FAQ answers that describe online card payments** (§3): a card-countries show-in rule, monthly-billing wording in Admin › FAQ, or leave them.
2. **"Take payment on your phone" (Coming soon)** in monthly-billing-only countries: hide it too?
3. **The wording readings in §0:** Pro's two sentences, "pre-orders" in the included sentence, the bold lead-in, the asterisk in card countries.
4. **The terms draft**, then its translations.
5. **When to run the migration:** after approval and deploy.

## 8 · Hard rules and housekeeping

- Nothing went on sale, nothing was written to the database, and nothing was deployed or pushed.
- The landing page changed only in its pricing wording, plus one CSS line for the note's phone position.
- Pizzeria Gusto and Le Roi du Churrasco were not touched. Gusto's billing rows were only **read**, by the mistaken run above.
- No .env file was opened.
- **The dev servers:**
  - The dev server that was on port 3000 had already stopped when I came to use it; I didn't stop it.
  - I cleared `.next/dev` (the dev cache) and ran my own server on port 3477, first plain and then with the in-memory preload. It is stopped now.
- **Read-only SQL this round:**
  - the guard's live definition (`pg_get_functiondef`);
  - `plans.is_expiry_fallback`;
  - the trial-end row counts;
  - the published FAQ items that mention cards or Stripe.

  Each query is shown in the chat.
