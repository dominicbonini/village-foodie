# pricing-copy-4 — the pricing wording, split by whether a country offers online card payments

12 November 2026 · on main, local only, **not pushed, not deployed** · no database writes · Pizzeria Gusto not touched · no outreach_templates rows · no .env file opened.

## Summary

- **Card countries** now show what you asked for:
  - the trial banner with each language's own "Prefer to take payment up front? Add online card payments any time." sentence, restored exactly from the commit before `62865ee5`;
  - Pay as you go's line as **"<b>0.99%*</b> on online orders only. Walk-up orders are always free."**;
  - Pro's asterisk, the plan table's asterisk and the card-fee footnote, exactly as now.
- **Monthly-billing-only countries** show:
  - the current banner (no card sentence);
  - Pay as you go's line with no asterisk;
  - no asterisk on Pro or on the plan table's fee row;
  - no card-fee footnote, on the landing page, /features, Manage › Billing, the plans PDF and /llms.txt.
- **One shared helper decides.** `offersOnlineCardPayments` in `lib/country-settings-types.ts` reads `country_billing.payment_model`, which the settings loader now carries on every country:
  - `fee_from_payment` or `billed_online` → card country;
  - `billed_at_truck`, or no `country_billing` row → monthly billing only.
  - There are no per-page lists.
- **Today every live country is a card country** (44 rows, all `fee_from_payment` or `billed_online`), so the live site changes only for card countries: the banner sentence and Pay as you go's asterisk come back.
  - world-countries-5's rows (committed by another session, not yet run) set 161 new countries to `billed_at_truck`. Those will show the monthly-only wording automatically once switched on.
- **Every locale file at HEAD was done**: 73 files.
  - 61 got their own sentence back.
  - languages-world-2's 12 new languages carry their current banner, as you chose (option b).
  - A new check, `scripts/pricing-copy-4.cjs`, names each of the 11 languages still to come. Each one fails by name if it arrives without the asterisk and footnote rules.
- **Checks:**
  - translation-check: 0 structural problems in all 85 translated locales;
  - messages-split 205/0, messages-parity 1,215,912/0, RTL 125/0;
  - pricing-copy-4 1,135/0;
  - 10 identity harnesses re-pinned, all green in a clean worktree.
- **Full sweep** in a clean worktree at `fa37121e`: **218 run · 197 passed · 21 failed. None of the 21 is mine.** Each fails the same way at `2d2a5e2e`, the commit before my last one (§5):
  - 5 are languages-world-2's missing legal pages;
  - 4 need a `.next` build;
  - 3 come from world-countries-5's new country data;
  - 9 come from world-countries-5's new country menu (`2d2a5e2e`).
- **Screenshots** before and after are in `docs/pricing-copy-4/`: /uk and /fr (card), and /ie as a monthly-billing-only country. /ie was changed in memory on a local dev server only, never in the database.

## 0 · The prompt, and flags

- **Nothing arrived garbled.**
- **One contradiction, asked and answered before any change.**
  - The problem: "restore each locale's own sentence exactly from git; don't retranslate" could not hold for languages-world-2's 12 languages. All of them were created after `62865ee5`, so none ever had the sentence.
  - Your answer: **(b)**. The 12 get the current text, with no sentence. For them and for the 11 still to come, the check requires only the asterisk and footnote rules. If a card country ever uses such a language, it shows the current text instead of failing.
- **Two readings you confirmed:**
  - "Asterisk back" applies only to `pricing.fee.feeOnly`, and to the plans PDF that uses it. /compare, the comparison pages and /llms.txt never had an asterisk on that line, so they keep "online orders" with no asterisk in every country.
  - Card countries are decided by `country_billing.payment_model` in one helper, and **no row means monthly billing only**.
- ⚠️ **What the footnote hides along with the card fee.** Its second sentence is "Walk-up orders use your own card reader — HatchGrab charges 0%." That goes too in monthly-billing-only countries, because the brief says to hide the footnote. Each card still says "Walk-up orders are always free."
- ⚠️ **Not in this brief: other card-fee lines.** Two more lines name the card processor's fees and would be wrong in a monthly-billing-only country:
  - the comparison pages' `comparison.costs.cardFee`: "Online card payments with HatchGrab also carry Stripe's fees: …";
  - `comparison.costs.costA`.
  
  No comparison page is live in a monthly-only country today. **Your decision** whether they should follow the same helper.
- **Other sessions in this tree:**
  - **world-countries-5** committed the 167 new countries as data (`5d90fbfb`, `f262d9b3`). It also has uncommitted edits in the same files I edit: `messages/*.json`, `docs/i18n/back/*.json`, the country menu and others.
    - I made and tested my commits in a clean worktree, so **none of its uncommitted work is in them**.
    - Its working-tree copy of the back-translation files has re-serialised them, which moves my five keys to the end of each file. The content is the same. When it commits, those files will show my keys "moved"; that is harmless.
  - **longer-intervals** committed `1ea69047` while I worked. I rebased onto it and kept both sessions' lines in `costs-accounts-1.cjs` and `scripts/harnesses.json`.
- **A slip, stopped:** a `run-harnesses.cjs --help` call I made to read its usage started a full sweep in the shared tree. I stopped it within two minutes. It writes nothing and changed nothing.

## 1 · What changed (en-GB shown; every locale the same way)

| Where it shows | Card country | Monthly billing only |
|---|---|---|
| Trial banner: landing and plans PDF (`pricing.banner.body` → card: **`bodyCard`**) | "…without connecting a card processor at all. **Prefer to take payment up front? Add online card payments any time.** When your trial ends you move to <u>Pay as you go</u> — no monthly fee — unless you choose a plan. No card to start, no contract, cancel anytime." | The current text (no card sentence) |
| The same banner where the trial ends into a paid plan (`bodyOnly` → card: **`bodyOnlyCard`**) | Its own sentence restored the same way | The current text |
| Pay as you go card: landing and PDF (`pricing.fee.feeOnly` → card: **`feeOnlyCard`**) | "<b>0.99%*</b> on online orders only. Walk-up orders are always free." | "<b>0.99%</b> on online orders only. Walk-up orders are always free." (current) |
| Pro card: landing and PDF (`pricing.fee.included` → monthly: **`includedNoMark`**) | "…then <b>0.99%*</b>. …" (current) | "…then <b>0.99%</b>. …" |
| Plan table fee row: /features, Manage › Billing, PDF (`planTable.pay.fee` → monthly: **`feeNoMark`**) | "HatchGrab fee on online orders*" (current) | "HatchGrab fee on online orders" |
| Card-fee footnote (`pricing.footnote`): landing, /features, Manage › Billing, PDF | Shown (current) | **Hidden** |
| /llms.txt, each country's card sentence (the footnote in English) | Listed (current) | **Not listed**; the plans are listed as before |
| /compare, comparison pages, /llms.txt's Pay as you go line | "online orders", no asterisk (current) | The same |

- **Every existing key keeps its text.** The five new keys are added beside their siblings. The harness proves that between the commit before the message commit and the message commit, in every file, only those keys were added.
- **en-GB matches the brief word for word**, rendered: "Your first 3 months are completely free — every feature unlocked. With Pay at Hatch, customers order ahead … Prefer to take payment up front? Add online card payments any time. … cancel anytime."

## 2 · Every language

- **73 locale files carry these strings.** 51 language bases have the fee keys. The English, Spanish and French variants have their own banner.
- **61 files had the sentence before `62865ee5`.**
  - `bodyCard` and `bodyOnlyCard` are that file's own text from `62865ee5~1`, **byte for byte**, and the check compares them exactly.
  - At HEAD, each file's `body` was still exactly pricing-copy-1's text, so nothing that changed later was lost.
  - Back-translations (`docs/i18n/back`, 63 files) follow the same way.
- **12 files have no sentence on file**: languages-world-2's uk-UA, ru-KZ, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, hi-IN, bn-BD, ur-PK and ne-NP. Their card banner keys are their current banner (option b).
- **The fee lines, in every file:**
  - `feeOnlyCard` = `feeOnly` with the asterisk put after the fee, inside the bold, where it was before pricing-copy-1;
  - `includedNoMark` = `included` without its one asterisk;
  - `feeNoMark` = `pay.fee` without its asterisk.
  - Nothing was retranslated.
- **The 11 still to come**: fil-PH, sq-AL, mk-MK, bs-BA, ca-AD, si-LK, ta-LK, km-KH, lo-LA, sw-TZ and am-ET.
  - `scripts/pricing-copy-4.cjs` names each one. When its file arrives, the language must:
    - carry all five keys (a missing one would show English);
    - have no asterisk on `feeOnly`;
    - have `feeOnlyCard` = `feeOnly` with the asterisk;
    - have `includedNoMark` and `feeNoMark` with no asterisk.
  - Its banner text is not constrained.
  - ⚠️ **languages-world-2's handover file** (`docs/languages-world-2/handover/en-GB.start.json`) predates these keys, so its next translators should add the five. translation-check flags them as missing anyway, so a language can't be committed without them.

## 3 · The code

- **`lib/country-settings-types.ts`**:
  - `CountrySettings.paymentModel?: CountryPaymentModel | null`. The three values are written in this file, and the harness checks they equal Billing's `PAYMENT_MODELS`. Neither settings module imports `lib/billing`, because event-types and tidy-2 compile them against older files;
  - **`offersOnlineCardPayments(settings)`**, the one helper.
  - An object the loader didn't build (a harness fixture, which has no field) answers yes, as every live country does today. The loader always sets the field, to null when there is no row, so no real page takes that path.
- **`lib/country-settings.ts`**:
  - The one settings read now embeds `country_billing(payment_model)`. That table is service-role only, like the settings table.
  - `mapCountryRow` maps it: null for no row, and an unknown model is refused like any other value.
  - If a database has no `country_billing` table yet, the read runs again without it.
  - Every reader (landing, /features, the PDF, /llms.txt, Manage, Admin) gets the model with no extra query.
- **Every surface asks the helper:**
  - `components/pricing/PricingSection.tsx` (banner, fee lines, footnote);
  - `components/pricing/PlanTable.tsx` (the fee row);
  - `app/(public)/(site)/features/page.tsx` and Manage › Billing in `app/(app)/manage/[token]/page.tsx` (the footnote);
  - `lib/plans-pdf.ts` (banner, cards, table, footnote);
  - `lib/llms-text.ts` (the card sentence).
  - The harness also checks that no other file renders these keys, and that no page reads the model itself.
- **`app/api/admin/billing/route.ts`**: saving a country's payment model in Admin › Billing now drops the settings cache and expires the marketing pages' shared country data, so the wording changes at once.

## 4 · SQL

None was written or run against the database apart from one read-only lookup, which I showed you in chat before starting:

```sql
select cs.country_code, cs.enabled, cs.platform_fee_allowed, cb.payment_model
from public.country_settings cs left join public.country_billing cb using (country_code)
order by cb.payment_model nulls first, cs.enabled desc, cs.country_code;
```

- Result: 44 countries, all enabled.
- 39 are `fee_from_payment`; 5 are `billed_online` (BR, MX, MY, SG, TH).
- None is `billed_at_truck`, and every country has a row.

## 5 · Checks

| Check | Result |
|---|---|
| translation-check, every translated locale (85) | 0 structural each. The English variants are override files, and en-GB's 3 plural notes were there before. |
| messages-split | 205 passed, 0 failed |
| messages-parity | 1,215,912 passed, 0 failed |
| languages-world-1-rtl | 125 passed, 0 failed |
| `tsc --noEmit` | clean |
| **pricing-copy-4** (new, registered) | **1,135 passed, 0 failed** |
| pricing-copy-1 · pricing-copy-2 · pricing-copy-3 · costs-accounts-1 · pricing-pages | 1,403/0 · 633/0 · 34/0 · 78/0 · 145/0 |
| event-types · tidy-2 · cwv-2 · native-prices (fixed after the first sweep) | 192/0 · 44/0 · 44/0 · 53/0 |
| faq-1 · faq-2 · faq-3 · faq-4 · copy-truth-1 · seo-geo-2 · store-badges-1 | 208/0 · 162/0 · 187/0 · 100/0 · 56/0 · 89/0 · 61/0 (re-pinned) |
| **Full sweep, clean worktree at `fa37121e`** | **218 run · 197 passed · 21 failed. None of the 21 is this work's** (below) |

**The 21 sweep failures — none is this work's.** Each one fails with the same count at `2d2a5e2e`, the commit just before my last.
- **languages-world-2's missing legal pages (expected, per its report):** paperwork-1, world-countries-3, contact-1, tidy-1 and legal-languages-1.
- **No `.next` build in the worktree** (the build folder was cleared when the machine restarted): event-types-render, pending-card-render and pending-card-buttons.
  - midnight-events fails 19 Manage-view checks the same way at `2d2a5e2e`. It passed in my first sweep at `3a2452ae`, while the build was still there.
- **world-countries-5's new country data:** ireland-2, countries-api and world-countries-1. They fail the same way at `1ea69047`, before any of my commits.
- **world-countries-5's region-tabbed country menu and landing CSS (`2d2a5e2e`, committed during this work):**
  - faq-1, faq-2, faq-3, faq-4, seo-geo-2 and copy-truth-1: the landing HTML now differs in the country menu;
  - site-chrome-1 and cwv-1: `landing.css`;
  - compare-languages-1: a new country's segment.
  - All of these **passed in my first full sweep at `3a2452ae`**, which already had every pricing-copy-4 wording change but not `2d2a5e2e`.
  - That session's commit re-pinned other harnesses but not these. **They are for world-countries-5 to re-pin. I didn't touch its work.**
- My first sweep, at `3a2452ae`, found 4 failures that were mine: event-types, tidy-2, cwv-2 and native-prices. They are fixed in `fa37121e` and now pass (192/0, 44/0, 44/0, 53/0).

**`scripts/pricing-copy-4.cjs` proves:**
- The helper's answer for each model, for null and for no field. The loader embeds the model, maps object, null and array forms, and refuses an unknown model.
- Every pricing surface switches through the helper, and nothing else renders these keys.
- In every file, only the five keys were added.
- The card banner is the language's own pre-`62865ee5` text (61 files) or its current text (12). The asterisk rules hold. en-GB matches the brief word for word.
- The back-translations follow.
- The 12 languages, and each of the 11 by name.
- Rendered pages from fixtures, never the database:
  - /uk, /fr and /br as a card country (`fee_from_payment`, `billed_online`, and a fixture with no field) and as monthly billing only (`billed_at_truck`, and no row);
  - on each: the banner sentence, Pay as you go's and Pro's asterisks, the footnote, and no asterisk anywhere in a monthly-only pricing section;
  - /features' fee row and footnote; the plans PDF; and /llms.txt, where only the changed country's card sentence moves.

**Re-pins.** The landing pages render every fixture country as a card country. So the harnesses that hold the landing page byte-identical to an older snapshot first take this change back, then pricing-copy-1's, then compare every other byte as before:
- The module is `scripts/_lp-pricing-copy-4.cjs` (`asBefore`, `pc1After4`).
  - Its banner pairs come from each language's two keys side by side.
  - Pay as you go's line is matched as a whole sentence with the fee as a wildcard. In Japanese, Azerbaijani, Hindi, Mongolian and Turkish its ending is Pro's ending too, and a tail match would have taken Pro's asterisk as well.
- Harnesses re-pinned this way: faq-1, faq-2, faq-3, faq-4, copy-truth-1, seo-geo-2, store-badges-1, and pricing-copy-1 §3. Further re-pins are listed below.
- pricing-pages' three Pay as you go literals now read "0.99%*" (GB is a card country).
- costs-accounts-1, cwv-2 and every other "unchanged since …" check use `scripts/_moved-paths.cjs`. It now takes pricing-copy-4's recorded code edits back first (the two settings modules and Manage › Billing's footnote), against any revision from before it, so billing-1's reverse patch meets the text it was made against.
- native-prices reads Manage › Billing's footnote behind the card-country condition.
- costs-accounts-1 holds the order paths byte-identical to `8b32036f`. The two settings modules now pass only when putting exactly pricing-copy-4's recorded edits back gives that file (`undoCode`, `scripts/fixtures/pricing-copy-4-code-edits.json`). Any other change still fails.
- Each changed line carries a "⚠️ RE-PINNED (pricing-copy-4, 12 November 2026)" note.
- **Baseline**: all 10 were green at HEAD before my change. With the change and the re-pins, all 10 are green again in a clean worktree. I compared their pass counts with HEAD's, not each check one by one.

## 6 · Screenshots (localhost, before and after)

- `scripts/pricing-copy-4-screens.cjs` opened /uk, /fr and /ie on `hatchgrab.localhost:3123`, at widths 390 and 1280. Each shot is the pricing section cut from a full-page screenshot.
- The "before" server ran from a clean worktree at HEAD, and the "after" server from a clean worktree with only my commits, so no other session's work is in the pictures.
- **The monthly-billing-only test country is Ireland (/ie), local only.**
  - No country in the database is monthly billing only, and none is switched off.
  - So the local dev server was started with `scripts/_pricing-copy-4-monthly-preload.cjs` (`PC4_MONTHLY_ONLY=IE`). In that server's own memory only, it sets IE's payment model to `billed_at_truck` in the settings read's response.
  - Nothing is written anywhere, and the shared database never sees it.
- Files in `docs/pricing-copy-4/`: `before-` and `after-` × `uk`, `fr`, `ie` × `390`, `1280`, each a `.png` with a `.txt` of the section's text.
- No page scrolled sideways, and no page error was logged.
- Text diff, before → after:
  - **/uk:** "Prefer to take payment up front? Add online card payments any time." added · Pay as you go "0.99%" → "0.99%*". Pro and the footnote are unchanged.
  - **/fr:** "Vous préférez encaisser à l’avance ? Ajoutez le paiement en ligne par carte quand vous voulez." added · "0,99 %" → "0,99 %*".
  - **/ie (monthly billing only):** the banner is unchanged (no card sentence) · Pro "0.99%*" → "0.99%" · the footnote ("* Plus … card processing … Walk-up orders use your own card reader — HatchGrab charges 0%.") is gone · Pay as you go stays "0.99%" with no asterisk.

## 7 · Commits (main, local, not pushed)

- `f3a77387` the wording: 73 messages files, their split files and 63 back-translation files.
- `0ddb1aec` the helper, the loader, the six surfaces and the Admin › Billing cache expiry.
- `3a2452ae` the harness, the re-pin module, 10 re-pinned harnesses, the registry, the screenshot script, its local-only preload and the screenshots.
- `fa37121e` four fixes the first full sweep found:
  - event-types and tidy-2 compile the settings modules against older files, so those modules no longer import `lib/billing`;
  - cwv-2: Manage's footnote edit is taken back in `_moved-paths`;
  - native-prices' footnote regex.
- This report.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — for reference only.
- No database change was made, so there is no SQL to undo.
- Undo is code only: `git revert` of the five commits above, newest first.
