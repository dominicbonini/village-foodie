# languages-world-3: resuming the language rollout, one batch per run

**Date:** 16 November 2026 · **Runs so far:** batch 1 (ru-KZ legal), batch 2 (uk-UA legal), batch 3 (kk-KZ legal), batch 4 (uz-UZ legal), batch 5 (az-AZ legal), batch 6 (ka-GE legal), batch 7 (hy-AM legal), batch 8 (mn-MN legal), batch 9 (hi-IN legal), batch 10 (bn-BD legal) of 35 · **Resumes:** languages-world-2 (paused at 12 of 23)

## Progress

| # | Language | UI done | Legal done | Checks | Commit |
|---|---|---|---|---|---|
| 1 | ru-KZ Russian (Kazakhstan) | ✅ (languages-world-2) | ✅ batch 1 — **needs native/legal check** | `_legal-translations.cjs ru-KZ` 3/3 ✓; `legal-languages-1` /kz/privacy, /kz/terms, /kz/country-terms ✓ | 6ac91927 |
| 2 | uk-UA Ukrainian | ✅ (lw-2) | ✅ batch 2 — **needs native/legal check** | `_legal-translations.cjs uk-UA` 3/3 ✓; `legal-languages-1` /ua/privacy, /ua/terms, /ua/country-terms ✓ | daf550f8 |
| 3 | hi-IN Hindi | ✅ (lw-2) | ✅ batch 9 — **needs native/legal check** | `_legal-translations.cjs hi-IN` 3/3 ✓; `legal-languages-1` /in/privacy, /in/terms, /in/country-terms ✓ | 290cd1ef |
| 4 | bn-BD Bengali | ✅ (lw-2) | ✅ batch 10 — **needs native/legal check** | `_legal-translations.cjs bn-BD` 3/3 ✓; `legal-languages-1` /bd/privacy, /bd/terms, /bd/country-terms ✓ | 40e90e42 |
| 5 | ur-PK Urdu | ✅ (lw-2) | — next (batch 11) | | |
| 6 | kk-KZ Kazakh | ✅ (lw-2) | ✅ batch 3 — **needs native/legal check** | `_legal-translations.cjs kk-KZ` 3/3 ✓; `legal-languages-1` /kz/privacy, /kz/terms, /kz/country-terms ✓ | b77e79df |
| 7 | uz-UZ Uzbek | ✅ (lw-2) | ✅ batch 4 — **needs native/legal check** | `_legal-translations.cjs uz-UZ` 3/3 ✓; `legal-languages-1` /uz/privacy, /uz/terms, /uz/country-terms ✓ | 3c2fb908 |
| 8 | az-AZ Azerbaijani | ✅ (lw-2) | ✅ batch 5 — **needs native/legal check** | `_legal-translations.cjs az-AZ` 3/3 ✓; `legal-languages-1` /az/privacy, /az/terms, /az/country-terms ✓ | 34efe2f6 |
| 9 | ka-GE Georgian | ✅ (lw-2) | ✅ batch 6 — **needs native/legal check** | `_legal-translations.cjs ka-GE` 3/3 ✓; `legal-languages-1` /ge/privacy, /ge/terms, /ge/country-terms ✓ | 45bae559 |
| 10 | hy-AM Armenian | ✅ (lw-2) | ✅ batch 7 — **needs native/legal check** | `_legal-translations.cjs hy-AM` 3/3 ✓; `legal-languages-1` /am/privacy, /am/terms, /am/country-terms ✓ | 3f5c1a28 |
| 11 | mn-MN Mongolian | ✅ (lw-2) | ✅ batch 8 — **needs native/legal check** | `_legal-translations.cjs mn-MN` 3/3 ✓; `legal-languages-1` /mn/privacy, /mn/terms, /mn/country-terms ✓ | 2c30808f |
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

Legal pages: **10 of 23 languages done (30 of 69 pages).** UI: 12 of 23 done, fil-PH partly done.

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

## Batch 6: ka-GE legal pages

**Files:** [privacy-policy.md](../content/legal/ka-GE/privacy-policy.md), [terms-and-conditions.md](../content/legal/ka-GE/terms-and-conditions.md), [country-specific-terms.md](../content/legal/ka-GE/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Georgian. No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs ka-GE` 3/3 ✓. `legal-languages-1`: /ge/privacy, /ge/terms and /ge/country-terms render ("4 ნოემბერი, 2026", "1 ნოემბერი, 2026"), then the harness stops with ENOENT at the next missing base (hy-AM). **No screenshot**: the country has no row yet (see batch 2).

**Translation choices:** The Georgian UI words are used throughout: Pay at Hatch = „გადახდა ფუდტრაკთან“, food truck = ფუდტრაკი, hatch = სარკმელი (walk-up orders = orders taken on the spot, at the hatch), kitchen screen = სამზარეულოს ეკრანი, dashboard = შეკვეთების პანელი, and the demo checkbox is quoted exactly. controller/processor = დამმუშავებელი/უფლებამოსილი პირი (the terms Georgian data protection law uses), reverse charge = უკუდაბეგვრა (reverse charge), VAT = დღგ. Fixes before commit: an ASCII apostrophe in "Information Commissioner’s Office" made typographic, and an added "(SLA)" removed.

**Garbled spans:** none.

## Batch 7: hy-AM legal pages

**Files:** [privacy-policy.md](../content/legal/hy-AM/privacy-policy.md), [terms-and-conditions.md](../content/legal/hy-AM/terms-and-conditions.md), [country-specific-terms.md](../content/legal/hy-AM/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Armenian. No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs hy-AM` 3/3 ✓. `legal-languages-1`: /am/privacy, /am/terms and /am/country-terms render ("4 նոյեմբերի, 2026 թ.", "1 նոյեմբերի, 2026 թ."), then the harness stops with ENOENT at the next missing base (mn-MN). **No screenshot**: Armenia has no country row yet (see batch 2).

**Translation choices:** The Armenian UI words are used throughout: Pay at Hatch = «Վճարում վերցնելիս», food truck = ֆուդթրաք, hatch = պատուհան, walk-up orders = տեղում պատվերներ (as in the UI), kitchen screen = խոհանոցի էկրան, dashboard = վահանակ, and the demo checkbox is quoted exactly. Polite plural with lowercase «դուք/ձեր» mid-sentence, «» quotes, ։ full stop and ՝ for label–value pairs, as the UI does (the date line keeps the colon the checker needs: «Վերջին թարմացումը:»). controller/processor = վերահսկող/մշակող, VAT = ԱԱՀ, reverse charge = հակադարձ հարկում (reverse charge), tort = արտապայմանագրային վնաս (tort). Fixes before commit: an ASCII apostrophe in "Information Commissioner’s Office" made typographic; the Privacy Policy table header translated (Մատակարար).

**Garbled spans:** none.

## Batch 8: mn-MN legal pages

**Files:** [privacy-policy.md](../content/legal/mn-MN/privacy-policy.md), [terms-and-conditions.md](../content/legal/mn-MN/terms-and-conditions.md), [country-specific-terms.md](../content/legal/mn-MN/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Mongolian (Cyrillic). No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs mn-MN` 3/3 ✓. `legal-languages-1`: /mn/privacy, /mn/terms and /mn/country-terms render ("2026 оны арван нэгдүгээр сарын 4", "2026 оны арван нэгдүгээр сарын 1"), then the harness stops with ENOENT at the next missing base (hi-IN). **No screenshot**: Mongolia has no country row yet (see batch 2).

**Translation choices:** The Mongolian UI words are used throughout: Pay at Hatch = “Очиж авахдаа төлөх”, food truck = фүүд трак, operator = эрхлэгч, hatch = цонх, walk-up orders = газар дээрх захиалга (as in the UI), kitchen screen = гал тогооны дэлгэц, dashboard = хянах самбар, plan = багц, HatchGrab fee = шимтгэл, and the demo checkbox is quoted exactly (“HatchGrab-аас хааяа зөвлөгөө, мэдээ илгээх”). Polite Та/Таны with lowercase та/таны mid-sentence and “…” quotes, as the UI does; the date line uses the UI label “Сүүлд шинэчилсэн:”. controller/processor = хариуцагч/боловсруулагч, VAT = НӨАТ, reverse charge = урвуу тооцоолол (reverse charge), as in the UI’s VAT note; tort = гэрээний бус хохирол (tort). Local law names are in Mongolian with the official name and year in brackets. The two in-text dates follow the page’s own date style (“2026 оны аравдугаар сарын 1-нээс”, “2025 оны гуравдугаар сарын 21-нээс”). Fixes before commit: the liability list letters (a)–(f) changed to Cyrillic (а)–(е); the Privacy Policy table’s “Apple and Google” row translated (Apple болон Google), the processors still named verbatim.

**Garbled spans:** none.

## Batch 9: hi-IN legal pages

**Files:** [privacy-policy.md](../content/legal/hi-IN/privacy-policy.md), [terms-and-conditions.md](../content/legal/hi-IN/terms-and-conditions.md), [country-specific-terms.md](../content/legal/hi-IN/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Hindi (Devanagari). No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs hi-IN` 3/3 ✓. `legal-languages-1`: /in/privacy, /in/terms and /in/country-terms render ("4 नवंबर 2026", "1 नवंबर 2026"), then the harness stops with ENOENT at the next missing base (bn-BD). **No screenshot**: India has no country row yet (see batch 2).

**Translation choices:** The Hindi UI words are used throughout: Pay at Hatch = “पिकअप पर भुगतान”, food truck = फ़ूड ट्रक, operator = ऑपरेटर, hatch = ट्रक पर / काउंटर, walk-up orders = वॉक-इन ऑर्डर (as in the UI), kitchen screen = किचन डिस्प्ले (KDS), dashboard = डैशबोर्ड, collection = पिकअप, plan = प्लान, HatchGrab fee = HatchGrab शुल्क, free trial = फ़्री ट्रायल, and the demo checkbox is quoted exactly (“मुझे HatchGrab से कभी-कभी टिप्स और ख़बरें भेजें”). Polite आप, “…” quotes and । as the full stop, as the UI does; the date line uses the UI label “आख़िरी अपडेट:”. controller/processor = कंट्रोलर/प्रोसेसर, VAT = वैट (the UI’s own word; “वैट (VAT)” at first mention), GST stays GST, merchant of record = विक्रेता-रिकॉर्ड (merchant of record), reverse charge = रिवर्स चार्ज (reverse charge), tort = टॉर्ट. Local law names are in Hindi with the official name and year in brackets (e.g. उपभोक्ता अधिकार अधिनियम (Consumer Rights Act 2022)). The two in-text dates follow the page’s own date style (“1 अक्टूबर 2026 से”, “21 मार्च 2025 से लागू”). Fixes before commit: the liability list letters (a)–(f) changed to Devanagari (क)–(च); the Information Commissioner’s Office named in Hindi with the English in brackets; the Privacy Policy table’s “Apple and Google” row translated (Apple और Google), the processors still named verbatim.

**Garbled spans:** none.

## Batch 10: bn-BD legal pages

**Files:** [privacy-policy.md](../content/legal/bn-BD/privacy-policy.md), [terms-and-conditions.md](../content/legal/bn-BD/terms-and-conditions.md), [country-specific-terms.md](../content/legal/bn-BD/country-specific-terms.md).

🔴 **All three pages need a native/legal check.** These are faithful machine translations into Bengali (Bangla script). No native-speaking lawyer has reviewed them.

**Checks:** `_legal-translations.cjs bn-BD` 3/3 ✓. `legal-languages-1`: /bd/privacy, /bd/terms and /bd/country-terms render ("4 নভেম্বর, 2026", "1 নভেম্বর, 2026"), then the harness stops with ENOENT at the next missing base (ur-PK). **No screenshot**: Bangladesh has no country row yet (see batch 2).

**Translation choices:** The Bengali UI words are used throughout: Pay at Hatch = “পিকআপে পেমেন্ট”, food truck = ফুড ট্রাক, operator = অপারেটর, hatch = কাউন্টার, walk-up orders = ওয়াক-ইন অর্ডার (as in the UI), kitchen screen = কিচেন ডিসপ্লে, dashboard = ড্যাশবোর্ড, collection = পিকআপ, basket = কার্ট, postcode = পোস্ট কোড, plan = প্ল্যান, HatchGrab fee = HatchGrab-এর ফি, free trial = ফ্রি ট্রায়াল, refund = রিফান্ড, and the demo checkbox is quoted exactly (“HatchGrab থেকে মাঝে মাঝে টিপস ও খবর পাঠান”). Formal আপনি, “…” quotes and । as the full stop, as the UI does; the date line uses the UI label “সর্বশেষ হালনাগাদ:”. controller/processor = কন্ট্রোলার/প্রসেসর, VAT = ভ্যাট (the UI’s own word), GST stays GST, TVA/IVA kept with (ফ্রান্সের ভ্যাট)/(মেক্সিকোর ভ্যাট) at first mention, merchant of record = মার্চেন্ট অব রেকর্ড (merchant of record), reverse charge = রিভার্স চার্জ (reverse charge), chargeback = চার্জব্যাক (chargeback), tort = টর্ট, Article = অনুচ্ছেদ. Local law names are in Bengali with the official name and year in brackets (e.g. ভোক্তা অধিকার আইন (Consumer Rights Act 2022)); law numbers keep their English form (প্রবিধান (EU) No 1169/2011, Law No. 8,078 of 1990). The two in-text dates follow the page’s own date style, comma included (“1 অক্টোবর, 2026 থেকে”, “21 মার্চ, 2025 থেকে কার্যকর”). Fixes before commit: the liability list letters (a)–(f) changed to Bengali (ক)–(চ); “Article”/“articles” and “Regulation”/“Standard” left in English in the first draft changed to অনুচ্ছেদ/ধারা and প্রবিধান/মান; the in-text dates given the page’s comma; the Privacy Policy table’s “Apple and Google” row translated (Apple ও Google), the processors still named verbatim.

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

Batch 11 is the ur-PK legal pages. Runs continue automatically back to back, with no waits.
