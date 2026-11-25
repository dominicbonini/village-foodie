# compare-research-6: fixes, the "nothing found" countries in launch order, micro-territories, and a read-only review of the Competitor check

**25 November 2026 · branch `france-vat-1` · not pushed, not deployed**

**Commits:**
- `6a00de88`: brief and stored list
- `5ba465c1`: round 1 and migration 20261134
- `33bc43ba`, `7de27203`: round 2
- `64f615d8`, `7a467faa`: migration 20261135, round 3
- `ef840f24`: round 4
- the agents' one-per-country commits

## 0 · The short version

- **Live: 59 → 59.** No country joined or left. All four rounds finished by **15:01 UK time**, well before the 18:10 cut-off.
- **Line-up changes:**
  - **CL:** Pedix · SumUp → **Fudo · Pedix**. SumUp's fallback is gone.
  - **AR:** Fudo · Ojapo, unchanged, but Fudo's price is now the real one (Plan Inicial + Tu Delivery).
- **Research:**

  | Round | Countries | Result |
  |---|---|---|
  | 2 (waves 1–2 "nothing found") | 14 | nothing eligible and priced |
  | 3 (wave 3) | 25 | only **KZ** gains one (Poster) |
  | 4 (never researched) | 90 | none has an eligible priced tool |

- **Loads:** 4 rounds, plus 2 pre-flighted migrations (20261134 Fudo, 20261135 Poster KZ).
  - Every round verified: shown = marked everywhere, AE false/false, 0 of 754 plans over the ceiling, no pending or duplicate answers.
  - The round-2 re-import was a no-change.
- **The Competitor check review (§6):**
  - Re-enabling it before the deploy would undo the live pages.
  - With the settings below and a stagger, it costs about **$3–11 a month**, and every counted price is re-checked between 4 Jan and 13 Feb 2027.

## 1 · Step 0 (read-only)

- **Git:** `france-vat-1` at `070525d8`. No uncommitted changes under the compare paths, `lib/comparison-publish.ts` or `lib/data-import/`.
- **Not live** (a rolled-back publish dry run; no change inside or after): **150 enabled countries**.
  - **One short (20):** AL BA BD BH BO CO DO GT IS JM JO LK MD MK MT QA RS SV UY UZ, plus AE (never published).
  - **Zero after earlier research (40):** AM AO AZ BN BS BW BZ CR CV DZ ET GE GY HN IL KG KH KR KZ LA MC ME MN MO MU MZ NA NI NP PE PK PY SN SR
    TN TT TZ UG ZM ZW.
  - **Never researched (90)**, the "micro-territories" list (some are small states): AD AG AI AS AW AX BF BI BJ BL BM BQ BT CC CF CK CW
    CX DJ DM ER FJ FK FM FO GA GD GF GG GL GM GN GP GQ GU GW IM JE KI KM KN KY LC LR LS MF MG MH MP MQ MR MS MW NC NE NF NR NU PF PG PM PN PW
    RE SB SC SH SJ SL SM ST SX SZ TC TD TG TJ TK TL TM TO TV VA VC VG VI VU WF WS YT.

## 2 · Round 1: the fixes (agent 3), ended 14:41

| Fix | Outcome | Line-up before → after |
|---|---|---|
| **a) Thinker POS MK** | **not found.** No pricing card mentions online ordering, pre-order or pickup. The only takeaway item is a "Takeaway & delivery license", one of the free licences you can pick on Standard (6 295 MKD, choose 1) and Advanced (8 693 MKD, choose 2); /en/online-ordering-delivery/ names no plan. It stays unclear | MK not live (Vitrina only) |
| **b) Toteat CL** | **not found.** The Chile home page lists only "…Menú QR, pedidos desde la mesa, delivery y pick up." as bare items; /productos/toma-de-pedidos is staff order-taking and a kiosk | — (handled by c) |
| **c) Fudo AR / CL** (your decision) | **applied.** Quoted on each country's own page: «Solo necesitás/necesitas una cuenta activa en Fudo.» (fu.do/es-ar/delivery/, fu.do/es-cl/delivery/). **AR:** Plan Inicial «$23.900 /mes … Precio final» + «1,9% + IVA de tasa de servicio por cada venta, con un tope de $99.000 + IVA por mes» (the cap only with Fudo Pagos). **CL:** Plan Inicial «$25.500 /mes … sin IVA» + «1,9% + IVA por cada venta». Stored as "Plan Inicial + Tu Delivery"; the old AR plan (ARS 0 + 1,9 %) and the unclear CL plan superseded (migration 20261134, kept as history) | **AR:** Fudo · Ojapo → Fudo · Ojapo (Fudo's price now ARS 23 900 + 1,9 %). **CL:** Pedix · SumUp → **Fudo · Pedix** |

**Round 1 load:**
- migration 20261134: pre-flight passed, then applied;
- import dry run +2 plans → import +2 plans;
- publish dry run (events +3) → publish;
- verify ✓ (59 live).

## 3 · Round 2: "nothing found", waves 1–2, ended 14:44 (loaded 14:45)

| Country | Agent | Vendors tried (new) | Verdict | Count |
|---|---|---|---|---|
| MC | 1 | LivePepper (no Monaco), Innovorder (Paris only), Obypay (403), L'Addition (404) | none | 0 |
| CV | 1 | 3 Portuguese searches, no tool sells there with CVE prices | none | 0 |
| SN | 1 | Kolonell (agency, rejected before), Haraka Pro (App Store only), Helio POS (third-party blog only), DFD (delivery) | none | 0 |
| TN | 1 | Dishop (no Tunisia; 49 € a week), Kmandi (QR menu), Menutium and Tunisiano (delivery) | none | 0 |
| IL | 1 | **Foody POS** (foody-pos.co.il, «Foody Online» 590 ₪ a month before VAT, pickup ordering): **not relevant** under V16.38 (no real customers; its about page says its examples are synthetic data); Wix (plans page loads only its title) | none (Foody borderline) | 0 |
| PE | 2 | Mesakloud (soles, but delivery only), Inforest (no own site), What The Truck! (finder app) | none | 0 |
| CR | 2 | Eatsy (delivery via Uber, no price), Take Away CR (404) | none | 0 |
| PY | 2 | ClickParaPedir (stored, still no price), Fiweex (WhatsApp catalogue), GU / KaruFast (marketplaces) | none | 0 |
| HN | 2 | Sinqro (delivery only, prices unavailable), Neolo (QR), WizPOS (no site), Clinpays (marketplace) | none | 0 |
| TT | 3 | eVendor (App Store only; its developer is a Calgary agency); marketplaces | none | 0 |
| BS | 3 | marketplaces and directories only | none | 0 |
| NI | 3 | Softland / Solaria (ERP till), Aldelo (USD), marketplaces | none | 0 |
| MZ | 3 | marketplaces and a software house with no restaurant product | none | 0 |
| AO | 3 | **Ocuioso** (stored, eligible): its /precos page loads its amounts from /api/plans, which isn't a page quote → unpriced | none | 0 |

**Round 2 load:**
- the build left out two incomplete rows: ClickParaPedir PY (no quotes, no price) and a hidden duplicate price-on-request plan.
- import dry run: **no change** → import (records only) → publish dry run: no change → publish → verify ✓.

## 4 · Round 3: "nothing found", wave 3 (world-countries-5), ended 14:50 (loaded 14:51)

| Country | Agent | Vendors tried (new) | Verdict | Count |
|---|---|---|---|---|
| **KZ** | 1 | **Poster**: joinposter.kz added to its check pages (migration 20261135), so «Starter + Poster Site add-on» counts at **21 000 ₸ a month** (9 600 + 11 400, both quoted, monthly billing); its add-on on its own is now unclear (as in UA). 4mobile.me (roubles, no KZ), SmartPikasso (App Store only) | Poster counts | **1** |
| GE | 1 | Poster GE (USD only), Shekveta.ge (certificate error), Syrve partner (no prices, no pickup) | none | 0 |
| AZ, AM, ME, KG | 1 | Wolt / Bolt, single-restaurant apps, Glovo, directories; Orders.co (AM, a US vendor, only named); Smartomato (KG: no countries, no pickup, no price) | none | 0 |
| DZ | 1 | BorneDZ (410 Gone), delivery apps | none | 0 |
| PK | 2 | **Nosh** (noshpk.com, Growth Rs 4 999 a month per branch with an online-ordering site, **no pickup wording** → not relevant, borderline); tossdown (no rupee price); CORN POS; Deonde (403); Pakodus (certificate error) | none | 0 |
| NP, KH, LA, MN, MO, BN, MU | 2 | Crossover (NP: till takeaway, no price); marketplaces, QR menus, single-business apps; Eats365 MO (no amounts) | none | 0 |
| NA, BW, ZM, ZW, BZ, GY, SR | 3 | YUMBI (its pricing page is 404 → unpriced); marketplaces; Deonde ZW (only named) | none | 0 |
| ET, TZ, UG | 3 | Gobirr (app only), Tayari (dine-in), **Reserveport by Pesapal** (UG: own-site ordering but no pickup wording, no price) | none | 0 |

**Round 3 load:**
- migration 20261135: pre-flight passed, then applied;
- the inherited compare-research-3 KZ exclusion was removed, and two incomplete rows left out (Eats365 MO, tossdown PK);
- import dry run: no change → import → publish dry run (KZ: Poster marked, still one short) → publish → verify ✓.

## 5 · Round 4: micro-territories, ended 15:00 (loaded 15:01)

All 90 were researched (agents 1, 2 and 3 split them by region; 1–4 searches each).

**None has an eligible tool with a price.** The near misses:
- **IM:** **ICRTouch TouchTakeaway** («Customers can pre-order their meals for a time and date of their choosing.»). Its Isle of Man
  evidence is a 2020 case study, it shows no price and it sells through partners. Imported as an unpriced entry, so it never counts.
- **AW:** **Restolabs** (stored). Its own site calls Aruba its 4th-largest market and lists "Online Ordering [Pickup & In-House
  Delivery]". Its pricing page is in $ only, with "$00" placeholders. Unpriced.
- **FoxiFood's** country list (70) and **Storekit's** regions (36) name none of the 23 European, French and UK territories.
  **NemTakeAway** names neither the Faroes nor Greenland.
- **Everywhere else:** marketplaces (EasyTaVie GP/MQ, Food.je, Food.gg, Eatout.im, CityXerpa AD, Liv'eats NC, Fiji Eats, GoFood PNG, Order
  Up, Deliver VI …), directories, single-restaurant or chain apps, and tills.
- **US territories** (GU, MP, AS, VI): Square, Toast, Clover and ChowNow weren't checked. Square's own availability page (read in
  compare-research-2) doesn't support even Puerto Rico.

**Round 4 load:**
- import dry run +1 competitor (ICRTouch), +2 unpriced plans, +2 entries;
- import the same → publish dry run: no change → publish → verify ✓.
- ⚠️ **The import also changed Restolabs' focus** (food truck → restaurant, from agent 2's AW row). I ran the import straight after its
  dry run without stopping on its `focusSet: 1`. Restolabs isn't shown anywhere (entries AW and US, neither marked), and restaurant is
  the accurate reading. Reversing it would be a one-row migration.

## 6 · The Competitor check: read-only review

All code was read on france-vat-1 and on origin/main (`5df925d8`), and the live settings and tables with the read-only SQL shown in chat
(also in `docs/compare-research-6/sql.txt`). No writes, no settings change, no workflow change, no API calls.

### 6.1 Does an unchanged price refresh the date planVerdict reads?

**Yes,** through the publish step after a checker run:
1. The routine check writes a finding with outcome `unchanged`.
2. `decideFindings` (`lib/comparison-publish.ts`) accepts it when the quote was found on the page or the second check confirmed it
   ("unchanged — its date moves on").
3. `acceptFinding` (`lib/admin/competitor-check-actions.ts`) → `touchPlanChecked(plan_id, today)` then sets that plan's **`checked_on`**
   to today, which is the date `planVerdict` reads.

**When the date does not move:**
- the finding is rejected ("could not confirm it is unchanged");
- the finding names no plan;
- the local `scripts/comparison-publish/main.ts` runs, since it skips findings.

So nothing in the code needs to change. The checker only has to run before each plan's `checked_on + 90 + 30`.

### 6.2 A changed price (a pending finding)

`decideFindings` decides each price finding automatically:
- **Accepted** (both checks agree, quoted on its own site, plausible, the move ≤ 50 %): a new plan version, unverified, `checked_on`
  today. The page shows the **new** price at the next publish; one check is enough.
- **Held** (the price moved by more than 50 %): the plan is in `heldPlanIds`. The page **keeps the old price while it is within its
  interval** (90 days, not + 30), then **drops the plan** ("a price change is held, and the old price is past its check interval")
  until Admin accepts or rejects.
- **Rejected** (not confirmed, or implausible: a unit slip): the old plan is untouched and ages out at `checked_on + 120`.

### 6.3 Due dates and expiry; a stagger

**How a research-loaded competitor is scheduled:**
- **`request_check: true`** in every research file sets **`check_requested_at`** at import. **200 of the 221 active competitors carry one.**
- `selectRoutine` (`lib/competitor-check/core.ts`) puts requests first and **does not count them against the daily quota**. So the first
  runs after re-enabling would work through the backlog, limited only by the $8 daily cap.
- After each check: `next_check_at = today + check_interval_days` (90 for all).
- **73 active competitors have no `next_check_at`.** `spreadFirstDates` spreads those over 90 days at the first run.
- **Live today:** next_check_at runs from 30 Oct 2026 (overdue) to 17 Feb 2027.

**Counted plans** (708 plans, 162 competitors; 151 in live countries), by week:

| Week of | Plans that reach 90 days | Plans that expire (checked + 120) | Competitors due (`next_check_at`) |
|---|---|---|---|
| 28 Dec – 11 Jan | 0 | 0 | 0 |
| 18 Jan | 40 | 0 | 0 |
| 25 Jan | 0 | 0 | 0 |
| 1 Feb | 101 | 0 | 55 |
| 8 Feb | 40 | 0 | 35 |
| 15 Feb | 23 | **40** | 19 |
| 22 Feb | **504** | 0 | 0 |
| 1 Mar | 0 | 70 | 0 |
| 8 Mar | 0 | 65 | 0 |
| 15 Mar | 0 | 29 | 0 |
| 22 Mar | 0 | **504** | 0 |

**Proposed stagger** (a database-only migration on `competitors`, with your yes):
- clear `check_requested_at`;
- set `next_check_at` for the 162 competitors with counted plans at **4 a day from 4 Jan 2027**, ordered by each one's earliest plan
  expiry.
- **Tested read-only:** 4 Jan → 13 Feb (28 a week), **0 later than 14 days before expiry, the smallest margin 40 days**.
- After each check the next date is 90 days on, so the spread keeps itself.
- The competitors without counted plans can stay on `spreadFirstDates`.

### 6.4 Current settings, and what should change

**Now** (`competitor_check_settings`):

| Setting | Value |
|---|---|
| `paused` | false |
| caps | daily **$8**, monthly **$90** |
| `check_interval_days` | 90 |
| `tier_intervals` | commercial 90, core 90, secondary 180 |
| deep queue | **on**: `deep_requested_at` 3 Nov; `deep_country` PT; `deep_per_day` 15; a 36-country `deep_queue` |
| quick pass | `pass_requested_at` 29 Oct, `pass_country` null, `pass_per_day` 40 |
| semi-deep | **status "started"**, 73 ids |
| models | `claude-haiku-5-5` for the extractor, verifier and pass |

**For "prices every 90 days; features every 365; presence never re-asked (Admin only); deep queue off":**
- `check_interval_days` 90 and `tier_intervals.commercial` 90: as now (the price tier).
- `tier_intervals.core` and `.secondary` → **365**.
- **Deep queue off:** `deep_requested_at` null, `deep_country` null, `deep_per_day` 0. Presence ("sold in / not sold in X") comes from
  the country deep checks, so with the deep queue off it is never re-asked, and Admin's not-sold-in marks stand.
- **Quick pass and semi-deep off:** `pass_requested_at` null, and `semi_deep` closed (its status set to done, or the column cleared).
- **Caps:** keep $90 a month. A daily $3 is plenty for 2–4 routine checks a day.
- All of these are rows of `competitor_check_settings`, which isn't a protected table: **database-only, live without a deploy**. They'd
  be written as one migration with your yes.

### 6.5 Cost

**Measured** (`competitor_check_runs`):
- routine **$0.046 per competitor** (19 runs, 154 checks; §86.15's older estimate was ≈ $0.19);
- deep $0.101; pass $0.009.
- November so far: $35.42.

**With the settings above:**
- about 170 competitors (the 162 with counted plans plus those in one-short countries) every 90 days ≈ 1.9 checks a day ≈ **57 a month**;
- at $0.046 that's **≈ $2.6 a month**; at the older $0.19, ≈ $11 a month;
- adding the yearly feature checks, still **under ~$25** — well within the $90 cap.
- **The one-off request backlog** (200) would cost ≈ $9 at $0.046 (≈ $38 at $0.19) if not cleared, and would bunch every next date into
  the same few days. Hence the stagger, which clears it.

### 6.6 What GitHub main (`5df925d8`) would do if re-enabled today

**The workflow file is identical on both branches.** Its import step runs `scripts/data-import/main.ts` with the REST credentials. Each
night at 02:10 UTC on origin/main's code it would:
1. **Import:** origin/main registers only 4 data files, all already imported → nothing.
2. **Check:** the old checker:
   - its prompt shows stored prices in minor units, with no plausibility guard → the **100× risk** returns;
   - it works through the **200 requests first**, up to the $8 daily cap;
   - then the deep queue (15 a day) and the semi-deep list;
   - and it counts account-level API errors as competitors' failed checks.
3. **Publish:**
   - `decideFindings` with no plausibility guard;
   - then every country under the **old rule** ("both checks confirmed", no eligibility rule, no second currencies, no neighbour fits);
   - then it **crashes at AE** (the upsert without `auto_publish` breaks `comparison_publish_never_ae`).
   - **Most of the 59 live countries would be taken down**, with no marks and no refresh after the crash.

**What must be in the deploy before it is switched back on:**
- compare-fix-1 / -2 (the AE fix, units end to end, the plausibility guard, the rules, the all-or-nothing importer);
- the 25 Nov rules: `ALSO_ACCEPTED_CURRENCY`, the eligibility and food-truck-first preference, one check;
- the data files and the `DATA_FILES` registry (all already imported, so the import does nothing);
- **a workflow-file change** (code, not yet written): the import step must run
  `npx -y -p pg@8.13.1 node scripts/competitor-check/run.mjs scripts/data-import/main.ts` with a **`SUPABASE_DB_URL`** secret.
  `scripts/comparison-db.ts` takes its connection only from db-migrate's reader, and the REST pair no longer works for the import.
- The checker step's own after-check publish still uses the REST store (`supabasePublishStore`). It applies the new rules, but not in one
  transaction. That's acceptable; noted.

### 6.7 Re-enable plan (before mid-February 2027)

1. **Code (a prompt):** the workflow-file change above, with a harness. It goes out with the batch deploy.
2. **Database only** (a migration each, your yes; live without a deploy, inert while the workflow is disabled):
   - (a) the settings in §6.4;
   - (b) the stagger in §6.3 (clear `check_requested_at`; `next_check_at` 4 a day from 4 Jan).
3. **You, by hand:**
   - add the GitHub secret **`SUPABASE_DB_URL`**;
   - confirm the **Console spend limit** ($100 on the Competitor checks workspace).
4. **The deploy (you):** move main to france-vat-1 and push, after localhost testing (Open item 40).
5. **You:**
   - run the workflow once by hand with `dry_run`;
   - then `gh workflow enable competitor-check.yml`, **before 4 January**.
6. **Verify (read-only):** the first runs check 2–4 a day; the publish keeps the live countries; `checked_on` moves on.
7. **Deadline:** the first prices age out on 21 Feb (US) and the 504-plan block on 22–26 Mar. The stagger has every counted competitor
   re-checked by 13 Feb.

## 7 · Live list before → after

- **Before (59):** AR AT AU BE BG BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GI GR HK HR HU ID IE IN IT JP KW LI LT LU LV MA MV MY NG NL NO NZ
  OM PA PL PR PT RO SA SE SG SI SK TH TR TW UA US ZA.
- **After (59):** the same. CL now shows Fudo · Pedix.

## 8 · Decisions taken conservatively for you (not counted; say if you want any changed)

1. **Thinker POS MK** stays unclear: no quote ties ordering to a plan. Counted, MK would go live.
2. **Toteat CL** not counted: no ordering-ahead quote. It's moot now that Fudo stands beside Pedix.
3. **Foody POS IL** (590 ₪ a month, pickup ordering) is not relevant: no real customers, synthetic examples.
4. **Nosh PK** (Rs 4 999) not counted: an online-ordering site, but no pickup wording.
5. **Reserveport UG** not counted: no pickup wording, no price.
6. **Ocuioso AO, YUMBI NA/BW/ZM, Restolabs AW, ICRTouch IM:** eligible but no readable price on their own pages, so not counted.
7. **Fudo AR / CL:** applied as you decided. Two flags:
   - neither site states "no free plan" (only a free trial), and AR's page still says «No tiene abono mensual»;
   - the prices are shown "/mes" under a Mensual / Semestral / Anual toggle, which I read as the monthly figure.
8. **Poster KZ's add-on on its own** is marked unclear (as in UA). KZ counts the Starter + add-on total.
9. **Left out as incomplete** (eligible rows without the required quotes): ClickParaPedir PY, Eats365 MO, tossdown PK.
   **Hidden duplicate price-on-request plans** are skipped where the stored competitor already has a plan in that country.
10. **The US territories:** US tools not checked (see §5).
11. **Restolabs' focus** changed to restaurant by the round-4 import (§5). It's not shown anywhere; reverting takes a one-row migration.

## 9 · Times, and what wasn't reached

| | Ended (UK) |
|---|---|
| Round 1 | 14:41 |
| Round 2 | 14:45 (load) |
| Round 3 | 14:51 (load) |
| Round 4 | 15:01 (load) |

**Nothing in scope was left unreached.** The parked countries were not researched (MT IS RS QA BH JO BO DO SV GT JM UY CO AL BA MD UZ LK
BD KR; MK only as in Round 1a).

**Files:**
- `docs/compare-research-6/`: `agent-brief.md`, `build.cjs`, the stored lists, `coordinator/raw/` (Fudo AR / CL from agent 3's quotes),
  `agent-1…3/` (raw evidence and summaries), `sql.txt`;
- `data/compare-research-6/competitors.json` (registered eleventh);
- `supabase/migrations/20261134_compare_research_6_fudo.sql` and `20261135_compare_research_6_poster_kz.sql`.

**Not done:** no push, no deploy, no workflow change, no `.env` file opened, no change to `country_settings.currency`, the manual,
customer-facing or landing-page code, nothing outside the competitor and comparison tables, nothing touching Pizzeria Gusto.

**Flags:**
- Nothing arrived garbled, and no instruction contradicted another.
- Round 1(c) was applied because the "[Dominic: delete this block if you don't agree]" block was still in the prompt.

## Undo (only if you ask)

⛔ DO NOT RUN without your say-so.
- **Fudo AR / CL:** make plans `46458e02…` and `7ae635e1…` current again and supersede the two "Plan Inicial + Tu Delivery" plans (a
  migration).
- **Poster KZ:** remove the two joinposter.kz check pages and set its add-on back to not unclear (a migration).
- **Restolabs' focus:** set back to food truck (a migration).
