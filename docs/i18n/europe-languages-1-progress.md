# europe-languages-1 — progress

*Started 22 October 2026 (overnight run). Kept up to date after every stage. If the run restarts, read this first and carry
on from the first unfinished stage; never redo finished work.*

Scratch folder (translation parts, checker, baseline captures):
`/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/b202fcf6-9b60-4397-8c7b-3f4a71421f5f/scratchpad/`
(`de/` for German; one folder per language after that). The "before" byte-identity captures are in `de/before/` (taken
before any app code changed).

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0 · editor memory (tsconfig) | done | tsc needs ~2.0 GB (2,315 files; the 1.1 MB Manage page and next-intl's typed keys are most of it), so the editor's TS server sits at its 3 GB default limit. Fix: tsconfig excludes non-source folders (docs, android, ios, public, …); non-English whole message files load untyped via require() in the generated locale-files.ts (~25 MB per language saved); .vscode/settings.json raises maxTsServerMemory to 6144 and stops watching .next/docs/android. Typed keys untouched; tsc clean |
| 1 · German (de-DE base; de-AT, de-CH, de-LI) | done | 0 structural ×4; e2e de-DE Chromium 390/1280: 3,548 views, 9 overflows (demo stepper) fixed by shortening „Küche“; failing shots in docs/europe-languages-1/de-DE; same-words/de.json; hero images de/at/ch (li → ch) |
| 2 · Spanish (es-ES) | done | 0 structural; harness ✓; order page: only explained residue |
| 3 · Italian (it-IT) | done | 0 structural; harness ✓; order page: only explained residue |
| 4 · Portuguese (pt-PT) | done | 0 structural; harness ✓; order page: residue + 2 PT words (same-words/pt.json) |
| 5 · Dutch (nl-NL; nl-BE) | done | 0 structural ×2; nl-BE 28 keys; harness ✓; order page: residue + Dutch words |
| 6 · Swedish (sv-SE) | done | 0 structural; consistency pass; harness ✓; order page: residue only |
| 7 · Danish (da-DK) | done | 0 structural; quotes/stepper aligned; harness ✓; order page: residue only |
| 8 · Norwegian (nb-NO) | done | 0 structural; "Drevet av" unified; harness ✓ 174/174; order page: residue only |
| Final · tsc, build, lint, sweep, byte-identity, recipe update, report | done | tsc ✓, build ✓ (no warnings), lint = baseline 2,445/378, byte-identity ✓ (19,894/19,894; 39/39), German overflow re-measured 0, sweep 164/165 (add-order-refresh-inputs: existing time-of-day flake, fails on untouched HEAD too), recipe §7b ✓, report docs/europe-languages-1-report.md |

## Shared pieces (done)

- Glossary: DE/ES/IT/NL "private event" rows split; PT/SV/DA/NB tables added; `lib/i18n/glossary/*.json` rebuilt (9 languages).
- Guard words for all 8 languages in `lib/allergen-guard/` and imported in `lib/allergen-guard.ts`.
- `scripts/europe-languages-1.cjs` (the lean checks; grows with LOCALES); `supabase/migrations/20261037_europe_language_short_names.sql` (NOT RUN).
- Tooling: translation-check reads regional chains; split-messages loads regional variants lazily; e2e `--engines` / `--failures-only`;
  messages-parity re-pinned for `planFeatures.cardRegion.Swisscards` (the one key added to en-GB).
- Button wording verified against each statute (scratch `button-research.md`).

## Decisions waiting for Dominic

None blocking. The questions are in docs/europe-languages-1-report.md §13. **Run complete, 23 October 2026.**
