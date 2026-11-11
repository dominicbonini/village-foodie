# pricing-copy-2 — the sweep fixed, then the remaining "card orders" wording

11 November 2026 · on main, local only, **not pushed, not deployed** · Pizzeria Gusto not touched · no outreach_templates rows · no .env file opened.

## Summary

- **The sweep runs again, and is green apart from one wording decision.** Final full sweep at `aa5846b9`, in a clean worktree: **214 run · 213 passed · 1 failed**. The one is `costs-accounts-1`, which needs your choice (§2, decision 1).
- **Part A1:** `scripts/billing-3.cjs` named the payment processor in prose, which the sweep's screen refuses. The prose now says "the payment processor". The screen is unchanged and billing-3 still passes **51/51**.
- **Part A2:** all 20 pre-existing failures fixed at their cause, except the one decision. 16 had a stale harness, mostly a hard-coded "28 languages" that should read the live list. 4 were real product bugs, now fixed:
  - de-CH inherited a German "ß";
  - ko-KR's review email named the truck twice;
  - Icelandic's trial line lost its number at 21 months;
  - compare-suits-1 silently checked 8 languages against nothing.
- **Part B:** done exactly as approved.
  - The plan table's fee row in 39 locale files.
  - The 3 FAQ answers, run through the FAQ's own save path and check, then written by a committed migration. Translations regenerate through the hourly translator.
  - Pay as you go's description in the database and in 41 translations.
  - The FAQ help line and /llms.txt.
  - The terms of use are untouched.
- Message pipeline: translation-check (73 locales, 0 structural), messages-split, messages-parity (1,001,970) and the RTL check all pass.
- **Flag — other sessions were committing to main while I worked:**
  - `e0a322ab` world-countries-4
  - `ac3e57f7` languages-world-2 (glossary files only)
  - `f6297228` "landing"
  - **`f6297228` committed 16 of the A2 harness fixes made by my sub-agents** before I committed them myself. The changes are the ones described below; only the commit is not mine.
  - languages-world-2 has committed **no new message files yet**, so Part B1 covers every locale file at HEAD (39 carry the row).

## 1 · The prompt
- Nothing arrived garbled, and no instructions contradicted each other.
- One reading on B2: "through the FAQ's normal path so its checks run; show the SQL inline". The FAQ's normal path is `faqAction('item.update')`, which runs `checkItem` for every switched-on country before it writes. The standing rule is that live writes go only through committed migrations via `scripts/db-migrate.cjs`, never through ad-hoc writes. So:
  - **`scripts/pricing-copy-2.cjs` runs the real `faqAction('item.update')`** on each published answer, with the live single-plan answers, over the switched-on-countries world fixtures. All three pass its check, and the harness proves the migration writes exactly the text `faqAction` saves.
  - The write itself is migration `20261091`, run with db-migrate.

## 2 · Part A — the sweep

### A1 · billing-3
`scripts/billing-3.cjs` used the processor's name as a whole word three times: a header comment, a section heading and a check label. The screen (`scripts/run-harnesses.cjs`) refuses that word in any listed harness, so every sweep was refused.
- All three are now "the payment processor" / "the processor".
- Field names such as `stripeInvoiceId` were never matched, because the screen matches whole words only, and they are unchanged.
- The screen itself is unchanged. `node scripts/billing-3.cjs` → **51 passed, 0 failed**. Commit `580156f8`.

### A2 · the 20 harnesses
Every one was compared check by check against `280fd2e3`, before pricing-copy-1, and failed identically there. "Live list" means `LANGUAGE_BASES` / `LOCALES` read from `lib/i18n/locales.ts`, so languages-world-2's new languages need no edits.

| # | Harness | Cause | Fix | Now |
|---|---|---|---|---|
| 1 | europe-languages-1 | **Product bug.** de-CH (Swiss "ss") inherited de-DE's `provisionContent.standardCategories.dipsSauces` = "Dips & Soßen", added by languages-world-1 (`6baad30f`) with no de-CH override. The only ß left in de-CH. | de-CH override **"Dips & Saucen"** (de-CH already writes "Saucen" elsewhere) | 427/0 |
| 2 | language-phase-0 | Its "unsupported locale" example was tr-TR, which languages-world-1 made supported | The example is the first real tag outside the live LOCALES (uk-UA today), with a private-use tag (qaa-QM) as the last resort, so it can never become supported. The same rule is proven. | 164/0 |
| 3 | paperwork-1 | `BASES.length === 28` hard-coded; no string was missing | Live list | 114/0 |
| 4 | features-list-1 | Same | Live list | 16/0 |
| 5 | reviews-weather-1 | Hard-coded 28, and a **product bug**: ko-KR's `emailReview.from` had `{truck}` twice ("ordered from {truck}… {truck} sent this") | Live list; ko-KR now reads "이 이메일은 {truck} 푸드트럭에서 보낸 것으로, 이 푸드트럭에서 주문하셔서 HatchGrab을 통해 발송되었습니다." ("This email is from the {truck} food truck; it was sent through HatchGrab because you ordered from this food truck.") | 79/0 |
| 6 | site-chrome-1 | Crashed: it reads every current locale file at an older commit, and `ar-BH` and the other new locales didn't exist then | Files absent at its base are treated as new, not as changed | 35/0 |
| 7 | perf-1 | Hard-coded 28 | Live list. "Every namespace it has" is now checked exactly: each base's loaders equal the split files it has, replacing "more than 50" | 50/0 |
| 8 | cwv-2 | Its Greek checks compared the **working tree** with cwv-2's base. Every later all-language change (billing-2/3, languages-world-1, pricing-copy-1/2, …) therefore broke it, and earlier briefs patched in exceptions one by one | **Anchored on cwv-2's own commits** (parent of its first → its last), so the checks still prove exactly what cwv-2 changed: one Greek value, the non-breaking space. A new check asserts the anchor is found. | 44/0 |
| 9 | compare-suits-1 | Hard-coded 28, and a **hidden gap**: the 8 new bases had no "never name a card reader / till" word list, so they were checked against nothing | Live list; a list is now required for every base, and the 8 lists were added (id, vi, is, sr, tr, ko, zh-TW, he) | 72/0 |
| 10 | compare-autopublish-1 | Hard-coded 29 | Must be exactly en-GB plus the live bases, by name | 75/0 |
| 11 | badges-manual-1 | Hard-coded "27 SVGs, all downloaded 2026-11-08". languages-world-1 added 8 Google badges on 10 November, with provenance in the manifest's own note and commit `92cb875b`. Every file matches byte for byte. | Count from the live bases. The original 27 stay pinned to 8 November; any later badge needs a dated note naming it. | 11/0 |
| 12 | **costs-accounts-1** | Hard-coded 28 (fixed). **Still failing, on a decision:** in **id-ID, is-IS, sr-RS and tr-TR**, the accounts report's "Pay at the truck" label differs from that language's own price word (`planFeatures.priceWord.payAtHatch`). In every older base the two match. | **Decision 1 below** | 77/1 |
| 13 | legal-languages-1 | Crashed: its country map covered only the 28 old bases. The new bases' countries have no `country_settings` row (by design: languages-world-1 switched no country on). | A base's country is its region. New bases with no row are checked to redirect to English, as they do today, and their translations are rendered with a stand-in row and pass every check the launched languages do | 270/0 |
| 14 | world-countries-3 | Its paragraph splitter split only on blank lines. In the 8 new `country-specific-terms.md` files, a "## …" heading sits directly under a line, so the sections went off by one and "Mexico" was read from Japan's section. The translations are correct. | Splits before a heading line, as the renderer does (`lib/legal-markdown.tsx`) | 12/0 |
| 15 | faq-1 | Hard-coded "28 languages" in the Admin › FAQ summary, which correctly prints the live count | Live list. It was also re-pinned for B2's migration, which is named precisely: only those three answers | 208/0 |
| 16 | faq-3 | Same | Live list, and it must equal the bundled `LANGUAGE_BASES` | 175/0 |
| 17 | faq-2 | Same, plus numbers derived from it ("24 missing", "4/28") | Recomputed from the fixture and the live list | 150/0 |
| 18 | contact-1 | Crashed: it read new legal locale files at an older commit | Files absent at its base are new. Later key changes by named workstreams are set aside only in the files their commits touched, key by key. | 207/0 |
| 19 | tidy-1 | Crashed: the same (`null` from reading a new legal file at an older commit) | The same rule | 67/0 |
| 20 | copy-truth-1 | **Product bug.** Icelandic's plural "one" covers 1, 21, 31…, but is-IS's "one" branch had no number, so a 21-month trial read "the first month is free" | is-IS `auth.signup.subtitle` and `demoGetStarted.freeMonth`: one-branch "# mánuður er ókeypis og hefst þegar þú skráir þig." ("# month is free and starts when you sign up") | 56/0 |

Also flaky, and not one of the 20: **event-types-render**, the layout harness that measures with Playwright.
- It failed in the first sweep of this round with 8 measurements.
- On reruns it failed 14 and 20 on the same code, and also at `d71bf0bd`, where it had passed earlier today.
- It passed in the final sweep.
- Nothing it measures changed, and the build it reads is from 9 November. This is load-dependent and environmental, so I left it unchanged.

**Decisions needed (I didn't guess):**

**1. costs-accounts-1: the "Pay at the truck" label in 4 languages.** Which side changes?
- **(A) Change the report label to match the price word** (Manage › Reports only, no pricing-page text). id-ID "Bayar saat ambil", is-IS "Greiða á staðnum", sr-RS "Platite pri preuzimanju", tr-TR "Teslim alırken öde".
- **(B) Change the price word to the noun form** the label already uses (is-IS "Greiðsla við afhendingu", sr-RS "Plaćanje pri preuzimanju", tr-TR "Teslim alırken ödeme"). Most older bases use the noun form for both, but this changes pricing-page text. id-ID changes the label either way.
- Recommended: A.

**2. sr-RS dates in Cyrillic** (found along the way). Serbian legal pages are written in Latin script, which is intended per `92cb875b`, but their "last updated" date is formatted by Intl `sr-RS` in Cyrillic ("4. новембар 2026."). Options:
- (a) format sr-RS dates as `sr-Latn-RS` everywhere;
- (b) only on the legal pages;
- (c) leave as is.

**3. Native-speaker checks** (not blocking):
- The Icelandic fix drops "first" in the singular ("1 mánuður er ókeypis").
- Slovenian's plural "one" branch has the same missing number, but it only bites at 101+ months, so I left it.

**Optional tidy, not done:** a blank line before the "## European Economic Area and Switzerland" heading in the 8 new `country-specific-terms.md` files. They render correctly already.

## 3 · Part B — the wording (approved)

| # | What | Where it shows | Before → after |
|---|---|---|---|
| B1 | `planTable.pay.fee`, **39 locale files** (every one at HEAD that has it, including the 8 new bases; minimal edit, the word for "card" dropped, asterisk and footnote kept) | /features, the plan table in Manage › Billing, the plans PDF's table | "HatchGrab fee on online card orders*" → **"HatchGrab fee on online orders*"** (de "…auf Online-Bestellungen mit Karte*" → "…auf Online-Bestellungen*"; fr "…en ligne par carte*" → "…en ligne*"; …) |
| B2 | FAQ …0001 "How much does HatchGrab cost?" | /faq and the landing FAQ, every country with all three plans | "{payg.name} charges {payg.fee} on online card orders." → "…on online orders." |
| B2 | FAQ …0002 "What do I pay on each order?" | same | "On online card orders, {payg.name} charges…" → "On online orders, {payg.name} charges…" ("Online card payments also carry the card processing fee…" is a different sentence and stays) |
| B2 | FAQ …0005 "What if I only trade part of the year?" | Pay as you go countries | "You only pay {payg.fee} on online card orders when you take them." → "…on online orders when you take them." |
| B3 | `plans.description` for payg (database), and `planNames.payg.description` in **41 translations** | Manage's current-plan card, Admin | "No monthly fee. You only pay when a customer pays online by card." → **"No monthly fee. You only pay 0.99% on online orders."** Each language keeps its own first sentence. The second is translated, with 0.99% written as the app formats percentages in that locale ("0,99 %", "%0,99", …; RTL files without direction marks). Pay as you go is 99 bps in every country's `plan_prices` row (checked live), so the figure is true everywhere. ⚠️ It is now typed into the description, so a future fee change must update this sentence too. |
| B4 | `lib/faq/live-values.ts:110` (Admin › FAQ token help) | Admin › FAQ | "Its fee on online card orders, as a percentage" → "Its fee on online orders, as a percentage" |
| B4 | `lib/llms-text.ts:87` general paragraph, `:142` Pro's line | /llms.txt | "The HatchGrab fee is 0.99% of online card orders, on the plans that charge one…" → "…of online orders, on the plans that charge one…"; "…then 0.99% on online card orders." → "…then 0.99% on online orders." |
| B5 | Terms of use | — | **Not changed**, as instructed; the harness checks it |

- **Translations of the FAQ answers:** the 3 rows' stored translations (28–29 each) are now stale, because their source hash no longer matches. The hourly translator (`.github/workflows/faq-translate.yml`) regenerates them, the same as after any save in Admin › FAQ. Until then each language shows its previous translation.
- **Back-translations** follow in 41 files.
- **The site wasn't told to refresh** (REVALIDATE_SECRET isn't set locally), so the pages show the database change within 5 minutes.
- `/llms.txt` still says "card orders" in one place, on purpose: the per-country footnote line "* Plus … card processing on online card orders…", which is the kept footnote.

**`scripts/pricing-copy-2.cjs` — 597 passed, 0 failed.** It proves:
- the migration's three FAQ updates are exactly "online card orders" → "online orders", once each;
- each passes `faqAction`'s check, refreshes the public pages and changes the translation hash;
- the plans update and its guards;
- only the two keys moved in every locale file, the "card" word is gone and the asterisk kept;
- Pro, the cards and the footnote are unchanged;
- the back-translations;
- the help line and /llms.txt;
- the terms are unchanged;
- every locale file at HEAD.

**Re-pins**, in the same style as pricing-copy-1, using a new module `scripts/_lp-pricing-copy-2.cjs`:
- `faq-4`: /features hashed with the fee row put back.
- `faq-1`: B2's migration named precisely.
- `pricing-pages`: the plan-table row.
- `ai-search-1` and `pricing-copy-1`: /llms.txt.
- `contact-1`: de-CH's new override file, set aside only while it holds exactly that key.

## 4 · SQL run (migration `supabase/migrations/20261091_pricing_copy_2_wording.sql`, committed in `29c11653`, run with `scripts/db-migrate.cjs --approved-by-dominic`: one transaction, no error)

```sql
begin;

update public.faq_items
   set answer_en  = 'Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000001'
   and answer_en = 'Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online card orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.';

update public.faq_items
   set answer_en  = 'Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000002'
   and answer_en = 'Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.';

update public.faq_items
   set answer_en  = '{payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online orders when you take them.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000005'
   and answer_en = '{payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online card orders when you take them.';

update public.plans
   set description = 'No monthly fee. You only pay 0.99% on online orders.'
 where key = 'payg'
   and description = 'No monthly fee. You only pay when a customer pays online by card.';

commit;
```

**Read-only checks (Supabase MCP):**
- before: the three answers and Pay as you go's fee in every country (99 bps, all 44 rows);
- after: each answer has no "online card orders", has "online orders", and `updated_by = 'pricing-copy-2'`; `plans.payg.description` = "No monthly fee. You only pay 0.99% on online orders.".

## 5 · Commits (main, local, not pushed)
- `580156f8` A1: billing-3's harness wording
- `29c11653` B: messages (39 rows, 41 descriptions), back-translations, live-values, llms-text, migration 20261091, `scripts/pricing-copy-2.cjs`
- `f6297228` "landing" — **not my commit:** 16 of the A2 harness fixes (rows 3–7, 9–11, 13–19 above), made by my sub-agents and committed from the working tree by another session
- `60dd2c42` A2: the three translation fixes (de-CH, ko-KR, is-IS) and their split files and back-translations
- `5b38a0cc` A2: cwv-2, language-phase-0's helper, compare-suits-1's word lists, faq-4, and the re-pin module `_lp-pricing-copy-2.cjs`
- `aa5846b9` B re-pins: faq-1, pricing-pages, ai-search-1, pricing-copy-1, contact-1
- this report

## Undo (only if Dominic asks)
⛔ DO NOT RUN unless Dominic asks.
- **Code:** `git revert` the pricing-copy-2 commits, newest first (`git log --grep=^pricing-copy-2:`).
- **Database:** a new migration that sets the four rows back, each guarded by the new text:
  - the three `faq_items.answer_en` values to the `and answer_en = '…'` texts in §4;
  - `plans.description` for payg to "No monthly fee. You only pay when a customer pays online by card.";
  - run with `--approved-by-dominic`.
