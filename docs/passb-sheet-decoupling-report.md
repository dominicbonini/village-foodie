# Pass B no longer depends on the Google Sheet

**Date:** 8 September 2026 (evening) · **Change:** `scripts/run-scraper.js`, one file, **+20 / −3**, uncommitted. No migration. No database row inserted, updated or deleted (proven below, not asserted). No Sheet cell touched — every Sheet access in this session was a read by the scraper itself. Nothing staged.

**Evidence tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped — every grep was over `scripts/run-scraper.js` (a `.js` file) and `scripts/geo-validate.js` by path, with no `--include`.

---

## 0. Row counts and working tree — START and END

| | START 17:46 UTC | END 17:50 UTC |
|---|---|---|
| `discovery_events` | 4,300 | 4,300 |
| `discovery_trucks` | 231 | 231 |
| `venues` | 559 | 559 |
| `excluded_terms` | 0 | 0 |
| `scraper_run_log` | **415** | **415** |
| `trucks` | 9 | 9 |
| `truck_events` | 137 | 137 |

🧪 PostgREST `Prefer: count=exact`, service-role key. *If this proved nothing:* an RLS-limited role would under-count identically both times; the service role bypasses RLS, and the same call showed 4,283 → 4,300 across today, so it moves when rows move.

**`git status --short` START** — `scripts/run-scraper.js` was **clean** (🧪 `git status --short scripts/run-scraper.js` printed nothing; `git diff --stat` empty; last commit touching it `6fe8634 2026-09-08 landing and SEO`). STOP condition not met; proceeded.
```
 M app/admin/outreach/page.tsx
 M app/admin/page.tsx
 M docs/reference-manual.md
 M docs/scraper-reference-manual.md
?? components/admin/
?? docs/manual-update-2-report.md
?? docs/sheet-retirement-plan-report.md
```
**END** — identical plus ` M scripts/run-scraper.js` and `?? docs/passb-sheet-decoupling-report.md`. `HEAD` = `origin/main` = `6fe8634`. Nothing staged. 🧪 Both temporary files this session created inside the repo (a HEAD copy of the scraper in `scripts/`, used once as the control) were deleted in the same command that used them; `ls scripts/.claude-*` → no matches.

---

## 1. STEP 2 — THE PREMISE, VERIFIED BY TRACING, NOT BY TRUSTING THE REPORT

🧪 One grep over the whole file for every Sheet-derived name **and** every derived structure **and** the Sheets client itself:

`truckData | venueData | eventData | exclusionData | excludedTerms | validTrucks | validVenues | existingEvents | newTrucksDetected | newVenuesDetected | newRowsToAdd | sitesToScrape | sheets. | emptyTabs | TARGET_NAME`

**Every hit, by line, against the file's block structure** (🔎 `if (RUN_DISCOVERY) {` opens at `:595` and closes `:1063`; Pass B `if (RUN_HATCHGRAB && …) {` runs `:1294-1667`; the second `if (RUN_DISCOVERY) {` — the appends — runs `:1671-1897`):

| Where | Lines | Block |
|---|---|---|
| The read and the derived sets | `:436-518` | top of `main()`, before either pass |
| Declarations shared by both Pass A blocks | `:534-536` (`newRowsToAdd`, `newVenuesDetected`, `newTrucksDetected`) | top of `main()` |
| Pass A loop consumers | `:608, :620, :782, :784, :790, :860, :888, :905, :909, :928, :943, :981, :982, :1002, :1011, :1024` | **inside** `:595-1063` |
| Pass A append consumers | `:1673, :1674, :1675, :1677, :1701-1704, :1708, :1709, :1739, :1740, :1742, :1812` | **inside** `:1671-1897` |
| **Pass B** | **none** | `:1294-1667` |
| Helpers defined between the passes (`shouldRunToday`, `dueWindowHours`, `isDueByLog`, `hashText`, `hashEvents`, `recordRunAndLearn`, `checkEmptySchedule`, `pruneScraperRunLog`) | `:1070-1287` | **none reference any of the names** |

🔎 Pass B's inputs, read in full: `supabase.from('trucks').select(…).not('schedule_url','is',null)` (`:1297-1302`), `scraper_run_log` (`:1311-1315`), the page itself via Puppeteer, Gemini, and the POST to `/api/inbound-schedule` (`:1555`). **Not one byte from the Sheet.**

⚠️ **The two-block scoping trap, checked explicitly:** the names are declared with `const` at the top level of `main()` (`:436`, `:453`, `:455`, `:462`, `:465`, `:478`, `:534-536`) and consumed in **two** separate `if (RUN_DISCOVERY)` blocks. A fix that moved the *declarations* inside the first block would compile (`node --check` passes on unreachable references) and die at `:1673` on the first real discovery run — the shape recorded at `:538-541` as having happened once. **The change below leaves every declaration at its current scope.**

*What a null result would look like:* a grep that failed to run prints nothing. This one printed 40 numbered lines in one command, including the `:392` hit inside `getTabData` — it ran, and it ran over the whole file.

**Premise holds. No Pass B consumer exists. Safe to proceed.**

---

## 2. STEP 3 — THE CHANGE

🔎 Three things were unconditional before the mode was consulted for anything but a log line: the credential guard (`:424`), the Sheets client construction with `JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)` (`:428-432` — which throws on `undefined` even without the guard), and the four-tab read + `assertSheetTabsLoaded` (`:436-450`). All three are now inside `if (RUN_DISCOVERY)`.

```diff
-if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GEMINI_API_KEY) {
+if ((RUN_DISCOVERY && !process.env.GOOGLE_SHEETS_CREDENTIALS) || !process.env.GEMINI_API_KEY) {
   throw new Error("Missing Credentials in .env.local");
 }
+let sheets = null;
+let truckData = [], venueData = [], eventData = [], exclusionData = [];
+if (RUN_DISCOVERY) {
 const auth = new google.auth.GoogleAuth({ … });
-const sheets = google.sheets({ version: 'v4', auth });
+sheets = google.sheets({ version: 'v4', auth });
 console.log("📥 Reading Master Data...");
-const [truckData, venueData, eventData, exclusionData] = await Promise.all([ …four getTabData… ]);
+[truckData, venueData, eventData, exclusionData] = await Promise.all([ …four getTabData… ]);
 const emptyTabs = assertSheetTabsLoaded({ … });   ← unchanged, still on the discovery path
 if (emptyTabs.length > 0) console.log(…);
+} else {
+  console.log('   ⏭️  SCRAPE_MODE=hatchgrab — Google Sheet not read (Pass B uses none of it).');
+}
```
plus a ten-line comment block recording why. **+20 / −3.**

**What it deliberately does NOT do:**
- Does not move `excludedTerms`, `validTrucks`, `validVenues`, `existingEvents`, `sitesToScrape` — they are built as before, from empty arrays in a hatchgrab run, at their current scope. Cost: four trivial loops over `[]`.
- Does not touch `assertSheetTabsLoaded`, `assertSitesToScrape` (`:518`, already gated), `assertSomeSiteSucceeded`, `assertNoWriteFailures`, or any Pass A or Pass B line.
- Does not change the unset-`SCRAPE_MODE` case: 🔎 `RUN_DISCOVERY = MODE !== 'hatchgrab'` (`:413`), so a bare `node scripts/run-scraper.js` still reads the Sheet and still requires the credential — unchanged.
- Does not change the workflows: `hatchgrab_scrape.yml` still passes `SPREADSHEET_ID` and `GOOGLE_SHEETS_CREDENTIALS`. They are now unused by that job; removing them is a separate, later step (sheet-retirement plan §6 step 8) and is not part of "the smallest change".
- Still requires `GEMINI_API_KEY` in both modes — Pass B uses it (`:1484`).

🧪 `node --check scripts/run-scraper.js` → OK. **That is syntax, not verification.**

---

## 3. STEP 4 — PROOF, RUN NOT ASSERTED

### 3.1 The harness, and why the first attempt was not evidence

🔎 The scraper loads `.env.local` itself via `dotenv.config({ path: '.env.local' })` (`:16`, cwd-relative), and dotenv **does not override** a variable already in the environment but **does fill** an absent one. So "unset the credential in the shell" proves nothing if the script runs from the repo root — dotenv puts it straight back. And `source .env.local` under `set -a` breaks on the multi-line credential JSON (🧪 `command not found: private_key:` … `parse error`), which is what happened on the first control attempt, together with the HEAD copy failing to resolve `./geo-validate.js` from the repo root. **Both failures were mine, both printed exit 1, and neither was the exit 1 I was looking for.** Recorded so nobody reads that log as a result.

The harness that actually tests the claim:
- The **non-Sheet** keys (`GEMINI_API_KEY`, Supabase URL + service key, `HATCHGRAB_API_URL`, `INBOUND_SCHEDULE_SECRET`, `BREVO_API_KEY`) parsed by a Python one-liner into a single-line `env.sh` in the scratchpad.
- "No credentials" runs execute with **cwd = the scratchpad**, which has no `.env.local` (🧪 checked), so dotenv loads nothing and `GOOGLE_SHEETS_CREDENTIALS` / `SPREADSHEET_ID` are genuinely absent (🧪 `env | grep -c` → **0**).
- The HEAD copy for the control lives in `scripts/` (same directory as the real file, so `./geo-validate.js` resolves) and is deleted in the same command.

### 3.2 🔴 Zero writes — how each run was made safe, and how that was checked

Pass B writes `trucks` (`scraper_rule`, hashes, `scraper_last_run_at`), inserts `scraper_run_log`, and POSTs to production — **but only for a truck that is DUE**. 🔎 `dueWindowHours` = `24/scrape_times_per_day − 1` = **7 h** for the three candidates (all `3/day`). 🧪 Immediately before the hatchgrab runs: `pizzeria-gusto` 5.36 h, `village-spice` 5.36 h, `test-truck` 5.35 h since their last `scraper_run_log` row → **0 due** → the run takes the `NO-OP` branch (`:1580-1581`): no browser, no scrape, no POST, no truck update, no log row. The only statement Pass B executes on that branch is `pruneScraperRunLog` — a `DELETE … WHERE run_at < now − 90d` — and 🧪 **0 rows are older than 90 days** (count taken at START), so it deletes nothing. The gate was scripted: **the runs abort if any truck is due.**

Discovery-mode runs were made write-free by construction: two of them fail before any scrape (that is what they test); the third uses a `TARGET_NAME` that matches no row, so `sitesToScrape` is empty, `logDiscoverySite` is never called, and no append runs.

🧪 **Checked afterwards, not assumed:** the three operator trucks' `scraper_rule / scraper_last_hash / scraper_last_text_hash / scraper_last_run_at` snapshot is **byte-identical before and after** (`diff` clean); `scraper_run_log` 415 → 415; `truck_events` 137 → 137; `trucks` 9 → 9; `discovery_events` 4,300 → 4,300.

### 3.3 The runs

| # | Code | Mode | Sheet creds | Expected | 🧪 Got | Log line that proves it |
|---|---|---|---|---|---|---|
| **P1 — CONTROL** | **HEAD `6fe8634`** (copy) | hatchgrab | **removed** | exit 1 | **exit 1** | `💥 SCRAPER RUN FAILED: Missing Credentials in .env.local` at `:425` |
| **P2 — THE POINT** | new | hatchgrab | **removed** | exit 0, Pass B reached | **exit 0** | `⏭️ SCRAPE_MODE=hatchgrab — Google Sheet not read` → `🏪 Starting HatchGrab-linked truck schedule scraping...` → `NO-OP: 3 truck(s) enrolled, 0 due` → `✅ scraper_run_log pruned` |
| P3 | new | hatchgrab | present (repo cwd, as the cron runs) | exit 0, identical | **exit 0**, output identical to P2 | same four lines |
| P4 | new | discovery | **removed** | exit 1 at the guard | **exit 1** | `Missing Credentials in .env.local` |
| P5 | new | discovery | present, `SPREADSHEET_ID=this-spreadsheet-does-not-exist` | exit 1 from `getTabData` | **exit 1** | `📥 Reading Master Data...` → `Could not read the "Exclusions" tab … Requested entity was not found.` |
| P6 | new | discovery | present, target `__no_such_truck__` | exit 0, tabs read, 0 sites | **exit 0** | `📥 Reading Master Data...` → `ℹ️ Loaded 698 existing unique events.` → `Pass A sites: 0 extracted, 0 failed, 0 attempted.` → `💤 No new events found.` |
| P7 | `geo-validate.js` | direct call | — | `assertSheetTabsLoaded` throws on four empty tabs | **throws** `Every Google Sheet tab came back empty (Trucks, Venues, Events, Exclusions)…`; partial-empty returns `["Venues","Exclusions"]` | unchanged function, still called on the discovery path (`:459-462`) |

🔴 **What this would look like if the change were doing nothing — and how that was ruled out.** A hatchgrab run that succeeds while the Sheet happens to be reachable is indistinguishable from one that no longer needs it. So the Sheet was not "unreachable"; **the credential and the ID were absent from the process environment, verified by `env` inside the same subshell, from a cwd where dotenv could not restore them.** On the committed code that exact environment produces exit 1 (P1). On the new code it produces exit 0 and reaches Pass B's own log lines (P2). **Same environment, two codes, two outcomes** — the difference is the change. And P3 shows the presence of the credential changes nothing.

🧪 **698** in P6 is the Sheet's dedup set as measured independently two hours earlier (`sheet-retirement-plan-report.md` §2.1) — the tabs were read, and read fully.

### 3.4 The three operator trucks

🧪 `trucks` with `scraper_preference in (auto, both)` and a `schedule_url`: **Pizzeria Gusto** (`pizzeria-gusto`, the trading truck), **Village Spice**, **Pizza Kitchen** (`test-truck`). All three were selected by Pass B in P2 and P3 (`3 truck(s) enrolled`), none was scraped (not due), and their scraper columns are byte-identical before/after (§3.2). The other six `trucks` rows are `manual` with no `schedule_url` and are never in Pass B's query.

---

## 4. WHEN THIS TAKES EFFECT, AND WHAT IS STILL TRUE

🔴 **This takes effect only when committed and deployed.** The scraper runs on GitHub Actions from the checked-out commit; the working tree on this machine is not what the cron runs. Until it is pushed, the hourly job still reads the Sheet and still dies with it.

**Which cron exercises it first:** `hatchgrab_scrape.yml`, `cron: '0 * * * *'` — **the first top-of-the-hour fire after the push.** It will print `⏭️ SCRAPE_MODE=hatchgrab — Google Sheet not read (Pass B uses none of it).` as its third line; that line's presence in the Actions log is the deployed proof. The daily `daily_scrape.yml` at `0 6 * * *` (arriving ~09:2x, per the workflow's own comment) is unaffected in behaviour and will print `📥 Reading Master Data...` exactly as today.

**Still true after this change, deliberately:**
- `hatchgrab_scrape.yml` still *passes* the two Sheet secrets. Unused now; removal is sheet-retirement step 8.
- A discovery run still needs the Sheet and still fails loudly without it (P4, P5, P7).
- 🔎 The `NO-OP` message says `(23h due-window)` while the window for these three trucks is **7 h** — a stale string in a pre-existing log line, cosmetic, not changed here. Likewise `ℹ️ Loaded 0 existing unique events.` prints in a hatchgrab run (it always did, as a count of a set nobody reads there); left alone to keep the edit the size of the defect.

---

## 5. WHERE A DOCUMENT WAS WRONG OR IMPRECISE

| Says | Actual |
|---|---|
| Prompt / plan §7.1: the read at `:436` is unconditional | ✅ correct — and 🔎 **so were the guard at `:424` and the client construction at `:428-432`**; gating the read alone would still have thrown on `JSON.parse(undefined)`. All three are gated. |
| Plan §7.1 / V1.3 §1.4: `getTabData` throws at `:394-395` | ✅ |
| V1.3 §4.9: due window from `scraper_run_log`, 3×/day → 7 h | ✅ 🧪 borne out by the NO-OP with all three at ~5.35 h |
| Pass B NO-OP log: "23h due-window" | ❌ stale text; the computed window is 7 h. Cosmetic. |

**No span of the prompt arrived garbled. No instruction contradicted another** — the apparent tension between "run in hatchgrab mode" and "insert/update/delete no row" was resolved by timing the runs inside the due window and proving the prune touched nothing, rather than by choosing one instruction over the other.
