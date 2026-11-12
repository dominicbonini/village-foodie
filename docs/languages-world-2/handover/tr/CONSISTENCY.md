# Consistency pass for one merged language — brief (languages-world-2)

Scratch `$S` = /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad
Repo READ-ONLY. Never open `.env*`, never run git/builds/split-messages.

The language was translated in 9 parallel parts (`$S/tr/<locale>/NN.json` + `NN.back.json`) against
`$S/tr/STYLE-common.md`, `$S/tr/<locale>/STYLE.md` and the shared `$S/tr/<locale>/TERMS.md`. A flat view of all parts is
`$S/tr/<locale>/merged.flat.json` (key → text) and the English `$S/tr/<locale>/en.flat.json`.

Your job: make the language ONE product. Write only corrections, to `$S/tr/<locale>/fix.json`:
`{ "messages": { "<flat key>": "<corrected text>" }, "back": { "<flat key>": "<back-translation of the corrected text>" } }`

1. **TERMS.md wins.** For every term in TERMS.md (and the STYLE.md glossary / Pay-at-truck / plan names), find every message
   that words the same concept differently (search merged.flat.json for the English concept in en.flat.json) and correct it.
   Tabs, screens, buttons and settings must have ONE name each across all parts.
2. **Quoted labels must equal the real keys**: when a message quotes a button/tab/screen («…», "…", 「…」), the quoted words
   must be exactly that button’s own translation (find the key whose English is that label).
3. **"Powered by"** and other recurring chrome phrases: one wording everywhere (use the poster / footer words).
4. **Address form and register**: one throughout (STYLE.md). Fix mixed forms.
5. **Numbers**: typed decimals/thousands in the language’s own separators (STYLE-common), consistently.
6. **No English left** that the language would translate; no "hatch"; brands verbatim; script rules (STYLE.md) everywhere.
7. Keep every ICU placeholder, select option, plural case (+ the language’s CLDR categories) and tag exactly — a broken
   message takes a page down. Never a straight apostrophe.
8. **Plural `one` that is not only 1** (uk, ru, bs: `one` = 1, 21, 31, 101…; also hy/bn/hi/ur/ne/si/ta/am where `one` covers 0): every
   `one` branch must read correctly for EVERY number in that category — so it shows `#` ("# фургон", not "каждый фургон" /
   "один фургон"). You cannot add `=1` (the checker keeps the English's exact cases), so put the number in the `one` text.
   List with: `node -e` over merged.flat.json for plural `one {…}` branches without `#`, and fix each.
Then run `node $S/tools/check-fix.cjs <locale>` (checks fix.json against en-GB’s structure) until it reports 0 problems, and
reply in ≤10 lines: how many messages you unified, the main term decisions, and anything a native speaker should check.
