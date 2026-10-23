# manual-v16-5 — report

**23 October 2026, about 18:10 BST.** Docs only: the one file changed by this workstream is `docs/reference-manual.md`
(plus this report). Nothing was committed, pushed or deployed. No database change; four read-only queries (§5).

## 1 · Deltas applied

- **Step 0:** the manual was already at **V16.4** (header line 1, front matter "Version 16.4"). V16.4 was not re-applied.
- **Applied: `~/Downloads/reference-manual-delta-v16-5.md`** (dated 23 Oct 18:07), per its "HOW TO APPLY":
  1. **Version:** the running header is `HatchGrab Engineering Reference Manual · V16.5` and the front matter
     `**Version 16.5**`. No header or front-matter line still says 16.4.
  2. **Part A:** the changelog block, at the top of `# Changelog` above `## V16.4`. It has the SWEEP STATUS line filled and
     a "Not in the delta, found when applying" list.
  3. **Part B:** the new `# 84. Every European language and the European switch-on`, after §83. Every "verify" line is
     filled with what was OBSERVED and dated.
  4. **Part C:**
     - **corrections in place** (strike plus `⛔ Corrected V16.5 — …`): §83.9, §83.10, §83.11, §77.2 and §83.8 (the
       locale lists), §83.2, §83.3, §83.4, §83.6;
     - **new V16.5 subsections:** §43 (legal) and §48 (marketing);
     - **§49:** a new current deploy-posture block, with the heading now "current at V16.5";
     - **§27:** a new V16.5 block, and the V16.4 "Languages to add" line struck;
     - **§35:** 35.am-1 to 35.am-5, after 35.al;
     - **§79:** the V16.5 tooling lines, at its end.
  5. **Part D:** the sweep below.
- **Older changelog entries:** not edited.
- **Nothing was deleted silently:** every removed line in `git diff` reappears struck through with its correction.

## 2 · SWEEP STATUS

**SWEEP STATUS (applied 23 October 2026):** _stale references found: 17; corrected in place: 17; left as history (changelog
only): 0; outstanding: 0._

What the 17 were (outside the Changelog):
1. §83.9: « Commander et payer au retrait » as the current button.
2. §83.9: the glossary split "uncommitted".
3. §83.10 heading: "switched off".
4. §83.10: "Malta and Gibraltar can go live in English … Every other country waits for its language".
5. §83.10: "Until europe-settings is deployed … 404".
6. §83.11: "screenshots" in the European recipe.
7. §77.2: "nine locales …".
8. §83.8: the locale list stopping at en-GI.
9. §83.8: `LANGUAGE_BASES = ['fr-FR']`.
10. §83.4: "the other four are switched off".
11. §83.4: guard lists "en.json and fr.json".
12. §83.2: "The 29 European entries are uncommitted".
13. §83.3: `narrowIn` "uncommitted".
14. §83.6: "The last two are uncommitted … live page ends at France".
15. §43 (V16.4 subsection): the same.
16. §48 (V16.4 subsection): "European segments uncommitted … 404".
17. §27 (V16.4): "Languages to add".

**Pattern 5** (`short_name` described as English for European rows) matched nothing in the manual's text. The live
database still has English short names for 14 rows (flag 2). No pattern matched inside the Changelog.

**Re-checked after applying:** two lines still contain "payer au retrait":
- §83.9's « Payer au retrait », the Pay at Hatch short label, which is still true;
- §84.3's history sentence about the old button.

Neither is stale.

## 3 · Flags (the delta against the code and database; the manual records what was OBSERVED)

1. 🔴 **Luxembourg is switched on without its language.**
   - `LU` has `enabled = true`, locale `fr-LU`. fr-LU is not in `LOCALES`, so `resolveLocale` gives en-GB words.
   - `countryPageAlternates` (`lib/marketing-meta.ts`) lists the row's own locale, so /lu is in hreflang as `fr-LU` with
     English content.
   - The delta says LU "must still be off".
   - Recorded in §84.1, §83.10, §27, §48 and §49. **Your call:** switch LU off, or build fr-LU.
2. 🔴 **`20261038` has not run.**
   - PL, CZ, SK, HU, RO, HR, SI, FI, EE, LV, LT, GR, CY and BG are switched on with English short names inside their own
     languages' sentences.
   - The delta says it runs "after the deploy". `20261037` has run: the 12 europe-languages-1 names are in their languages.
3. 🔴 **France has no row**, and no `plan_prices`.
   - The delta's expected list includes "some or all of FR". France is the one built language with no live country.
   - france-1's block B (`20261034_france_row.sql`) is still not run.
4. **Regional key counts differ from the delta:**
   - de-AT: 5 keys (delta 4);
   - de-CH: 98 (delta 95);
   - de-LI: 1 (delta "empty").
   - The extras are the localised team-phone examples (europe-languages-2 Stage 0) and, in de-CH, the card button that
     keeps its amount.
   - §84.2 records the observed counts.
5. **`schedule-graphics-places.cjs`** fails while `lib/pricing-check.ts` is committed (`f17f6540`). It needs adding to the
   guard's EXPECTED list. Recorded in §27 and §79.
   - While I was applying this, `git diff` began to show another session editing `scripts/schedule-graphics-places.cjs` and
     `docs/pricing-check-1-report.md`.
   - I did not touch either. That session may be landing the guard fix.
6. **Not verifiable from here:**
   - the live site (not fetched);
   - Vercel's deploy record;
   - the Vercel build log's `check-tzdata` line (Node 24.x / tzdb 2026e, due before 1 Nov).
   All three are recorded as **UNVERIFIED**.

## 4 · The live country list (OBSERVED 23 October 2026, read-only SQL)

**All 35 `country_settings` rows are enabled:**
AT, AU, BE, BG, CA, CH, CY, CZ, DE, DK, EE, ES, FI, GB, GI, GR, HR, HU, IE, IT, LI, LT, LU, LV, MT, NL, NO, NZ, PL, PT, RO,
SE, SI, SK, US.

There is **no FR row**.

| Country | short_name | locale | currency |
|---|---|---|---|
| AT | Österreich | de-AT | EUR |
| AU | Australia | en-AU | AUD |
| BE | België | nl-BE | EUR |
| BG | Bulgaria | bg-BG | EUR |
| CA | Canada | en-CA | CAD |
| CH | Schweiz | de-CH | CHF |
| CY | Cyprus | el-CY | EUR |
| CZ | the Czech Republic | cs-CZ | CZK |
| DE | Deutschland | de-DE | EUR |
| DK | Danmark | da-DK | DKK |
| EE | Estonia | et-EE | EUR |
| ES | España | es-ES | EUR |
| FI | Finland | fi-FI | EUR |
| GB | UK | en-GB | GBP |
| GI | Gibraltar | en-GI | GBP |
| GR | Greece | el-GR | EUR |
| HR | Croatia | hr-HR | EUR |
| HU | Hungary | hu-HU | HUF |
| IE | Ireland | en-IE | EUR |
| IT | Italia | it-IT | EUR |
| LI | Liechtenstein | de-LI | CHF |
| LT | Lithuania | lt-LT | EUR |
| LU | Luxembourg | fr-LU | EUR |
| LV | Latvia | lv-LV | EUR |
| MT | Malta | en-MT | EUR |
| NL | Nederland | nl-NL | EUR |
| NO | Norge | nb-NO | NOK |
| NZ | New Zealand | en-NZ | NZD |
| PL | Poland | pl-PL | PLN |
| PT | Portugal | pt-PT | EUR |
| RO | Romania | ro-RO | RON |
| SE | Sverige | sv-SE | SEK |
| SI | Slovenia | sl-SI | EUR |
| SK | Slovakia | sk-SK | EUR |
| US | US | en-US | USD |

**Non-euro `plan_prices`:** exactly europe-settings' figures (§84.1 table):
- CHF 27/65;
- SEK 329/769;
- DKK 219/519;
- NOK 299/729;
- PLN 129/299;
- CZK 699/1,690;
- HUF 10,990/24,990;
- RON 149/369;
- GI £29/£69.

**Other observations:**
- `allergen_card_only_allowed = false`: IE, LV, PL, RO, SK.
- **Pricing check (`20261039`):** `competitors`, `competitor_plans` and `country_benchmarks` exist.
- **Git:** `origin/main` = HEAD = `f17f6540` "more europe" (23 Oct 18:07 BST, after `git fetch`). `git status` was clean
  before this edit. The pricing-research files are all committed.

## 5 · Read-only SQL run

```sql
select country_code, enabled, short_name, locale, currency from public.country_settings order by country_code;
```
```sql
select country_code, plan_key, monthly_minor, included_online_minor, fee_bps from public.plan_prices where country_code in ('CH','LI','SE','DK','NO','PL','CZ','HU','RO','GI') order by country_code, plan_key;
```
```sql
select to_regclass('public.competitors') as competitors, to_regclass('public.competitor_plans') as competitor_plans, to_regclass('public.country_benchmarks') as country_benchmarks;
```
```sql
select country_code, allergen_card_only_allowed from public.country_settings where allergen_card_only_allowed = false order by country_code;
```

## 6 · Files

- **Changed:** `docs/reference-manual.md` (V16.4 → V16.5; +385 / −30 lines, every removed line reappears struck).
- **New:** `docs/manual-v16-5-report.md` (this file).
- **A copy of the V16.4 manual from before the edit** is in this session's scratchpad (`manual-v16-4.bak.md`). It is not in
  the repo.
