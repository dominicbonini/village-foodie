# languages-world-2 — 23 new languages: paused at 12 of 23

*11–12 November 2026. Started from `d71bf0bd`. Commits on main, made path by path: 12 language commits, 1 groundwork commit,
1 listings commit, 1 harness commit and 1 handover commit (§7). **Not pushed, not deployed.** No country was added to `country_settings` or the
country selector. No `outreach_templates` row was touched, Pizzeria Gusto is unchanged, no SQL was run and no `.env*` file was
opened. **Paused at your request** (weekly usage limit). The other 11 languages resume next week from the handover kit (§6).*

## Summary — what can be released now

- **12 languages are finished, committed and switched off:** uk-UA, ru-KZ, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN, hi-IN, bn-BD,
  ur-PK and ne-NP. Each one has:
  - all 5,897 en-GB keys plus the plan names, translated in 9 parts against one brief, then a consistency pass;
  - an English back-translation for every key;
  - **0 structural problems** in translation-check;
  - allergen-guard words, which passed their safety questions;
  - iOS app words (an `.lproj` folder);
  - registration in `lib/i18n/locales.ts`.

  Urdu is right to left: `isRtl` / `isRtlLang` now include `ur`, and the RTL check passes **125/125**.
- **They are safe to deploy as they are.** No country row points at them, so nobody sees them until a later prompt adds and
  switches on the country.
  - **One condition:** the clean sweep still has 5 harnesses failing until the new bases get their legal pages, plus 6 that
    need a built run to confirm (§1a). Either do the legal pages first, or re-pin those 5.
  - One side effect: once deployed, the hourly FAQ translator will translate the FAQ into these 12 locales. That is model
    spend, within its cap.
  - Each country needs the items in §4 before its switch-on.
- **Also done:**
  - SEO research for **all 23** languages: keywords, meta text, glossary tables and SERP rows;
  - allergen-guard lists for all 23, of which 11 are ready but not installed;
  - store listings for 7, of which 6 are staged in `data/store-listing/next/`.
- **Not done yet:**
  - the other 11 languages: sq-AL, mk-MK, bs-BA, ca-AD, si-LK, ta-LK, km-KH, lo-LA, fil-PH (3 of 9 parts done), sw-TZ, am-ET;
  - the legal pages for all 23;
  - store listings for 14;
  - store badges and URL segments, which I left for the country prompts (§0).

## 0 · Flags, readings and scope

- **No span of the brief arrived garbled.** No two instructions contradicted each other.
- **I read four parts of "follow languages-world-1's process exactly" as limited by your specific rules.** None of these is
  done:
  - **URL segments** (`COUNTRY_PATH_SEGMENTS`) and **store-badge files**: both are landing-page/country setup, which "no
    landing-page changes other than the language files" and "don't add any country" rule out. They come with each country prompt.
    `scripts/store-badges-1.cjs` is re-pinned: the new bases read both English badges for now (61/61).
  - **Legal pages:** world-1 translated Privacy, Terms and Country-specific terms for its new bases. This brief doesn't list
    them, but its process does. I put them last, and they didn't start before the pause. Allow 3 agent runs per language.
  - **Fonts:** listed only (§5), none added, as asked.
- **Digits.** The Bengali and Nepali research wanted native digits in typed text. I kept **ASCII digits** everywhere, as
  world-1 did for Arabic, because it keeps every number checkable and input examples typeable. **Your decision:** Intl renders
  live numbers for bn-BD in Bengali digits (৳১,২৩৪.৫০) and for ne-NP in Devanagari digits. Choose one:
  - force `-u-nu-latn` for those locales;
  - switch the typed text to native digits.
- **One language per country.** Kazakhstan now has two locales (ru-KZ, kk-KZ), and Sri Lanka will have two (si-LK, ta-LK).
  - The Philippines already has en-PH, and Filipino research found PH businesses write English.
  - Kyrgyzstan is meant to use ru-KZ.
  - The country prompt has to pick each country's language. Research recommends English as the default for LK and PH (§3).
- **The en-GB catch-up.** I compared en-GB at `d71bf0bd` with HEAD. The only changed key is `planTable.pay.fee` (pricing-copy-2,
  "online orders" without "card"). All 12 committed languages already carry the new wording and Pay as you go's "0.99 %"
  description:
  - the later parts were translated from it;
  - another session's pricing-copy-4 (`f37bc348`) applied it to the first eight.

  `scripts/pricing-copy-2.cjs` passes 633/633.

## 1 · Checks

| Check | Result |
|---|---|
| translation-check, the 12 committed locales | **0 structural** each. Flag tables in `docs/languages-world-2/<locale>-translation-flags.md` |
| RTL check (`scripts/languages-world-1-rtl.cjs`, re-pinned for Urdu) | **125/125**: same rule in both files, no bidi controls, Urdu in its own script |
| split-messages `--check` / glossary-build `--check` / ios native-strings `--check` | in step / 60 languages / 98 files in 49 languages |
| allergen guard | all 23 lists PASS their own proof: 11–13 safety questions caught, 8–12 plain questions not caught, per language |
| allergen-label audit (`menuBadges.allergen.*` back-translations against en-GB) | no wrong allergen; Bengali uses descriptive names (shrimp/crab-type…) |
| harnesses touched by this work | store-badges-1 61/61 and badges-manual-1 11/11 (re-pinned: the new bases read the English badges for now); compare-suits-1 72/72 (card-word lists added for the 12); languages-1 91/91; pricing-copy-2 633/633 |
| messages-parity and the full sweep (`run-harnesses.cjs`) | see §1a |

Known checker noise:
- translation-check's glossary matcher (`termRe`, `[\p{L}-]*`) can't step over Indic vowel signs (\p{M}). It flags correct
  Hindi, Bengali, Nepali and Urdu text as "glossary term not used".
- Azerbaijani shows 578 "English left" flags. Nearly all are the locked loanword "food truck"; the rest are brands and codes
  (checked).

### 1a · The sweep
Run twice.

**1. In the shared working tree:** 14 failed. Other sessions' uncommitted edits were in that tree (for example
`app/(app)/trucks/[slug]/order/page.tsx`). Those edits explain cwv-2, costs-accounts-1 and language-phase-1a/1b/2: all of these
are byte-identity checks on GB/US English output, which this work does not change. Two failures were mine and are fixed in
`103279c4`:
- compare-suits-1 needed card-word lists for the new bases (now 72/72);
- badges-manual-1 expected a badge per base (now 11/11).

**2. In a clean worktree at `103279c4`: 215 harnesses, 204 passed, 11 failed.**
- **5 fail because the 12 new bases have no legal pages yet:** paperwork-1, world-countries-3, contact-1, tidy-1 and
  legal-languages-1. Each reads `content/legal/<base>/…` for every registered base, and legal-languages-1 also needs a URL
  segment. The app itself is safe: `legalPlace` redirects a language with no translation to the English page.
  - **They turn green when the legal pages land** (§6). I did not re-pin them, so these checks don't weaken for every other
    language.
  - If you want a green sweep before then, they can be re-pinned with a named exemption list. **Your call.**
- **6 fail only because a fresh worktree has no `.next` build:** event-types-render, pending-card-render, pending-card-buttons
  and language-phase-1d/1d2/1e ("no .next/static — run `npx next build` first"). I can't build there without the environment
  files I must not open.
  - language-phase-1d/1d2 also fail in the shared tree, on GB English byte-identity ("F === BEFORE"), which the new languages
    don't touch.
  - **Not proven unrelated by a clean built run.** That is the one check still to do before release.

## 2 · Per language

**Done** means committed: 0 structural, registered and switched off. "Pay" lists the feature name and the short label.

| Locale | Status | Primary landing keyword | Pay at the truck | Main decision / note |
|---|---|---|---|---|
| uk-UA | **done** | система замовлень для фудтраків | Оплата у фудтраку / Оплата на місці | Law 3153-IX Art. 19 (in force after martial law): the order button «Замовлення з оплатою» is used, for a lawyer to confirm. Telegram/Viber rather than WhatsApp |
| ru-KZ | **done** | система заказов для фудтраков | Оплата в фудтраке / Оплата на месте | Kazakhstan's Russian, capital Вы (Kaspi). The one Russian App Store listing would also show in Russia |
| kk-KZ | **done** | фудтрактарға арналған тапсырыс жүйесі | Фудтракта төлеу / Орнында төлеу | Cyrillic: the ministry set no Latin date as of 8 Sep 2026. фудтрак is low confidence |
| uz-UZ | **done** | fudtraklar uchun buyurtma tizimi | Fudtrakda toʻlash / Olib ketishda toʻlash | Latin with ʻ ʼ. Neither store supports Uzbek. Telegram dominates |
| az-AZ | **done** | food truck sifariş sistemi | Götürərkən ödəniş / Yerində ödəniş | siz, although Bolt Food writes sən. «haqq» for our fee, so «komissiyasız» stays true |
| ka-GE | **done** | ფუდტრაკის შეკვეთების სისტემა | გადახდა შეკვეთის აღებისას / გადახდა ფუდტრაკთან | The 2022 consumer law sets no button wording. Plain «შეკვეთა» is used; «…გადახდის ვალდებულებით» is the stronger option |
| hy-AM | **done** | ֆուդթրաքի պատվերների համակարգ | Վճարում վերցնելիս / Վճարել ֆուդթրաքում | Food-truck and pickup words are unverified |
| mn-MN | **done** | фүүд трак захиалгын систем | Очиж авахдаа төлөх / Газар дээр нь төлөх | фүүд трак is unattested; native check needed. Messenger may matter more |
| hi-IN | **done** | फ़ूड ट्रक ऑनलाइन ऑर्डर सिस्टम | पिकअप के समय भुगतान / पिकअप पर भुगतान | People search in English or romanised Hindi; is the English page India's main SEO page? VAT kept as वैट where it means VAT |
| bn-BD | **done** | ফুড ট্রাক অনলাইন অর্ডার সিস্টেম | পিকআপের সময় পেমেন্ট / পিকআপে পেমেন্ট | Digits (§0). Dhaka's trade is mostly ফুড কার্ট (secondary keyword) |
| ur-PK | **done**, RTL | فوڈ ٹرک آن لائن آرڈر سسٹم | پک اپ پر ادائیگی / ٹرک پر ادائیگی | Halal demo items replace the two pork ones (same allergens). Pakistan is cash-on-delivery-heavy, so COD wording is avoided |
| ne-NP | **done** | फुड ट्रक अनलाइन अर्डर सिस्टम | पिकअप गर्दा भुक्तानी / ट्रकमै भुक्तानी | Digits (§0). No beef in the demo dishes |
| fil-PH | 3/9 parts | food truck ordering system (English) | Bayad sa Pick-up / Magbayad sa truck | Research: en-PH may be the better default for the Philippines. Taglish register |
| sq-AL | research only | sistem porosish për food truck | Pagesë në marrje / Paguaj në marrje | Statutory button «porosi me detyrim pagese» (Ligji 9902/2008 neni 37/2, checked). Listing written |
| mk-MK | research only | систем за нарачки за фуд тракови | Плаќање при подигнување / Плати при подигнување | The order-button statute was not read. фуд трак is unattested |
| bs-BA | research only | sistem za narudžbe za food truckove | Plaćanje pri preuzimanju / Platite pri preuzimanju | Titles run long with the full country name: use "BiH"? Neither store supports Bosnian |
| ca-AD | research only | sistema de comandes per a food trucks | Pagament en recollir / Paga en recollir | Andorra: IGI, not IVA. No statutory button wording |
| si-LK | research only | food truck ඇණවුම් පද්ධතිය | රැගෙන යන විට ගෙවීම / ස්ථානයේදී ගෙවන්න | Sri Lankans search in English |
| ta-LK | research only | food truck ஆர்டர் முறைமை | எடுக்க வரும்போது செலுத்துதல் / நேரில் செலுத்தவும் | Intl groups ta-LK numbers the Indian way (12,34,567) |
| km-KH | research only | ប្រព័ន្ធកុម្ម៉ង់សម្រាប់ Food Truck | បង់ប្រាក់ពេលទៅយក / បង់ពេលទៅយក | កុម្ម៉ង់ vs បញ្ជាទិញ. Telegram |
| lo-LA | research only | ລະບົບສັ່ງອາຫານສຳລັບ Food Truck | ຈ່າຍເງິນຕອນໄປຮັບ / ຈ່າຍທີ່ລົດ | Intl prints ₭12.500; Lao businesses write 10,000ກີບ |
| sw-TZ | research only | mfumo wa oda mtandaoni kwa food truck | Lipa Unapochukua / Lipa ukichukua | Mobile money dominates. Adding the sw guard list means re-pinning languages-1's "no list" language (sw-KE) |
| am-ET | research only | የምግብ መኪና የኦንላይን ትዕዛዝ ስርዓት | ሲወስዱ ክፍያ / ሲወስዱ ይክፈሉ | Low confidence (apps publish English). 24-hour clock (Ethiopian time). Telegram/telebirr |

## 3 · What was made (the 12 committed languages)

- **Messages:**
  - `messages/<locale>.json` and `messages/ns/<locale>/*`;
  - the regenerated catalogue (`lib/i18n/catalog/*`, `lib/i18n/locale-files.ts`);
  - `docs/i18n/back/<locale>.json`.
- **How each was translated:**
  - 9 parts against one brief, plus a shared term sheet;
  - then one consistency pass per language, with 42–229 corrections each.
- **Rules added to the brief during the run:**
  - **Deals = meal deal / combo, never a "promotion".** Russian and Ukrainian had drifted to «акция».
  - **VAT stays VAT.** Hindi had written GST.
  - **Allergen names are exact.** A Filipino draft had yam → taro.
  - **Plural `one` must show the number where it covers more than 1** (uk/ru: 21, 31…; hy/bn/hi/ur: 0).
- **Glossary:** 23 tables in `docs/i18n/seo-glossary-eu.md`, built to `lib/i18n/glossary/<lang>.json` (Russian is filed as
  `ru`). Cash-on-delivery bans for uk/sq/bs/ca/hi/ur/sw, and Latin-only bans for uz and bs.
- **SEO:** each locale's landing, features, compare, comparison, about and truck-page meta text uses its researched keyword.
  - 184 SERP rows are in `docs/seo-geo-1/keywords.csv`.
  - The research tool is US-indexed, so the ranks are not local Google ranks.
- **Allergen guard:** `lib/allergen-guard/<lang>.json` plus one import each, for uk ru kk uz az ka hy mn hi bn ur ne.
  - Stems only, never bare allergen names.
  - Romanised and mixed-script spellings are included.
  - Trap stems that matched ordinary words were removed.
- **iOS:** `.lproj` folders for uk ru kk uz az ka hy mn hi bn ur ne, generated from `nativeShell.binary`.
  - **Which iOS UI languages exist:** Ukrainian, Russian, Kazakh, Hindi, Bengali, Urdu, Tamil and Catalan are iOS system
    languages. The others show only for users who add them to their device's preferred languages; world-1 did the same for
    Icelandic and Serbian.
  - Android has no translatable strings.
- **Store listings:** staged in `data/store-listing/next/` for uk-UA, ru-KZ, kk-KZ, az-AZ, ka-GE and hy-AM, with back-translations.
  - Store support by language:
    - both App Store and Google Play: uk, ru, ca, hi, bn, ur and ta;
    - Google Play only: kk, az, ka, hy, sq, mk, ne, si, km, lo, mn, fil, sw and am;
    - **neither store: uz, bs.**
  - `whatsNew` says "60 languages". Correct it before upload.

## 4 · Before each country is switched on (a later prompt)

1. **Its `country_settings` row and URL segment**, and which language the country uses (§0).
2. **Store badges for its language.**
   - Apple has badges for uk, ru, az, ca, hi, bn, ur and ta.
   - Google's badge page needs a sign-in; a mirror has all but am.
3. **Legal pages in its language**, plus its own section in Country-specific terms (a lawyer's job; no section exists for these
   countries).
4. **The scoped web font (§5)** and one screenshot pass per new script.
5. **🔴 Kitchen tickets.** `lib/printing/ticket.ts` (`encodeEscPos`, lines 471–494) sends only ASCII and "£" to the printer, and
   every other character prints as "?".
   - Tickets in Cyrillic, Georgian, Armenian, Devanagari, Bengali, Urdu, Sinhala, Tamil, Khmer, Lao and Ethiopic would print as
     question marks. Latin-script languages only lose their accents.
   - This already affects Greek, Bulgarian, Japanese, Chinese, Thai, Arabic and Hebrew.
   - It needs a raster (image) ticket path or printer code pages. **Your decision.**
6. **The decisions in §2** (order-button wording, digits, number grouping).
7. **Stripe / card availability** in each country.
8. **Existing bug, not changed:** the Thai guard stem แพ้ ("allergic") also matches แพง ("expensive"). Thai price questions get
   the allergen reply. It fails safe, but the AI never answers those questions.

## 5 · Fonts (recommendations only — none added)

The landing faces (Archivo, Public Sans) cover Latin only. App pages use Geist. All of these are in `next/font/google`:

| Script (languages) | Recommendation |
|---|---|
| Cyrillic (uk, ru, kk, mk, mn) | Reuse the existing scoped Noto Sans: widen its `el\|bg` rule to these languages, and **add the `cyrillic-ext` subset** (Kazakh ә ғ қ ң ө ұ ү һ і, Mongolian ө ү) |
| Georgian (ka) | Noto Sans Georgian |
| Armenian (hy) | Noto Sans Armenian |
| Devanagari (hi, ne) | Noto Sans Devanagari (alternatives: Mukta, Hind) |
| Bengali (bn) | Noto Sans Bengali (alternatives: Hind Siliguri, Anek Bangla) |
| Urdu (ur) | Noto Nastaliq Urdu for real Urdu typesetting, with the existing Noto Sans Arabic (Naskh) as fallback. Nastaliq needs a taller line-height, so test buttons |
| Sinhala (si) | Noto Sans Sinhala (keep U+200D ZWJ intact) |
| Tamil (ta) | Noto Sans Tamil |
| Khmer (km) | Noto Sans Khmer (alternative: Kantumruy Pro) |
| Lao (lo) | Noto Sans Lao |
| Ethiopic (am) | Noto Sans Ethiopic |
| Latin extended (az ə, uz ʻ ʼ, ca l·l, sq ë, bs č ć đ) | Check that the landing faces' `latin-ext` subset is loaded on those pages |

## 6 · Resuming next week

Everything needed is in **`docs/languages-world-2/handover/`**: tools, briefs, research, style sheets, the 11 ready guard lists,
Filipino parts 01–03, the queue and the notes. Its README has the restore steps and the per-language loop.

- **Cost guide:** 9 part runs plus 1 consistency run per language, and 3 legal runs per language.
- **Pace:** two at a time stayed inside the 5-hour limit.
- **Order:**
  1. finish fil-PH (parts 04–09, consistency);
  2. then sq, mk, bs, ca, si, ta, km, lo, sw, am;
  3. then the legal pages for all 23;
  4. then the remaining 14 listings;
  5. then re-run the en-GB diff, the checks and the sweep.

## 7 · Commits

| Commit | What |
|---|---|
| `ac3e57f7` | (0) glossary tables for 23, the builder map and bans, 184 keyword rows |
| `bdc619c1` `91758cfd` `027572c1` `776cb868` `06d17115` `02709c35` `407bedfa` `e90c2c54` | ru-KZ, uk-UA, kk-KZ, uz-UZ, az-AZ, ka-GE, hy-AM, mn-MN |
| `36d868d2` `aeec8a45` `a24ddf2c` `7f922245` | hi-IN, bn-BD, ur-PK (+ RTL rule and three harness re-pins), ne-NP |
| `32a1e5f8` | 6 staged store listings; store-badges-1 re-pin |
| `103279c4` | compare-suits-1 card-word lists for the 12; badges-manual-1 re-pin |
| `b310497d` | handover kit for the 11 languages still to do |

## 8 · For a native check (the translators' notes, condensed)

- **uk:**
  - «фургон» (van) vs «фудтрак» (truck);
  - genitive «фудтрака»;
  - «Комбо» as a tab name;
  - «Графік» also on public pages, where «розклад» might be expected;
  - «пейджер» (buzzer);
  - «Замовлення з оплатою» even for pay-at-the-truck orders;
  - UK paperwork names.
- **ru-KZ:**
  - masculine status buttons («Готов/Выдан/Оплачен»);
  - «Наличными и выдан»;
  - «Работает на HatchGrab» (Powered by);
  - «эквайринг»;
  - «Отмена в любой месяц».
- **kk:**
  - фудтрак and its suffixes (фудтрагыңыз);
  - «Болдырылмады» for a cancelled event;
  - the long «HatchGrab негізінде жұмыс істейді» on posters;
  - «Шоттар» (Billing);
  - «шайпұл» (tip).
- **uz:**
  - «sotuv oynasi» (serving window);
  - «Ish paneli» vs «Boshqaruv paneli»;
  - «chaqiruv qurilmasi» (long);
  - «keytering» vs «katering»;
  - «choychaqa» (tip).
- **az:**
  - «maşın» for van;
  - «HatchGrab ilə hazırlanıb» in footers;
  - «Sifarişlər paneli» vs «İdarəetmə paneli»;
  - «çaypulu» (tip).
- **ka:**
  - Reports «ანგარიშები» / Billing «ანგარიშსწორება» / account «ანგარიში»;
  - «სამზარეულოს დატვირთვა» reads like "kitchen load";
  - «ცვლა» (service);
  - ფუდტრაკი is low confidence.
- **hy:**
  - Approve «Ընդունել» vs Confirm «Հաստատել»;
  - Done «Ավարտել»;
  - «ազդանշանիչ» (buzzer);
  - «Սակագին և հաշիվներ» (Billing);
  - the less common allergen names.
- **mn:**
  - «үйлчлүүлэгч» (customers);
  - batch «нэг удаагийн тоо», because «багц» = plan;
  - «Технологи: HatchGrab»;
  - the dative of фүүд трак;
  - «дуудлагын төхөөрөмж» (long).
- **hi:**
  - वैट vs GST familiarity;
  - «PIN कोड»;
  - «बिलिंग», which also means POS software in India;
  - Approve «मंज़ूर करें»;
  - «रई» for rye (राई = mustard seed).
- **bn:**
  - «আনডু/রিডু»;
  - «সমাপ্ত» (finished) vs «শেষ» (sold out);
  - the descriptive allergen names;
  - «হ্যালো 👋» vs আসসালামু আলাইকুম;
  - «পেজার» (buzzer).
- **ur:**
  - «گاڑی» (van);
  - «کچن ڈسپلے»;
  - «لوکیشن» vs «جگہ»;
  - beef salami in place of nduja;
  - «کل» means both total and tomorrow;
  - «انڈین» as a cuisine label in Pakistan;
  - the allergen names جودار (rye) and کوٹو (buckwheat).
- **ne:**
  - Discard «खारेज गर्नुहोस्»;
  - «साइन इन» vs noun «लगइन»;
  - «प्रविधि सहयोग:» (Powered by);
  - POS in the cash-till help;
  - Fonepay QR as a walk-up example.

The full per-part notes are in `docs/languages-world-2/handover/NATIVE.md`.
