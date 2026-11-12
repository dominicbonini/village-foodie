# languages-world-2 — handover kit (paused 12 November 2026)

The working set for the 11 languages not yet done, kept in the repo because the session scratch folder lives in /private/tmp
(cleared on reboot). Nothing here is loaded by the app. See docs/languages-world-2-report.md for status.

## Restore
1. Copy this folder to a new session scratch folder `$S` (any path).
2. Replace the old scratch path in the five briefs: `grep -rl d3eb5486 $S | xargs sed -i '' "s#/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/d3eb5486-6aff-402e-8e96-9240129b98fe/scratchpad#$S#g"`.
   The tools resolve paths relative to themselves and need no change.
3. Re-split only if en-GB changed: `node tools/split.cjs` rewrites `tr/parts/` from en-GB at HEAD (then part 09's
   planTable.pay.fee is current automatically). Finished Filipino parts 01–03 were translated against the parts in `tr/parts/`.

## What is here
- `tools/` — split, genprompt (part brief), check-part, join-part, prep-consistency, check-fix, merge, install2 (merge →
  register → guard → split-messages → translation-check), commit-lang.sh, build-style, csv-append, queue helpers.
- `tr/STYLE-common.md`, `tr/CONSISTENCY.md` — the briefs, with every rule added during the run (deal = combo, VAT, allergen
  names exact, plural `one` beyond 1).
- `tr/<locale>/STYLE.md` (+ STYLE.base.md, TERMS.md) for sq-AL mk-MK bs-BA ca-AD si-LK ta-LK km-KH lo-LA sw-TZ am-ET fil-PH.
- `tr/fil-PH/01–03.json` + back — finished, checked parts (04–09 still to do).
- `seo/` — research per locale (seo JSON, glossary sections already merged into docs/i18n/seo-glossary-eu.md), STORES.json.
- `guard/` — allergen-guard lists for all 23 (the 11 not yet installed are ready: sq mk bs ca si ta km lo sw am fil), with
  build-a/b.cjs and prove-a/b.cjs (all PASS).
- `listing/` — the listing brief, checker and src/c.cjs (sq-AL's listing is written there, not yet staged).
- `queue.txt` — remaining parts in order; `NOTES.md`, `NATIVE.md` — research notes and every translator's native-check note.

## Per language, the loop
`node tools/genprompt.cjs <locale> <NN> "<Language>"` → an agent per part (9) → `node tools/prep-consistency.cjs <locale>` →
consistency agent (tr/CONSISTENCY.md) → `node tools/install2.cjs <locale>` → add the locale to LPROJ in
scripts/ios/native-strings.cjs and run it → `tools/commit-lang.sh <locale> <lproj> <guardLang> <message-file>`.
Swahili: adding lib/allergen-guard/sw.json means scripts/languages-1.cjs's "no list" language (sw-KE) must be re-pinned to one
that still has no list.
