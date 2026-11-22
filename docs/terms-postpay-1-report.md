# terms-postpay-1 — the post-pay Terms of Service, in English and the 51 languages enabled countries use

19 November 2026. **Committed locally on main as `a38bfe0d`. Not pushed, not deployed.** docs/ is left uncommitted.

- **No database writes.** Only read-only SELECTs were run (§6).
- **Not run:** `20261119_plans_everywhere_1.sql`, and the FAQ translator.
- No .env file was opened, and the landing page is unchanged.

## Summary

- **English.** `content/legal/terms-and-conditions.md` now carries the approved draft's "After" wording **word for word**. All 9 "After" blocks in `docs/plans-everywhere-1/terms-draft.md` were checked against the file, with 0 differences. "Last updated" is 19 November 2026; nothing else in the terms changed.
- **Translations.** The 13 changed paragraphs are translated into the **51 languages** that have their own terms **and** are used by an enabled country. es-MX and the other Spanish variants read es-ES, and so on for the other variants. **Every unchanged sentence is kept byte for byte**: checked automatically everywhere except Thai, which has no sentence punctuation and is covered by the structure check.
  - Each file is re-stamped with the new English.
  - **fil-PH, hi-IN, ur-PK, ta-LK and vi-VN** (used by no enabled country) are left on the old English, as you asked.
- **Checks:** legal-languages-1 **390/0**; the structure, numbers and links compare passes **51/51**; tsc is clean. Every other legal harness passes, except the four that fail the same way on HEAD.
- **FAQ, pricing note and terms agree** on all four points. No wording contradicts the terms, so nothing was changed there.
  - **The one mismatch is data, not wording.** In the 164 pay-at-the-truck / online-billed countries, the trial still ends on **Unlimited** until `20261119_plans_everywhere_1.sql` runs. The terms (from your deploy) say Pay as you go. Run that migration soon after the deploy, as planned.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- **Interpretations:**
  - **`lib/legal.ts`.** I moved `TERMS_UPDATED` to "19 November 2026" and `TERMS_VERSION` to `2026-11-19`.
    - The repo's own rule says to "change BOTH": the document's date line and this mirror, which the sitemap uses.
    - `TERMS_VERSION` is only written at signup, so it asks nobody to re-accept.
    - Neither is the terms text, so "change nothing else in the terms" holds.
  - **The two new paragraphs** ("How we collect our fee on pre-orders", "Your payment method") are bullets in §4's list, after "When we charge", where the draft places them, formatted like their neighbours.
  - **A rule superseded on purpose.** The terms now name the plan "Pay as you go". An older rule ("Terms §4 names no plan and no price", V16.2, in `scripts/world-countries-2.cjs`) said they shouldn't. Your approved wording names it, so the harness now checks that rule against the terms as they were before this change, with a dated note.

## 1 · The English (`content/legal/terms-and-conditions.md`)

Exactly the draft's "After" text:
- **Plans:** "Every country has a plan with no monthly fee, Pay as you go, where you pay only our fee on pre-orders."
- **Free trial:** it moves to **Pay as you go** "which has no monthly fee, unless you have chosen another plan. On Pay as you go you pay only our fee on pre-orders."
- **When we charge:** the new bullet, replacing "Paid in advance, and non-refundable". Its non-refundable sentences are kept.
- **How we collect our fee on pre-orders** and **Your payment method:** new bullets.
- **Cancellation:** "…then move to Pay as you go, which has no monthly fee."
- **HatchGrab fees on pre-orders:** replacing "…on online card orders".
- **Changes to prices and billing:** with "**at least 30 days' notice**".
- **If payment is not made:** the retry, "the rest of that day and **5 more full days**", the pause at midnight local time, and the three bullets.
- **§5:** "We take only the fee agreed for your plan, deducted at the point of the transaction where your country allows it, and otherwise charged monthly as described in section 4."
- **Last updated:** 19 November 2026.

## 2 · The translations (51 languages)

**The languages:** ar-AE az-AZ bg-BG bn-BD bs-BA ca-AD cs-CZ da-DK de-DE el-GR es-ES et-EE fi-FI fr-FR he-IL hr-HR hu-HU hy-AM id-ID is-IS it-IT ja-JP ka-GE kk-KZ ko-KR lt-LT lv-LV mk-MK mn-MN ms-MY nb-NO ne-NP nl-NL pl-PL pt-BR pt-PT ro-RO ru-KZ si-LK sk-SK sl-SI sq-AL sr-RS sv-SE sw-TZ th-TH tr-TR uk-UA uz-UZ zh-HK zh-TW.

They are every translated-terms language used by an enabled country, read live from `country_settings`, with variants mapped to their base the way the legal pages do (`lib/legal-documents.ts` → `legalBaseOf`).

**How they were made:**
- Six parallel translators wrote only the 13 changed paragraphs.
- They used each file's own register (vous/Sie/usted…) and its own terms, and each app's names for "Pay as you go" (`planNames.payg.name`) and the Billing screen (`manageShell.tabs.billing`).
- The paragraphs were put in by position, every unchanged sentence was checked to be byte for byte, and each file was re-stamped.
- One slip of mine was caught and corrected before anything was applied: the English given to the translators for the three "If payment is not made" bullets was off by two lines.

**Notes from the translators:**
- In many languages the "Pay as you go" plan's own name means "no monthly fee", so "…, which has no monthly fee" reads a little repetitively there. The English does the same, so it was kept.
- Several files put the plan name in their own quote marks.
- In da-DK the app calls the Billing screen "Abonnement", the same word the terms use for "subscription".
- lv-LV uses "priekšpasūtījumi" for pre-orders, not the app's "iepriekšējie pasūtījumi", which reads as "previous orders".

**English back-translations of the changed paragraphs** (my own back-translation of what is now in each file):

### fr-FR
- **Plans (changed sentence):** In every country we offer a plan with no monthly subscription, the "Sans abonnement" plan, with which you pay only our fees on pre-orders.
- **Free trial (changed sentences):** At the end of the trial your account moves to the **Sans abonnement** plan, which has no monthly subscription, unless you have chosen another plan. With the Sans abonnement plan you pay only our fees on pre-orders.
- **When we charge:** Monthly subscriptions are billed in advance, on the 1st of each month. If you choose a paid plan at the end of your free trial, we bill the rest of the month on the day the trial ends. If you move to a higher plan, we immediately bill the difference for the rest of the month. A move to a lower plan takes effect on the 1st of the following month. (The non-refundable sentences are unchanged.)
- **How we collect our fees on pre-orders:** Where your country allows it, we take our fees from each online card payment when the order is paid. Everywhere else, including every country where your customers pay at collection, we add up our fees on the previous month's pre-orders and debit them from your bank card on the 1st, together with your plan's subscription for the coming month. Your country's pricing page says which method applies. If a monthly charge is below your country's minimum, we carry it over to the following 1st.
- **Your payment method:** Where we bill you monthly, you must have a bank card on file (or Pix Automático in Brazil) at the end of your free trial, and you authorise us to debit it automatically for the amounts above. Without a payment method, online orders are suspended until you add one.
- **Cancellation (changed sentence):** You keep full access until the end of the period you have paid for, then you move to the Sans abonnement plan, which has no monthly subscription.
- **HatchGrab fees on pre-orders:** Depending on your plan, we take a set percentage of the food value of each pre-order placed through HatchGrab, whether your customer pays online or at collection: on all of it, on the value above the amount included each month in your plan, or not at all. These fees don't apply to taxes, tips, service charges or supplements, nor to cancelled or rejected orders. If you refund a card payment, our fees go down in proportion. **We take no fees on counter orders.**
- **Changes to prices and billing:** We may change our prices, our fees, what a plan contains or how we collect our fees in your country. We will give you **at least 30 days' notice** before a change affects you, and you may change plan or cancel before it takes effect.
- **If payment is not made:**
  - **If a payment fails, we retry it and send you an email.** You have the rest of the day and **5 more full days** to pay. If the amount is still unpaid after that, **online orders are suspended at midnight (local time) until the amount due is paid.**
  - Your account, your menu, your orders and your data stay unchanged.
  - Paying the unpaid amount (from the Facturation screen or by updating your bank card) reactivates online orders.
  - A suspension gives you no right to a refund of fees already paid, and you remain liable for the amounts due.
- **§5:** **We take only the fees agreed for your plan**, deducted at the time of the transaction where your country allows it, and otherwise billed monthly as described in section 4. Everything else is yours.

### es-ES (also what es-MX reads)
- **Plans (changed sentence):** In every country there is a plan with no monthly fee, Pago por uso, with which you pay only our commission on pre-orders.
- **Free trial (changed sentences):** At the end of the trial, your account moves to **Pago por uso**, which has no monthly fee, unless you have chosen another plan. With Pago por uso you pay only our commission on pre-orders.
- **When we charge:** Monthly plan fees are charged in advance, on the 1st of each month. If you choose a paid plan when your free trial ends, we charge you the rest of that month on the same day the trial ends. If you move to a higher plan, we immediately charge you the difference for the rest of the month. A move to a lower plan takes effect on the 1st of the following month. (The non-refundable sentences are unchanged.)
- **How we collect our commission on pre-orders:** When your country allows it, we deduct our commission from each online card payment when the order is paid. In all other cases, including every country where your customers pay at collection, we add up our commission on the previous month's pre-orders and charge it to your card on the 1st, together with your plan fee for the following month. Your country's pricing page says which option applies. If a monthly charge does not reach your country's minimum, we move it to the next 1st.
- **Your payment method:** When we charge you monthly, you need a card on file (or Pix Automático in Brazil) when your free trial ends, and you authorise us to charge the amounts above to it automatically. Without one, online orders are paused until you add one.
- **Cancellation (changed sentence):** You keep full access until the end of the period you have paid for, and then move to Pago por uso, which has no monthly fee.
- **HatchGrab's commissions on pre-orders:** Depending on your plan, we charge a stated percentage of the food value of each pre-order placed through HatchGrab, whether your customer pays online or at collection: on all of it, on the value above the amount your plan includes each month, or nothing at all. The commission does not apply to taxes, tips, service charges or surcharges, nor to cancelled or rejected orders. If you refund a card payment, our commission goes down in the same proportion. **We charge no commission on window orders.**
- **Changes to prices and billing:** We may change our prices, our fees, what a plan includes or the way we collect our commission in your country. We will notify you **at least 30 days in advance** before a change affects you, and you may change plan or cancel before it takes effect.
- **If payment is not made:**
  - **If a payment fails, we try again and send you an email.** You have the rest of that day and **5 more full days** to pay. If after that it is still unpaid, **online orders are paused at midnight (local time) until the amount is paid.**
  - Your account, your menu, your orders and your data stay as they are.
  - Paying the outstanding amount (from the Facturación screen or by updating your card) turns online orders back on.
  - The pause does not entitle you to a refund of fees already paid, and you remain responsible for the amounts owed.
- **§5:** **We only charge the commission agreed for your plan**, which is deducted at the time of the transaction when your country allows it and, otherwise, charged monthly as described in section 4. Everything else is yours.

### sw-TZ
- **Plans (changed sentence):** Every country has the Lipa kadri unavyotumia plan ("pay as you use"), which has no monthly fee and where you pay only our fee on pre-orders.
- **Free trial (changed sentences):** At the end of the trial your account moves to the **Lipa kadri unavyotumia** plan, which has no monthly fee, unless you have chosen another plan. On Lipa kadri unavyotumia you pay only our fee on pre-orders.
- **When we charge:** Monthly plan fees are charged in advance, on the 1st of each month. If you choose a paid plan when your free trial ends, we charge the remaining part of that month on the day the trial ends. If you upgrade your plan, we charge the price difference for the rest of the month straight away. A downgrade takes effect on the 1st of the following month. (The non-refundable sentences are unchanged.)
- **How we collect our fee on pre-orders:** Where your country allows it, we take our fee from each online card payment when the order is paid. Everywhere else, including every country where your customers pay at the food truck, we add up our fee on the previous month's pre-orders and charge it to your card on the 1st, together with your plan fee for the coming month. Your country's pricing page shows which applies. If the monthly amount to charge is below your country's minimum, we move it to the following 1st.
- **Your payment method:** Where we charge you every month, you need a saved card (or Pix Automático in Brazil) when your free trial ends, and you authorise us to charge it automatically for the amounts mentioned above. Without that card, online ordering is paused until you add it.
- **Cancellation (changed sentence):** You keep full access until the end of the period you paid for, then you move to the Lipa kadri unavyotumia plan, which has no monthly fee.
- **HatchGrab fees on pre-orders:** Depending on your plan, we charge a stated percentage of the food value of each pre-order placed through HatchGrab, whether your customer pays online or at the food truck: on the whole value, on the value above the amount your plan includes each month, or not at all. This fee is not charged on tax, tips, service fees or extra charges, nor on cancelled or rejected orders. If you refund a card payment, our fee goes down in proportion. **We charge no fee on on-the-spot orders.**
- **Changes to prices and billing:** We may change our prices, our fees, what a plan includes, or how we collect our fee in your country. We will give you **at least 30 days' notice** before a change affects you, and you can change plan or cancel before it takes effect.
- **If payment is not made:**
  - **If a payment fails, we try again and send you an email.** You have the rest of that day and **5 more full days** to pay. If it is still unpaid after that, **online ordering is paused at midnight (your local time) until the amount is paid.**
  - Your account, your menu, your orders and your data stay as they are.
  - Paying the amount owed (on the Bili screen, or by updating your card) turns online ordering back on.
  - Being paused does not give you the right to a refund of fees already paid, and you remain responsible for the amount owed.
- **§5:** **We take only the fee agreed for your plan**, deducted at the time of the transaction where your country allows it, and otherwise charged every month as described in section 4. Everything else is yours.

## 3 · Do the FAQ, pricing note and terms agree?

| Point | Terms (new) | Pricing (landing, /features, PDF) | FAQ | Verdict |
|---|---|---|---|---|
| The fee is on pre-orders | every pre-order, paid online or at the truck | monthly-billed countries: "0.99% on pre-orders, billed monthly"; card countries: "0.99%* on online orders only" ("online orders" covers every pre-order — the pricing-copy-1 rule) | …0001 / …0002 / …0005: "on online orders"; …1002: "On pre-orders you pay only your plan’s fee" | agree |
| Billed monthly where it can't come from the payment | "Everywhere else … charge it to your card on the 1st" | note: "Once a month we charge your card for your plan and our fee on last month’s pre-orders" | …1002: "charged to your card once a month" | agree |
| A card on file when the trial ends | "Where we charge you monthly, you need a card on file … when your free trial ends" | note: "You’ll need a card on file when your free trial ends." | …0003: "you don’t need a card to start" (not a contradiction); no FAQ says no card is needed at the trial's end | agree |
| The trial ends on Pay as you go | yes | card countries' banner: "When your trial ends you move to Pay as you go — no monthly fee —" | …0003: "you move to {trialEnd.name} ({trialEnd.price} a month)", from the data | agree in wording; **data mismatch in 164 countries until the plans migration** (below) |

**What I searched for:**
- **Messages:** all en-GB messages for "no fee on Pay at Hatch", "lock you out", "7 days", "in most countries", "online card orders", "deducted at the point". The only hits are Stripe's card-processing sentences (`pricing.footnote`, `order.serviceFeeNotice`), which agree with the terms' unchanged "Card processing" bullet.
- **Other legal documents:** the Privacy Policy and the Country-specific terms contain nothing contradicting.
- **No wording was changed.**

**The data mismatch (no wording fix possible):**
- Until `20261119_plans_everywhere_1.sql` runs, the 164 billed_at_truck / billed_online countries offer Unlimited only, and their trial ends on Unlimited.
- So in those countries, after your deploy, the pricing banner ("When your trial ends, Unlimited is … a month"), FAQ …0003's single-plan answer and the trial-end data all say Unlimited, while the terms say Pay as you go.
- Running the plans migration right after the deploy (your plan) closes this.

## 4 · Checks

| Check | Result |
|---|---|
| The English vs the draft | all 9 "After" blocks present word for word |
| `_legal-translations` compare (stamp, structure, numbers, links), 51 languages | **51/51** |
| `node scripts/_legal-translations.cjs <locale>` (fr-FR, es-ES, sw-TZ, de-DE, ja-JP, th-TH) | ✓ |
| **legal-languages-1** | **390 passed, 0 failed** |
| tsc | clean |
| The 20 swept harnesses that read the legal files | 16 pass. contact-1, france-1, pricing-copy-3 and tidy-1 fail **exactly as on HEAD** (checked in a temporary worktree, removed) |

**Re-pins**, each with a dated note:
- `scripts/_named-terms-postpay-1.cjs` + `scripts/fixtures/terms-postpay-1-code-edits.json`:
  - takes this round's English and `lib/legal.ts` edits back exactly (idempotent);
  - is hooked first into the undo helpers `_lp-world-countries-2/-3`, `_lp-contact-1`, `_lp-tidy-1` and `_lp-paperwork-1`;
  - also carries the sitemap's /terms lastmod, 2026-11-19, as a named item.
- `legal-languages-1` and `world-countries-3`: the five untranslated bases' Terms are exempt by name. Every other base × document must still match today's English.
- `world-countries-2`, `legal-languages-1`, `paperwork-1`: read through the undo, so they still prove the Terms as their round left them.
- `pricing-copy-2`: it was waiting for "the billing terms"; it now asserts "HatchGrab fees on pre-orders".
- `us-legal-draft`: the rendered /terms date.
- `plans-data-model`, `language-phase-1e-tidy`: the sitemap's /terms lastmod 2026-11-19.

## 5 · After your deploy

**Deploy this together with `645e145a`.** Then, in order:
1. **The FAQ translator until done.** It writes FAQ translations only. The 19 jobs left include the four pay-at-truck answers and the section titles.
2. **`20261119_plans_everywhere_1.sql`**, which needs `--approved-by-dominic`. It puts Pay as you go and Pro on sale in the 164 countries and moves their trial end to Pay as you go, so the terms, pricing and FAQ all agree there too.

Neither has been run.

## 6 · Hard rules and read-only SQL

- No database writes; no deploy or push.
- Pizzeria Gusto and Le Roi du Churrasco were not touched. The landing page is unchanged. No .env file was opened. docs/ is uncommitted.
- **Read-only SQL:**

```sql
select string_agg(distinct locale, ' ' order by locale) as enabled_locales from country_settings where enabled;
select id, show_in, left(question_en, 70) as q, answer_en, answer_single_plan_en from faq_items
 where status = 'published' and (answer_en ~* '(trial|card|fee|pay at|lock|fail|days|monthly|pre-order)'
    or answer_single_plan_en ~* '(trial|card|fee|pay at|lock|fail|days|monthly)') order by id;
```
