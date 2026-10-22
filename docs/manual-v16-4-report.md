# manual-v16-4 — the reference manual, V16.3 → V16.4

*22 October 2026. Written for Dominic. Applies `~/Downloads/reference-manual-delta-v16-4.md` to `docs/reference-manual.md`,
following its HOW TO APPLY. The manual is the only project file changed, apart from this report. No database change.*

## 1 · Summary

- **Versions:** the running header is `HatchGrab Engineering Reference Manual · V16.4` and the front matter
  `**Version 16.4**`. Nothing in the header or front matter still says 16.3.
- **Part A:** the changelog block is inserted verbatim at the top of `# Changelog`, above `## V16.3`, with the SWEEP
  STATUS line filled (§5).
- **Part B:** `# 83. Addresses, native prices, languages and Europe (V16.4 — 21–22 October 2026)` is inserted after
  §82. Every "verify" is filled with what was observed on 22 Oct, or marked UNVERIFIED.
- **Part C:** 38 statements that are now false are struck through, each followed by `⛔ Corrected V16.4 — …`. Three
  pointer notes send readers to §83. Nothing was deleted.
- **New blocks:**
  - §43 subsection (terms and the order page);
  - §48 subsection (native prices, /about, the footer picker, the country pages);
  - §49 current posture;
  - §27 V16.4 backlog;
  - §35.al;
  - §79 additions.
- **Older changelog entries are byte-identical to HEAD:** the text from `## V16.3 — 20–21 October 2026` to
  `# 1. Purpose of this document`, 1,073,629 characters, compared programmatically.
- **Size:** `git diff --stat docs/reference-manual.md` is 485 insertions and 56 deletions. The deletions are the
  replaced lines, each still present inside its strike (`~~…~~`), plus the two version lines.

## 2 · ⚠️ Where the delta and reality differ (the manual records reality)

1. 🔴 **Canada's time zones.**
   - **What I saw:** the delta asks for the build log's `check-tzdata` line. The Vercel log was not visible to me:
     **UNVERIFIED**.
   - A local `npm run build` on 22 Oct (Node v22.22.3, ICU 78.2, tz 2026a) printed: "the 2026 Canadian time-zone
     changes are MISSING … Keep Canada switched off until a build prints 'present'". **Canada is switched on.**
   - From 1 Nov 2026, BC, Alberta, NWT and Manitoba clocks would read an hour out, unless Vercel runs Node 24.22.1+ or
     22.23.4+.
   - Recorded in §83.1, §49 and §27.
2. **France has no row.** §83.1 said "FR (if france-1 block B has run: verify)".
   - OBSERVED: no FR `country_settings` row and no FR `plan_prices`.
   - `/fr` 302s to `/uk`.
   - The `fr` key is in the live address-format CHECK, via europe-settings' block A.
3. **The non-euro European prices: approval not recorded.**
   - The live rows hold exactly the proposed figures (CHF 27/65, CZK 699/1 690, DKK 219/519, HUF 10 990/24 990, NOK
     299/729, PLN 129/299, RON 149/369, SEK 329/769, GBP 29/69).
   - Every row is still `updated_by = 'europe-settings draft'`.
   - Recorded as UNVERIFIED (§83.10).
4. **europe-settings is uncommitted.** The delta describes it as done; the manual says it is in the working tree only.
   That covers:
   - the 29 address formats, Latvia's comma, `narrowIn`, en-MT / en-GI;
   - the European segments;
   - the EEA and Gibraltar terms sections.

   Live today: `/de` and `/mt` return **404**, not "302 while off" as the delta's §48 line says; they will 302 once
   deployed. Recorded in §48 and §83.1.
5. **Its rows are already live, ahead of its code.** The deployed code leaves the 29 rows out of every country list,
   with a log line per row per read, until europe-settings ships (§83.10, §49).
6. **The region lists:** the delta lists US 51, IE 26, AU 8 and CA 13. OBSERVED, there is also **IT 107** (provinces).
   Added in §83.2.
7. **The Admin › Countries testing rule** says "the IRELAND column only (switched off, no trucks)". Ireland is now
   **switched on** (still no trucks). The parenthesis is struck and the rule left as Dominic's to change (§76.1, §27).
8. **Part C's §76 "address_format postcode | zip_state" statements:** none exist in §76 or anywhere outside the
   Changelog. Nothing to correct.
9. **Part C's §77 "One language for every country":** that phrase is not in the manual. The §77 lines that were false
   are corrected instead:
   - five locales;
   - "still planned";
   - "/ie, /au, /nz switched off";
   - "Phase 3 has not started";
   - "every locale imported statically";
   - the English-only safety floor.
10. **IE's switch-on time** can't be seen after the fact: its last write was by `allergen-card-country` (22 Oct 10:26
    UTC).
11. **"Deployed":** the git refs and the public site (curl) agree that `2d725e3e` is what is live. Vercel's own deploy
    record was not read.
12. **The §49 heading** "(current at V16.3; …)" now says V16.4. It is a version marker, like the running header.

## 3 · Verified (22 October 2026)

**Git:**
- `git log origin/main -1` = HEAD = `2d725e3e1437b6211c037cd293b149d6f320e9dc` "france", 2026-10-22 19:57:37 +0100
  (local ref, no fetch).
- `git status`: `main...origin/main`, not ahead or behind.

**Uncommitted work, all from earlier workstreams, not this one:**
- europe-settings: `lib/address-formats.ts`, `lib/currencies.ts`, `lib/money-format.ts`, `lib/marketing-country.ts`,
  `lib/i18n/*`, `messages/en-MT.json`, `messages/en-GI.json`, `content/legal/country-specific-terms.md`,
  `app/trucks/[slug]/order/page.tsx`, the scripts and re-pins, `supabase/migrations/20261035_…` and `20261036_…`,
  `docs/europe-settings-report.md`;
- the france-1 Follow-up: `docs/i18n/seo-glossary-eu.md`, `scripts/glossary-build.cjs`, `lib/i18n/glossary/fr.json`,
  `docs/france-1-report.md`, `docs/france-1-translation-flags.md`.

**Which of the listed reports are committed** (last commit touching each, on origin/main):

| Report | Commit |
|---|---|
| ireland-2, address-formats-diagnosis, directions-link-fix, address-formats-1 | `7fcd4fc9` "addresses" (21 Oct) |
| allergen-card-country, address-formats-2, ireland-3, native-prices, anz-terms | `fadb352f` "allergens and address" (22 Oct) |
| canada-1 | `7f905934` "canada" |
| canada-2 | `fc33b3d9` "canada readiness" |
| about-page (code `ae871119` "about us"; report) | `2d725e3e` "france" |
| languages-1, france-1, `docs/i18n/add-a-country.md` | `2d725e3e` "france" |
| europe-settings | **uncommitted** |

**The live site (curl, read-only, public marketing pages only):**
- `/about` 200 and `/ca` 200;
- `/fr` 302 → `/uk`;
- `/de` 404 and `/mt` 404;
- `/llms.txt` 200;
- `/nz` contains "Prices in New Zealand dollars (NZD)";
- `/country-terms` has Canada and France, but no EEA or Gibraltar section;
- `/robots.txt`: the GPTBot / ClaudeBot / Google-Extended group has `Allow: /`, then the private disallows;
- `/uk` JSON-LD `"countriesSupported":["AU","CA","IE","NZ","GB","US"]`.

**The database (read-only SQL, §6):**
- **Rows:** 35 `country_settings` rows, 6 enabled (GB, US, IE, AU, NZ, CA). No FR row.
- **The 29 European rows:** enabled false, `updated_by` 'europe-settings draft', `updated_at` 2026-10-22
  19:34:02.272602+00.
- **`allergen_card_only_allowed` false:** IE, LV, PL, RO, SK.
- **CHECKs:**
  - `country_settings_address_format_chk` = gb, us, ie, au, nz, ca, fr + the 29 European keys (36, in config order);
  - `country_settings_allergen_set_chk` = uk14, us9, anz, ca;
  - `country_settings_currency_chk` = the 14 registry codes.
- **Columns:** `truck_events.suburb`, `truck_places.suburb` and `truck_places.region` exist (text);
  `country_settings.allergen_card_only_allowed` (boolean); `trucks_base_region_code_chk` does not exist.
- **The CA row:** mdy, 12h, tipping on {10,15,20}, service fee not allowed, prices exclude tax.
- **Trucks and orders:** trucks GB/GBP 11 and US/USD 1; orders GBP 2,939 and USD 5.

**`content/legal/country-specific-terms.md`, in order** (working tree): United States, Ireland, Australia, New Zealand,
Canada, France, European Economic Area and Switzerland, Gibraltar.

**Code facts used in §83** (read 22 Oct):
- `ADDRESS_FORMAT_KEYS` (36);
- region lists US 51, IE 26, AU 8, CA 13, IT 107; `identifiesPremises` GB and IE only;
- `LEGACY_ADDRESS_FORMATS` {postcode: gb, zip_state: us}; `includedTaxOf` set on 29 formats;
- CA regions (HST 13/14/15, GST 5, MB GST + RST 12 closed, SK GST + PST 11 closed, QC closed);
- `LOCALES` (9), `LANGUAGE_BASES ['fr-FR']`;
- override key counts: en-US 474, en-IE 6, en-AU 107, en-NZ 22, en-CA 87, en-GI 1, en-MT 0; fr-FR 5,056, en-GB 5,042;
- `lib/allergen-guard/` holds en.json and fr.json;
- `prebuild` runs `check-tzdata.cjs`;
- no `public/about/` (no photo);
- 164 harnesses listed; `languages-1-e2e` is excluded as "needs a browser";
- `COUNTRY_TERMS_UPDATED` '22 October 2026', `TERMS_VERSION` '2026-10-22'.

## 4 · What changed in the manual

| Where | Change |
|---|---|
| Header, front matter | V16.4 |
| `# Changelog` | Part A, above `## V16.3`, SWEEP STATUS filled |
| §83 (new, after §82) | Part B; 83.1 and the other "verify" items filled with the observations above |
| §20 | the "Still English-only" guard line |
| §27 | V16.2 "the WhatsApp allergen check"; V16.3 launch lists, language stages, the anz CHECK; **new "Added V16.4" block** (the delta's items, plus five found when applying) |
| §43 | V16.3 "terms need sections"; **new V16.4 subsection** (terms order, versions, the order-page decision) |
| §48 | **new V16.4 subsection** (native prices, /about, footer picker, /ca, /fr, the European segments, hreflang) |
| §49 | heading "current at V16.4"; **new current posture block** above V16.3's |
| §35 | **35.al** (5 invariants), after 35.ak |
| §76 | the IE/AU/NZ rows line, the testing rule's "(switched off)", `base_region_code` "US only", the header flag selector, the allergen lists, the allergen CHECK |
| §77 | the safety floor, "five locales … still planned", "/ie /au /nz switched off", "Phase 3 not started", "five LOCALES", "imported statically" |
| §79 | at its end: the 164-harness sweep, the new harnesses, the tools, the database writes not made by the session |
| §81 | "AU/NZ rows not inserted", "IE switched off" ×2 |
| §82 | 82.1 "no AU, NZ or CA row"; 82.2 pointer plus four lines; 82.3 pointer plus two; 82.4 ×4; 82.5; 82.6 ×2; 82.8 ×2; 82.9; 82.10 pointer plus Canada |

## 5 · The sweep (Part D)

**SWEEP STATUS:** stale references found: **38**; corrected in place: **38**; left as history (changelog only): **2**;
outstanding: **0**.

**Patterns:**

| Pattern | Outside the Changelog |
|---|---|
| 1. `postcode \| zip_state`, `zip_state` as current, `addressStyleOf`, `messagesStyle` | 0 matches |
| 2. `A$39`, `NZ$49`, `planLocale`, "bare $" | §82.8's plan money format line (corrected). §81's and §82.1's A$39 / NZ$49 are prices, still true, left |
| 3. AU/NZ not inserted, block B after deploy, Ireland switched off, Canada not started | §76.1, §81 ×2, §82.1, §82.2 ×3, §82.10 Canada (corrected). §82.10's "~~run after deploy~~" was already struck at V16.3 |
| 4. `en-GB and en-US`, the locale list, one locale per country | §77.2, §77.4, §82.4 LOCALES (corrected); "en-GB and en-US" and "one locale per country" not found |
| 5. Country menu in the header / nav picker | §76.5 (corrected); §48's "The flag selector sets `hg_country`…" is still true, left |
| 6. `trucks_base_region_code_chk` as current | 0 matches. The related §76.5 `base_region_code` "US only" line is corrected |

**Other false statements found and corrected while reading:**
- the guard as English-only (§20, §77.1, §82.4);
- "language plan not started" (§77.3, §82.4);
- "imported statically" (§77.6);
- the allergen lists and CHECK (§76.6, §82.5, §82.2);
- the registry "uncommitted" (§82.6), the plan-price symbol list (§82.6);
- ai-search "NOT LIVE" (§82.9);
- `lib/i18n/messages.ts` in the recipe (§82.3);
- the European word choices "pending" (§82.4);
- the terms "need sections" (§43);
- the §27 V16.2/V16.3 backlog items now done.

**Inside the Changelog:** 2 lines matched: V16.3's "AU A$0/A$39/A$99" and "NZ NZ$0/NZ$49/NZ$119". Both are prices and
still true; neither was edited.

**Left as dated history:**
- the §49 V16.3 posture ("AU/NZ rows (block B): not inserted", "IE … switched off");
- the §79 V16.3 sweep line ("149 registered harnesses"), labelled with its version.

## 6 · Read-only SQL run in this workstream

```sql
select country_code, enabled, address_format, allergen_set, allergen_card_only_allowed, updated_by, updated_at from country_settings order by country_code;
```
```sql
select pp.country_code, cs.currency, pp.plan_key, pp.monthly_minor, pp.included_online_minor, pp.fee_bps, pp.extra_van_monthly_minor from plan_prices pp join country_settings cs on cs.country_code = pp.country_code where cs.currency <> 'EUR' and pp.country_code not in ('GB','US','AU','NZ','CA') order by pp.country_code, pp.plan_key;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where conname in ('country_settings_address_format_chk', 'country_settings_allergen_set_chk', 'country_settings_currency_chk', 'trucks_base_region_code_chk') order by 1, 2;
```
```sql
select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and ((table_name = 'truck_events' and column_name = 'suburb') or (table_name = 'truck_places' and column_name in ('suburb', 'region')) or (table_name = 'country_settings' and column_name = 'allergen_card_only_allowed')) order by 1, 2;
```
```sql
select country_code, date_order, time_format, tipping_enabled_default, tip_presets_pct, service_fee_allowed, prices_include_tax, platform_fee_enabled from country_settings where country_code in ('CA','IE','AU','NZ','GB','US') order by 1;
```
```sql
select (select count(*) from plan_prices where country_code = 'FR') as fr_prices, (select count(*) from country_settings) as rows_total, (select count(*) from country_settings where enabled) as rows_enabled, (select count(*) from pg_constraint where conname = 'trucks_base_region_code_chk') as base_region_chk;
```
```sql
select 'trucks' as what, country as code, currency, count(*) as n from trucks group by country, currency union all select 'orders', null, currency, count(*) from orders group by currency order by 1, 2, 3;
```

No database change was made or proposed.

## 7 · For Dominic

1. 🔴 **Canada's clocks:** check the Vercel build log's `check-tzdata` line, or set Vercel to Node 24.x, before 1 Nov
   2026.
2. **The non-euro European prices** are live in the table as proposed. Approve them, or change them
   (europe-settings §9.3).
3. **Deploy europe-settings and the france-1 Follow-up** to stop the 29 rows being logged as unreadable, and to give
   `/de` etc. their 302.
4. **France:** run france-1 block B when you want the FR row (switched off).
5. **The Admin › Countries testing rule** names Ireland, which is now live. Pick another switched-off column (e.g. a
   European one) if you want the rule to keep its intent.
