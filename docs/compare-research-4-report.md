# compare-research-4 — one-short countries (MT, then languages-world-1's) and three evidence top-ups

**25 November 2026 · branch `france-vat-1` · not pushed, not deployed**

**Commits:**
- `2a814f71`: brief and stored list
- agents' one-per-country commits
- `0ad9e31e`, `dad0e3c1`: build, data file and registration
- `9933ffc1`: migration 20261133

## 0 · The short version

- **Live: 56 → 58.** SA (Ordable · Linkin1) and ZA (Bizzfo · Resto) join. Nothing left the list.
  - AE false/false; shown = marked everywhere; 0 of 753 priced plans over the ceiling; no pending or duplicate answers.
- **Top-ups:**
  - **Menufy PR:** a quote found, $179 a month on monthly billing, replacing $0. PR stays live.
  - **Fudo CL:** no "no monthly fee" quote, so its plan is unclear. CL stays live on Pedix · SumUp, SumUp being the single fallback.
  - **Pedix:** a body sentence replaces the bare title quote.
  - **Toss Place KR:** its own site doesn't state the fee in force, so its plan is unclear. KR has 0.
- **ONE load round:** build → validate → commit → the migration's rolled-back pre-flight → migration → rolled-back import dry run →
  import → rolled-back publish dry run → publish → read-only verify.

## 1 · Step 0 (read-only)

**a) Git:**
- `france-vat-1` is checked out, HEAD `4bd5f57e` at the start.
- Under data/compare-*, docs/compare-*, lib/comparison-publish.ts and lib/data-import/, the only uncommitted file was
  `docs/compare-research-2/sql-wave-2.txt`. This session wrote it in compare-research-2 (that report lists it) and never committed it.
  It isn't another session's work, so I committed it on its own (`22e885df`) instead of stopping. ⚠️ Flagged here.

**b) Not-live counts, from the publish step's own logic** (a rolled-back publish dry run; inside and after the rollback: no change):
- **One short:** MT (FoxiFood), IS (Vitrina), RS (Vitrina), KR (Toss Place), QA, SA, BH, JO (Ordable each), BO (Mezzita), DO (Gestióndo),
  SV (Pedix), GT (Sabbor), JM (Ezy Cart), UY (Pedix), ZA (Bizzfo).
- **At 0:** CO and MU.
- **This exactly matches your expectation.** Also one short, all in wave 3 and outside this run: AL BA MK MD (Vitrina), IN (uEngage),
  LK (POS Masters), UZ (Delever), BD (Restora POS).

**c) When the 56 live countries would stop counting if nothing is re-checked** (`planVerdict`):
- **The rule:** a plan stops counting once `checked_on + interval (90 days for every shown competitor) + 30` is before today.
  Admin-verified plans never stop.
- **How it was computed:** a country drops when its second-latest expiry among the shown competitors' marked plans passes. It's
  conservative, because a non-shown eligible competitor could step in.
- **Earliest:** US stops counting from **21 Feb 2027** (its last counted day is 20 Feb).
- **Drops by 31 Jan 2027:** 0. **By 28 Feb:** 1 (US). **By 31 Mar:** all 56.
  - BR, CZ, GB, JP, NZ from 8 Mar;
  - most from 10 to 26 Mar (the research of 24–25 Nov).
  - The full list per country is in the query result (`docs/compare-research-4/sql.txt` has the query).
- Nothing was changed.

**d) Stored currencies:** MT EUR · IS ISK · RS RSD · ZA ZAR · KR KRW · QA QAR · SA SAR · BH USD (+BHD) · JO USD (+JOD) · BO BOB ·
DO DOP · **SV USD** · GT GTQ · JM JMD · UY UYU · CO COP · PR USD · CL CLP.

## 2 · Per country

The evidence is in `docs/compare-research-4/agent-N/raw/<CC>.json`, with one commit per country.

| Country | New vendors tried | Verdict | Count now |
|---|---|---|---|
| MT (strict) | UpMenu (no Malta), Kups Malta (app-store only), MENU.mt (script-only, a menu directory), Choice / Flipdish (no Malta), agencies, Sixteen (resells Storekit) | nothing new | 1 |
| IS | Noona (bookings + QR table), Yonoton (403 twice), Munu (NO/SE/FI only), Glaze (in-venue pay); Icelandic searches → Wolt, myPOS, foreign tools | nothing new | 1 |
| RS | Poster (no Serbia, $ only), Remaris, iiko (no RSD ordering module) | nothing new | 1 |
| ZA | Resto re-read once: «Resto's simple pricing - R1000/month», «We do not take any type of commission.»; `ahead` partial ("delivery or collection") | Resto now counts | **2 ✅ live** |
| KR | 7 Korean searches (픽업 주문, 선주문, 포장 주문): Naver / Kakao ordering, shop builders, table-order products | none; Toss now unclear | 0 |
| QA | Take App (no Qatar), Taker and Grubtech (no prices), Klikit (APAC only) | nothing new | 1 |
| SA | **Linkin1** (linkin1.com · E-Menu with curbside pickup · «SAR 59» a month excl. VAT + 1.5 % on online-paid orders; no scheduling wording) | eligible (borderline) | **2 ✅ live** |
| BH | **OrderFlow** (15 / 20 / 25 BHD a month, pickup and BenefitPay takeaway) — its only site is `aporederbot.duckdns.org` and it claims one customer | ⚠️ left out on review (the Resto-SaaS standard: not a confirmed live product) | 1 |
| JO | Mnasati (store builder, no pickup), Supaorder (no Jordan); Foodics' Jordan offers page not opened (rejected for JO in round 3) | nothing new | 1 |
| BO, GT, UY | only marketplaces, directories and foreign tools; Reorder (UY) has no own site | nothing new | 1 |
| DO | Meniu (rejected) | nothing new | 1 |
| SV | Kioskito (Panama only) | nothing new | 1 |
| JM | YaadBooks (till only) | nothing new | 1 |
| CO | **Fudo** settled: Tu Delivery is a module on a paid plan («Necesitas una cuenta activa en Fudo y sumar el módulo Tu Delivery a tu plan.») → stored as "Plan Inicial + Tu Delivery" COP 173.800/mes sin IVA ($62.900 + $110.900, both quoted); Menüpp (pickup, no price); Loggro Restobar (QR only) | Fudo counts | 1 |

## 3 · Toss Place, Menufy, Fudo CL and Pedix

| | Outcome | Change |
|---|---|---|
| **Toss Place KR** | On tossplace.com only: three newer stories show no fee; the terms page didn't load; the only fee wording is still «주문 수수료 0원으로 써보기» (2025), against 3.5 % excl. VAT planned (2024). **No fee in force is stated** (`raw/KR-toss.json`) | its KR plan is **unclear** (migration 20261133); KR has 0 |
| **Menufy PR** | Found in restaurant.menufy.com/pricing's own HTML: «Menufy is $179 a month month-to-month, or $149 a month on a 12-month agreement, which saves you $360 a year and includes equipment.» | the stored "Menufy online ordering" is **corrected USD 0 → 179** through the importer's corrected-plans route (old row kept as history), note "$149 on a 12-month agreement". **PR stays live** (Menufy · Take App) |
| **Fudo CL** | Not found: fu.do/es-cl/delivery/ has only «Las primeras 25 ventas son sin costo. Luego pagas una tasa de servicio del 1,9% + IVA…» and «sin costo adicional» | its CL plan is **unclear** (migration 20261133). **CL stays live** on Pedix · SumUp (SumUp as the single fallback) |
| **Pedix** | Found in the article body: «La opción "Retiro en persona" permite que tus clientes hagan el pedido desde el catálogo online y pasen luego a buscarlo por el local.» | Pedix's every-country `ahead` answer was **replaced** (migration 20261133; the old answer superseded). The importer couldn't do it: the stored answer had a note, so it wasn't "bare" |

## 4 · Build and load

**`docs/compare-research-4/build.cjs`** (a copy of compare-research-3's, every review rule kept). Changes:
- `coordinator/raw/` holds merges of the agents' own quotes, with **no new reads**: Menufy PR at $179, and Fudo CO's one combined plan.
- Resto's "Shop" plan is matched by name (`RENAME`).
- Toss KR's eligible row is left out as incomplete (no order quote, no price).
- OrderFlow is left out (`REVIEW_NOT_RELEVANT`; a new competitor, so nothing is written for it).
- **Fudo's stored focus is kept** (`KEEP_STORED_FOCUS`). The first dry run showed agent 3's CO row would have changed Fudo from food
  truck to restaurant everywhere, which wasn't asked.
- Display name: Linkin1.

**The data file** `data/compare-research-4/competitors.json`:
- 6 competitors, 5 plans, 5 entries;
- passes `researchProblems` (each competitor once; the database's unique rules) and the 100× check;
- **registered ninth** in `DATA_FILES`.

**Migration `20261133_compare_research_4_corrections.sql`:**
- covers the corrections the importer can't make: Toss KR and Fudo CL marked unclear; Resto ZA's unclear mark cleared; Pedix's `ahead`
  answer;
- **pre-flighted** with `compare-db-proofs.cjs --preflight`: inside, its guards passed (unclear plans 75 → 76, answers unchanged); after
  the rollback, every count and checksum equal;
- then applied with `db-migrate.cjs`: one transaction, no error.

| Step | Result |
|---|---|
| import dry run (rolled back) | +2 competitors, +4 plans (1 corrected), +2 entries, +30 answers (2 bare ones replaced); after the rollback: no change |
| real import | the same; `data_imports` 14 → 15 |
| publish dry run (rolled back) | 56 → 58 (SA, ZA); after the rollback: no change |
| real publish | 58 live, events +9; site refresh answered 200 |
| verify (read-only) | 58 live; shown = marked in all; AE false/false; 0 of 753 over the ceiling; 0 pending, 0 duplicate answers |

**SQL:** every distinct statement was shown in chat and is written to `docs/compare-research-4/sql.txt`. That file holds the migration,
and the import's and publish's statements as their entry points printed them.

## 5 · Live list

- **Before (56):** AR AT AU BE BG BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GI GR HK HR HU ID IE IT JP KW LI LT LU LV MA MV MY NG NL NO NZ
  OM PA PL PR PT RO SE SG SI SK TH TR TW UA US.
- **After (58):** the same plus **SA** and **ZA**.

**Changed line-ups:**
- **CL:** Pedix · SumUp (was Fudo · Pedix).
- **PR:** Menufy now at $179.
- **AR:** unchanged (Fudo · Ojapo; Fudo's AR page states no monthly fee).

## 6 · What needs you

1. **OrderFlow BH** (15 BHD a month, pickup) runs only on a duckdns.org address. I left it out, by your Resto-SaaS standard.
   - Counting it would make **BH live**.
2. **Linkin1 SA** is counted (curbside pickup, no "for a time" wording), like Asila.
   - Admin's switch can take SA down.
3. **CL now leans on SumUp's single fallback.**
   - A second real tool in CLP, or a Fudo CL "no monthly fee" quote, would replace it.
4. **Re-checks:** the first live country (US) stops counting from 21 Feb 2027 unless its prices are re-checked. All 56 are gone by 31 Mar.
   - So the Competitor check (Open item 55) needs to be back before mid-February.
5. **Still one short after this run:** MT IS RS QA BH JO BO DO SV GT JM UY, and KR at 0. Two rounds now find nothing new for most of them.

**Not done:** no push, no deploy, no workflow change, no `.env` file opened, no change to `country_settings.currency`, the manual,
customer-facing or landing-page code, nothing outside the competitor and comparison tables, nothing touching Pizzeria Gusto.

**Flags:**
- Nothing arrived garbled, and no instruction contradicted another.
- The Step 0 (a) leftover file (§1) is the one place I didn't stop. It was this session's own file.

## Undo (only if you ask)

⛔ DO NOT RUN without your say-so.
- **Taking SA or ZA down:** Admin's per-country switch.
- **Reversing migration 20261133:** a migration that flips the three `unclear` flags back, and makes Pedix's old answer current again
  while superseding the new one.
- **Reversing Menufy's correction:** make its superseded plan current again and supersede the $179 one.
