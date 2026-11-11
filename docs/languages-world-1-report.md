# languages-world-1 — language files for the next countries

*10–11 November 2026. Seven commits on main (`6baad30f`, `d7d6f946`, `10ee6aff`, `1f20cefb`, `8d6be4f8`, `86bc1d3b`, `92cb875b`), committed by path, **not pushed, not deployed**. No country was added or switched on, no `country_settings` row or price was touched, and no SQL was run. billing-1's files were left alone. No `.env*` file was opened.*

## Summary

- **47 new locales**, all switched off: 15 Spanish, 9 English, 7 Arabic, 5 French and 3 Portuguese regional variants, plus **8 new full language bases**: tr-TR, ko-KR, zh-TW, id-ID, vi-VN, he-IL, is-IS and sr-RS.
- **Every one passes the automatic checks:**
  - translation-check: **0 structural** for all 47;
  - messages-parity: **981,054 passed, 0 failed**;
  - the new right-to-left check: **111/111**.
- **SEO terms were researched country by country.** They are in each locale's titles, descriptions, headings, JSON-LD and plan names. The SERP rows are in `docs/seo-geo-1/keywords.csv` (+259 rows).
- **hreflang and sitemap are prepared** through URL segments. A country appears only once its row is switched on.
- **The menu-upload words** (`provisionContent.standardCategories.*`, `provisionContent.demoEventName`) are in en-GB, the 28 existing bases and every new locale. Only those keys were added to the existing files.
- **Native app words:**
  - iOS: `.lproj` folders for the 7 new iOS languages, made with the existing generator.
  - Android: has no translatable native strings, so it needs nothing.
  - Store listings: 8 written and staged, not pushed.
  - Store badges: 14 vendor files, with checksums in the manifest.

## 0 · Flags, premises and the checks run

- **No span of the brief arrived garbled.** No two instructions contradicted each other, so nothing needed stopping.
- **One reading to confirm: "every language file" for the menu words.** I read it as en-GB (the base keys must exist for parity), the 28 existing bases and every new locale.
  - The existing regional files (en-US, es-MX, de-AT …) were **not** edited, because the brief lists the 28 bases.
  - Two of them would say it differently: en-US ("Appetizers"/"Entrées") and es-MX (it inherits es-ES's "Entrantes"). Each would need a one-line override if you want that.
- **Checks run, and only these:**

  | Check | Result |
  |---|---|
  | `messages-parity` | 981,054 passed, 0 failed |
  | `translation-check --locale <x>` (structural ICU/placeholder check), every new locale and every existing one | 0 structural for all; flag tables in `docs/languages-world-1/<locale>-translation-flags.md` |
  | **New** `scripts/languages-world-1-rtl.cjs` | 111/111 |
  | `split-messages --check` | in step |
  | `glossary-build --check` | 37 languages |
  | `ios/native-strings --check` | 37 languages |
  | The legal drift checker (`_legal-translations.cjs compare`) on all 24 new legal files | all ✓ |
  | The listing rules on the 8 staged listings | ok |
  | `tsc --noEmit` | clean; run once as a compile check of the code lines below |

  The RTL check covers: the RTL rule for every locale; no bidi control characters; every RTL message written in its own script.

  No screenshots, browser runs or harness sweep were done.
- **Four harness pins were changed but not run** (only file checks were allowed). Run them with the next sweep:
  - `store-badges-1.cjs`: now 36 bases, 34 Apple and 36 Google files, and an Apple English fallback for is/sr.
  - `languages-1.cjs`: the "no guard list" language is now **Swahili** (sw-KE), because Turkish now has a list.
  - `world-countries-1.cjs` and `cwv-2.cjs`: they pin the RTL rule, which is now `/^(ar|he)(-|$)/i`.
- **Two usage-limit stops** paused 19 and then 10 agents. Each was resumed from its own transcript and nothing was redone.

## 1 · Per locale: done, primary keyword, and anything needing your decision

Every row is **done** (0 structural, registered, switched off). "Over" names the locale it inherits from.

| Locale | Over | Primary SEO keyword (landing) | Needs your decision |
|---|---|---|---|
| es-AR | es-MX | sistema de pedidos para food trucks | voseo (Mercado Pago AR); posnet; retiro |
| es-CL | es-MX | sistema de pedidos para food trucks | "carta" for the dish list; arriendo; máquina POS |
| es-CO | es-MX | sistema de pedidos para food trucks | tú kept (Rappi CO), not usted; datáfono |
| es-PE | es-MX | sistema de pedidos para food trucks | carta; recojo / hora de recojo |
| es-UY | es-MX | sistema de pedidos para food trucks | voseo; "colas" is low confidence |
| es-PY | es-MX | sistema de pedidos para food trucks | voseo |
| es-BO | es-MX | sistema de pedidos para food trucks | low evidence; close to es-MX |
| es-EC | es-MX | sistema de pedidos para food trucks | retirar chosen over recoger (both are used) |
| es-CR | es-MX | sistema de pedidos para food trucks | **tú kept.** Research: business copy uses usted, consumer apps vos |
| es-PA | es-MX | sistema de pedidos para food trucks | |
| es-DO | es-MX | sistema de pedidos para food trucks | |
| es-GT | es-MX | sistema de pedidos para food trucks | |
| es-SV | es-MX | sistema de pedidos para food trucks | tú kept (Uber SV writes vos) |
| es-HN | es-MX | sistema de pedidos para food trucks | tú kept (mixed usage) |
| es-NI | es-MX | sistema de pedidos para food trucks | tú kept (consumer copy is vos) |
| en-ZA | en-GB | food truck ordering system | |
| en-KE | en-GB | food truck ordering system | "PDQ machine" |
| en-NG | en-GB | food truck ordering system | "— not a POS terminal" (bare "POS" means the card machine in Nigeria) |
| en-GH | en-GB | food truck ordering system | |
| en-PH | en-US | food truck ordering system | written over en-US (American spelling) |
| en-JM | en-GB | food truck ordering system | |
| en-TT | en-GB | food truck ordering system | |
| en-BS | en-GB | food truck ordering system | British spelling assumed |
| en-BB | en-GB | food truck ordering system | |
| ar-SA | ar-AE | نظام طلبات فود ترك | «فود ترك» in titles and headings; Arabic-Indic digits (§3) |
| ar-QA | ar-AE | نظام طلبات لعربات الطعام | digits; the VAT line reads oddly (Qatar has no VAT) |
| ar-KW | ar-AE | نظام طلبات فود ترك | digits; the VAT line reads oddly (Kuwait has no VAT) |
| ar-BH | ar-AE | نظام طلبات لعربات الطعام | digits |
| ar-OM | ar-AE | نظام طلبات لعربات الطعام | digits |
| ar-JO | ar-AE | نظام طلبات لعربات الطعام | digits |
| ar-EG | ar-AE | نظام طلبات لعربات الطعام | digits |
| fr-MA | fr-FR | logiciel de commande food truck | **French vs Arabic:** French, as you briefed and as the evidence supports (§3) |
| fr-TN | fr-FR | logiciel de commande food truck | same as MA |
| fr-SN | fr-FR | logiciel de commande food truck | « récupération » used (retrait = cash-out there) |
| fr-CI | fr-FR | logiciel de commande food truck | same as SN |
| fr-MC | fr-FR | logiciel de commande food truck | |
| pt-AO | pt-PT | sistema de encomendas online food truck | pre-1990 spelling; "menu" now means both the dish list and the combo |
| pt-MZ | pt-PT | sistema de encomendas online food truck | |
| pt-CV | pt-PT | sistema de encomendas online food truck | |
| tr-TR | base | food truck sipariş sistemi | the order button says "Siparişi onayla" (the market norm), not statute wording |
| ko-KR | base | 푸드트럭 주문 시스템 | Korea uses KakaoTalk, not WhatsApp |
| zh-TW | base | 餐車點餐系統 | the App Store zh-Hant listing (§3); Taiwan uses LINE |
| id-ID | base | aplikasi pemesanan food truck | Anda for operators, no pronoun for customers; "Bayar di tempat" banned (it means cash on delivery) |
| vi-VN | base | phần mềm đặt món cho food truck | Vietnam uses Zalo |
| he-IL | base | מערכת הזמנות לפודטראקים | spelling פודטראק needs a native check |
| is-IS | base | pöntunarkerfi fyrir matarvagna | EEA order button «Panta með greiðsluskyldu»; Iceland uses Messenger |
| sr-RS | base | online poručivanje za food truckove | **script: Latin** (§3); Serbia uses Viber |

## 2 · What was made

**Groups 1–5, the regional variants.** Each variant holds only what differs from the locale it sits on:
- its researched SEO strings;
- its everyday words, swapped consistently;
- its menu-category words;
- country samples: phone format, domains, towns and venues.

Everything else is inherited, so each variant is complete. Each was registered in `lib/i18n/locales.ts` (`LOCALES`, plus `LOCALE_PARENT` where the parent is not en-GB). Back-translations are in `docs/i18n/back/` (the English variants have none, as before).

- **Spanish:**
  - es-AR, es-UY and es-PY are in **voseo**: about 1,360 overrides, with tú/vos and the accent rules applied.
  - The other 12 use tú, each with its local words (retiro/recojo, carta, datáfono/POS, alquiler/arriendo).
  - All 15 say "costos", not es-MX's "costes".
  - Where "POS" means the card machine, the "not a POS" wording became "no es un sistema de caja".
- **English:** "Pay at Hatch" and every "hatch" sentence became truck wording ("Pay at the truck"). Your rule ("the best local wording") and the en-SG precedent both point that way. Each country also gets its own pickup word, card-machine word, phone word, combo and spot.
- **Arabic:** Modern Standard Arabic, with no dialect in the copy.
- **French:** the African countries use « Payer sur place ». France's VAT sentence is removed for them.
- **Portuguese:** pt-AO uses Angolan pre-1990 spelling throughout.

**Group 6, the eight new bases.** Each is a full translation of all **5,785 keys** with a back-translation per key. Each was made in 9 parallel parts against one brief, then one consistency pass per language (35–179 corrections each). Each base also has:
- plan names;
- glossary tables in `docs/i18n/seo-glossary-eu.md`, built to `lib/i18n/glossary/*.json`;
- allergen-guard word lists (`lib/allergen-guard/<lang>.json`, imported). Each list was proved on 8–11 safety questions in its language and on 5–9 plain menu questions that must not trigger it;
- legal pages: Privacy, Terms and Country-specific terms in `content/legal/<locale>/`, stamped and drift-checked. The "English version governs" line is the existing `legalChrome` note, translated.

**SEO and URLs:**
- Research files are one per country in the session scratchpad. The CSV rows are in `docs/seo-geo-1/keywords.csv`.
- **The SERP rows have a limit.** The search tool is US-based and showed no local Google page or autocomplete, and its shared 200-search budget ran out mid-research. So 21 countries have a single rank-0 row, "SERP not visible from the research tool". Confidence is stated per country in the research.
- **URL segments:** `COUNTRY_PATH_SEGMENTS` gained 47 segments, each the ISO code (`/ar`, `/kr`, `/tw`, `/il` …). The router, hreflang, sitemap and translated legal pages list a country only when its `country_settings` row is enabled. Until then the segment 302s to `/uk`.

**Locale data:**
- Plural rules and number, date and time formats all come from Intl. Every count plural carries the CLDR categories, which translation-check enforces: he `two`, sr `few`, is `one` = 1, 21, 31 ….
- Right to left now covers Hebrew: `lib/script-fonts.ts` `isRtl` and `lib/public-script.ts` `isRtlLang`.

**Badges (`public/badges/`):**
- Apple: tr, ko, zh-TW, id, vi, he.
- Google: the same six, plus is and sr.
- All unmodified vendor files, with sha256 in `scripts/fixtures/store-badges-1-manifest.json`. `lib/store-badge-files.ts` and the README are updated.
- **Apple has no Icelandic or Serbian badge** (404 on its toolbox, and neither language is in its list), so those pages use Apple's English badge.
- Apple's zh-TW badge is byte-identical to its zh-HK one.
- **Google's Serbian badge is Cyrillic.**

**App words:**
- `nativeShell.binary` is in all 8 bases.
- The `.lproj` folders `tr`, `ko`, `id`, `vi`, `he`, `is` and `sr-Latn` were added.
- **`zh-Hant` now carries Taiwan's words.** It is Apple's Traditional Chinese folder, which Taiwanese devices read. `zh-HK` keeps its own folder.
- Android has no translatable native strings (only the brand and IDs), so no `values-<lang>` was added.
- Nothing was versioned, built or uploaded.

**Store listings:**
- Staged in `data/store-listing/next/`, with back-translations in `docs/i18n/back-store-listing/next/`. Its README explains the staging: the push script pushes every top-level file and checks each country URL, and switched-off countries redirect.
- App Store: tr, ko, id, vi, he.
- Google Play only:
  - zh-TW;
  - is and sr: App Store Connect does not support them, so those countries see **en-GB** on the App Store.
- Left out: "commission-free" (the 0.99 % plan makes it untrue somewhere) and POS keywords.
- Nothing was pushed.

## 3 · Decisions for you (nothing below blocks the files)

1. **Serbian script.** The pages are written in **Latin**. Glovo/Donesi, Wolt, restaurant sites and searches are Latin. A 2014 survey found 47 % Latin and 36 % Cyrillic (61.6 % Latin in Belgrade).
   - **The catch:** `Intl` treats `sr-RS` as Cyrillic, so dates and month names would render in Cyrillic inside Latin text ("новембар").
   - Before switch-on, choose one:
     - (a) map sr-RS to `sr-Latn-RS` for Intl;
     - (b) use the tag `sr-Latn-RS`;
     - (c) go Cyrillic.
   - Google's Serbian badge is Cyrillic too.
2. **Morocco and Tunisia: French or Arabic.** I did French, as you briefed. The evidence agrees:
   - Glovo MA and TN are French-only on the web.
   - Kool, MonResto, CMI and the food-truck press write French.
   - Arabic searches found nothing local.
   - An Arabic version could later sit on ar-AE. Darija should not be used for site copy.
3. **Arabic digits.** `Intl` gives Arabic-Indic digits (١٢٣) for ar-SA, QA, KW, BH, OM, JO and EG, but Latin digits for ar-AE. Prices and times would show ١٢٣. Forcing `-u-nu-latn` is a one-line code choice.
4. **Costa Rica and Central America address form.** I kept tú (es-MX's). CR business copy uses usted; SV, NI and HN consumer copy uses vos. Changing it is a full pass like es-AR's.
5. **One App Store listing for Traditional Chinese.** `zh-Hant` (today Hong Kong's words) serves both HK and Taiwan. The zh-TW listing is staged for Google Play only. Decide which words zh-Hant should carry.
6. **Country-specific terms.** The English document has **no section for any of these 47 countries**, Iceland included in the EEA list. Each country needs its own section (a lawyer's job) before it is switched on.
   - Turkey's order button uses the market norm "Siparişi onayla". The Distance Contracts Regulation wording would be stronger.
   - Iceland and Serbia use the EU-style "obligation to pay" wording.
7. **The WhatsApp feature has little pull** in Korea (KakaoTalk), Taiwan (LINE), Vietnam (Zalo), Iceland (Messenger) and Serbia (Viber).
8. **Fonts.** These pages have no scoped script font yet: Korean, Traditional Chinese (Taiwan), Hebrew and Vietnamese. They will draw with system fallbacks, and Vietnamese diacritics may mix fonts. Screens were out of scope, so this is a decision for before switch-on.
9. **The FAQ.** Its content lives in the database, and the hourly translator covers every registered locale. Once this is deployed, it will translate the FAQ into the 8 new bases and the variants that differ (model spend, within its cap).
10. **Smaller points:**
    - Indonesian and Vietnamese help text now shows decimal commas (3,5 / 0,50), as fr and de do. Confirm the charge inputs accept a comma.
    - pt-AO "menu" now means both the dish list and the combo.
    - fr-MA, fr-SN and fr-CI inherit France's certified-till sentence on the comparison page.
    - Every language's comparison page still describes German specifics (TSE, Lieferando). That is existing copy.
    - Card payments: Stripe's availability in many of these countries is unconfirmed. That is a switch-on check.

## 4 · For a native check (the translators' notes, condensed)

- **tr:** "parti" (batch), "çağrı cihazı" (buzzer, long on 58 mm tickets), "KART BLOKEDE"; legal "açık rıza".
- **ko:** 접수 / 확정 split; 카드 가승인; 푸드트럭 섭외; spelled-out numbers in legal (육 년간).
- **zh-TW:** 優惠 for deals; 預先授權; 廚房顯示系統; 你 rather than 您 in the legal text.
- **id:** "buzzer" also means a paid social-media account; "kendaraan" for van; "Promo" for deals.
- **vi:** "tồn kho"; "thẻ rung"; "sukien" as a sample subdomain.
- **he:** תפיסת מסגרת (card held); בון (kitchen ticket); feminine HatchGrab; privacy uses Israeli statute terms while country terms use GDPR's בקר/מעבד.
- **is:** "píptæki" (buzzer); "innheimta" (collect payment); "kynning" (demo); "Knúið af" (Powered by).
- **sr:** singular imperatives on short buttons; "akcija" vs "kombo ponude"; "pejdžer"; "bon".
- **Spanish variants:** "Platos fuertes", "plazo mínimo", "Pedile a {truck}".
- **Gulf Arabic:** the phone words.
- **SN/CI:** « Payer sur place ».

## 5 · Commits

| Commit | What |
|---|---|
| `6baad30f` | menu-upload words in en-GB and the 28 bases (only those keys) |
| `d7d6f946` | 1/6 Spanish (15) |
| `10ee6aff` | 2/6 English (9) |
| `1f20cefb` | 3/6 Arabic (7) and the RTL check |
| `8d6be4f8` | 4/6 French (5) |
| `86bc1d3b` | 5/6 Portuguese (3) |
| `92cb875b` | 6/6 the 8 bases, plus legal, guard words, glossary, badges, iOS strings, staged listings and harness re-pins |
