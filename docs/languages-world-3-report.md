# languages-world-3: resuming the language rollout, one batch per run

**Date:** 16 November 2026 · **Runs so far:** batch 1 (ru-KZ legal), batch 2 (uk-UA legal), batch 3 (kk-KZ legal), batch 4 (uz-UZ legal), batch 5 (az-AZ legal) of 35 · **Resumes:** languages-world-2 (paused at 12 of 23)

## Progress

| # | Language | UI done | Legal done | Checks | Commit |
|---|---|---|---|---|---|
| 1 | ru-KZ Russian (Kazakhstan) | ✅ (languages-world-2) | ✅ batch 1 — **needs native/legal check** | `_legal-translations.cjs ru-KZ` 3/3 ✓; `legal-languages-1` /kz/privacy, /kz/terms, /kz/country-terms ✓ | 6ac91927 |
| 2 | uk-UA Ukrainian | ✅ (lw-2) | ✅ batch 2 — **needs native/legal check** | `_legal-translations.cjs uk-UA` 3/3 ✓; `legal-languages-1` /ua/privacy, /ua/terms, /ua/country-terms ✓ | daf550f8 |
| 3 | hi-IN Hindi | ✅ (lw-2) | — | | |
| 4 | bn-BD Bengali | ✅ (lw-2) | — | | |
| 5 | ur-PK Urdu | ✅ (lw-2) | — | | |
| 6 | kk-KZ Kazakh | ✅ (lw-2) | ✅ batch 3 — **needs native/legal check** | `_legal-translations.cjs kk-KZ` 3/3 ✓; `legal-languages-1` /kz/privacy, /kz/terms, /kz/country-terms ✓ | b77e79df |
| 7 | uz-UZ Uzbek | ✅ (lw-2) | ✅ batch 4 — **needs native/legal check** | `_legal-translations.cjs uz-UZ` 3/3 ✓; `legal-languages-1` /uz/privacy, /uz/terms, /uz/country-terms ✓ | 3c2fb908 |
| 8 | az-AZ Azerbaijani | ✅ (lw-2) | ✅ batch 5 — **needs native/legal check** | `_legal-translations.cjs az-AZ` 3/3 ✓; `legal-languages-1` /az/privacy, /az/terms, /az/country-terms ✓ | 34efe2f6 |
| 9 | ka-GE Georgian | ✅ (lw-2) | — next (batch 6) | | |
| 10 | hy-AM Armenian | ✅ (lw-2) | — | | |
| 11 | mn-MN Mongolian | ✅ (lw-2) | — | | |
| 12 | ne-NP Nepali | ✅ (lw-2) | — | | |
| 13 | fil-PH Filipino | 3 of 9 parts (lw-2) | — | | |
| 14 | sq-AL Albanian | — | — | | |
| 15 | bs-BA Bosnian | — | — | | |
| 16 | mk-MK Macedonian | — | — | | |
| 17 | ca-AD Catalan (Andorra) | — | — | | |
| 18 | sw-TZ Swahili | — | — | | |
| 19 | si-LK Sinhala | — | — | | |
| 20 | ta-LK Tamil (Sri Lanka) | — | — | | |
| 21 | km-KH Khmer | — | — | | |
| 22 | lo-LA Lao | — | — | | |
| 23 | am-ET Amharic | — | — | | |

Legal pages: **5 of 23 languages done (15 of 69 pages).** UI: 12 of 23 done, fil-PH partly done.

## Batch order

Batches go smallest and most-used first. Each legal batch is about half the size of a UI batch. The legal batches also unblock release of the 12 finished languages, and they close the five harnesses (Open item 12) that fail on missing legal files. So the legal pages for the finished languages come first.

| Batch | Work |
|---|---|
| 1 | ru-KZ legal ✅ (this run) |
| 2 | uk-UA legal ✅ |
| 3–12 | Legal pages for kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, hi-IN, bn-BD, ur-PK, ne-NP (one language per batch). The order now follows `legal-languages-1`, which stops at the first missing base, so each batch moves that harness one language further. |
| 13 | fil-PH UI: parts 04–09, consistency pass, install, LPROJ (handover README loop) |
| 14 | fil-PH legal |
| 15–34 | UI, then legal, for each of sq-AL, bs-BA, mk-MK, ca-AD, sw-TZ, si-LK, ta-LK, km-KH, lo-LA, am-ET (two batches per language) |
| last | Store listings for the 14 languages still without them, then the **full sweep, once** |

That is 34 batches plus the closing one: 35 runs in all.

Every UI batch adds the 5 pricing-copy-4 keys and runs `scripts/pricing-copy-4.cjs` (see the 9/12 rule below). The Swahili guard also needs languages-1’s "no list" re-pin (handover kit note).

## Batch 1: ru-KZ legal pages

**Files:**
- [content/legal/ru-KZ/privacy-policy.md](../content/legal/ru-KZ/privacy-policy.md)
- [content/legal/ru-KZ/terms-and-conditions.md](../content/legal/ru-KZ/terms-and-conditions.md)
- [content/legal/ru-KZ/country-specific-terms.md](../content/legal/ru-KZ/country-specific-terms.md)

🔴 **All three pages need a native/legal check.** These are faithful machine translations. No Russian-speaking lawyer has reviewed them.

**Checks run** (this locale only, not the full sweep):
- `node scripts/_legal-translations.cjs ru-KZ`: all 3 pass. The checks cover:
  - the source stamp and date line;
  - headings, bullet counts and tables;
  - numbers, links, emails and web addresses;
  - every processor named.
- `node scripts/legal-languages-1.cjs`: `/kz/privacy`, `/kz/terms` and `/kz/country-terms` render. Each page has the translation, the note linking to the English, the date in Russian («4 ноября 2026 г.» and «1 ноября 2026 г.»), the KZ footer and cross-links, a Russian title and its own canonical. The harness then stops with ENOENT on `uk-UA/privacy-policy.md`. That is expected: it needs every base's legal files, so it stays red until batch 23, as do paperwork-1, world-countries-3, contact-1 and tidy-1 (Open item 12).
- `translation-check`, `messages-keys-used` and `split-messages` were not run, because this batch changed no message files.

**Screenshot: not taken.** A local `next dev` on port 3471 returned **404** for `/kz/privacy`, because Kazakhstan is not switched on in the countries table. The harness above renders the page with a test copy of the country row instead. Taking a real screenshot would mean switching KZ on, which is a core-table row change, so I didn't. The server was stopped afterwards.

**Translation choices** (for the native reviewer):
- Kazakhstan's Russian, formal capital «Вы» throughout. The page titles match the existing `legalChrome` strings: «Политика конфиденциальности», «Условия использования», «Условия для отдельных стран». The date line is `**Обновлено:** {{LAST_UPDATED}}`.
- Product terms follow the ru-KZ UI:
  - Pay at Hatch → «оплата на месте»;
  - the hatch → «окно»;
  - kitchen screen → «кухонный экран».
- Foreign law and authority names get a Russian rendering with the official English (or local) name in brackets, e.g. «Закон о конфиденциальности (Privacy Act 2020)». The year sits only in the bracketed name: the checker counts numbers, so writing it in both would add extra ones. The same goes for law numbers, which keep the English digit grouping (Brazil's «Закон № 8,078»).
- Untranslatable legal terms keep the English in brackets on first use: merchant of record, reverse charge, chargeback, white-label, data intermediary, encargado, aviso de privacidad.
- Kept verbatim:
  - the Food Standards Code allergen names ("milk", "egg", …);
  - the French button labels ("Payer …");
  - the Japanese law names (特定商取引法, 個人情報保護法).
- VAT → НДС. TVA, IVA, GST, HST, PST and SST stay as their local abbreviations, as in the English.

**Garbled spans:** none found in the English sources.

## Batch 2: uk-UA legal pages

**Files:**
- [content/legal/uk-UA/privacy-policy.md](../content/legal/uk-UA/privacy-policy.md)
- [content/legal/uk-UA/terms-and-conditions.md](../content/legal/uk-UA/terms-and-conditions.md)
- [content/legal/uk-UA/country-specific-terms.md](../content/legal/uk-UA/country-specific-terms.md)

🔴 **All three pages need a native/legal check.** These are faithful machine translations. No Ukrainian-speaking lawyer has reviewed them.

**Checks run** (this locale only):
- `node scripts/_legal-translations.cjs uk-UA`: all 3 pass (stamp, date line, structure, numbers, links, addresses, processors).
- `node scripts/legal-languages-1.cjs`: `/ua/privacy`, `/ua/terms` and `/ua/country-terms` render. Each has the translation, the note linking to the English, the Ukrainian date («4 листопада 2026 р.» and «1 листопада 2026 р.»), the UA footer and cross-links, a Ukrainian title and its own canonical. The harness then stops with ENOENT on `kk-KZ/privacy-policy.md`, the next batch.

**Screenshot: not possible yet, for this or any languages-world-2 language.** Ukraine has no country row, and neither does Kazakhstan. On the real site their legal addresses redirect to the English page, which is the gate the harness proves. The harness then renders each page with a test copy of Japan's row. A real screenshot has to wait until Dominic adds the country rows. Adding them is a core-table change, so I am not doing it in this workstream.

**Translation choices** (for the native reviewer):
- Lowercase «ви»/«вам», as in the uk-UA UI (`legalChrome.questions`: «вам відповідять живі люди»). The page titles match `legalChrome`: «Політика конфіденційності», «Умови використання», «Умови для окремих країн». The date line is `**Останнє оновлення:** {{LAST_UPDATED}}`.
- Product terms follow the uk-UA UI:
  - Pay at Hatch → «оплата у фудтраку»;
  - the hatch → «віконце»;
  - kitchen screen → «екран кухні»;
  - account → «обліковий запис».
- The same conventions as ru-KZ: Ukrainian law names with the official name and year in brackets; untranslatable terms (merchant of record, reverse charge, chargeback, white-label, data intermediary) in English in brackets; allergen names, French button labels and Japanese law names verbatim; VAT → ПДВ, other tax abbreviations as in the English.

**Garbled spans:** none.

## Batch 3: kk-KZ legal pages

**Files:** [privacy-policy.md](../content/legal/kk-KZ/privacy-policy.md), [terms-and-conditions.md](../content/legal/kk-KZ/terms-and-conditions.md), [country-specific-terms.md](../content/legal/kk-KZ/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Kazakh. No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs kk-KZ` 3/3 ✓. `legal-languages-1`: /kz/privacy, /kz/terms and /kz/country-terms render («2026 ж. 4 қараша», «2026 ж. 1 қараша»), then the harness stops with ENOENT at the next missing base (uz-UZ). **No screenshot**: the country has no row yet (see batch 2).

**Translation choices:** Polite «сіз» forms as in the kk-KZ UI; titles match legalChrome («Құпиялылық саясаты», «Қызмет көрсету шарттары», «Елге қатысты шарттар»); date line `**Соңғы жаңарту:** {{LAST_UPDATED}}`. Pay at Hatch → «Фудтракта төлеу», the hatch → «терезе», kitchen screen → «ас үй экраны», VAT → ҚҚС. Law names: Kazakh rendering with the official name and year in brackets; same conventions as ru-KZ for untranslatable terms and verbatim names.

**Garbled spans:** none.

## Batch 4: uz-UZ legal pages

**Files:** [privacy-policy.md](../content/legal/uz-UZ/privacy-policy.md), [terms-and-conditions.md](../content/legal/uz-UZ/terms-and-conditions.md), [country-specific-terms.md](../content/legal/uz-UZ/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Uzbek. No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs uz-UZ` 3/3 ✓. `legal-languages-1`: /uz/privacy, /uz/terms and /uz/country-terms render ("4-noyabr, 2026", "1-noyabr, 2026"), then the harness stops with ENOENT at the next missing base (az-AZ). **No screenshot**: the country has no row yet (see batch 2).

**Translation choices:** Latin script with ʻ (U+02BB) in oʻ/gʻ and ʼ (U+02BC) for the tutuq belgisi, as in the UI. Lowercase «siz»; «Oxirgi yangilanish:» (legalChrome); Pay at Hatch «Olib ketishda toʻlash»; hatch «sotuv oynasi»; kitchen screen «oshxona ekrani (KDS)»; account «hisob»; VAT «QQS». Law names in Uzbek with the official name and year in brackets; merchant of record, reverse charge, chargeback, white-label, data intermediary, encargado and aviso de privacidad kept in English in brackets.

**Garbled spans:** none.

## Batch 5: az-AZ legal pages

**Files:** [privacy-policy.md](../content/legal/az-AZ/privacy-policy.md), [terms-and-conditions.md](../content/legal/az-AZ/terms-and-conditions.md), [country-specific-terms.md](../content/legal/az-AZ/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Azerbaijani. No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs az-AZ` 3/3 ✓. `legal-languages-1`: /az/privacy, /az/terms and /az/country-terms render ("4 noyabr 2026", "1 noyabr 2026"), then the harness stops with ENOENT at the next missing base (ka-GE). **No screenshot**: the country has no row yet (see batch 2).

**Translation choices:** Latin script. Lowercase «siz»; «Son yenilənmə:» (legalChrome); food truck written "food truck" with hyphenated suffixes ("food truck-dan"), as in the UI; Pay at Hatch «Yerində ödəniş»; hatch «pəncərə»; kitchen screen «mətbəx ekranı (KDS)»; dashboard «sifarişlər paneli»; account «hesab»; VAT «ƏDV». The demo checkbox is quoted exactly as the UI has it. Law names in Azerbaijani with the official name and year in brackets; merchant of record, reverse charge, chargeback, white-label, data intermediary, encargado and aviso de privacidad kept in English in brackets.

**Garbled spans:** none.

## The "9/12 fixed languages" rule (settled by Dominic, 16 November 2026)

- The **12 languages-world-2 languages** (uk-UA, ru-KZ, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, hi-IN, bn-BD, ur-PK, ne-NP) keep their current card banner (pricing-copy-4, option b). They are **not changed**.
- Each of the **11 languages still to come** gets pricing-copy-4's five pricing keys, translated from **current en-GB**. The handover file `docs/languages-world-2/handover/en-GB.start.json` predates these keys. The rules:
  - `feeOnly` has **no** asterisk;
  - `feeOnlyCard` is `feeOnly` **with** the asterisk;
  - `includedNoMark` and `feeNoMark` have no asterisk;
  - the card banner sentence ("…Prefer to take payment up front? Add online card payments any time…") and the asterisk footnote ("*0.99% on online card orders only") are included.
- The site decides which countries show them: card countries do, monthly-billing-only countries don't.
- **Also from trial-column-1 (commit d839ac46):** each incoming language needs `planTable.trial.length` ("{months, plural, one {# month} other {# months}}", with the plural forms taken from that base’s `comparison.cell.trial`) and `planTable.trial.ends` ("Ends {date}"). The handover file predates them too.
- **`node scripts/pricing-copy-4.cjs` is part of every UI batch's checks** and must pass for that language before the commit.

## Open decisions carried from languages-world-2 (not needed yet)

- Native digits for bn-BD and ne-NP (affects their legal batches 4 and 12: the checker requires ASCII digits, so those pages will use ASCII unless told otherwise).
- Country language choice for KZ (ru-KZ vs kk-KZ default), LK (si vs ta) and PH (fil vs en).

## Next

Batch 6 is the ka-GE legal pages. Runs continue automatically (60-minute gaps, at most 5 batches a UK day).
