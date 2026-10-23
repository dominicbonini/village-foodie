# europe-languages-2 — progress

*Started 23 October 2026. Updated after every stage. If the run restarts, read this first and carry on from the first
unfinished stage; never redo finished work.*

Scratch folder (translation parts, checkers, captures):
`/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/b202fcf6-9b60-4397-8c7b-3f4a71421f5f/scratchpad/`
(one folder per language: pl, cs, sk, hu, ro, hr, sl, fi, et, lv, lt, el, bg; shared `STYLE-common.md`, `check-lang.cjs`,
`merge-lang.cjs`, `fixcommon.cjs`, `consistency.cjs`; byte-identity captures in `el2/before`, `el2/after`).

## Decision held for Dominic (everything else proceeds)

- **The French phone placeholder.** Stage 0.3 says to localise the +44 placeholder in fr. The final stage says FR stays
  identical except `order.placeOrder`. These conflict, so the French placeholder is left as +44 until you decide. The
  de, sv and nb placeholders are localised.

## Shared pieces done

- Glossary tables for the 13 languages (private hire vs private event split); `lib/i18n/glossary/*.json` rebuilt (22 languages).
- Guard words for the 13 languages in `lib/allergen-guard/`, imported.
- `supabase/migrations/20261038_europe_language_short_names_2.sql` (NOT RUN). LU, MT, GI already correct.
- Greek/Cyrillic font fallback (Noto Sans, scoped to el/bg pages): app/layout.tsx, app/globals.css, app/landing/landing.css.
- Read-only SQL: all 14 rows switched off; **BG is EUR** ✓; prices as europe-settings.
- Research agent: DONE — button statutes (LV/LT from the Directive's own text: national portals blocked; FI no fixed phrase) and Annex II names; written into each STYLE.md.
- Translation briefs: shared TERMS.md per language (parts run in parallel); pl/cs/sk TERMS.md set from parts 03–10.
- Re-pins done: europe-languages-1.cjs (de/at button without amount, de-AT/de-LI phone keys) 177/177; languages-1.cjs (no-list language → tr-TR; pseudo-language writes out CLDR plural categories) 91/91; split-messages regenerated.

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0 · fixes from europe-languages-1 | done | 0.1 de-DE/de-AT card button without amount (docs/i18n/placeholder-drops.json lets translation-check accept exactly that); de-CH/LI keep it · 0.2 fr placeOrder « Commander avec obligation de paiement » (+ busyNotice, which quotes it) · 0.3 phone placeholder de +49, AT +43, CH +41, LI +423, sv +46, nb +47 (fr held — see above) · 0.4 sv "abonnemang" (7 strings), da "oversigt" (28) · 0.6 add-order-refresh-inputs: not the time of day (fake 08:18 clock passes); virtual clock removes the wall-clock dependency; 24-busy-loop load did not reproduce the old failure either (old and new both pass twice) · also: translation-check now enforces CLDR plural categories; fixed 19 missing categories in 8 built languages (3 real grammar bugs) |
| 1 · Polish (pl-PL) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 2 · Czech (cs-CZ) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 3 · Slovak (sk-SK) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 4 · Hungarian (hu-HU) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 5 · Romanian (ro-RO) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 6 · Croatian (hr-HR) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 7 · Slovenian (sl-SI) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 8 · Finnish (fi-FI) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 9 · Estonian (et-EE) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 10 · Latvian (lv-LV) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 11 · Lithuanian (lt-LT) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 12 · Greek (el-GR, el-CY) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| 13 · Bulgarian (bg-BG) | done | merged · consistency pass · 0 structural · lean checks + order page pass |
| Final | done | tsc ✓ · build ✓ · lint = baseline · sweep 164/165 (the 1: another session's lib/pricing-check.ts) · byte-identity ✓ · fonts 16/16 · report docs/europe-languages-2-report.md |

## Run log
- 23 Oct, ~11:00: a usage limit stopped all 20 running translators (pl/cs/sk/hu/ro 01·02·04, hr 01·02·04·07·08); each was
  resumed from its own transcript after the reset — nothing redone. Still queued: hr 09·10; sl, fi, et, lv, lt, el, bg (all ten
  parts each). Prompts: `node <scratch>/genprompt.cjs <lang> <NN>`.
- europe-languages-1.cjs now lists the 13 new languages (button, plans, WhatsApp safety/plain questions) and reads 20261038 too.
- Consistency pass per language (CONSISTENCY.md in scratch): one agent unifies tab/button/term names across the ten parts
  in messages/<locale>.json + docs/i18n/back/<locale>.json; the main session runs split-messages after.
- "Insert opt-out", "Templates", "Signature" are English-only admin labels (components/admin/*): every new language quotes them in English.
- 23 Oct, ~16:30: a second usage limit stopped 20 agents (lt 01–10, el 01–07, et/fi/lv consistency); all resumed from
  their own transcripts after the 17:10 reset. Merged and registered so far: pl, cs, sk, hu, ro, hr, sl, fi, et, lv (all 0
  structural); consistency done for pl, cs, sk, hu, ro, hr, sl. Still queued: el 08–10, bg 01–10, el-CY override.
