# languages-world-3: resuming the language rollout, one batch per run

**Date:** 16 November 2026 · **Run:** batch 1 of 25 (ru-KZ legal pages) · **Resumes:** languages-world-2 (paused at 12 of 23)

## Progress

| # | Language | UI done | Legal done | Checks | Commit |
|---|---|---|---|---|---|
| 1 | ru-KZ Russian (Kazakhstan) | ✅ (languages-world-2) | ✅ batch 1 — **needs native/legal check** | `_legal-translations.cjs ru-KZ` 3/3 ✓; `legal-languages-1` /kz/privacy, /kz/terms, /kz/country-terms ✓ | languages-world-3 batch 1 |
| 2 | uk-UA Ukrainian | ✅ (lw-2) | — next (batch 2) | | |
| 3 | hi-IN Hindi | ✅ (lw-2) | — | | |
| 4 | bn-BD Bengali | ✅ (lw-2) | — | | |
| 5 | ur-PK Urdu | ✅ (lw-2) | — | | |
| 6 | kk-KZ Kazakh | ✅ (lw-2) | — | | |
| 7 | uz-UZ Uzbek | ✅ (lw-2) | — | | |
| 8 | az-AZ Azerbaijani | ✅ (lw-2) | — | | |
| 9 | ka-GE Georgian | ✅ (lw-2) | — | | |
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

Legal pages: **1 of 23 languages done (3 of 69 pages).** UI: 12 of 23 done, fil-PH partly done.

## Batch order

Batches go smallest and most-used first. Each legal batch is about half the size of a UI batch. The legal batches also unblock release of the 12 finished languages, and they close the five harnesses (Open item 12) that fail on missing legal files. So the legal pages for the finished languages come first.

| Batch | Work |
|---|---|
| 1 | ru-KZ legal ✅ (this run) |
| 2–12 | Legal pages for uk-UA, hi-IN, bn-BD, ur-PK, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, ne-NP (one language per batch) |
| 13 | fil-PH UI: parts 04–09, consistency pass, install, LPROJ (handover README loop) |
| 14 | fil-PH legal |
| 15–34 | UI, then legal, for each of sq-AL, bs-BA, mk-MK, ca-AD, sw-TZ, si-LK, ta-LK, km-KH, lo-LA, am-ET (two batches per language) |
| last | Store listings for the 14 languages still without them, then the **full sweep, once** |

That is 34 batches plus the closing one. The run count in the header ("25") came from the first plan, which counted UI and legal together. The real count is in this table.

When the UI batches for the 11 languages reach `translation-check`, it will flag the 5 pricing-copy-4 card-banner keys. `en-GB.start.json` in the handover kit does not have them, so each UI batch adds them from en-GB. The Swahili guard also needs languages-1's "no list" re-pin (handover kit note).

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

## Flag: the "9/12 fixed languages" wording note

The prompt asks me to read "the wording note about the 9/12 fixed languages". **No note with that wording exists** in the reference manual's languages section, in `docs/languages-world-2-report.md` or in the handover kit. The closest match is `docs/pricing-copy-4-report.md`: the **12** finished languages-world-2 bases already carry the current card-banner wording (option b), and the 11 still to come need its 5 keys. I have assumed that is the note meant and applied it as above (each new UI batch adds the 5 keys). If "9/12" means something else, for example a fixed set of 9, please say so before batch 13, the first UI batch.

## Open decisions carried from languages-world-2 (not needed yet)

- Native digits for bn-BD and ne-NP (affects their legal batches 4 and 12: the checker requires ASCII digits, so those pages will use ASCII unless told otherwise).
- Country language choice for KZ (ru-KZ vs kk-KZ default), LK (si vs ta) and PH (fil vs en).

## Next

Batch 2 is the uk-UA legal pages. Start it with "Continue languages-world-3: next batch".
