# legal-languages-1 — progress

*Started 1 November 2026. If the run restarts, read this first and carry on from the first unfinished stage.*

Scratch: `/private/tmp/claude-501/-Users-dominicbonini-dev-village-foodie/ca22c535-d1ad-44a9-b881-1d15addf2739/scratchpad/`
(`tr-legal/BRIEF.md` — the translators' brief; `tr-legal/<locale>/` their parts; `audit-<locale>.log`).

Chat format (Dominic): two-line summary, every NOT RUN SQL block fenced, confirm the file, report filename last.

## Design decisions (mine, explained in the report)
- English (content/legal/*.md) stays the governing version at /privacy, /terms, /country-terms — reachable from every country.
- A translation per LANGUAGE BASE: content/legal/<base>/<file>, line 1 a source stamp (sha256 of the English file), the date
  line `**<Last updated>:** {{LAST_UPDATED}}` (the page writes the English date in the local format). Regional locales read
  their base (de-AT/de-LI → de-DE; es-MX → es-ES; nl-BE → nl-NL; el-CY → el-GR; fr-LU → fr-FR); de-CH / de-LI get ß → ss.
- Served at the COUNTRY's address: /fr/privacy, /de/terms, /jp/country-terms (app/[country]/(legal)/…, the same LegalChrome in
  the language). English-speaking / switched-off countries redirect to the English page.
- Every legal link asks lib/legal.ts `legalPath(doc, { country, locale })` — English pages unchanged.
- Drift: scripts/_legal-translations.cjs compare() — structure, numbers, links, addresses, processors, and the source stamp.
- No cookie banner exists (PostHog memory-only); browser storage is Privacy §5, translated with the policy.

## Stages
| Stage | Status | Notes |
|---|---|---|
| 1a legal infra (routes, loader, links, note key in 29 files) | done | |
| 1b legal translations, 28 bases | done | 84 files, stamped, compare 0 problems |
| 2 other public pages | done | auth pages (AuthLocale), 404/error pages (errorPage, 28 bases); contact keeps Tally (gap) |
| 3 everything we send | done | account emails localeForOperator; email privacy link; Stripe Elements / Connect locale |
| 4 audit harness + fixes | done — 28/28 clean (run 3, per-language caches) | fixes: dietary tags, font reason, setup press labels; fixture/harness rules |
| 5 proof, report | done — drift 220/220, screens 20/20, identity 440/440, lint 0 regressions; final sweep + build run last | report: docs/legal-languages-1-report.md |
