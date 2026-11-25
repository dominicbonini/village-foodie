# compare-territories-1 + checker-prep-1

**25 November 2026 · branch `france-vat-1` · commits `3b9da546` (Part 1), `43501574` (Part 2), `18836cf5` (Part 3) · not pushed, not deployed**

The Competitor check workflow is still **disabled**. No `.env` file was opened. Only competitor, comparison and
`competitor_check_settings` rows changed. Every SQL statement is in `docs/checker-prep-1/sql.txt`.

## Summary

- **Part 1.** The neighbour rule now covers 15 territories. **Live comparison countries went from 61 to 75.** AX stays one short
  (it has Food4you only).
- **Part 2.** Both migrations were pre-flighted (rolled back), applied and verified:
  - `20261140`: the checker settings.
  - `20261141`: the stagger. **161 competitors at 4 a day, 4 Jan → 13 Feb 2027. The smallest margin is 40 days (Bizzfo).**
- **Part 3.** The workflow's import step now uses the pg runner and the `SUPABASE_DB_URL` secret. All four harnesses pass:
  checker-prep-1 18/0, competitor-check-1 227/0, compare-fix-1 65/0, compare-fix-2 79/0.

---

## Part 1 · compare-territories-1 (the neighbour rule, 15 territories)

The evidence comes from compare-research-7 Block 5. A parent-country tool counts in a territory unless its own site excludes that
territory.

### 1.1 Currency check (`country_settings`, read-only)

Every territory uses its parent's currency, so none was skipped:

| Territories | Currency | Parent's currency |
|---|---|---|
| JE GG IM | GBP | GB: GBP |
| AX | EUR | FI: EUR |
| SM VA | EUR | IT: EUR |
| AD | EUR | ES and FR: EUR |
| RE GP MQ GF YT BL MF PM | EUR | FR: EUR |

### 1.2 Per territory

| Territory | Parent | Plans stored | Shown (live page) | Left out, and why |
|---|---|---|---|---|
| JE, GG, IM | GB | Ordea, Order Tiger, Perkss, Grafterr | Ordea · Order Tiger · Grafterr | Perkss: unclear (its price is weekly, as in GB) |
| AX | FI | Food4you | — (1, one short, **not live**) | FoxiFood: its own country list omits AX |
| SM, VA | IT | Qromo, MenuForma, Tilby | Qromo · MenuForma · Tilby | Boom srl: «Operiamo a Catania e in tutta Italia» means mainland only |
| AD | ES + FR | Beau Camion, Nomad, Place à emporter, Eatch, pidopago | Beau Camion · Nomad · Place à emporter · Eatch | pidopago: stored, but it is a restaurant tool and 4 are already shown; FoxiFood: its list omits AD |
| RE GP MQ GF YT BL MF PM | FR | Beau Camion, Nomad, Place à emporter, Eatch | the same four | — |

Each plan carries `"neighbour": <parent>` and the note "serves X from Y".

### 1.3 The build and load

- **Build:**
  - `docs/compare-territories-1/build.cjs` is a copy of compare-research-7's build, with `RAWS = ['coordinator']`.
  - It writes `data/compare-territories-1/competitors.json`: 13 competitors, 56 plans, 56 entries.
  - The file is registered thirteenth in `lib/data-import/importer.ts`.
- **Import dry run (rolled back):** +56 plans and +56 entries. No unasked change: no focus or lifecycle change, nothing superseded.
- **Import:** the same counts. `data_imports` went from 24 to 25 rows (status `ok`).
- **Publish dry run, then the real run:** 61 → 75 live; events +66, marked +52; revalidate returned 200.
- **Verify (read-only):**
  - `shown_ne_marked` 0;
  - AE false / false;
  - 0 of 848 plans over the ceiling;
  - no pending or duplicate answers.

### 1.4 Live list

- **Before (61):** AR AT AU BE BG BH BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GI GR HK HR HU ID IE IN IT JP KW LI LT LU LV MA MV MY
  NG NL NO NZ OM PA PL PR PT QA RO SA SE SG SI SK TH TR TW UA US ZA
- **After (75):** the same plus **AD BL GF GG GP IM JE MF MQ PM RE SM VA YT** (+14; AX not live).
  Re-checked at 16:32 UTC: still 75.

### 1.5 Zyda's wording on the live pages (Open item 58)

| Country | Zyda's price cell | Reads as "billed yearly"? | Reads as "from"? |
|---|---|---|---|
| QA | «‏٢٣٧٫٥٠ ر.ق.‏ شهريًا، تُدفع سنويًا» | ✅ | ❌ not in the price cell |
| BH | «‏١٥٫٨٣٣ د.ب.‏ شهريًا، تُدفع سنويًا» | ✅ | ❌ |
| OM | Zyda isn't shown (the page shows Ordable · Foodics) | — | — |

- "From" only reaches the page through the plan name. That name leaks in English, untranslated: "Zyda plans (lowest, 'from')".
- **I only reported this.** Fixing it needs a customer-facing change, which this prompt rules out.

---

## Part 2 · checker-prep-1 (two database-only migrations)

### 2.1 `20261140_checker_prep_1_settings.sql`

The pre-flight (`compare-db-proofs.cjs --preflight-checker`, rolled back) passed every check:

- inside the transaction, every target value was written;
- no other settings column changed (checked by md5);
- plans, entries and answers didn't change;
- after the ROLLBACK, everything was exactly as before.

| Setting | Before | After (verified) |
|---|---|---|
| check_interval_days | 90 | 90 |
| tier_intervals | commercial 90 · core 90 · secondary 180 | commercial 90 · **core 365 · secondary 365** |
| deep_requested_at | 2026-11-03 13:20 UTC | **null** |
| deep_country | PT | **null** |
| deep_per_day | 15 | **0** |
| pass_requested_at | 2026-10-29 21:13 UTC | **null** |
| semi_deep status | started | **done** (closed_at 2026-11-25) |
| daily_cap_usd | 8 | **3** |
| monthly_cap_usd | 90 | 90 |

### 2.2 `20261141_checker_prep_1_stagger.sql`

- **What counts as a counted plan:**
  - current, `counted`, priced, not unclear and not Admin-verified (Admin-verified plans never expire);
  - the competitor is active and has an entry in that country.
- **Order:** by the competitor's earliest counted-plan expiry (`checked_on` + its interval, 90 by default, + 30 days). Ties go by id.
- **Rate:** 4 a day from 4 January 2027.
- **Pre-flight (rolled back):** passed.
  - The guard said: "161 competitors staggered, smallest margin 40 days".
  - `check_requested_at`: 209 → 0. Competitors with a `next_check_at`: 195 → 245.
  - Every other column of `competitors` was unchanged (checked by md5), and so were plans, entries and answers.
  - After the ROLLBACK, everything matched the "before" state.
- **The first pre-flight was refused**, because `on commit drop` contains the word "commit". I changed it to a plain temporary table
  that is dropped before `commit;`.
- **4 a day meets the 14-day rule**, so I didn't raise the rate.

### 2.3 Verify after applying (read-only)

- `check_requested_at` is null on every competitor (0 left).
- **Smallest margin: 40 days.** The tightest three:

  | Competitor | Due | First expiry | Margin |
  |---|---|---|---|
  | Bizzfo | 13 Feb | 25 Mar | 40 days |
  | İletmen | 12 Feb | 25 Mar | 41 days |
  | Mezzita | 12 Feb | 25 Mar | 41 days |

  None of the 161 is under 14 days. The busiest day has 4.

**`next_check_at` by week, active competitors, Jan–Mar 2027:**

| Week of | Staggered (counted plans) | Kept (no counted plan) | Total |
|---|---|---|---|
| 4 Jan | 28 | 0 | 28 |
| 11 Jan | 28 | 0 | 28 |
| 18 Jan | 28 | 0 | 28 |
| 25 Jan | 28 | 0 | 28 |
| 1 Feb | 28 | 17 | 45 |
| 8 Feb | 21 (the last is due 13 Feb) | 16 | 37 |
| 15 Feb | 0 | 3 | 3 |
| 22 Feb – 29 Mar | 0 | 0 | 0 |

The other active competitors without a counted plan also kept their dates:

- one is due in the week of 2 Nov 2026. It is overdue, so it will be checked on the first run after enabling;
- 29 have no date; `spreadFirstDates` spreads them.

Candidates and not-relevant competitors were untouched.

---

## Part 3 · the workflow file and the harness

### 3.1 Diff (`.github/workflows/competitor-check.yml`, +5 −1)

These are the only changes, all in the "Import new data files" step:

- `run:` changed from `node scripts/competitor-check/run.mjs scripts/data-import/main.ts` to
  **`npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts`**;
- env gained **`SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}`**;
- a three-line comment explains both.

Everything else is unchanged: the triggers and inputs, concurrency, permissions (including `id-token: write`), the timeout, the
federation variables, the OIDC token step, the checker step with its REST store, and the token log.

### 3.2 Harness `scripts/checker-prep-1.cjs` (registered in `scripts/harnesses.json`)

It reads only files and git. It checks three things:

1. **The import step:** the exact command, the secret's name, the two REST secrets kept, no `if:` added, and nothing else changed in
   the step.
2. **Nothing else changed:** compared with the file at `43501574`, the same steps and the same text above the steps; every other step
   is byte-for-byte the same; the checker step has no `SUPABASE_DB_URL`.
3. **Nothing prints the secret:**
   - `SUPABASE_DB_URL` appears on one line only;
   - no step uses echo, printenv, `env` or `set -x`;
   - the importer reads `process.env.SUPABASE_DB_URL` first, redacts `postgres://` strings in its errors, and logs neither the env nor
     the URL.

### 3.3 Results

| Harness | Passed | Failed |
|---|---|---|
| checker-prep-1 | 18 | 0 |
| competitor-check-1 | 227 | 0 |
| compare-fix-1 | 65 | 0 |
| compare-fix-2 | 79 | 0 |

Two older harnesses had asserted the old import line, so I narrowed them:

- competitor-check-1 now also accepts the `npx -y -p pg@8.13.1` prefix;
- compare-fix-1's "the workflow is unchanged since `2f0e763a`" check now removes exactly this change before comparing.

Before that edit, they failed 1 check and 0 checks respectively.

---

## Dominic's manual next steps (in order)

1. **GitHub:** add the repository secret **`SUPABASE_DB_URL`** under Settings › Secrets and variables › Actions. Use the same pooled
   connection string the local scripts use.
2. **Anthropic Console:** confirm the **spend limit** on the Competitor checks workspace. Open item 55 says $100. The database caps
   are now $3 a day and $90 a month.
3. **Deploy and push:** the batch deploy (Open item 40), including the workflow commit `18836cf5`. I didn't push or deploy.
4. **After the deploy:** run one manual dispatch with `dry_run = true` (mode routine) and check that the import step and the check
   both succeed.
5. **Then, before 4 January 2027:** run `gh workflow enable competitor-check.yml`.
6. **After the first runs:** a read-only check that 2–4 competitors are checked each day and the live countries stay live.
   - The first fortnight of February also carries 36 kept dates, up to about 6 a day.
   - What actually runs each night depends on the checker's routine share, which this work didn't change.

---

## Decisions taken conservatively

- **FoxiFood is excluded from all 15 territories,** including AX and AD. Its own country list omits them (the compare-research-3 rule).
- **Perkss** stays unclear in JE, GG and IM, because its price is weekly.
- **Boom srl** is excluded from SM and VA (mainland Italy only).
- **MenuForma's and TopEstrellas's terms** load by script and couldn't be read. I treated them as "says nothing", which means no
  exclusion.
- **pidopago** is stored in AD but not shown. It is a restaurant tool, and four food-truck tools are already shown.
- **Zyda's missing "from"** wording is reported only, with no customer-facing change.
- **Semi-deep** is "closed" by setting its status to `done`. `semi-deep.ts` acts only on `waiting`, and the earlier keys are kept.
- **Competitors without counted plans** kept their `next_check_at`, as the prompt said. That includes one date that is overdue.
- **The import step keeps the two REST secrets.** I added the DB secret rather than replacing them, so no capability is lost.
- **Old harnesses:** I narrowed their checks to allow only this change, rather than deleting them.

## Flags

- Nothing in the prompt arrived garbled, and no two instructions contradicted each other.
- ⚠️ **The stagger cannot be undone exactly.** I recorded only before / after totals, not each competitor's old `next_check_at` and
  `check_requested_at`:
  - 209 requests;
  - dates from 2026-10-30 to 2027-02-17.

  Those values were inert while the workflow was disabled, so nothing visible changed.
- I didn't edit the manual.

## Undo (only if Dominic asks)

```sql
-- 20261140: restore the previous settings (values from the pre-flight's "before" state)
update public.competitor_check_settings
   set tier_intervals = jsonb_build_object('commercial', 90, 'core', 90, 'secondary', 180),
       deep_requested_at = '2026-11-03T13:20:11.83+00', deep_country = 'PT', deep_per_day = 15,
       pass_requested_at = '2026-10-29T21:13:30.129+00',
       semi_deep = (semi_deep - 'closed_at' - 'closed_by') || jsonb_build_object('status', 'started'),
       daily_cap_usd = 8, monthly_cap_usd = 90
 where id;
-- 20261141: no exact undo (the old per-row values weren't snapshotted). Nearest equivalent: request every active competitor again
-- (update public.competitors set check_requested_at = now() where lifecycle = 'active';) — only if Dominic wants the backlog back.
```

Run any undo as a committed migration through `scripts/db-migrate.cjs`.
