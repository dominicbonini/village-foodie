# Store listings — brief (languages-world-2, 11 November 2026)

Scratch `$S` = /private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad
Repo READ-ONLY: /Users/dominicbonini/dev/village-foodie. Never edit/commit repo files; never open `.env*`.

Translate HatchGrab's App Store / Google Play listing into your languages. The master is the repo's
`data/store-listing/en-GB.json` (fields subtitle, promotionalText, description, keywords, whatsNew, shortDescription). The
exact shape to write is languages-world-1's `$S/listing/EXAMPLE-src-b.cjs` (vi, he, is, sr) — copy its structure:
a CommonJS module `module.exports = { ABOUT, langs: [ … ] }` (only the first file, c.cjs, defines ABOUT; d.cjs/e.cjs export
`{ langs }`), each entry `{ file, meta: { appStoreLocale, playLocale, messagesLocale, countrySegment }, t: { …the 6 fields },
b: { …their English back-translations } }`, description as an array of 10 paragraphs joined with '\n\n' (the SAME 10
paragraphs as the master, each section heading in capitals or the language's equivalent emphasis as the examples do).
ABOUT (c.cjs): 'languages-world-2 (11 November 2026): the store listing for this locale — App Store (appStoreLocale) and Google
Play (playLocale; name → title, shortDescription → short description, description → full description). Staged in
data/store-listing/next/ until the country is switched on. Must be true in every country: no prices, plan names, trial lengths,
purchase instructions or other platforms (docs/ios-intl-1-report.md §5).'

Per language read `$S/tr/<locale>/STYLE.md` (voice, script, terms) and `$S/seo/<locale>.json` (`storeKeywords`,
`playShortDescription` — start from them). Rules (the checker enforces them): subtitle ≤30 chars, promotionalText ≤170,
description ≤4000, keywords ≤100 (comma-separated, no spaces after commas, no "HatchGrab"), shortDescription ≤80; no prices,
currency, percentages, plan names (Pay as you go / Pro / Unlimited / Free trial or the language's names for them), "subscribe",
"free trial", Android, Google Play, web app, WhatsApp or "hatch"; no straight apostrophe; no bidi control characters; whatsNew
says the app now supports **60 languages** (ASCII digits) + the printer line + bug fixes, as the master does.
`appStoreLocale` = the App Store Connect code or null when App Store Connect has no such listing language; `playLocale` = the
Play code; `countrySegment` = the ISO country code in lower case. Codes (from `$S/seo/STORES.json`):
uk-UA uk/uk/ua · ru-KZ ru/ru-RU/kz · kk-KZ null/kk/kz · az-AZ null/az-AZ/az · ka-GE null/ka-GE/ge · hy-AM null/hy-AM/am ·
sq-AL null/sq/al · mk-MK null/mk-MK/mk · ca-AD ca/ca/ad · hi-IN hi/hi-IN/in · bn-BD bn-BD/bn-BD/bd · ur-PK ur-PK/ur/pk ·
ne-NP null/ne-NP/np · si-LK null/si-LK/lk · ta-LK ta-IN/ta-IN/lk · km-KH null/km-KH/kh · lo-LA null/lo-LA/la ·
mn-MN null/mn-MN/mn · fil-PH null/fil/ph · sw-TZ null/sw/tz · am-ET null/am/et.
`file` = the messages locale tag (e.g. 'uk-UA').

When your file is written run `node $S/listing/build-check.cjs` (it builds every language of c/d/e present, so create empty
`module.exports = { langs: [] }` stubs for the other two files ONLY if they do not exist yet; never overwrite another
agent's file). Fix until every one of YOUR languages prints "ok". The accepted "appStoreLocale missing" note is fine for null
codes. Reply in ≤8 lines.
