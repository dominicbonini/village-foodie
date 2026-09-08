HatchGrab / Village Foodie — Scraper & Discovery Pipeline Reference Manual · V1.2

**Version 1.2 · 8 September 2026**

*This documents the discovery pipeline: a separate codebase path, a separate runtime and a separate deploy path from the Next.js app. It exists because this pipeline had never been documented, and that cost three months of silent venue-creation failure — nobody could tell "few trucks scraped" from "few venues created" from "nothing ran", because none of it was written down and every failure exits 0.*

**⚠️ HOW TO READ THIS.** Every claim is marked 🔎 **SOURCE-READ** (I read the code) or 🧪 **EXECUTED** (I ran it against the live API or database). Where something could not be established it says **UNREAD** — not a description of what it probably does. **A plausible state is not a read one.**

🔴 **THE METHOD ERROR THAT MADE THIS MANUAL NECESSARY.** A grep scoped `--include="*.ts"` reported "nothing creates venues" — because `scripts/run-scraper.js` is **JavaScript**. The creator had been there all along. **This pipeline is `.js`; the app is `.ts`. Never scope a search by extension here.**

---

# CHANGELOG

## V1.2 — 8 September 2026 — THE MANUAL'S OWN DIAGNOSIS OF ITS HEADLINE FAILURE WAS WRONG, THIRTEEN POINTERS WERE STALE, TWO "DELETION EVENTS" WERE NEITHER, AND A WRITE HAS BEEN FAILING LOUDLY FOR THREE MONTHS INTO A CHANNEL NOBODY READS

**Delta — a documentation pass over four read-only investigations (`sheet-migration-audit-report.md`, `deletion-rules-report.md`, `pricing-suppression-report.md`, `venue-consolidation-report.md`). No code changed. §3.2's causal claim reversed; 13 line-number pointers corrected; the Sheet counted for the first time; a new §8 on deletion and retention; a new §5.6 on `excluded_terms`; and a new §9 recording what moved in the data today.**

⚠️ **Everything in this entry post-dates the body below, which has been corrected in place. Where the two disagree, this entry is current.**

### 🔴 THE LOAD-BEARING CORRECTION — §3.2 TAUGHT THE WRONG LESSON FROM A REAL EVENT

- 🔴 **"Two of the three DB mirrors are NOT awaited" was FALSE.** 🔎 **All four are awaited** (`:792`, `:1673`, `:1708`, `:1833`). The un-awaited writes were real when V1.1 was drafted and were fixed the same day; the section was never updated.
- 🔴 **The three-month gap was real. Asynchrony was not its cause.** 🧪 The cause is the **345-venue divergence** — `onConflict: 'name'` against a `(name, village)` constraint, so every venue write raised 42P10 while the Sheet append beside it succeeded. **A write that is awaited and fails looks, from the Sheet's side, exactly like a write that was never awaited.** The wrong mechanism was written down and would have sent the next reader to fix the wrong thing.
- ⚠️ **There were THREE mirrors documented and there are FOUR.** `excluded_terms` was missing from §2.4 entirely.

### 🔴 `excluded_terms` — THE OPPOSITE FAILURE MODE, AND THE UNREAD CHANNEL (new §5.6)

- 🧪 **The live unique key is `(truck_id, term)` and `truck_id` is NOT NULL.** The scraper (`:792`) supplies `{ term }` with `onConflict: 'term'` — **42P10** on the missing constraint, **23502** on the NOT NULL. 🧪 **0 rows, against 146 terms in the Sheet.**
- 🔎 The shape changed on **4 June 2026**, when `20260604_exclusion_terms.sql` **dropped and replaced** the table. ⚠️ **Reading only the schema migration would tell you the scraper is correct.**
- 🔴 **THIS FAILS LOUDLY — INTO `dbWriteFailures` (`:795`) — AND HAS DONE SO FOR LONGER THAN THE SILENT VENUE FAULT DID.** The silent one ran 11 Jun → 7 Sep; this one has run 4 Jun → today. **"It fails loudly" is only mitigation if someone reads the channel. Nobody read it.** Do not cite loud failure as safety anywhere in this manual without naming the reader.
- 🔴 **Two features share this table with incompatible meanings** — the scraper's terms are global, the manage route's are per-`truck_id`. **OPEN; no fix proposed.**

### 🔴 DELETION AND RETENTION — THE RULES EVERYONE ASSUMED EXISTED DO NOT (new §8)

- 🔎 **Nothing in this repository deletes from `discovery_events`, `discovery_trucks` or `venues`** — six sweeps, every extension. 🧪 **No cascade can either**: every FK pointing in is `ON DELETE SET NULL`, nothing references `discovery_events` at all, and `outreach_prospects` *blocks* a discovery-truck delete.
- 🧪 **No duplicate rule and no old-event rule has ever run against Supabase. 3,577 past-dated rows survive, oldest 2026-05-22, flat across every month.** The absence of duplicates is the unique index refusing them, not a cleaner removing them.
- 🔴 **The pruning that does exist acts on the Sheet's Events tab and belongs to the Apps Script outside this repo** — which 🧪 also **writes `discovery_events` directly** and **creates `venues`**. It is now load-bearing in three reports and its code is **UNREAD**.
- ⚠️ **V1.1's `ignoreDuplicates` note was half wrong**: after a delete the venue row *does* return; the hand-applied coordinate does not.

### 🔴 TWO "DELETION EVENTS", NEITHER OF WHICH WAS A DELETION (new §9)

- 🧪 **The PMF pack: 4 inserted, 5 REFUSED** by `ON CONFLICT DO NOTHING` — a `URL:` scrape had written the same natural key **nine seconds earlier**. All nine events exist. The pack's own `00-verify-before.sql` would have caught it. ⚠️ **This corrects the migration audit's §10.**
- 🧪 **The 16 venues: a deliberate hand-run merge of exactly the CERTAIN tier.** Proven by the **125 events being repointed to the keepers** — `ON DELETE SET NULL` means a bare delete would have orphaned them.
- 🔴 **UNRESOLVED:** a reported deletion of 4 PMF duplicates **is not present in the data** — all four rows are live with `created_at = updated_at`. Recorded, not tidied away.

### THE COUNTS THIS MANUAL NEVER HAD

- 🧪 **The Sheet has TEN tabs; the scraper reads four.** Trucks **152** · Venues **933** · Events **713** · Exclusions **146**. **109 of 152 truck rows enter `sitesToScrape`.**
- 🧪 **The dedup set is FUTURE-ONLY** — the Events tab holds no past rows at all, because of the external pruner. Dedup is at **`:988-992`**, not `:881`.
- 🧪 **The unlinked backlog is the majority: 2,237 of 4,301 events (52.0%) have no `venue_id`**, and nothing links on a schedule. ⚠️ **`updated_at` is never maintained — zero rows have `updated_at ≠ created_at`**, so it can date nothing.
- ⚠️ **`Manual Entry` is emitted BY THE SCRAPER** for `manual`/`manual_single` sites (`:983`) — it is **not** a hand-entered row, and 581 rows carry it.

### THE STANDING LESSONS FROM THIS PASS

- 🔴 **A stale pointer is worse than none.** Thirteen line numbers in this manual pointed at unrelated code. Every one is corrected and marked with what it used to say. ⚠️ **They will go stale again** — the working tree already holds uncommitted edits to `run-scraper.js`. **Treat every `:NNN` here as a neighbourhood, not an address.**
- 🔴 **A verified-live claim is a claim about a moment.** Two claims in the app manual were marked verified-live and both aged into falsehood within a month. Date them or do not write them.
- 🔴 **Loud failure is not safety.** It is safety *plus a reader*. Name the reader.

## V1.1 — 7 September 2026 — VENUE CREATION BROKEN SINCE JUNE BY A KEY THAT COULD NEVER MATCH, A GEOCODER THAT WAS INVENTING RATHER THAN ESTIMATING, A MATCHER THAT IGNORED THE VILLAGE, AND 51 SILENT TRUCKS THAT TURNED OUT TO BE ONE STRATEGY

**Delta — venue creation found broken since 11 June by a conflict key that could never resolve; the geocoder demoted from oracle to postcode suggester; the venue matcher found to skip the village entirely in one branch; 312 links applied taking the map from 69 pinnable events to 396; 54 venue coordinates corrected out of a re-derived bad list of 103, not 40; and the 51 silent trucks traced to one strategy rather than fifty-one faults.**

⚠️ **Everything in this entry post-dates the body of this manual, which was written the same morning.** Where the two disagree, this entry is current and the section below has been corrected in place.

### 🔴 VENUE CREATION — BROKEN SINCE 11 JUNE BY A KEY THAT COULD NEVER MATCH

- 🔴 **THE UPSERT USED `onConflict: 'name'`. THERE IS NO UNIQUE INDEX ON `name` ALONE.** The only unique constraint is `venues_name_village_key` on `(name, village)`. Every venue upsert raised **42P10** and wrote nothing, while the workflow exited 0.
- ✅ **PROVEN FROM THE LIVE DATABASE, NOT INFERRED.** `venues_name_village_key` shows `idx_scan = 0` and `last_idx_scan = null` while `venues_pkey` shows 4,522 scans. Reads work; venue writes have never once reached that constraint.
- ⚠️ **THE CAUSE WAS IN THE DATABASE, NOT IN GIT.** The venue code had not changed since 22 May — three weeks before creation stopped. The constraint was almost certainly added by hand around 11 June and broke every write instantly. **A change with no commit is still a change; when a failure date has no code change either side of it, look at the schema.**
- 🔴 **THE NULL HAZARD THAT NEARLY REPLACED IT.** The village written came from the model's echo rather than from the queue, and two identical null-village upserts produced two rows. **Fixing the key alone would have swapped "always fails" for "always duplicates" — which looks like success.** The village now comes from the queue and a row without one is refused.
- ✅ **THE WRITE IS AWAITED AND THE RUN GOES RED.** Three fire-and-forget writes are now awaited, and eight paths that exited 0 on failure now fail. ⚠️ **The first attempt put a `throw` inside the geocoder's own `catch`, so it still exited 0** — the guard existed and did not bite.
- ⚠️ **`ignoreDuplicates: true` IS RETAINED DELIBERATELY.** The consequence is that **a wrong coordinate is permanent until corrected by hand** — no re-run will ever fix one.

### THE GEOCODER WAS NOT ESTIMATING. IT WAS INVENTING.

- 🔴 **26 PRODUCTION VENUES CARRIED PLACEHOLDER DECIMALS** such as `52.1234, 0.1234`, and **13 SAT AT THE CENTROID OF GREAT BRITAIN.** p90 error was **10 km against the model's own postcode**. Two of those pins were live on the public map.
- ✅ **THE MODEL IS DEMOTED FROM GEOCODER TO POSTCODE SUGGESTER.** Every coordinate now comes from **postcodes.io** or the venue is stored with none. The model still suggests a postcode; it no longer decides where a place is.
- ✅ **A FIVE-CHECK GAUNTLET, THRESHOLDS DERIVED FROM THE LIVE TABLE.** 5 km from its own postcode catches every named failure while passing the p75 rural offset. **The sentinel set is built at runtime, so it found the GB centroid without being told about it.**
- 🔴 **AMBIGUOUS VILLAGE NAMES NOW GET NO PIN, AT A MEASURED COST OF 21%.** "Newton" is 20 places across 576 km; a first draft resolved "Barrow" to Lancashire. **This trades wrong pins for fewer pins.** Whether ambiguous matches should instead store at low confidence and surface for approval is an open decision.
- ⚠️ **THE MODEL IS DETERMINISTIC HERE — 4/4 IDENTICAL.** So the stability argument for freezing coordinates is weaker than assumed; the reason to keep `ignoreDuplicates` is caution, not measured drift.

### 🔴 THE VENUE MATCHER IGNORED THE VILLAGE ENTIRELY

- 🔴 **A SINGLE-TOKEN CANDIDATE RETURNED HIGH CONFIDENCE WITHOUT EVER CHECKING THE VILLAGE.** That one branch produced every mislink in the emitted backfill: **"The White Swan" [Bluntisham] → "The Swan" [Monks Eleigh], 65.5 km**, and **43 venues containing "Village Hall" collapsing onto one row in Troston**.
- ⚠️ **THE DEFECT WAS AT LINE 81, NOT 88.** An earlier report misnumbered it; line 88 is inside the check that works. **A stale pointer is worse than none.**
- ✅ **FIXED BY HOISTING THE EXISTING VILLAGE RULE INTO THAT BRANCH, NOT BY REWRITING THE RULESET.** A draft that quietly restructured the two-stage test for multi-candidate matches was caught and reverted. **The pipeline's matching and dedup rules work; the fix was to stop one branch bypassing them.**
- ✅ **A 15 km DISTANCE CEILING, ANCHORED ON OTHER VENUES IN THE SAME VILLAGE.** Agreeing matches sit at p99 5.55 km; disagreeing ones at a median of 36 km. **The ceiling independently rediscovered 13 badly-geocoded venues, including the Cambridge longitude sign-flips, without being told they existed.**
- ⚠️ **THE COST: HIGH 435 → 325, LOW 133 → 243.** Coverage after applying drops from 504 to 394 of 669. **110 events traded for correctness. A pin 65 km wrong is worse than no pin.**

### 🔴 A GUARD THAT CANNOT FAIL FOR A WHOLE CLASS OF INPUT

- 🔴 **THE VILLAGE-ANCHOR CHECK VALIDATES A VENUE AGAINST OTHERS IN ITS VILLAGE. A VILLAGE HOLDING ONE VENUE ANCHORS TO ITSELF AND ALWAYS PASSES.** It reported zero problems on 7 genuinely broken venues — one 76.8 km from its own postcode, two carrying literal `1.2345` decimals.
- 🔴 **THAT BLIND SPOT IS WHY THE BAD-COORDINATE LIST WAS 40 AND IS ACTUALLY 103.** Re-derived live. 81 are correctable: **54 from a postcode that agrees with its village (APPLIED)**, 22 from a village centroid needing review, 5 moves over 20 km held in an opt-in file.
- ⚠️ **ONE OF THE FIVE IS ADVISED AGAINST: 117 km, an invalid postcode, and the only one carrying a live pin.**
- ✅ **A GUARD WHOSE PASS IS INDISTINGUISHABLE FROM ITS ABSENCE IS WORSE THAN NO GUARD**, because it reads as a verdict. **Check what a guard does with its degenerate input before trusting its zero.**

### THE LINKING PASS — WHAT ACTUALLY PUT PINS ON THE MAP

- ✅ **FIXING VENUE CREATION PUTS NOTHING ON THE MAP BY ITSELF.** Pass A writes `discovery_events` with **no `venue_id` at all**, and coordinates come only from that join. Creating venues and linking events are two separate jobs, and only the second is visible.
- ✅ **312 STATEMENTS APPLIED. PINNABLE FUTURE EVENTS WENT 69 → 381**, and **396** after the coordinate corrections. **13 links were held back** because their target venue failed an independent coordinate check — **a correct link to a wrong venue is still a wrong pin.**
- ✅ **EVERY LINK WAS RE-DERIVED FROM THE DATABASE RATHER THAN READ FROM THE EMITTED FILE.** A generated artefact and the current data can disagree, and that is how a stale file gets applied.
- ⚠️ **21 LOW-CONFIDENCE LINKS COVERING 185 EVENTS HAVE NO MEASURABLE DISTANCE**, because their village is a landmark phrase — "Near the Co op Store". **Their risk is unknown rather than zero.** 🔴 **Do not read an unusual venue name as bad data: pitches are often located by reference to a nearby business, because that is how the trucks describe where they park.**

### 🔴 THE 51 SILENT TRUCKS — ONE STRATEGY, NOT FIFTY-ONE FAULTS

- 🔴 **52 URL-SCRAPED TRUCKS HAVE ZERO FUTURE EVENTS. ONLY 44 OF 175 HAVE ANY.**
- 🔴 **THERE IS NO DATE CLUSTERING — 33 SEPARATE STOP DAYS — BUT THERE IS SEVERE CLUSTERING BY STRATEGY. 100% OF FAILURES ARE `scroll_lazy`. EVERY `manual`, `click_next` AND `scrape_rules` TRUCK WORKS.** 30 of 51 are Facebook, which is 73% of all Facebook trucks failing.
- ⚠️ **NOBODY HAS FETCHED A FACEBOOK PAGE TO SEE WHAT `scroll_lazy` ACTUALLY GETS.** The correlation is strong; the cause could be blocking, a layout change, or a bug in the strategy. **Those need different fixes and one of them may not be fixable.** Open.
- 🔴 **THE DISCOVERY PASS WRITES NO RUN LOG. `scraper_run_log` HOLDS ONLY THE THREE OPERATOR TRUCKS.** So "scraped and found nothing" is indistinguishable from "never scraped", and the only reason any of this was noticed is that the operator happened to look at the map.
- ✅ **`discovery_run_log` IS BUILT — MIGRATION WRITTEN, NOT APPLIED** (`supabase/migrations/20260907_discovery_run_log.sql`) — with an awaited write in the per-site `finally`, so **no row means never attempted**. Alert threshold N=14, derived from healthy write gaps (p95 = 13 days, 3 false positives). ⚠️ **The per-site write path is unexercised, because a zero-site run never enters the loop.**

### PIMP MY FISH — CONFIGURATION CORRECT, CAUSE STILL UNKNOWN

- ✅ **RULED OUT BY EXECUTION, NOT ARGUMENT:** the URL, the path, the strategy, the page rendering and the extraction. **The scraper's own prompt against that page produced all nine events.** `order.pimp-my-fish.co.uk/basket/new` is a white-label SPA serving the same page for every path.
- ⚠️ **TWO EARLIER CLAIMS WERE WRONG AND WERE WITHDRAWN:** that the URL was an ordering dead end, and that the strategy was empty — the latter was a 60-character truncation of the `source` string, reported as a data finding. **A truncation artefact sent an operator to edit a Sheet row that was never wrong.**
- ✅ **THE CONTROL IS PIZZA MONDO:** same host, same URL shape, still writing. **The fault is in the run, not the host.**
- ✅ **NINE EVENTS INSERTED BY HAND, 8–12 SEPTEMBER**, all nine venues already existing with good coordinates.

### TWO CONVENTIONS THAT MUST HOLD FOR HAND-INSERTED ROWS

- 🔴 **USE THE `truck_name` THE PIPELINE ACTUALLY WRITES, NOT THE TIDIER SPELLING.** `Pimp My FIsh` — capital I — holds 174 rows against 3 for the correct spelling. The natural key is `(event_date, truck_name, venue_name)`, so **a tidier spelling would not collide when the scraper recovers, and would duplicate every event.**
- 🔴 **THE `source` STRING MUST NOT CLAIM A SCRAPE.** Mirroring `URL: … | Strategy: …` would be false in the data **and would corrupt the staleness sweep**, which parses `source LIKE 'URL:%'` to derive each truck's URL, strategy and last-written date. A hand-inserted row carrying that string makes a broken truck look healthy. Use a dated manual-entry string.

### OUR OWN DUPLICATION, PRE-DATING ALL OF THIS

- 🔴 **ONE EVENT IS STORED THREE TIMES UNDER THREE VENUE NAMES.** Pig-Casso's on 11 September appears as `FoodPark Biomedical`, `foodPark` and `Biomedical Campus Cambridge` — three pins for one van. Nomadough similarly. **The extent has never been counted.**
- ⚠️ `foodPark` appears five ways in the venue list and `Off The Beaten Truck` six. **Creating a row per string bakes the inconsistency in permanently.**

### THE HATCHES UP SOURCE — MEASURED, NOT ADOPTED

- ✅ **THEIR COORDINATES ARE DECISIVELY BETTER: MAX ERROR 127 m AGAINST OUR p90 OF 7 km**, 119/119 through the gauntlet, zero placeholders or centroids. **They expose no postcode** — the field named that way is their search box.
- 🔴 **THEIR GraphQL `bounds` ARGUMENT SILENTLY DROPS ANY LOCATION WITH A NULL POSITION.** 15 collections were missing from a bounded query and present in an unbounded one, all sharing `roughPosition: null`. **Nothing in the API says so. Query unbounded and filter client-side.**
- 🔴 **THEY PUBLISH THE ORDERING WINDOW; A TRUCK'S OWN SITE PUBLISHES THE TRADING WINDOW — CONSISTENTLY 15 MINUTES EARLIER.** Importing their times over ours would tell customers to arrive before the truck opens. ⚠️ Inferred from every case examined, never labelled in their API.
- ⚠️ **AN UNFILTERED IMPORT WOULD CREATE 45 VENUES AND DRAG THE MAP NATIONWIDE** — Pop Brixton, Grainger Market, Shambles Market York, Falmouth. Filtered to 60 km of the live footprint it is 28 events across 10 trucks, of which **one is from the 51**. ⚠️ **A radius derived from where the map is today can never discover an area you are not already in.**
- 🔴 **THEIR VENUE NAMES ARE AS AMBIGUOUS AS OURS.** A bare `foodPark` matches four of ours; one candidate paired Wintringham with a pitch 50 km away. **Their coordinates cannot rescue an unlinked event, because the ambiguity is in the name, not the position.**
- 🔴 **WHETHER TO READ THEIR COMPILED DATASET IS A COMMERCIAL JUDGEMENT, NOT A TECHNICAL ONE.** `robots.txt` is permissive, there is no terms-of-use page at all, and the footer asserts copyright. **An absent stated position is not permission.**

### THE STANDING LESSONS

- 🔴 **A SWEEP SCOPED NARROWER THAN THE RISK MEASURES THE SCOPE, NOT THE RISK.** A grep restricted to `.ts` hid the venue creator, which is a `.js` file, for a full round — and an existing report had already found it and was not read first.
- 🔴 **EVERY SILENT FAILURE IN THIS PIPELINE PRESENTS AS SUCCESS.** A dead credential becomes "0 sites, exit 0". A rotated secret is logged as a success row. A rejected upsert writes nothing and returns green. **Three months of venue failure, three days of one truck, and 51 trucks of unknown status all share one cause: nothing was watching.**
- 🔴 **PROOFS THAT REPORT GREEN WHILE PROVING NOTHING ARE THE RECURRING FAILURE.** A harness running a pre-edit copy. A loop breaking before the case it existed for. A `throw` inside the catch it was meant to escape. A guard anchoring on itself. **Each was caught by inspecting the test, never by reading its result. State what a proof's failure mode would look like if it were proving nothing, before quoting it.**
- ⚠️ **THE OPERATOR'S ACCOUNT OF THE SYSTEM BEAT THE TOOLING TWICE** — venue creation was automatic, and unusual venue names are real pitches. **Where a claim from the operator and a grep disagree, the grep is the thing to widen.**

---

# 1. WHAT RUNS, WHERE, AND WHEN

## 1.1 It is one script, in the app repo, run by GitHub Actions

🧪 **EXECUTED (machine-wide search):** there is **no separate scraper project**. `~/dev/village-foodie` is the only git repository on this machine besides `~/.nvm`. **`scripts/run-scraper.js` (~1,700 lines) is the whole scraper.**

🔴 **Its runtime is GitHub Actions, not Vercel.** Nothing about it deploys with the app. A Vercel rollback does not touch it; a Vercel env var is not its env var.

## 1.2 The three workflows

🔎 **SOURCE-READ**, `.github/workflows/`:

| Workflow | Cron | `SCRAPE_MODE` | What it runs |
|---|---|---|---|
| **`daily_scrape.yml`** | `0 6 * * *` (once a day) | `discovery` | **Pass A** — the global Sheet scrape. **This is the only thing that creates venues.** |
| **`hatchgrab_scrape.yml`** | `0 * * * *` (hourly) | `hatchgrab` | **Pass B** — HatchGrab-linked trucks, POSTed to `/api/inbound-schedule` |
| **`process-next-truck.yml`** | ⚠️ **cron disabled** — the file records it *was* `*/30 * * * *` | — | "Hatchesup Menu Scraper", a separate menu job |

⚠️ **GitHub's scheduled crons fire late.** `hatchgrab_scrape.yml` carries the evidence in its own comments: *"the discovery cron '0 6' arrives ~09:2x"*. 🔴 **A previous gate required an exact local hour and therefore almost never matched — "scheduled scraping silently stopped (06-28 regression)".** That is why Pass B now uses a duration window rather than a clock match.

## 1.3 The mode split

🔎 `scripts/run-scraper.js:398-400`:
```js
const MODE = (process.env.SCRAPE_MODE || '').toLowerCase();
const RUN_DISCOVERY = MODE !== 'hatchgrab';
const RUN_HATCHGRAB = MODE !== 'discovery';
```
🔴 **Unset runs BOTH passes.** A local `node scripts/run-scraper.js` with no `SCRAPE_MODE` is a full scrape — it will hit every site in the Sheet **and** every eligible HatchGrab truck, and it will write to production.

## 1.4 Credentials, and where each lives

🔎 All seven come from **GitHub Actions secrets** in CI, and from **`.env.local`** locally (`dotenv.config({ path: '.env.local' })`, line 9).

| Secret | Used for | 🔴 Fails how? |
|---|---|---|
| `GOOGLE_SHEETS_CREDENTIALS` | Service-account JSON for the Sheet | **Throws at startup** — `if (!GOOGLE_SHEETS_CREDENTIALS \|\| !GEMINI_API_KEY) throw` (`:411`). Run goes red. |
| `GEMINI_API_KEY` | Extraction **and** venue geocoding | Same startup throw if absent. ⚠️ **If present but rejected at call time, the failure is caught downstream** — see §2. |
| `SPREADSHEET_ID` | Which Sheet | 🔴 **No guard.** UNREAD what an absent value does. |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | All DB writes | 🔴 **No guard.** `createClient` is called at module scope with whatever is there. |
| `HATCHGRAB_API_URL` + `INBOUND_SCHEDULE_SECRET` | Pass B's POST | 🔎 Pass B is **skipped entirely** if either is missing (`:1152` — `if (RUN_HATCHGRAB && HATCHGRAB_API_URL && INBOUND_SECRET)`). ⚠️ **Skipped silently, on a green run.** |
| `PUPPETEER_EXECUTABLE_PATH` | Chrome, from `browser-actions/setup-chrome` | Set by the workflow. Locally unset → puppeteer's bundled Chrome. |

## 1.5 What happens when a run fails

🔎 `:1694`:
```js
main().catch(err => {
  console.error('\n💥 SCRAPER RUN FAILED:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
```
🟢 **An uncaught throw turns the Actions run red.** ✅ Verified as the only exit-code mechanism — the workflow step is a bare `run: node scripts/run-scraper.js`.

🔴 **THE PROBLEM WAS THAT ALMOST NOTHING THREW.** Per-site failures, per-write failures and the geocode were all caught and logged. ✅ **CORRECTED V1.1: eight paths that exited 0 on failure now fail the run** — a dead Sheet credential, four empty tabs, zero sites, every site failing, a non-2xx from `inbound-schedule`, a failed Trucks append, and any Pass-A database write failure. Proven by a control run: the old code exits **0** on a broken credential, the new code exits **1**.

---

# 2. THE FULL DATA PATH, STAGE BY STAGE

```
  Truck / venue WEBSITES
        │  Puppeteer + a per-site strategy
        ▼
  Gemini extraction  (gemini-2.5-flash / -flash-lite, temperature 0, JSON mode)
        │
        ├──► GOOGLE SHEET  (Events / Trucks / Venues / Exclusions tabs)   ← AWAITED
        │
        └──► SUPABASE mirrors                                            ← ALL FOUR AWAITED (V1.2)
                 ├─ excluded_terms     :792    ✅ awaited — 🔴 but the write is REFUSED, §4.8
                 ├─ discovery_trucks   :1673   ✅ awaited (V1.1) — was fire-and-forget
                 ├─ discovery_events   :1708   ✅ awaited (V1.1); still writes NO venue_id
                 └─ venues             :1833   ✅ fixed 7 Sep 2026
                                                    │
  discovery_events.venue_id ──── JOIN ─────────────┘
        │  (nothing in the scraper sets it — §2.5)
        ▼
  /api/discovery/events  → venueLat / venueLong → THE MAP
```

## 2.1 Source → Sheet

🔎 `sitesToScrape` (`:456-490`) is built from **two Sheet tabs**:
- **Trucks tab** — `row[8] || row[6]` as the URL, `row[14]` as `ai_instructions`, `row[15]` as the strategy (comma-separated ⇒ **one entry per strategy**, so a truck can be scraped several ways in one run).
- **Venues tab** — `row[9]` as the URL (must start with `http`), `row[10]` instructions, `row[11]` strategy.

🔴 **The site list is the SHEET, not the database.** 🔴 **UNREAD: how many sites are on it.** I cannot open the Sheet, so **the first stage of this pipeline is uncountable from the repository.**

## 2.2 Extraction

🔎 Two models, both `temperature: 0`, both `responseMimeType: 'application/json'` (`:494-503`):
- `modelHeavy` = `gemini-2.5-flash` — event extraction
- `modelLite` = `gemini-2.5-flash-lite` — **venue geocoding**

🔎 `generateContentWithRetry(model, prompt, maxRetries = 3)` (`:235`) — retries, then rethrows on the last attempt.

## 2.3 Where rows are silently dropped

🔴 **Every one of these is invisible from production.** Each prints to stdout in the Actions log and nowhere else; none affects the exit code.

| Line | Drop | Message |
|---|---|---|
| `:576` | Page yielded `< 50` chars | `❌ Empty page content (N chars). Skipping.` |
| `:382` | 🔴 A frame-dump failure returns `[]` | **No message at all** |
| `:545` | Navigation failure | `⚠️ Navigation warning.` — **then it scrapes the page anyway** |
| `:737` | Event date before today | `⏳ Skipping historical event` |
| `:747` | Truck matches an exclusion term | `🚫 Skipping excluded truck term` |
| `:755` | `venueName + notes` contains `private` | `🚫 Skipping private event` |
| `:863` | 🔴 **New venue with no village** | **Silent — no message.** Marked `[⚠️ NEW VENUE]` in the Sheet, never queued for creation |
| `:910` | Any Gemini/parse failure for a site | `❌ AI Failed:` |
| `:912` | Any error for a site | `❌ Error on <site>:` — **loop continues** |
| `:1540`, `:1568` | ✅ **CORRECTED V1.1** — DB write rejected | Both are now **awaited**, and a failure is collected and **fails the run**. Was `console.warn` on a promise nobody awaited. |

## 2.4 The FOUR Supabase mirrors — 🔴 all awaited, and one of them always fails

⚠️ **[CORRECTED V1.2 — this section said "three" and carried three wrong line numbers.]** There are **four** mirrors, not three; the fourth is `excluded_terms`. 🔎 All four sit **after** an awaited `sheets.spreadsheets.values.append`, and 🔎 **all four are `await`ed** — see the load-bearing correction in §3.2.

| Target | Line (V1.2) | Was cited as | Conflict key | Awaited? | Working? |
|---|---|---|---|---|---|
| `excluded_terms` | `:792` | *(absent from this table)* | `term` | ✅ Yes | 🔴 **NO — every write refused, §4.8** |
| `discovery_trucks` | `:1673` | ~~`:1540`~~ | `name` | ✅ **Yes (V1.1)** | ✅ |
| `discovery_events` | `:1708` | ~~`:1568`~~ | `event_date,truck_name,venue_name` | ✅ **Yes (V1.1)** | ✅ |
| `venues` | `:1833` | ~~`:1616`~~ | `name,village` ✅ *(was `name`)* | ✅ **Yes, since 7 Sep 2026** | ✅ |

🧪 **Line numbers re-read 8 September 2026** (`docs/sheet-migration-audit-report.md` §1–2). ⚠️ **They move whenever the script is edited** — the working tree already holds uncommitted changes to `run-scraper.js`. Treat them as a pointer to the right neighbourhood, not an address.

## 2.5 🔴 THE STAGE THAT LOSES EVERYTHING: `venue_id` is never set

🔎 **`:1696-1706`** (~~`:1556-1566`~~ — re-read 8 Sep 2026) — the `discovery_events` row is built as:
```js
{ event_date, start_time, end_time, truck_name, venue_name, village, event_notes, source, ai_notes }
```
🔴 **No `venue_id`. No `discovery_truck_id`.**

🔎 `app/api/discovery/events/route.ts:55-64` joins `venues!venue_id (…latitude, longitude…)` and maps at `:163`:
```js
venueLat: venue.latitude ? parseFloat(String(venue.latitude)) : undefined,
```
🔴 **So an event written by Pass A cannot be pinned, however many venues exist.**

🧪 **EXECUTED against the live API, 7 September 2026:**

| | |
|---|---|
| Events returned | **639** *(at V1.0; 688 future events at V1.1)* |
| **Events with coordinates — V1.0** | **69 — 10.8%** |
| 🎯 **Events with coordinates — V1.1, after the linking pass** | **396** |
| Distinct trucks | **39** |
| **Trucks that can appear on the map — V1.0** | **7 — 18%** |
| Distinct venues that cannot pin — V1.0 | **123** |
| Events with a non-empty postcode | **46** ⚠️ (`postcode` also comes from the venue join, so it is no fallback) |

🟢 **What links them is a separate, deliberately manual tool:** `scripts/backfill-venue-id.ts`. 🔎 Its header: *"EMIT-ONLY by default — this script NEVER writes to the database"*. It emits guarded SQL of **high-confidence** matches for you to run by hand, a JSON snapshot for reversal, and a **CSV of low-confidence matches for review**.

⚠️ `scripts/reresolve-event-venues.ts` is a different tool — it operates on **`truck_events`**, not `discovery_events`, so **it does not affect the discovery map**.

### 🔴 THE UNLINKED BACKLOG — MEASURED, AND IT IS THE MAJORITY

🧪 **8 September 2026: 2,237 of 4,301 `discovery_events` rows have `venue_id IS NULL` — 52.0%.** (`docs/sheet-migration-audit-report.md` §6 measured **2,219 of 4,283 — 51.8%** earlier the same day; the table has since taken 18 new rows. **Both figures are correct for their moment; the ratio has not moved.**)

🔴 **Nothing has linked anything since the hand-run pass on 7 September.** Pass A writes with no `venue_id` (above), and linking is a **separate job that does not run on any schedule** — 🔎 `scripts/backfill-venue-id.ts` is emit-only by design. **The backlog grows by every scrape and shrinks only when a human runs the tool.**

Where the missing venues are (🧪 audit §6, of the 2,219 then measured):

| The unlinked row's `venue_name`… | all | future |
|---|---|---|
| …matches a `venues.name` exactly — **linkable today** | 1,563 | 263 |
| …matches only a **Sheet-only** venue (one of the 345 the DB never received) | 729 | 84 |
| …matches neither | 116 | — |

⚠️ **84 future events cannot be linked at all until the 345 Sheet venues are imported.** That ordering constraint is why venue import precedes the dedup switch in the migration plan.

🔴 **`updated_at` CANNOT DATE ANY OF THIS.** 🧪 **Zero of the 4,301 rows have `updated_at ≠ created_at`** — including the 125 rows repointed by today's venue merge, which changed `venue_id` and left `updated_at` untouched. **The column is written at insert and never maintained.** Do not use it to establish when a row was last touched, and do not add a feature that assumes it means anything. **The linking pass leaves no trace in the row it links.**

---

# 3. THE GOOGLE SHEET'S ROLE, HONESTLY

## 3.1 It is the source of truth for inputs, and currently the more reliable record of outputs

⚠️ **[CORRECTED V1.2 — every line number in this section was wrong, and "all four tabs" was wrong about the Sheet.]**

🔴 **THE SHEET HAS TEN TABS. THE SCRAPER READS FOUR.** 🧪 Enumerated live 8 September 2026: **Events, Logs, Trucks, Venues, Subscribers, Unsubscribes, Vendor Ingest, Manual Checks, Facebook Posts, Exclusions.** The six the scraper never opens are **Apps-Script or human tabs** — `Logs` (the Apps Script's own log, ~19 hours deep and rotated), `Subscribers`/`Unsubscribes` (a form), `Vendor Ingest` (Apps Script), `Manual Checks` and `Facebook Posts` (hand-kept). **Nothing in this repository reads or writes any of the six.**

🔎 **Read from it** — one function, `getTabData` (`:390-396`, range `${tab}!A2:T`), called for the four tabs at **`:436-440`** (~~`:422-427`~~) and guarded by `assertSheetTabsLoaded` at `:448`. The column reads are spread over **`:453-509`**. Those reads drive **which sites are scraped**, **which trucks and venues exist for matching**, **which terms are excluded**, and **the dedup set**.

🔎 **Written to it:** new events **`:1689`** (~~`:1550`~~), new trucks **`:1663`** (~~`:1530`~~), new venues **`:1798`** (~~`:1607`~~), auto-exclusions **`:784`** (~~`:672`~~).

🧪 **AND ITS CONTENTS ARE NOW COUNTED** — this manual previously listed the Sheet as UNREAD. Read live 8 September 2026: **Trucks 152 rows · Venues 933 · Events 713 · Exclusions 146.** Of the 152 truck rows, **109 enter `sitesToScrape`** (a URL in col `I`/`G`, or >10 characters of instructions).

## 3.2 🔴 THE SHEET IS STILL THE MORE COMPLETE RECORD — BUT THE REASON GIVEN HERE WAS WRONG

🔴 **[CORRECTED V1.2 — THIS SECTION TAUGHT THE WRONG LESSON FROM A REAL EVENT. READ THE CORRECTION BEFORE THE CLAIM.]**

**What this section used to say:** *"The Sheet append is `await`ed. Two of the three DB mirrors are not."*

🔴 **THAT IS FALSE. 🔎 ALL FOUR DB MIRRORS ARE `await`ed** (`:792`, `:1673`, `:1708`, `:1833` — every one preceded by `await`, verified by source-read 8 September 2026). The un-awaited writes were real when V1.1 was written that morning and were fixed **the same day**; this section was never updated to match. ⚠️ The venue block's *"DB mirror — parallel run"* comment survives in the code and now describes nothing — **a comment is not an executing line, and this is what happens when a manual quotes one.**

🔴 **THE OBSERVED GAP WAS REAL. ITS CAUSE WAS NOT ASYNCHRONY.** The Sheet did keep gaining venues while the database gained none for three months. 🧪 The measured cause is the **345-venue divergence**: the venue upsert used `onConflict: 'name'` against a constraint that is `(name, village)`, so **every venue write raised 42P10 and wrote nothing** while the Sheet append beside it succeeded (V1.1, "VENUE CREATION BROKEN SINCE 11 JUNE"). **A write that is awaited and fails is indistinguishable, from the Sheet's side, from a write that was never awaited** — and the wrong diagnosis was written down.

🧪 **The gap, measured 8 September 2026** (`docs/sheet-migration-audit-report.md` §3): Sheet **933 venue rows / 897 distinct `(name, village)`** vs **558** in `venues` — **345 in the Sheet and not the database**, 5 the other way. Events are near-parity (Sheet 713 future, DB 706 future); trucks diverge in **both** directions (19 Sheet-only, 98 DB-only).

**So the standing rule survives with a different justification:** if the two disagree on venues, the Sheet is the fuller record — because the database write was **broken**, not because it was **unawaited**.

## 3.3 What depends on it, and what breaks if it goes

| Depends on the Sheet | Effect if removed |
|---|---|
| **The site list** | 🔴 **The scraper has nothing to scrape.** Fatal. |
| **Truck/venue matching** | 🔴 Matching is against **Sheet rows**, not DB rows (`validTrucks`, `venueData`). Every truck and venue would look new. |
| **Exclusions** | 🔴 The exclusion set is the Exclusions tab. Excluded trucks would return. |
| **Dedup** | 🔴 `existingEvents` is built from the Events tab (`:466-472`). Every event would look new. ⚠️ And the set is **FUTURE-ONLY** — §4.5. |
| Truck `aliases`, `scraper_strategy`, `ai_instructions` | 🔴 Read from Sheet columns 17, 15, 14 (`:455-458`, `:484-485`) — **not from the database.** ⚠️ **[QUALIFIED V1.2]** Still true of the *reads* — but 🧪 the DB copies are **complete**: aliases 21/21 agree, `scraper_strategy` 42/42 agree, `ai_instructions` 29/30 (one differs by a single byte). **The only field the database cannot supply is `schedule_url` — 26 of 109 scraped sites.** So "the DB could not replace these" is no longer true for three of the four. |

🔴 **SO THE SHEET IS THE SOURCE, NOT A LOG AND NOT A LEFTOVER. Removing it stops the pipeline dead.** The database is downstream of it in every respect except Pass B.

---

# 4. THE RULES, EXTRACTED FROM THE CODE

## 4.1 Name normalisation — "the washing machine"

🔎 `:48`:
```js
function normalizeName(name) {
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\b(the|street|st|food|ltd|co|company|and)\b/g, '')
        .split(/\s+/)
        .map(word => word.replace(/s$/, ''))
        .join('');
}
```
⚠️ **It strips `street` and `st`.** A venue called *"The Street"* normalises to the empty string, and 🧪 *"The Street"* appears **twice** in the unmatched list (Capel St. Mary, Whatfield).

## 4.2 Fuzzy matching — 1-edit Levenshtein

🔎 `isFuzzyMatch` (`:60`): identical → true; length difference > 1 → false; otherwise **at most one substitution or one insertion**. ⚠️ Applied to *normalised* names, so it is one edit on a smashed-together string.

## 4.3 Truck identification

🔎 **`:871` region** (~~`:762-792`~~ — that range is now the *exclusion* write). If the site is a **truck** page, the truck **is** the site (`finalTruck = site.name`) — no matching. Otherwise: fuzzy-or-substring against Sheet truck names **and aliases**. No match ⇒ new truck, title-cased, queued with 🔴 **`newTruckRow[19] = 'Yes'`** — *"Flag as excluded/pending verification"*. **New trucks arrive excluded and need a human to admit them.**

## 4.4 Venue identification — postcode first, then scored fuzzy

🔎 `:797-852`. If the site is a **venue** page, the venue is the site. Otherwise:
1. **Postcode extraction** from `venueName + village + notes` via `/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i`; if venues share that postcode, score them (fuzzy name +100, substring +5) and take the best.
2. Otherwise **scored fuzzy**: fuzzy name **+100**; substring **+10**, then **+50 if the DB village appears in the event text**, **−20 if it does not**; and **−5** if names differ in length by more than 5. Only `score > 0` qualifies; highest wins.

⚠️ **A second, different matcher exists** — `lib/venue-matcher.ts` `findVenue`, used by `/api/inbound-schedule` and the backfill tools: normalised token overlap, ranked by village agreement, **best-pick on ambiguity**. 🔴 **Two implementations of one question, and they can disagree.**

✅ **CORRECTED V1.1.** `findVenue` had a branch that returned **`high` for a single token candidate without consulting the village at all** (line 81 — *not* 88, which is inside the check that works). It is fixed by hoisting the existing village rule into that branch, plus a **15 km distance ceiling** anchored on other venues in the same village. The multi-candidate two-stage test is byte-for-byte unchanged. See the V1.1 changelog.

## 4.5 Dedup

🔎 **`:988-992`** (~~`:881`~~): an event is a duplicate if **same date** (string equality on `DD/MM/YYYY`) AND **fuzzy-equal truck** AND **fuzzy-equal venue** against `existingEvents` (the Sheet's Events tab, `:466-472`, plus rows added this run, `:1010`).

🔴 **THE DEDUP SET IS FUTURE-ONLY, AND NOT BY DESIGN.** 🧪 Read live 8 September 2026: the Events tab holds **713 rows, every one dated today or later (2026-09-08 → 2027-02-01), and none in the past** — while `discovery_events` holds **3,577 past-dated rows**. 🔎 The scraper only ever *appends* to that tab and contains no `values.clear`, `batchUpdate`, `deleteDimension` or `values.update`. **Something outside this repository empties the tab of past rows, and because the dedup set is built from that tab, that external pruner defines the dedup window.** See §8.

⚠️ **CONSEQUENCE FOR THE MIGRATION.** Rebuilding this set from `discovery_events` (step 4 of the Sheet-migration plan) changes three things: the date format must be re-rendered to `DD/MM/YYYY` or **every event looks new**; the query must reproduce "future only"; and 🔴 **a row deleted from the database stops being suppressed and returns on the next scrape.** Today a hand-deleted row stays deleted *only because the Sheet still remembers it*. See §8.3.

## 4.6 Date handling

🔎 `parseTime` (`:95`) — 🔴 **`7ish` → `19:00`**, and with no am/pm marker, **hours 1–7 are assumed PM**.
🔎 `generateDatesFromRule` (`:137`) — expands recurrence rules over **`for (let i = 0; i < 60; i++)`**, i.e. **60 days ahead**, further clamped by `startLimit` (today, or the rule's `startDate`) and `endLimit` (**today + 365**, or the rule's `endDate`).
⚠️ **So recurring rules generate 60 days; the 365-day figure is only the outer clamp.**

## 4.7 Per-truck strategy and instructions

🔎 `STRATEGIES` (`:34`): `scroll_lazy` (default), `click_next`, `frames`, `manual`, `manual_single`, `scrape_rules`.

| Strategy | Behaviour |
|---|---|
| `manual` | 🔎 No page load. `ai_instructions` become the input: *"SYSTEM OVERRIDE: Extract Recurrence Rules"* → recurring |
| `manual_single` | Same, but *"Extract ONE-OFF events… Do NOT treat these as recurring"* |
| `scrape_rules` | Loads the page, then extracts a **recurring** schedule from its text |
| others | Load, extract one-off events |

⚠️ **Implicit rule:** with any other strategy, if `ai_instructions` contains `weekly` or `recurring`, rule-extraction turns on anyway (`:571`).
🔴 **`scraper_strategy` and `ai_instructions` are read from the SHEET** (Trucks columns 15 and 14), not from `trucks.scraper_rule`.

## 4.8 Exclusions

🔎 Built from the Exclusions tab, normalised (**`:453`**, ~~`:430`~~). Applied fuzzily (**`:851`**, ~~`:744`~~). 🔎 The AI is also asked to return `exclusionsToAdd`, which are appended back to the Sheet (`:784`) and upserted into `excluded_terms` (**`:792`**, ~~`:688`~~) — ⚠️ that write is also `console.warn`-on-error.
🔎 **Hard filter:** any event whose `venueName + notes` contains **`private`** is dropped (`:755`).

## 4.9 Pass B pacing

🔎 `dueWindowHours` (`:962`) = `max(1, 24 / scrape_times_per_day − 1)` → 3×/day = 7h, 1×/day = 23h. Last-run source is **`scraper_run_log`**, deliberately not `trucks.scraper_last_run_at` (*"reset to NULL by test-truck cleanup"*).
🔴 **`shouldRunToday` (`:937`) begins `return true;` with the rest unreachable — the day-of-week gate is disabled.**
🔎 `SCRAPE_TRUCK_ID` scopes Pass B to one truck **and bypasses both pacing gates**.
🔎 A **pre-Gemini text hash** skips extraction when the raw page is byte-identical to last time.

---

# 5. SCHEMA FACTS THAT ARE LOAD-BEARING

## 5.1 `venues`

🔎 `supabase/migrations/20260522_discovery_schema.sql:8-27` creates it with `idx_venues_name` and `idx_venues_village` — **both plain, neither unique.**

🧪 **CONFIRMED LIVE:** the only unique constraint is **`venues_name_village_key` on `(name, village)`**, applied by hand. That index shows **`idx_scan = 0`, `last_idx_scan = null`** while `venues_pkey` shows **4,522 scans** — reads work; **venue writes had never reached it.**

🧪 **Live counts:** **574 venues**, **46 with a NULL village**, **24 where village equals name**, **1 with no coordinates**.

## 5.2 🔴 THE 42P10 DEFECT — A WORKED EXAMPLE

**The code said `onConflict: 'name'`. The constraint is `(name, village)`.**

🧪 **REPRODUCED** against the real schema:
```
OLD key  onConflict:'name'        → 42P10
   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
NEW key  onConflict:'name,village' → inserted, 1 row
SECOND run, same (name, village)   → still 1 row  ✅ no duplicate
```
🔴 **Every venue write failed, every run, for three months — and the run exited 0 every time**, because the error went to `console.warn` on a promise that was never awaited.

## 5.3 🔴 A NULL IN A UNIQUE KEY NEVER CONFLICTS — THIS BROKE THE FIX BEFORE IT WAS CAUGHT

**Changing the key alone would have swapped "always fails" for "always duplicates".**

🧪 **PROVEN:** two identical upserts with `village: null` and the corrected key produced **TWO ROWS**. In a unique index, nulls are **distinct from each other** by default, so `(name, NULL)` never matches `(name, NULL)`.

🔴 **Why null was reachable:** the write took `village: v.village || null` where **`v` was Gemini's reply**, not the queued entry. The queue guarantees a village; the model is only *asked* to echo it back and can drop it.

🟢 **The fix therefore takes the village from the queue and refuses to write a row without one.** ⚠️ **46 existing rows already carry a NULL village and are unreachable by this upsert.**

## 5.4 Other conflict keys

| Table | Key | Note |
|---|---|---|
| `discovery_events` | `event_date,truck_name,venue_name` | ✅ **RESOLVED V1.1** — the index exists; 811 rows landed through it in 30 days, and hand-inserted rows conflict on it as designed. |
| `discovery_trucks` | `name` | ✅ **RESOLVED V1.1** — 12 rows carry the scraper's `'Yes - New Truck'` stamp, so the key resolves. |
| `excluded_terms` | 🔴 **`term` — AND IT DOES NOT EXIST** | 🔴 **RESOLVED V1.2, AND IT IS BROKEN.** The live key is `(truck_id, term)`. Full worked example in §5.6. |

## 5.6 🔴 `excluded_terms` — THE OPPOSITE FAILURE MODE TO `onConflict: 'name'`, AND NOBODY READ THE CHANNEL

🧪 **Read from the LIVE schema 8 September 2026** (PostgREST OpenAPI, not a migration file): `excluded_terms` is `id, truck_id, term, created_at`; **`truck_id` is NOT NULL** and is a foreign key to `trucks.id`; the unique constraint is **`(truck_id, term)`**. 🔎 The shape comes from `supabase/migrations/20260604_exclusion_terms.sql`, whose **first line is `drop table if exists excluded_terms cascade;`** — it *replaced* the `term text not null unique` version in `20260522_discovery_schema.sql:94-98`. ⚠️ **Anyone reading only the schema migration would conclude the scraper is correct. It was — until 4 June 2026.**

🔎 The scraper (`:792-794`) supplies **no `truck_id` at all**:
```js
const { error: exErr } = await supabase.from('excluded_terms').upsert({
  term: ex,
}, { onConflict: 'term', ignoreDuplicates: true });
```

**So every write fails, and it fails twice over:** `onConflict: 'term'` names a constraint that no longer exists → **42P10**; and `truck_id` is NOT NULL → **23502**. 🧪 **The table has 0 rows and has never had any**, while the Sheet's Exclusions tab holds **146** terms.

### 🔴 THIS IS THE OPPOSITE OF THE `onConflict: 'name'` FAULT, AND THE DIFFERENCE IS THE LESSON

| | `venues` — `onConflict: 'name'` (V1.1) | `excluded_terms` — `onConflict: 'term'` (V1.2) |
|---|---|---|
| What happened | the wrong row was silently **KEPT** | the insert is **REFUSED OUTRIGHT** |
| Visible? | ❌ **invisible** — looked like success for three months | ✅ **loud** — every run pushes a message into `dbWriteFailures` (`:795`) |
| Damage | 345 divergent venues, wrong pins on a public map | 0 rows; the Sheet still works, so nothing user-visible broke |
| Duration | 11 June → 7 September 2026 | **4 June 2026 → today, still failing** |

🔴 **AND THAT IS THE POINT: THE LOUD ONE HAS RUN LONGER.** It has been erroring on every scraper run for three months **into a channel nobody reads**. ⚠️ **A failure that announces itself is only better than a silent one if someone is listening.** `dbWriteFailures` is accumulated and surfaced by `assertNoWriteFailures`, and the message has been going to a GitHub Actions run log that no one opens. **Do not treat "it fails loudly" as mitigation anywhere in this manual without also naming who reads the channel.**

⚠️ **THE PREMISE THAT NULLS WOULD MAKE IT DUPLICATE IS WRONG HERE.** A natural guess is that a null `truck_id` would be *stored* and, since nulls are distinct in a unique index (§5.3), every run would insert afresh. **That is not what happens** — `NOT NULL` refuses the row rather than storing it. Same family, opposite direction, and the distinction matters because the remedies are different.

### 🔴 LATENT CONFLICT — TWO FEATURES, ONE TABLE, INCOMPATIBLE MEANINGS

🔎 `app/api/manage/route.ts:2160-2180` reads, upserts and deletes this table **per truck** — `{ truck_id: truck.id, term }` with `onConflict: 'truck_id,term'`. **That feature is correct and matches the live constraint.**

🔴 **But the two features mean different things.** The operator feature means *"**this truck** does not want this term"*. The scraper's exclusion set means *"this string is **not a food truck at all**"* — 🔎 applied globally at `:851` against every extracted name, and its members are things like `TBC`, `live music`, `quiz nights`. **A global term has no `truck_id` to put in a NOT NULL column.** Sharing the table needs a sentinel truck row or a nullable `truck_id` with a partial unique index — and a nullable `truck_id` reintroduces the §5.3 nulls fault for real. **OPEN: no fix is proposed here, and the two features cannot both use this table as it stands.**

## 5.5 `ignoreDuplicates: true`

🧪 It compiles to **`ON CONFLICT DO NOTHING`**. A second run is a **no-op, not an update** — verified: the latitude stayed at its first value. 🔴 **A venue whose coordinates were once wrong will never be corrected by a re-run.**

---

# 6. WHAT IS BROKEN OR UNPROVEN TODAY

| # | Defect | Evidence |
|---|---|---|
| 1 | ✅ **FIXED V1.1** — `discovery_events` write is awaited and fails the run | was `.then()`, `console.warn`, exit 0 |
| 2 | ✅ **FIXED V1.1** — `discovery_trucks` write is awaited and fails the run | was fire-and-forget |
| 3 | 🔴 **STILL OPEN — Pass A sets no `venue_id`** | 🔎 Source-read `:1556-1566`. 🎯 The 312-link backfill took pinnable events **69 → 396**, but **Pass A still writes null**, so **the linking pass must be re-run after every scrape** until Pass A calls `findVenue` at write time. |
| 4 | 🔴 **A venue with no extracted village is never queued** (`:863`) | 🔎 Source-read · 🧪 **19 of 123** unmatched are in this class: **11** where village == name (*Barracks*, *Near the Co op Store*, *Royal Square*…), **8** where village is `Unknown`/blank |
| 5 | ⚠️ **PARTLY ADDRESSED V1.1** — ~123 unmatched venue names; top four carried **121 events** | 🧪 Executed. 312 were linked; *The Bull Pub — Great Paxton* (**42 events**) remains **low-confidence and unapplied** — it would attach to a pub 36 km away. |
| 6 | ⚠️ **`ignoreDuplicates` never corrects a wrong coordinate** | 🧪 Executed |
| 7 | 🔴 **30-mile mislink risk in the low-confidence CSV** | 🧪 *The Bull* exists in **Bottisham and Langley**; *The Plough* in **Great Shelford and Birdbrook** — different pubs sharing a name. A name-only merge puts one pub's customers at the other's coordinates |
| 8 | 🔴 **WITHDRAWN V1.1 — THIS ENTRY WAS WRONG.** It read five unusual venue names as diary entries | 🔴 **Do not read an unusual venue name as bad data.** Pitches are routinely named after the landmark they park beside — *Near the Co op Store*, *Near the Spar Shop*, *Barracks*, *Royal Square* are **real pitches**, and the operator corrected this. The keyword classification over-triggered and is not to be used. |
| 9 | ⚠️ **`shouldRunToday` is disabled** (`return true` then unreachable code) | 🔎 Source-read |
| 10 | ⚠️ **Two venue matchers** — the scraper's scorer and `findVenue` — can disagree | 🔎 Source-read |
| 11 | 🔴 **STILL TRUE — the fixed venue write has never executed** | The upsert *semantics* were proven with a synthetic row; **the scraper has still not been run.** The same now applies to the `discovery_run_log` per-site write (V1.1). |

---

# 7. VILLAGE FOODIE VISIBILITY — WHAT THE DISCOVERY SIDE DOES THAT THE APP DOES NOT

## 7.1 Two independent per-site flags

🔎 `app/api/discovery/events/route.ts:71-74`:
```js
const isHG = isHatchGrabHost(host)
const showCol = isHG ? 'show_on_hg' : 'show_on_vf'
```
🔴 **One row, two audiences.** A truck can appear on Village Foodie and not HatchGrab, or the reverse. **Neither flag exists on the operator side of the app** — this is discovery-only.

## 7.2 How a truck reaches the public map — every gate

🔎 All must hold:
1. `discovery_events.show_on_vf = true` (or `show_on_hg`)
2. `event_date >= today`
3. Under the query's `.limit(1000)` — 🧪 **not binding at 639**
4. 🔴 **`venue_id` resolves to a `venues` row WITH latitude and longitude**
5. 🔎 The joined `discovery_trucks` row carries `excluded`, `show_on_vf`, `show_on_hg` — **new trucks are created with the Sheet's exclusion flag set to `Yes`** (`:787`), so **a newly discovered truck is invisible until a human clears it**

## 7.3 Exclusion is two-layered

🔎 **Sheet-side:** the Exclusions tab, applied fuzzily during scraping — the event is never created.
🔎 **DB-side:** `discovery_trucks.excluded`, plus `excluded_terms`. ⚠️ **[CORRECTED V1.2 — this said the manage route "also reads" the same list, implying one shared exclusion set. It is not one set.]** The manage route reads **per-`truck_id`** terms — a different feature with a different meaning, on the same table, and the scraper's own writes to it are refused. **§5.6.**
⚠️ **A truck that "graduates" to a real HatchGrab customer keeps a scraped shadow row carrying `excluded = true`** so the duplicate stops appearing — which is why a graduated truck can vanish from `/trucks/<slug>`.

---

# 8. DELETION AND RETENTION — WHAT REMOVES ROWS, AND WHAT DOES NOT

**Verified 8 September 2026 against the live schema and the live row set** (`docs/deletion-rules-report.md`). This section exists because two "unexplained deletion events" were investigated and **neither turned out to be a deletion** — and because the rules everyone assumed existed do not.

## 8.1 🔴 Nothing in this repository deletes from `discovery_events`, `discovery_trucks` or `venues`

🔎 **Six independent sweeps, across every file extension** — `.md .ts .tsx .js .mjs .cjs .sql .yml .swift .java .gradle .xml .json .plist` and the rest; **nothing was scoped by extension**, because `run-scraper.js` is `.js` and that mistake has already cost this project a round:

| Sweep | Spelling | Result |
|---|---|---|
| A | `.delete(` chained after `from('<table>')` | **0** for all three |
| B | every `.delete(` anywhere | 90 hits, **none names the three** |
| C | `DELETE FROM` / `TRUNCATE` | only two hand-run rollback runbooks under the **untracked** `docs/sql/` — neither has been run |
| D | raw REST `method:'DELETE'` | 1 hit, the Vercel domains API — not Supabase |
| E | `.rpc(` | 8 sites, all order/buzzer/authorisation |
| F | foreign keys, read from the **live** schema | §8.2 |

## 8.2 No cascade can delete one either

🧪 The complete list of foreign keys pointing **into** the three tables, read from the live PostgREST schema:

| FK | Rule | Effect of deleting the parent |
|---|---|---|
| `discovery_events.venue_id` → `venues` | **ON DELETE SET NULL** | event survives, loses its link |
| `discovery_events.discovery_truck_id` → `discovery_trucks` | **ON DELETE SET NULL** | event survives |
| `truck_events.venue_id` → `venues` | **ON DELETE SET NULL** | operator event survives |
| `outreach_prospects.discovery_truck_id` → `discovery_trucks` | **no clause ⇒ NO ACTION** | 🔴 **blocks the delete** — a discovery truck with a prospect row cannot be deleted at all |

🔴 **Nothing anywhere references `discovery_events`. No cascade can delete an event, by construction.** And 🔎 `lib/delete-truck.ts:54` is correct where it says deleting an operator truck only **SET NULLs** `discovery_trucks.hatchgrab_truck_id` — the discovery shadow survives.

## 8.3 🔴 There is no duplicate rule and no old-event rule. There never has been.

🧪 `discovery_events` holds **3,577 rows dated before today, oldest `2026-05-22`** — the first day of the migration from Sheets — distributed flatly across every month since (May 312 · Jun 1,050 · Jul 1,072 · Aug 955 · Sep 188). **A retention rule of any age would have left a cliff. There is none. No old event has ever been deleted from Supabase.**

🧪 **0 exact duplicates** on `(event_date, truck_name, venue_name)`, and **0 rows with a NULL `venue_name`**. ⚠️ **That is the unique index refusing duplicates at insert, not something removing them afterwards** — the two causes look identical in a row count, and what separates them is that a remover would need a schedule, and §1.2 has none.

**So: if you are looking for the job that prunes duplicates or old events, it is not in this repository and it has never run against the database.**

## 8.4 What DOES prune — the Sheet, from outside this repository

🧪 The Sheet's **Events** tab holds **713 rows, all future, none past** — against 3,577 past rows in the database. 🔎 The scraper only appends to it. 🔴 **An Apps Script project outside this repo prunes that tab, and because `existingEvents` is built from it (§4.5), that pruner defines the dedup window.** The same project writes `discovery_events` and creates `venues` (see WHAT I COULD NOT READ). **Its predicate and schedule are UNREAD.**

## 8.5 The one scheduled delete in the pipeline — and it is not on these tables

🔎 `scripts/run-scraper.js:1268-1274`, called at `:1641` on every run:
```js
const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
await supabase.from('scraper_run_log').delete().lt('run_at', cutoff);
```
**Table: `scraper_run_log`. 90-day retention. Not one of the three.** It is the only `.delete()` the scraper issues.

## 8.6 🔴 `ignoreDuplicates: true` and a deleted venue — V1.1 got this half wrong

V1.1 records `ignoreDuplicates: true` as *"retained deliberately, meaning a re-run never restores a wrong delete."* ⚠️ **The half it gets wrong matters.** 🔎 `:1833` is `ON CONFLICT DO NOTHING`, so once a venue row is **deleted** there is no conflict — **the row DOES come back** on the next scrape that names it. What never comes back is the **hand-applied coordinate**, because a later run can never overwrite an existing row. **A wrong venue delete is repaired into a wrong venue, and the run reports success.**

## 8.7 Still UNREAD

- 🔴 The Apps Script's code, triggers and Events-tab predicate.
- 🔴 Whether a `pg_cron` job or a non-internal trigger exists that no migration records. **`cron.job` and `pg_trigger` are unreachable through PostgREST.** One query in the SQL editor settles it: `select * from cron.job;` and `select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;`
- ⚠️ Whether RLS is enabled on the three tables in production. **No policy in this repository grants DELETE on any of them.**

---

# 9. WHAT MOVED ON 8 SEPTEMBER 2026 — READ THIS BEFORE TRUSTING ANY COUNT ABOVE

## 9.1 Venue consolidation — the CERTAIN tier only

🧪 **15 merges applied, 16 loser rows deleted** (set 1 dropped two), **125 `discovery_events` repointed to the keepers**. **`venues` 574 → 558.**

🧪 Verified after the fact: **0 of the 16 losers remain, 15 of 15 keepers remain, 0 events point at a loser, 125 point at a keeper.** 🔴 **The repointing is the proof it was a deliberate merge and not a delete** — the FK is `ON DELETE SET NULL` (§8.2), so a bare `DELETE` would have left those 125 rows orphaned with `venue_id IS NULL`. **An `UPDATE` ran first. No code path in this repository can do that.**

🔴 **NOT APPLIED, and still open:** the **PROBABLE tier** (19 merges, 0.5–5 km — 🧪 10 sampled losers all still present) and all **four REFUSED sets** (`foodPark`, `The Common`, `Off The Beaten Truck`, `The Street`, plus the 122 distance-rejected pairs and the 43 `Village Hall` rows). ⚠️ Set 16 of the PROBABLE tier still conflicts with a held 29.9 km coordinate correction — **that decision is unresolved.**

## 9.2 Event deletions, and 🔴 THE TOMBSTONE LINK

**6 `discovery_events` rows** were removed as a double-assignment on the `offthebeatentruck.co.uk` / Saffron Walden source — the same trucks had been written against two venue strings for **2026-09-10**.

🧪 **What is verifiable today:** the Sheet's Events tab still holds those six rows — five at `Off The Beaten Truck - The Railway Arms` (Buffalo Joe's, Guerrilla Kitchen, Nomadough, Pizza Mondo, Tikka Tonic) and one at `Saffron Walden (The Common)` (Buffalo Joe's) — and **the database has no row matching them**. The surviving rows for those trucks sit at `Off The Beaten Truck - The Common`, `created_at 2026-09-06T10:24:56`, never modified.

⚠️ **ATTRIBUTION IS OPEN.** `docs/deletion-rules-report.md` §5 attributed these six to the Hatches-Up comparison. That attribution is **not proven** — the surviving rows predate it, and a venue-string difference alone would produce the same Sheet-vs-DB gap. **What is proven is the gap, not its cause.**

🔴 **AND THIS IS THE TOMBSTONE CASE, WRITTEN OUT.** Those six rows stay deleted **only because the Sheet still remembers them and the Sheet is the dedup set**. 🔴 **After step 4 of the Sheet-migration plan — dedup sourced from `discovery_events` — they stop being suppressed and return on the next scrape that sees them. Deleting them again achieves nothing; they return again.** A suppression table (`discovery_event_suppressions`, or a `deleted_at`) is a **precondition** of step 4, not a follow-up. **See §4.5 and the audit's step 4.**

## 9.3 🔴 The Pimp My Fish pack — 4 inserted, 5 REFUSED, nothing deleted

🧪 The pack proposed nine rows. **Four were inserted; five were refused by `ON CONFLICT (event_date, truck_name, venue_name) DO NOTHING`, because a `URL:` scrape had written the same natural key nine seconds earlier** (10:51:55 vs 10:52:04). **All nine events exist today** — four carry `source = 'Manual entry 2026-09-07: …'` and five carry the `URL:` source.

🔎 The pack's own `docs/sql/pmf-events-20260907/00-verify-before.sql:9-16` contains the check that would have caught this — *"None of the nine may already exist on the unique key. Expect 0 rows."* ⚠️ **Either it was not run, or it returned 5 and the delta was never reconciled.** The fault is a skipped pre-check, not a deleter.

⚠️ **THIS CORRECTS `docs/sheet-migration-audit-report.md` §10**, which recorded *"9 were inserted, 4 remain — 5 were deleted by something since"*. **Nothing was deleted.**

🔴 **DISCREPANCY, RECORDED UNRESOLVED.** A subsequent instruction described **4 Pimp My Fish manual/scrape duplicates as deleted**. 🧪 **They are not deleted.** All four `Manual entry 2026-09-07` rows are present with `created_at = updated_at = 2026-09-07T10:52`, so they have never been removed and re-inserted, and all nine PMF future rows are live. **Either that deletion was not applied, or it was applied against a different set. UNRESOLVED — do not assume the duplicates are gone.**

## 9.4 Graduated-truck visibility — a convention deliberately reversed

🧪 `discovery_trucks` for **Real Thai Food**: `visibility = public`, `show_on_vf = true`, `show_on_hg = true`, `hatchgrab_truck_id = real-thai-food`. **This reverses the graduated-truck convention**, under which a truck that signs up has its discovery shadow hidden. **Deliberate.** **Tikka Tonic** was left public by the same decision (`hatchgrab_truck_id = tikka-tonic`, same three flags).

⚠️ **BOTH ROWS ALSO CARRY `excluded = true`.** Per §7.2 that flag is a gate in its own right. **Whether these two trucks actually reach the public map, or whether `excluded` overrides the visibility change, was NOT verified.** **OPEN — check the rendered map before assuming the change took effect.**

---

# WHAT I COULD NOT READ OR VERIFY

- ✅ **[RESOLVED V1.2] The Google Sheet.** 🧪 Read live 8 September 2026: **ten tabs**, of which the scraper reads four — Trucks **152**, Venues **933**, Events **713**, Exclusions **146**. **109 of the 152 truck rows enter `sitesToScrape`**; of those, 67 have a blank strategy and 21 carry aliases. §3.1. ⚠️ Still unread: the six Apps-Script/human tabs' *writers*.
- 🔴 **The GitHub Actions run logs.** Every silent failure in §2.3 prints there and nowhere else. **Whether the scraper is currently succeeding is unreadable from here.**
- 🔴 **Whether the Actions secrets are set or valid.** A different store from Vercel's.
- ✅ **[RESOLVED V1.2 — and one of them WAS a second 42P10.]** `discovery_events` and `discovery_trucks` resolve (§5.4). 🔴 **`excluded_terms` does not: its live key is `(truck_id, term)` and the scraper names `term`. §5.6.** ⚠️ Still UNREAD: the *definitions* — `pg_indexes` is unreachable through PostgREST, so `NULLS NOT DISTINCT` on `venues_name_village_key` remains unread (below).
- 🔴 **Whether `venues_name_village_key` is `NULLS NOT DISTINCT`.** The duplication behaviour was proven empirically; **the index definition was not read** — PostgREST cannot query `pg_indexes`.
- 🔴 **The `discovery_trucks` upsert's conflict key** — not visible in the block I read.
- 🔴 **The Apps Script schedule-image pipeline — STILL NOT IN THIS REPOSITORY, AND NOW KNOWN TO BE LOAD-BEARING.** Referenced at `:1366` (*"Apps Script paths also use gemini-2.5-flash"*). 🧪 Its own Logs tab, read live 8 September 2026, proves three things this manual previously listed as unknown: it **writes `discovery_events` directly** (`"Mirrored N event(s) to Supabase"`), it **creates `venues`** (`"Auto-Created & Geocoded New Venue from Screenshot"` — so `run-scraper.js:1833` is *not* the only venue creator), and it runs roughly every five minutes. 🔴 **Its code, its Events-tab pruning predicate and its schedule are UNREAD and unreadable from here.** It now appears as load-bearing in three separate reports. **Read it at Sheet → Extensions → Apps Script.** ⚠️ The Logs tab covers only ~19 hours and rotates, so it cannot prove the absence of anything.
- ⚠️ **The fixed venue write has never run.** Semantics proven against the real schema with a synthetic row; the scraper itself was not executed.
- ⚠️ **`process-next-truck.yml`** ("Hatchesup Menu Scraper") was read only for its trigger. Its body is unread.
- ⚠️ **Whether the 46 NULL-village venues are duplicates** of properly-villaged rows. Counted, not investigated.
