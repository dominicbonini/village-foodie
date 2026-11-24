# compare-fix-1 — the comparison pages working and live

**24 November 2026 · code done, tested and committed (`81b756e6`, branch `france-vat-1`, not pushed) · step 6 (the live run) NOT RUN
— stopped for one decision (§6) · nothing written to the database**

## 0 · The short version

- **All seven steps are built except the live run (step 6).**
  - Steps 1–4 are new code: the UAE crash fix, explicit price units, the importer's instructions, and Dominic's rules.
  - Step 5 is a check of origin/main: the deployed page decides only from stored data.
  - Step 7 is analysis of the nightly run.
  - New harness `scripts/compare-fix-1.cjs` passes **65/0**. Every listed harness is the same before and after, two of them after a
    re-pin by name (§7). tsc and ESLint are clean.
- **Step 6 is blocked**, for two reasons:
  - **Credentials:** the project's own import and publish commands read the Supabase credentials from the environment and don't load
    `.env.local` themselves. So I can't run them without loading that file, which the rules forbid.
  - **The nightly run would undo it:** the GitHub run still uses origin/main's old publish code and re-evaluates every night, even while
    the checker is failing. It would undo most of step 6 at its next run (§5).
- **What step 6 would do, simulated** on an in-memory copy of a read-only export, with the real importer and the new rules (§4):
  - **28 countries live** (today: 5): AT AU BE BR CA CH CY CZ DE DK ES FI FR GB GR HU IE IT JP LT MY NL NO NZ PL RO TH US;
  - **4 one short**: GI, HK, SE, SG;
  - **IE** would show Order Tiger and Click & Collection; **IT** Qromo, MenuForma, Software Food Good and Tilby; **US** Goodfynd, Food
    Truck ONE, Food Truck Pub and Where's The Foodtruck.
- **Found and fixed along the way:** the checker counted the Claude account outage (20–23 Nov) as each competitor's own failed checks.
  15 competitors had 5 "failures" and would have been taken down (Bopple, Square, iShopo, Food Truck Pub…). Now an account-level API
  error never counts, and a competitor re-read by the research starts again at 0.

## 1 · The publish step's UAE crash (step 1)

- **Cause:** `runPublish` upserted every country's row without `auto_publish`. Postgres checks an upsert's INSERT half with the column
  defaults (`auto_publish = true`), so AE broke `comparison_publish_never_ae` on every run from 10 Nov. The loop died there, and nothing
  after it ran: no countries after AE, no marks, no events, no refresh.
- **Fix** (`lib/comparison-publish-run.ts`):
  - AE's row is always written with `auto_publish: false`;
  - each country is evaluated and saved inside its own try/catch, so a failure is logged ("XX FAILED and was skipped"), reported in
    `countryErrors`, and the loop carries on;
  - the marks, events and refresh still run.
- **Harness** (§1 of `compare-fix-1.cjs`):
  - the store applies the real CHECK the way Postgres does;
  - AE + GB + FR + DE: all three evaluated and live, AE written with `auto_publish` false and never live;
  - with FR forced to fail, GB and DE are still evaluated and FR is reported;
  - the old upsert (without `auto_publish`) is refused by the same check, which proves the test.

## 2 · The 100× price units (step 2)

**The cause, found:** the checker's prompt showed the model stored prices in minor units ("money amounts are in the currency's smallest
unit (2900 EUR = 29.00 €)"). The model sometimes answered `amount` in minor units, and `planColsOf` multiplied by 100 again.

**The unit is now explicit end to end:**
- **The extractor:**
  - stored plans are shown in MAJOR units and fees in percent (`plansForPrompt`, `lib/competitor-check/prompts.ts`);
  - the price rule says "79 for "R$79,00", never 7900";
  - the `record_findings` schema's `amount` says "exactly as printed, in the currency's normal units … Never in cents". It is still one
    union, so the 16-union limit is not affected.
- **`planColsOf`** (`lib/admin/competitor-check-actions.ts`) uses the new `lib/price-units.ts` `resolveAmountMinor`:
  - it reads the printed price back out of the finding's own words (`found_value`, quote) with the inbox-2 number reader;
  - an amount equal to the printed price is major (× 10^digits);
  - an amount equal to the printed price × 10^digits was already minor, and is kept as it is;
  - anything else is treated as major, as instructed.
- **Plausibility guard:** `PLAUSIBLE_MONTHLY_MAX`, about US$1,500 a month in each of about 50 currencies. Above it, a price is NOT
  stored:
  - the plan is only marked unclear;
  - a new plan is refused;
  - the automatic decision rejects the finding as "not plausible … (a unit slip?)".
- **The importer:** plans may carry `monthly_major` / `setup_major`, converted with `toMinorUnits`. If `monthly_major` and
  `monthly_minor` are both given, they must agree. A monthly price above the ceiling arrives hidden and unclear, "NOT STORED as a price".
- **Harness cases:**

| Input | Result |
|---|---|
| "a partir de R$79,00", amount 79 | 7900 |
| the same, amount 7900 | 7900, not 790,000 |
| "59€ /mois" | 5900, whether amount is 59 or 5900 |
| "99€ /mois" | 9900 |
| "月額3,980円" | 3980 (yen have no minor digits), also when the yen amount is only in the quote |
| 445,000 € or 4,450 € a month | not stored |
| "44,50 € HT", amount 4450 | 4450 (the Eatch case) |
| 990 € a year | 8250 a month |

  - a 100× decision is rejected;
  - the prompt and schema say major units.

## 3 · The importer (step 3) and the data file

**New data-file instructions** (`lib/data-import/research.ts`), each keeping its evidence:

| Instruction | Effect |
|---|---|
| `set_lifecycle: { value: "not_relevant", reason, source_url }` | a stored competitor becomes not relevant; the reason and page go into its notes. A NEW competitor found not relevant is never added (nor its plans or entries); a candidate is not "upgraded" on its way |
| `set_lifecycle: { value: "active", … }` | a not-relevant competitor comes back to active |
| `not_sold_in: [{ country, reason, source_url }]` | the countries are added to `not_in_countries`, and `evaluateCountry` never shows it there |
| `set_focus: true` | the researched focus replaces the stored one |
| plan `correct: true` | the stored current plan of that name in that country is **superseded (kept as history)** and today's is inserted. A rerun is idempotent |
| quoted answers | a quoted answer replaces a **bare** stored one (no quote and no note: the 23 Oct legacy "yes"). Admin's verified or blocked answers, and any with its own quote or note, are kept |
| check records | each answer written records its check in `competitor_feature_checks` (every country = `''`, with the pages read), so the page's "row checked for every shown competitor" rule shows it |
| failure count | a competitor re-read by the research is a good check: `check_failures` goes back to 0 |

- The store (`lib/data-import/store-supabase.ts`) reads `not_in_countries`, `check_failures` and answer quotes, and adds
  `supersedePlans` and `upsertFeatureChecks`.

**`data/compare-research-1/competitors.json`, rebuilt by `docs/compare-research-1/build.cjs`:**
- **Totals:** 161 competitor rows, 316 plans (275 priced), 173 entries.
- **18 not relevant**, all stored: Aphelios, Liven, Soften Food, VirtualLine, Moduurn, Dine360, Gustoco, Ordeno App, Creavo Order,
  Food Truck Concept, AdvaNceD IoT, FoodTruck POS, apetitio, POSbistro, ABS POS, Orsys, DineEasy, Zettle. Each carries the research
  agent's reason and page.
- **5 back to active:** Qromo IT, Yoveletta CH, WEIQ SE, Digitaste BE, Superb NO.
- **15 not sold in:**
  - Ordering.co AU; EatSelf ES;
  - MENU TIGER HK, RO, TH; GloriaFood IE, PT, TH; Take App TH; SumUp MT, SE;
  - Flipdish, UpMenu and Order Tiger PT; Pikit LI.
- **Every eligible vendor is imported.** Food-truck-first is now the publish step's job (§4), so restaurant tools are no longer dropped
  from the file.
- **Anolla is left out entirely.**
- Where an eligible vendor's `ahead` / `preorder` didn't say yes / partly with a quote, its research order-ahead quote becomes `ahead`
  partly. That is "the research file's eligibility evidence" as data.
- `build.cjs --check` passes the importer's own `researchProblems` and the 100× guard.

**16 corrected plans:**

| Competitor | Plan | Stored → today (minor units) |
|---|---|---|
| The Foody Gram (US) | Starter | 1,590,000 → 15,900 |
| The Foody Gram (US) | Growth | 1,990,000 → 19,900 |
| Order Tiger (US) | EPOS | 490,000 → 4,900 |
| Order Tiger (US) | Online Ordering + EPOS | 1,090,000 → 10,900 |
| Klikit (SG) | Core | 190,000 → 1,900 |
| Ordinalo (IT) | WhatsApp module | 190,000 → 1,900 |
| Wiiz Eat (CY) | Own app | 850,000 → 8,500 |
| Eatch (FR) | Fondateur | 445,000 → 4,450 |
| Beau Camion (FR) | Vitrine | 290,000 → 2,900 |
| Digitale Menukaart (NL) | Menu | 120,000 → 1,200 |
| FoodTruck POS (NL) | Starter | 129,900 → 1,299 |
| Storekit (GB) | Grow | 0 → 9,900 |
| OrderFront (DE) | Starter / Premium / Multi | hidden → 4,900 / 6,900 / 14,900 |
| Bestelly (NL) | Compleet | 0 → 5,900 |

## 4 · Dominic's rules in `evaluateCountry` (step 4)

`lib/comparison-publish.ts`:

- **Eligible** (`eligibleOf`):
  - an `ahead` or `preorder` answer of yes / partly **with a quote on the competitor's own site** (this country or every country);
    Admin-verified counts;
  - plus counted, a website, not "not sold here", not failed twice.
  - **Aphelios-style** (QR at the table only) → never shown: "no quote on its own site showing customers can order online ahead".
  - **Anolla** never counts.
- **Price** (`planVerdict`):
  - a monthly price in the country's currency (**EUR also in RO**, `ALSO_ACCEPTED_CURRENCY`);
  - a source on its own site;
  - checked within its interval + 30 days;
  - **one check is enough** ("both checks confirmed" dropped); Admin-verified counts; unclear, hidden or not-counted plans don't.
  - Where the entry's own plan doesn't qualify, the competitor's cheapest qualifying plan in the country is used, and the run points the
    entry at it.
- **Preference:**
  - food-truck tools (food_truck, street_food_markets, pop_up) first, up to four;
  - restaurant and pos tools only to make up 2;
  - **SumUp's generic shop only as the single fallback** beside one eligible food-truck or restaurant tool.
- **Live:**
  - at least 2 shown (at most 4), a page, auto-publish on, Admin not off, never AE;
  - features may be "not stated";
  - **only the shown competitors are marked**, so the page (which picks four from the marked entries) shows exactly those.
- **Harness §4–§5:** every rule, case by case, including "Aphelios-style never shown", a quote on another site, a quoteless legacy
  "yes", 3 food-truck tools + 2 restaurant tools, 1 + 2, SumUp in four situations, Anolla, RO EUR / USD, the plan fallback, not sold
  here, 1 → not live, at most 4, AE, marks for exactly four of five.

**Simulated result of step 6** (`docs/compare-fix-1/simulate.cjs` on the export of §8; the real importer, then `evaluateCountry`).

The import would do:

| What | Count |
|---|---|
| competitors added | 13 |
| updated | 148 |
| upgraded from candidate | 34 |
| plans added | 224 (16 corrected) |
| entries added | 73 |
| answers added | 1,877 (68 bare ones replaced) |
| check records | 1,877 |
| not relevant / back to active / not sold in | 18 / 5 / 15 |
| failure counts reset | 6 |

**Live (28):**

| Country | Shown |
|---|---|
| AT | Liefersoft · FoxiFood · gastro25 · GastroDok |
| AU | Y wait · Square |
| BE | Payli · Restomax |
| BR | VexMenu · Food Pronto |
| CA | iShopo · Owner.com |
| CH | Rent-a-Shop · Yoveletta |
| CY | Wiiz Eat · SumUp |
| CZ | Menu55 · DISH |
| DE | Liefersoft · gastro25 · FoxiFood · GastroDok |
| DK | Truckly · NemTakeAway |
| ES | pidopago · Cheerfy Shop |
| FI | Food4you · SumUp |
| FR | Place à emporter · Beau Camion · Eatch · Nomad |
| GB | Ordea · Order Tiger · Grafterr · Perkss |
| GR | Spevdo · Worldline |
| HU | Orderly · QRM.hu · StandMágus |
| IE | Order Tiger · Click & Collection |
| IT | MenuForma · Software Food Good · Tilby · Qromo |
| JP | モバレジ · どこでも注文くん |
| LT | ared · SumUp |
| MY | Klikit · StoreHub |
| NL | Digitale Menukaart · Qrder · Foodticket |
| NO | Favrit · Superb |
| NZ | HungryTrucks · SmakSpace |
| PL | Frivo · UpMenu |
| RO | 4SaleFood · MenuForma |
| TH | Klikit · StoreHub |
| US | Goodfynd · Food Truck ONE · Food Truck Pub · Where's The Foodtruck |

**One short (4):** GI (Order Tiger), HK (Eats365), SE (WEIQ), SG (Klikit).

Caveats:
- Some shown prices are stored prices the research could not re-read in monthly form today, but are still within their interval:
  Spevdo GR (its price API was refused), Cheerfy ES (its stored "Starter" may be a loyalty plan), Perkss GB and Foodticket NL (weekly
  or daily on the site).

## 5 · The deployed site (step 5) and the nightly run (step 7)

**Step 5: the deployed site shows the result without a deploy.**
- origin/main's page code (`lib/comparison.ts`, `lib/comparison-flags.ts`, `lib/comparison-selection.ts`) is unchanged from this
  branch.
- It decides only from stored data:
  - `country_settings.comparison_status`;
  - `comparison_publish` (auto_publish, auto_live, admin_off);
  - each entry's and plan's `auto_verified_at` / `auto_blocked`;
  - lifecycle and website;
  - the evidence rule on answers;
  - `competitor_feature_checks` for which rows show;
  - its own four-cap over the marked entries.
- It does not re-apply the old price rule at render time.
- The deployed marketing cache expires every **300 seconds** (vercel-cost-1 isn't deployed), so the pages, sitemap and `/llms.txt`
  follow within about 5 minutes. **Nothing stays hidden until a deploy.**
- **One difference:** the deployed page doesn't know `not_in_countries`. That doesn't matter, because those entries are never marked.

**Step 7: yes, the nightly run would undo most of step 6.**
- The workflow (02:10 UTC; it has been starting late, e.g. 24 Nov at 12:22) runs origin/main's code.
- Its publish step runs **every night, even while the checker fails on the account limit**: 23 and 24 Nov evaluated, with every
  competitor failed.
- With the old code it would:
  1. re-evaluate countries with the OLD rule ("both checks confirmed", no eligibility) until it reaches AE and crashes, setting
     `auto_live` false for most of the 28;
  2. now decide pending findings for many more competitors (those with new entries), with no plausibility guard, so old 100× price
     findings could be accepted again;
  3. go on counting the account outage as competitors' failed checks until 1 Dec.
- **To stop it** (Dominic's steps — I don't change the workflow):
  - **either** move main to `france-vat-1` and push (that also deploys the site) **before** the next run;
  - **or** disable the workflow until then: `gh workflow disable competitor-check.yml`, and `gh workflow enable competitor-check.yml`
    after the push.
- **After the push, the nightly run itself does step 6:**
  - its first step imports `data/compare-research-1/competitors.json`, which is registered;
  - its publish step runs the new rules, even while the checker part still fails on the account limit until 1 Dec.

## 6 · The decision (step 6)

The live run needs the Supabase credentials. The project's commands get them from the environment and don't load `.env.local` (only
`db-migrate.cjs` reads a key from it, and it runs SQL files only).

- **A · Recommended:** push first, and let the next nightly run do it.
  1. Move main to `france-vat-1` and push (you deploy).
  2. The next "Competitor check" run imports the file and publishes with the new rules.
  3. Nothing for me to run.
  4. I verify afterwards, read-only.
- **B · You run it yourself:**
  1. `gh workflow disable competitor-check.yml`.
  2. In a terminal with the Supabase environment:
     - `node --env-file=.env.local scripts/competitor-check/run.mjs scripts/data-import/main.ts`
     - then `node --env-file=.env.local scripts/competitor-check/run.mjs scripts/comparison-publish/main.ts --dry-run`
     - then the same without `--dry-run`.
  3. Re-enable the workflow after the push.
- **C · I run B's commands** as a one-off exception to the `.env` rule: `node --env-file` loads the file, and I never print it. You
  disable the workflow first.

## 7 · Checks

| Harness | Before (2f0e763a) | After |
|---|---|---|
| **compare-fix-1** (new, registered) | — | **65 / 0** |
| compare-no-system | 54 / 0 | 54 / 0 |
| compare-de-1 | 93 / 0 | 93 / 0 |
| competitor-check-1 | 227 / 0 | 227 / 0 |
| competitor-check-8 | 51 / 0 | 51 / 0 |
| competitor-features-2 | 79 / 0 | 79 / 0 |
| competitor-wtt-1 | 42 / 0 | 42 / 0 |
| compare-suits-1 | 72 / 0 | 72 / 0 |
| compare-autopublish-1 | 75 / 0 | 75 / 0, **re-pinned by name** |
| compare-languages-1 | 24 / 0 | 24 / 0 |
| compare-ux-1 | 39 / 0 | 39 / 0 |

- **compare-autopublish-1 re-pins**, each for Dominic's new rules:
  - its fixture competitors carry a quoted order-ahead answer, because the eligibility rule requires one;
  - "only one with its price confirmed by both checks → NOT live" became "→ still LIVE: one check is enough";
  - "GB goes live with the two whose prices both checks confirmed" became "the two eligible ones" (C3 has no order-ahead answer).
- **competitor-wtt-1** first failed one case ("an answer that already says something is kept"). The new replace rule was narrowed to
  **bare** answers (no quote and no note). None of the 86 live quoteless answers has a note, so nothing changes in practice, and the
  harness passes unchanged.
- tsc and ESLint are clean on every changed file.

**Files changed:**
- `lib/price-units.ts` (new);
- `lib/admin/competitor-check-actions.ts`;
- `lib/competitor-check/prompts.ts`, `model.ts`;
- `lib/comparison-publish.ts`, `-run.ts`, `-store.ts`;
- `lib/pricing-check.ts`, `lib/admin/pricing-check-actions.ts` (`notInCountries`);
- `lib/data-import/research.ts`, `store-supabase.ts`;
- `scripts/comparison-publish/main.ts` (new: the publish step alone, `--dry-run`, `--skip-findings`);
- `scripts/competitor-check/main.ts` (account errors);
- `scripts/compare-fix-1.cjs` (new), `scripts/compare-autopublish-1.cjs`, `scripts/harnesses.json`;
- `docs/compare-research-1/build.cjs`, `stored-plans.json`;
- `data/compare-research-1/competitors.json`;
- `docs/compare-fix-1/simulate.cjs`.

## 8 · SQL run (read-only SELECTs, Supabase MCP)

```sql
-- the constraints the importer and the publish step write against
select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def from pg_constraint
where conrelid in ('public.competitor_feature_checks'::regclass, 'public.competitors'::regclass, 'public.competitor_plans'::regclass) order by 1, 2;
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema='public' and ((table_name='competitors' and column_name in ('not_in_countries','lifecycle','focus','category','category_by','notes'))
 or (table_name='competitor_feature_checks') or (table_name='competitor_plans' and column_name in ('superseded_at','status','unclear','price_hidden','source'))) order by 1,2;
-- the stored current plans (for the corrections; docs/compare-research-1/stored-plans.json)
select json_agg(json_build_object('c', left(competitor_id::text,8), 'cc', country_code, 'n', plan_name, 'm', monthly_minor, 'cur', currency, 'st', status)
  order by competitor_id, country_code, plan_name)::text from public.competitor_plans where superseded_at is null;
-- the failed-check counts the outage left
select check_failures, count(*) n, string_agg(name, ', ' order by name) filter (where check_failures >= 2) names
from public.competitors where coalesce(check_failures,0) > 0 group by 1 order by 1;
-- the snapshot for the simulation (two statements)
select json_build_object(
 'competitors', (select json_agg(row_to_json(c)) from (select id,name,website,focus,lifecycle,added_as_candidate,features_verified_at,check_urls,check_interval_days,check_failures,category,category_by,not_in_countries,notes,payment_providers,features_checked_on,check_urls_by from public.competitors) c),
 'countries', (select json_agg(row_to_json(x)) from (select country_code code, currency, locale, enabled, comparison_status from public.country_settings) x),
 'publish', (select json_agg(row_to_json(p)) from (select country_code, auto_publish, auto_live, admin_off, shown, live_since from public.comparison_publish) p))::text;
select json_build_object(
 'plans', (select json_agg(row_to_json(p)) from (select * from public.competitor_plans where superseded_at is null) p),
 'entries', (select json_agg(row_to_json(e)) from (select * from public.comparison_entries) e),
 'values', (select json_agg(row_to_json(v)) from (select id, competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on, verified_at, verified_by, superseded_at, created_at, auto_verified_at, auto_blocked
   from public.competitor_feature_values where superseded_at is null and feature_key in ('ahead','preorder')) v))::text;
```

**Not done:**
- no database write, no import, no publish run;
- no checker run or `gh workflow run`, no workflow change;
- no deploy, no push;
- no `.env` file opened.

## 9 · Flags

- Nothing in the brief arrived garbled.
- **Step 6 is impossible as written:** "through the project's own import command" against "never open … any .env file (run the project's
  own scripts that load env internally)". The import command doesn't load env itself, so it can't be run without loading `.env.local`.
  That is the §6 decision.
- **Scope added**, each because step 6's result depended on it:
  - account-level API errors no longer count as a competitor's failed checks;
  - research resets the count;
  - the importer writes check records so feature rows show;
  - a shown entry is pointed at its qualifying plan.
