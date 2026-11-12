# SEO + style research brief — languages-world-2 (11 November 2026)

You research, ON THE LIVE WEB, how people in specific countries search for and word the things HatchGrab does, so the
translators can put those exact words into page titles, meta descriptions, headings, buttons and FAQ wording. You also
write each language's translator style sheet.

**HatchGrab** (brand, never translated) is software for food trucks / mobile caterers: customers order ahead online and
choose a collection (pickup) time; capacity-limited time slots so the kitchen is not overloaded; walk-up orders on the same
screen; a kitchen display screen (KDS); ticket printing; offline mode; WhatsApp auto-replies; social posts; weekly schedule
of trading locations. It is NOT a POS/till. Customers can pay online by card or pay in person at the truck when collecting
("Pay at Hatch" in English — NEVER translate the word "hatch"; find the language's natural way to say "pay at the truck /
pay when you collect". TRAP: do NOT use the local words for "cash on delivery" / "pay the courier" — there is no delivery).
Plans: "Pay as you go" (no monthly fee), "Pro" (stays "Pro" everywhere), "Unlimited", plus a "Free trial".

Scratch `$S` = /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad
Repo (read-only for you): /Users/dominicbonini/dev/village-foodie. Do NOT edit any repo file. Never open any `.env*` file.
Write ONLY into `$S/seo/` and `$S/tr/<locale>/`.

## Tools and budget
Use WebSearch (load its schema with ToolSearch `select:WebSearch` if it is not loaded; mode "standard"; "extended" only
when a standard result is thin) and the web-fetch agent for pages. **Budget: at most ~8 searches per language** (the
search budget is shared by several agents) — so be targeted: the local delivery apps' own sites, local POS/ordering vendors'
landing pages, food-truck / street-food festival sites, the country's consumer-protection law text on online order buttons.
Delivery apps to look at where they operate: Glovo, Wolt, Bolt Food, Yandex Eda, Chocofood, Uzum Tezkor, Express24, Uklon,
Foodpanda, Pathao, Swiggy, Zomato, PickMe Food, Uber Eats, Nham24, foodpanda KH, GrabFood, FoodPanda PH, Jahez, Talabat,
Deliveroo, Just Eat, Toters, Menu.am, Tamtam, Kaspi, Halyk, Gozem, Jumia, Piki, Deliver Addis, Zmall, BEU, Baboon, Korpa,
Donesi, Sambe… No paid search-volume tool exists: judge by consistent real-world use and say so ("Conf." High/Med/Low).
Never invent a source or a search result.

## For EACH language in your task produce THREE files

### 1. `$S/seo/<locale>.json` (e.g. `$S/seo/uk-UA.json`), exactly this shape:
```json
{
  "country": "UA", "locale": "uk-UA", "language": "Ukrainian (Ukraine)",
  "addressForm": "how sites address the reader (formal/informal, ви/ти…), with the apps/sites that write that way",
  "primaryKeyword": { "landing": "...", "features": "...", "faq": "...", "comparison": "...", "compare": "..." },
  "secondaryTerms": ["..."],
  "terms": {
    "foodTruck": "", "foodTruckPlural": "", "streetFood": "", "mobileCatering": "", "preOrder": "", "orderAhead": "",
    "pickupCollect": "", "pickupTime": "", "takeaway": "", "timeSlot": "", "kitchenDisplay": "", "pos": "",
    "cardReader": "", "menuListOfDishes": "", "combo": "", "privateHire": "", "privateEvent": "", "mobilePhone": "",
    "commissionFree": "", "whatsappAutoReply": "", "walkUpOrder": "", "orderButton": "",
    "payAtHatchFeature": "", "payAtHatchShort": "", "payAsYouGo": "", "unlimited": "", "freeTrial": ""
  },
  "differsFromBase": [],
  "seo": { "landing.meta.title": "", "landing.meta.description": "", "landing.jsonLd.subCategory": "",
    "landing.jsonLd.description": "", "landing.jsonLd.audience": "", "landing.hero.title": "", "landing.does.title": "",
    "landing.faq.metaTitle": "", "landing.faq.metaDescription": "", "featuresPage.metaTitle": "", "compare.meta.title": "",
    "compare.meta.description": "", "comparison.meta.title": "", "comparison.meta.description": "",
    "comparison.meta.about": "", "comparison.h1": "", "aboutPage.meta.description": "", "truckPage.meta.orderTitle": "",
    "truckPage.meta.orderDescription": "" },
  "csvRows": [["UA", "<primary landing keyword>", 1, "<result title>", "<result url>", "<page type>", "y|n"]],
  "storeKeywords": "comma-separated App Store keywords, ≤100 characters total, no spaces after commas, no 'HatchGrab', no plan names or prices",
  "playShortDescription": "Google Play short description in the language, ≤80 characters, no prices/plan names",
  "sources": ["url — what it showed"],
  "confidence": "High|Med|Low with one line why",
  "decisions": ["anything Dominic must decide, with the evidence (script, register, which word, legal button wording…)"]
}
```
A full worked example (Hebrew, from languages-world-1): `$S/seo/EXAMPLE-he-IL.json`.

Rules for the `seo` strings (the existing SEO conventions):
- Start from en-GB and the other languages' versions in `$S/seo/seo-keys.json`. Keep EVERY placeholder and tag exactly
  (`{country}`, `{truck}`, `<lean>…</lean>`); `{country}` is the country's short name in the language, so word the
  sentence so it needs no case ending, article or postposition glued to it (apposition or brackets: "(… {country})").
- One primary keyword per page, first in the title (terms first, brand last). Titles ≤ 60 characters counting `{country}`
  as ~10; meta descriptions 120–155 characters. `comparison.meta.title` / `comparison.h1` keep "2026".
- `HatchGrab` stays as is. Never say HatchGrab IS a POS/till (only "not a POS", or the POS word in storeKeywords).
- Never a straight apostrophe `'` — write ’ (U+2019), or the language's own letter (Uzbek ʻ U+02BB / ʼ U+02BC).
- Native-feeling wording, not literal. Match the address form.

`csvRows` (appended to docs/seo-geo-1/keywords.csv: `market,keyword,rank,title,url,page_type,compares_food_truck_preorder`):
for the PRIMARY landing keyword record the top results you actually saw, ranks 1–8, real titles and URLs. If you could
not see a SERP, give ONE row with rank 0 and title "SERP not visible from the research tool" and say so in confidence.
The market column is the ISO country code (KZ for both ru-KZ and kk-KZ; LK for both si-LK and ta-LK).

### 2. `$S/seo/<locale>-glossary.md` — a markdown section in EXACTLY this shape (pasted into docs/i18n/seo-glossary-eu.md),
Use terms in **bold** (example: `$S/seo/EXAMPLE-he-IL-glossary.md`):
```
## UK — Ukrainian (Ukraine)

*languages-world-2, 11 November 2026. <one paragraph: address form, which apps/sites write this way, traps>.*

| Concept | Use | Alternatives / Avoid | B2B/B2C | Conf. | Notes |
|---|---|---|---|---|---|
| Food truck | **…** | … | Both | High |  |
| Street food | **…** | | Both | | |
| Pre-order | **…** | | | | |
| Click & collect | **…** | | | | |
| Pickup time | **…** | | | | |
| KDS | **…** | | | | |
| POS / till | **…** | | | | |
| Card reader | **…** | | | | |
| Menu (list of dishes) | **…** | | | | |
| Meal deal / combo | **…** | | | | |
| Allergens | **…** | | | | |
| Private hire | **…** | | | | |
| Private event | **…** | | | | |
| Commission-free | **…** | | | | |
| WhatsApp auto-reply | **…** | | | | |
| Walk-up order | **…** | | | | |
```
then a blank line and ONE plan-name row, exactly:
`| **UK** | <Pay at Hatch feature name> | <short button/label> | <Pay as you go> | <Unlimited> | <Free trial> |`
Headings / codes: `UK — Ukrainian (Ukraine)`, `RU-KZ — Russian (Kazakhstan)`, `KK — Kazakh (Kazakhstan)`,
`UZ — Uzbek (Latin, Uzbekistan)`, `AZ — Azerbaijani (Azerbaijan)`, `KA — Georgian (Georgia)`, `HY — Armenian (Armenia)`,
`SQ — Albanian (Albania)`, `MK — Macedonian (North Macedonia)`, `BS — Bosnian (Latin, Bosnia and Herzegovina)`,
`CA — Catalan (Andorra)`, `HI — Hindi (India)`, `BN — Bengali (Bangladesh)`, `UR — Urdu (Pakistan)`, `NE — Nepali (Nepal)`,
`SI — Sinhala (Sri Lanka)`, `TA — Tamil (Sri Lanka)`, `KM — Khmer (Cambodia)`, `LO — Lao (Laos)`,
`MN — Mongolian (Cyrillic, Mongolia)`, `FIL — Filipino (Philippines)`, `SW — Swahili (Tanzania)`, `AM — Amharic (Ethiopia)`.
The "Avoid" column must name the traps (e.g. the cash-on-delivery phrase, a neighbouring country's word).

### 3. `$S/tr/<locale>/STYLE.base.md` — the translators' style sheet (create the folder). 8–14 bullet lines, in the shape of
the examples in `$S/seo/STYLE-examples.md` (Hebrew, Serbian, Indonesian from languages-world-1). It MUST cover:
- heading `# STYLE — <Language> (<locale>, <Country>)` (+ "— RIGHT TO LEFT" for Urdu, "— <SCRIPT> SCRIPT" where a script
  choice matters);
- the register and address form for operators (B2B screens) and for customers (order page, emails), with the evidence;
  standard vs regional variety (e.g. Sri Lankan Tamil vs Indian Tamil words; Tanzanian vs Kenyan Swahili; Bangladeshi vs
  Indian Bengali; Kazakhstan's Russian, NOT Russia's — no Russian-Federation-only brands, laws, or "₽");
- the script and its orthography rules (Uzbek LATIN with oʻ gʻ written with ʻ U+02BB and the tutuq belgisi ʼ U+02BC;
  Bosnian LATIN; Mongolian CYRILLIC with ө ү; Kazakh — state which script real businesses use online today and write that;
  Ukrainian apostrophe ’ inside words (мʼясо / м’ясо — pick one, U+2019 recommended, never '); Catalan l’ d’ and l·l with the
  middle dot U+00B7; Urdu in Arabic script with Urdu letters (ے ں ٹ ڈ ڑ ہ ھ), Nastaliq-style spelling, Urdu punctuation ، ۔ ؟;
  Hindi Devanagari with ASCII digits; Bengali/Nepali — say whether typed numbers should be native digits or ASCII and
  note that the app's own Intl formatting renders Bengali (bn-BD) and Devanagari (ne-NP) digits; Amharic Ge’ez script with
  ። ፣ punctuation; Khmer/Lao — no spaces between words, spaces between phrases; Filipino — natural Taglish register as
  Grab/Foodpanda PH write it, English loanwords where Filipinos really use them);
- how loanwords like "food truck", "pre-order", "online", "app", "QR" are written (Latin or the local script) in real use;
- the CLDR plural categories (given below) and how a count reads with each;
- number, percent and decimal style; a phone example and postcode/address format; email/domain example (`you@yourfoodtruck.<tld>`);
- 5–8 sample towns/neighbourhoods and generic venues (markets, parks, festivals — no real business names);
- the order button: if the country's consumer-protection law has statutory wording for the online order button (EU-style
  "order with obligation to pay"), give it with the law's name; otherwise the market norm, and say there is none.
- the "Pay at Hatch" feature name and short label you chose.

Plural categories (Intl/CLDR, which the checker enforces): uk/ru **one, few, many, other**; bs **one, few, other**;
ca **one, other** (+ many only for millions; not needed); km, lo **other** only (keep the English's `one`, harmless);
all the others **one, other**.

## Finish
Reply with a SHORT summary (≤15 lines): per language the primary landing keyword, address form, script decision,
"Pay at Hatch" words, confidence, and any decision for Dominic. The files are the deliverable.
