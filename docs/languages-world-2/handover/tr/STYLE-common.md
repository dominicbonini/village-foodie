# Translating a part of HatchGrab — the common brief (languages-world-2, 11 November 2026)

You translate ONE PART of HatchGrab's English UI file (en-GB, British English) into ONE language. Other agents translate
the other parts of the same language in parallel against the same briefs; a consistency pass follows.

Scratch root `$S` = /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad
Repo (READ-ONLY for you): /Users/dominicbonini/dev/village-foodie. Never edit, add or commit any repo file. Never open any
`.env*` file. Never run split-messages, git, builds or any repo script except the read-only ones named here.

## Read first, in this order
1. this file;
2. `$S/tr/<locale>/STYLE.md` — the language's voice, address form, plural categories, the LOCKED terms (glossary), the
   "Pay at Hatch" words, the plan names, sample places, the order-button words;
3. `$S/tr/<locale>/TERMS.md` — the shared term sheet for this language. **Read it before you start and again before you
   finish.** The moment you choose a word for a screen, tab, button, setting or recurring concept that is not already there,
   APPEND one line (`- en-GB term → your term (part NN, key)`) — never rewrite or reorder others' lines. If a line already
   exists, USE it, even if you would have chosen differently.
4. your source: `$S/tr/parts/<NN>.src.json` (nested JSON, the en-GB text of your part).
5. For context only, you MAY read how an existing language words the same keys — e.g. `messages/es-ES.json`,
   `messages/ja-JP.json`, `messages/ar-AE.json` in the repo — but translate from the English, and follow your STYLE.md.

## Deliverables (in `$S/tr/<locale>/`)
- `<NN>.json` — the SAME nested structure and keys as `<NN>.src.json`, every value translated.
- `<NN>.back.json` — FLAT: `{ "namespace.key.path": "English back-translation" }` for EVERY key of the part: an honest
  English rendering of what YOUR translation says (not the en-GB original pasted back). Keep the ICU placeholders/tags in it.
- Large parts: you may write the part in several files `<NN>.a.json`, `<NN>.b.json`, … (each a nested subset) and
  `<NN>.back.a.json`, … then run `node $S/tools/join-part.cjs <locale> <NN>` which writes `<NN>.json` / `<NN>.back.json`.
- Then run `node $S/tools/check-part.cjs <locale> <NN>`. It must report **STRUCTURAL 0** and **back missing 0** (exit 0).
  Fix and re-run until it does. Read every flag: "English left" must be only brands, product names, codes, file types,
  admin-only English labels and words your language really writes the same way; fix anything else.
- Finally reply in ≤10 lines: keys done, check result, and any term or wording a native speaker should look at.

## ICU and structure — a broken message takes a page down
- Keep EVERY placeholder exactly: `{truck}`, `{count}`, `{amount}`, `{n, plural, …}`, `{state, select, …}`, `#`.
  Never translate a placeholder name, a select option KEY (`yes`, `other`, `confirm`…) or a tag name. Translate only text.
- Rich-text tags (`<b>…</b>`, `<lean>…</lean>`, `<br></br>`, `<pill></pill>`, `<accent>…</accent>`, `<green>…</green>`)
  stay, with the same names and the same count; move them to wherever the words they wrap end up in your sentence.
- `select`: keep every option of the English, including `other`.
- `plural`: keep the English's exact cases (`=0`, `=1`, …) and `other`, and ADD every CLDR category your language needs
  (STYLE.md lists them; a language with only `other` still keeps `one` if the English has it — harmless). `#` stays where
  the number goes.
- **Apostrophes:** NEVER a straight `'` (ICU treats it as a quote and swallows text). Use ’ (U+2019) or your language’s
  own quotation marks. Hebrew geresh: use ׳ (U+05F3) / gershayim ״ (U+05F4), never ' or ".
  Ukrainian apostrophe inside words (м’ясо, п’ять, обов’язково): ’ U+2019. Uzbek Latin: oʻ gʻ with ʻ (U+02BB) and the tutuq belgisi ʼ (U+02BC) (maʼlumot). Catalan: l’ d’ s’ with ’ and l·l with the middle dot U+00B7. Never a straight '.
- Never put a case ending, article-agreement or possessive suffix ON a placeholder that holds a name or number
  (`{truck}`, `{plan}`, `{country}`, `{name}`, `{van}`, `{event}`): use apposition or a colon ("food truck: {truck}",
  "Removed: {name}"). For agglutinative / postpositional languages (Kazakh, Uzbek, Azerbaijani, Georgian, Armenian, Mongolian, Hindi/Urdu/Nepali/Bengali postpositions, Tamil/Sinhala case suffixes, Amharic prefixes, Filipino linkers -ng/na, Swahili noun-class prefixes):
  do not glue a suffix or prefix letter to a placeholder — restructure, use a noun before it, or a colon/dash.
- A count that is not inside a plural becomes "Label: {n}".
- Keep `\n` line breaks and any leading/trailing emoji, arrows (→ ←) and symbols (· — •) as in the English (in a
  right-to-left language, mirror an arrow only if it points "next/back": → becomes ←).
- Numbers keep their VALUE; write a typed decimal or thousands number with your language’s own separators where they differ
  (e.g. Ukrainian/Russian/Kazakh/Uzbek/Azerbaijani/Georgian/Armenian/Albanian/Macedonian/Bosnian/Catalan: 8,875 · 3,5 · 0,50 · 4 000 / 4.000 — the checker accepts both forms; the South-Asian, Khmer, Lao, Mongolian, Filipino, Swahili and Amharic pages write 3.5 / 4,000 as English does). Digits are ALWAYS ASCII 0–9 in what you type (no Bengali ০–৯, Devanagari ०–९, Arabic-Indic or Khmer/Lao digits) — the app formats live numbers itself. Prices,
  percentages, times, URLs, e-mail addresses, file types (PDF, JPEG, HEIC…) and codes stay as written. Do not convert currencies
  or units typed in a string. Percent: follow the language (Turkish writes %20).

## Words that never change
HatchGrab · Village Foodie · WhatsApp · WhatsApp Business · Instagram · Facebook · Messenger · Meta · Stripe · Apple ·
Apple Pay · Google · Google Pay · Google Play · App Store · iPhone · iPad · Android · Tap to Pay · TikTok · Squarespace ·
Vercel · Pro (the plan) · KDS may be kept as an abbreviation beside the local term.
Admin-only English labels are QUOTED IN ENGLISH (the admin screens are English-only): "Insert opt-out", "Templates",
"Signature".
UK-only proper names (HMRC, FSA, Natasha’s Law, Companies House, Eircode, the UK’s 14 allergens list) keep their name;
translate the words around them.

## "Pay at Hatch" and the word "hatch"
- "Pay at Hatch" is a FEATURE NAME: use STYLE.md's feature name; as a button/short label use its short label.
- "hatch" elsewhere ("see you at the hatch", "order at the hatch") means the truck's serving window: say "at the truck" /
  "at the counter" in your language's natural words. The English word "hatch" must never appear.
- "van" (a truck in the fleet) and "truck" = the food truck: use STYLE.md's words; "pitch" = the trading spot/location.

## Voice
Native-feeling, not literal: write what a local product team would ship. Short UI labels stay short (a button about the
English length; at most ~1.5× for a label). Consistent terms across the part (and with TERMS.md). Sample places, streets,
towns, people’s names and dish examples in the English are British — replace them with natural ones for the country in
STYLE.md (keep them plausible and generic, no real business names). Phone/postcode examples: STYLE.md gives the format.

## Real names stay verbatim
The landing testimonial (landing.testimonial.*: the quote’s author names and their business, e.g. “Pizzeria Gusto”, “Nadia & Bogdan”) and any other real person or business named in the English stay EXACTLY as written — translate only the quote’s words. Invented SAMPLES (example venues, towns, demo customer names) are localised.

## Scripts in this batch (languages-world-2)
- Write ONLY in the script STYLE.md names (Uzbek and Bosnian: Latin; Mongolian, Kazakh, Russian, Ukrainian, Macedonian:
  Cyrillic; Urdu: Arabic script with the Urdu letters ے ں ٹ ڈ ڑ ہ ھ; Hindi/Nepali: Devanagari; Bengali, Sinhala, Tamil,
  Georgian, Armenian, Khmer, Lao, Amharic (Ge’ez): their own scripts). Latin only for the brands/products listed above,
  file types and codes. A loanword STYLE.md writes in the local script ("food truck" → the local spelling) is written in that
  script everywhere.
- Right to left (Urdu): write naturally; Latin words, numbers and placeholders sit inside RTL text — the browser’s bidi
  handles them; NEVER insert bidi control characters (U+200E/200F/202A–202E/2066–2069). Mirror arrows that mean next/back
  (→ becomes ←). Urdu punctuation: ، ؛ ؟ and the full stop ۔ (not .) at sentence end; a URL/e-mail keeps its own dots.
- Khmer and Lao: no spaces between words; a space only between phrases/clauses, as native copy writes; never insert
  zero-width spaces.
- Amharic: ። (full stop) ፣ (comma) ፤ ፡ as native copy writes; Ethiopic digits are not used (ASCII digits).

## "Deal" = a meal deal / combo (added 11 Nov, after parts disagreed)
The **Deals** feature (manageDeals.*, deals.*, "Lunch Deal", "deal price", "Apply a deal", "already in a deal") is a bundle of
items sold together for one price — a MEAL DEAL / COMBO, not a discount or promotion. Always use STYLE.md's glossary row
"Meal deal / combo" Use term for it (tab, buttons, sentences). Never a word for "promotion / sale / discount".

## VAT and other named taxes / laws (added 12 Nov)
Where the English names VAT (HatchGrab's own invoices, "excl./incl. VAT", reverse charge, EU/UK VAT rules) it means THAT tax:
write "VAT" (or the language's word for value-added tax), never the country's own tax name (GST, НДС, IGI…). Only a sentence
that is about the truck's own sales tax, worded generically, may use the generic local word for sales tax.

## Allergen names are exact (added 12 Nov — FOOD SAFETY)
menuBadges.allergen.* and every allergen label name exactly that allergen. Never widen or swap it for a neighbouring food
(yam ≠ taro, celery ≠ celeriac only if the language truly separates them, tree nuts ≠ peanuts). If the language has no exact
everyday word, write the closest exact word with the English in brackets ("… (yam)").
