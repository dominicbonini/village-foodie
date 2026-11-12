# pricing-copy-3 — the two decisions from pricing-copy-2

12 November 2026 · on main, local only, **not pushed, not deployed** · Pizzeria Gusto not touched · no outreach_templates rows · no .env file opened · **no SQL** (none was needed).

## Summary

- **1 · costs-accounts-1, option A — done.** The Manage › Reports "Pay at the truck" label in id-ID, is-IS, sr-RS and tr-TR is now that language's own price word. The price word and every pricing-page string are unchanged. costs-accounts-1 → **78/0**.
- **2 · Serbian dates, option (a) — done.** One shared mapping, `intlDateLocale` (sr-RS → sr-Latn-RS), defined in `lib/time-utils.ts` and re-exported as `lib/i18n/intl-locale.ts`. **Every** place Intl formats a date or month for a variable locale now goes through it: Manage, the KDS, receipts and emails via the truck time helpers, the legal pages' date, the relative day words, the posters, and Admin › Countries' sample.
  - Serbian now reads "4. novembar 2026.", "sreda", "Sutra" instead of "4. новембар 2026.", "среда", "Сутра".
  - Every other locale's output is byte-identical.
- **The sweep:**
  - **With my changes and nothing else, it is fully green: 215 run · 215 passed.** That tree is pricing-copy-3's commits on top of `260a69c4`, without the six languages added since.
  - **At HEAD (`ece1caa6`) it has 13 failures. All of them come from languages-world-2's six new bases** (ru-KZ, uk-UA, kk-KZ, uz-UZ, az-AZ, ka-GE), committed by that session while I worked and still being built (§3).
- **One decision for you** (§3): languages-world-2's six new bases still carry the old wording, because they were translated before pricing-copy-2/3:
  - the plan table's "…online **card** orders*" row;
  - Pay as you go's "…pays online **by card**" description;
  - in uk-UA and uz-UZ, a "Pay at the truck" label that isn't their price word.

  Applying the approved wording to them means editing that session's in-progress files, which this brief rules out ("commit only your own files"). Who should do it?
  - **(a) Recommended:** languages-world-2 applies it before it finishes. Its harnesses (pricing-copy-2, pricing-copy-3, costs-accounts-1) now name each file and key.
  - **(b)** I do it once languages-world-2 has finished.

## 1 · The prompt
Nothing arrived garbled, and no instructions contradicted each other. "The full sweep; it should now be fully green" can't hold at HEAD while languages-world-2 is mid-way through adding bases. I fixed only my own files and harnesses, proved the green result on a tree without those bases, and list the HEAD failures with their cause (§3). I didn't touch that session's files.

## 2 · What changed

### 2.1 · The "Pay at the truck" report label (option A)

| Locale | Label before | Label now (= `planFeatures.priceWord.payAtHatch`, unchanged) | Back-translation now |
|---|---|---|---|
| id-ID | Bayar di truk | **Bayar saat ambil** | Pay on pickup |
| is-IS | Greiðsla við afhendingu | **Greiða á staðnum** | Pay on the spot |
| sr-RS | Plaćanje pri preuzimanju | **Platite pri preuzimanju** | Pay at pickup |
| tr-TR | Teslim alırken ödeme | **Teslim alırken öde** | Pay on collection |

- Only `manageReports.accounts.payAtTruck` moved in each file. id-ID carries other keys named `payAtTruck` with the same text, and those weren't touched.
- It shows on the accountant view in Manage › Reports and its CSV.

### 2.2 · Serbian dates in Latin script — one mapping
- **The mapping:** `intlDateLocale(locale)`.
  - Any Serbian tag without a script subtag gets the Latin script: `sr` → `sr-Latn`, `sr-RS` → `sr-Latn-RS`.
  - A tag that names its script keeps it.
  - Every other locale is returned unchanged.
  - It is defined in `lib/time-utils.ts`, because that file must stay import-free (the engine harnesses compile it alone). `lib/i18n/intl-locale.ts` re-exports it as the name everything else imports.
- **Where it is used — every Intl date call whose locale can be a truck's or a reader's:**
  - `lib/time-utils.ts`:
    - `formatYmd` and `formatInstant` (Manage, KDS, order cards, receipts, billing and order emails all format dates through these);
    - the month and weekday names (`monthName`, `weekdayName` via `datePart`, used by the billing emails' month);
    - `formatYmdShortMonth`;
    - the Intl clock.
  - `lib/legal-documents.ts` `localLegalDate`: the legal pages' "last updated", now "4. novembar 2026." on the Serbian pages.
  - `lib/event-display.ts`: the "Today / Tomorrow" words (Intl RelativeTimeFormat), now "Danas / Sutra".
  - `lib/weekly-post/locale.ts`: the posters' dates and numeric order.
  - `components/admin/CountriesTab.tsx`: the clock sample beside each country's Times choice.
- **Nothing else formats a date for a variable locale.** The new harness scans every `.ts`/`.tsx` file under `app/`, `components/` and `lib/`. Every Intl date call takes a literal tag (admin and English-only paths) or `intlDateLocale(…)`; the one call with no locale reads only the time zone (`resolvedOptions`).
- No next-intl date formatter or ICU `{x, date}` argument is used anywhere, so nothing else formats a date.
- Numbers are unaffected: Serbian digits are the same in both scripts.

## 3 · Checks

| Check | Result |
|---|---|
| split-messages, then translation-check for id-ID, is-IS, sr-RS, tr-TR | 0 structural each |
| messages-split · messages-parity · languages-world-1-rtl | 205/0 · 1,001,972/0 · 111/0 |
| costs-accounts-1 | **78 passed, 0 failed** |
| typecheck (`tsc --noEmit`) | clean |
| **pricing-copy-3** (new) | **34 passed, 0 failed** |
| **Full sweep: pricing-copy-3 without languages-world-2's six new bases** (`260a69c4` + `fa394199` + `ece1caa6`) | **215 run · 215 passed · 0 failed** |
| Full sweep at HEAD `ece1caa6` (with the six new bases) | 215 run · 202 passed · 13 failed — all from the new bases, below |

**`scripts/pricing-copy-3.cjs` proves:**
- Part 1: the message commit changes exactly the four files and only that key in each; each label now equals its price word, which didn't change; the back-translations follow; every base keeps costs-accounts-1's rule.
- The mapping: one function, re-exported; sr-RS → sr-Latn-RS, sr → sr-Latn; script tags kept; every other app locale unchanged; time-utils still import-free.
- Each path produces Latin with no Cyrillic for a Serbian truck: formatYmd, formatInstant, formatYmdShortMonth, monthName ("novembar"), weekdayName ("sreda"), the legal date ("4. novembar 2026."), the event label and "Danas / Sutra", and the posters' dates. There is a control showing Intl itself writes sr-RS in Cyrillic, so the checks are real.
- formatYmd and the legal date are byte-identical to Intl with their own tag for every other locale.
- The source scan described above.

**Fixed along the way (my files):**
- `scripts/weekly-post.cjs`: its "broken variants" compile copies a fixed file list, and `lib/weekly-post/locale.ts` now imports `lib/i18n/intl-locale.ts`. Added to the list, as that harness's own comment asks; 251/0.
- `scripts/pricing-copy-1.cjs`: a locale created after pricing-copy-1 was treated as an error. It is now checked only for the old wording.
- `scripts/pricing-copy-2.cjs`: its per-language "card" words lacked languages-world-2's languages. A new base fell back to English "card" and **passed silently**. It now knows them, and an unknown language fails.
- **Flaky, unchanged:** event-types-render (the Playwright layout harness) and add-order-refresh each failed once and passed on rerun. Both passed in the 215/215 sweep.

**The 13 failures at HEAD — all from languages-world-2's six new bases, still in progress:**

| Harness | Cause |
|---|---|
| pricing-copy-2 (18 checks) | The six bases' `planTable.pay.fee` still says "card" (uk "…з оплатою карткою*", ru-KZ "…с оплатой картой*", kk, uz, az, ka), and their back-translations of the row and of `planNames.payg.description` carry the pre-pricing-copy-2 wording → **decision above** |
| pricing-copy-3 · costs-accounts-1 | uk-UA and uz-UZ: "Pay at the truck" label ≠ their price word → **decision above** |
| paperwork-1 · world-countries-3 · contact-1 · tidy-1 · legal-languages-1 | No `content/legal/<locale>/` files yet for the new bases (e.g. `content/legal/ru-KZ/privacy-policy.md`) |
| badges-manual-1 · store-badges-1 | No store badges yet for the six (`missing: ru-KZ, uk-UA, kk-KZ, uz-UZ, az-AZ, ka-GE`) |
| compare-suits-1 | No "never name a card reader / till" word lists yet for the six. Since pricing-copy-2 every base must have one, so they can't pass silently |
| billing-3 | The six lack billing-3's six new strings |
| faq-translate-fix | Its recorded reply leaves out one base more than the live list expects (33 vs 34): one of the new bases isn't asked |

These are that session's work to finish. None involves a file of mine, and none existed at my last green sweep.

## 4 · Commits (main, local, not pushed)
- `9e389c11` the four labels (+ split files, back-translations)
- `260a69c4` the Serbian date mapping and its uses; `scripts/pricing-copy-3.cjs`
- `fa394199` weekly-post's variant compile carries `lib/i18n/intl-locale.ts`
- `ece1caa6` pricing-copy-1 / pricing-copy-2 harness fixes for locales created after them
- this report

I committed by path only. Left alone in the tree (other sessions'): `docs/reference-manual.md`, `docs/world-countries-4/*`, and languages-world-2's files.

## Undo (only if Dominic asks)
⛔ DO NOT RUN unless Dominic asks.
- `git revert` the pricing-copy-3 commits, newest first (`git log --grep=^pricing-copy-3:`).
- No database change was made.
