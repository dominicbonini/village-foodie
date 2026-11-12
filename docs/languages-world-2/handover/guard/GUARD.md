# Allergen-guard word lists — brief (languages-world-2, 11 November 2026). FOOD SAFETY.

Scratch `$S` = /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad
Repo READ-ONLY: /Users/dominicbonini/dev/village-foodie. Never edit/commit repo files; never open any `.env*` file.

HatchGrab's WhatsApp auto-reply sends any allergen / food-safety question to a fixed safe reply (never to the AI) when the
customer's message matches the truck language's guard words. Read, in the repo: `lib/allergen-guard.ts` (the matcher:
`unicodeNorm` = NFKD, combining marks \p{M} STRIPPED, lower case, every non-letter/number run → one space; a STEM matches as a
substring of the normalised message, a TOKEN as a whole normalised word), `lib/allergen-guard/en.json`, `ar.json`, `th.json`,
`bg.json`, `tr.json`, `he.json`, `vi.json` (examples), and `$S/guard/build.cjs` + `$S/guard/prove.cjs` (languages-world-1's
builder and proof — copy their method exactly).

Each list = OPTION B, as every other language: **absence / safety words only** — allergy, intolerance, coeliac,
anaphylaxis, EpiPen, "free from X", "without X", "no X please", "does it contain / does not contain", "safe for", "suitable
for", "may contain", "traces", "cross-contamination", "sensitive to". NOT the bare allergen names (a presence question may
reach the AI, which answers only from the tags). `caveatWords.codex` = for each of the codex set's labels, in THIS ORDER:
gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree nuts, sulphites → the words (lower case, NFC) a reply in the
language would use for it.

**Stems must survive inflection** (Slavic cases, Turkic/Mongolian/Georgian/Armenian suffixes, Indic postpositions, Amharic
prefixes, Swahili noun-class prefixes, Filipino infixes/linkers): use the shortest unambiguous stem. **Because combining
marks are stripped**, Indic/Khmer/Lao/Sinhala/Tamil vowel signs vanish on both sides: check every stem's NORMALISED form
against your plain questions — a too-short skeleton will match ordinary words. Also add the spellings customers really type:
romanised Hindi/Urdu/Bengali/Nepali ("allergy hai", "gluten free"), Latin-keyboard Georgian/Armenian/Mongolian/Kazakh
transliteration where common, Russian words inside Kazakh/Uzbek/Kyrgyz chats, English "allergy"/"gluten free" inside
Filipino/Swahili chats (English is matched too only via these lists, so include the common English safety words customers
mix in: allergy, allergic, gluten free, lactose, intolerant, celiac, nut free, epipen).

## Deliverables (in `$S/guard/`)
- `build-<group>.cjs` writing `<lang>.json` for each of your languages, in exactly world-1's output shape:
  `{ "$comment": "languages-world-2 (11 November 2026): the WhatsApp allergen guard’s trigger words for <LANGUAGE (locale)>: <what>. OPTION B, as every other language: … The country has no allergen set of its own yet, so caveatWords are for 'codex' (as MX, SG, HK, MY, TH and AE).", "language": "<lang>", "normalise": "unicode", "stems": […], "tokens": [], "caveatWords": { "codex": { … } } }`
  (`language` = the language subtag: uk ru kk uz az ka hy sq mk bs ca hi bn ur ne si ta km lo mn fil sw am).
- `prove-<group>.cjs` (world-1's prove.cjs with your languages): for each language **at least 9 safety questions** a real
  customer would type (incl. one romanised/transliterated or mixed-English one and one inflected form) that MUST match, and
  **at least 6 plain menu questions** (opening hours, location, price, card payment, "what pizzas", one containing a word
  that looks like a stem trap) that must NOT match. Its `$comment` regex must test for `languages-world-2 \(11 November 2026\)`.
- Run `node $S/guard/prove-<group>.cjs` until every language PASSes. Reply in ≤12 lines: per language stems count, safety
  caught/plain clean, and any word a native speaker should confirm.
