HatchGrab / Village Foodie — Scraper & Discovery Pipeline Reference Manual · V1.7

**Version 1.7 · 9 September 2026 (night)**

*This documents the discovery pipeline: a separate codebase path, a separate runtime and a separate deploy path from the Next.js app. It exists because this pipeline had never been documented, and that cost three months of silent venue-creation failure — nobody could tell "few trucks scraped" from "few venues created" from "nothing ran", because none of it was written down and every failure exits 0.*

**⚠️ HOW TO READ THIS.** Every claim is marked 🔎 **SOURCE-READ** (I read the code) or 🧪 **EXECUTED** (I ran it against the live API or database). Where something could not be established it says **UNREAD** — not a description of what it probably does. **A plausible state is not a read one.**

🔴 **THE METHOD ERROR THAT MADE THIS MANUAL NECESSARY.** A grep scoped `--include="*.ts"` reported "nothing creates venues" — because `scripts/run-scraper.js` is **JavaScript**. The creator had been there all along. **This pipeline is `.js`; the app is `.ts`. Never scope a search by extension here.**

---

# CHANGELOG

## V1.7 — 9 September 2026 (night) — TWO PROMPTS IN ONE FILE DIFFER BY 37 POINTS ON THE SAME PAGES, THE POSTCODES.IO GAUNTLET TURNS OUT TO GOVERN ONE WRITER OF THREE, AND THE SCREENSHOT UPLOAD IS BUILT BUT HAS NEVER BEEN SEEN RUN

**Delta — new §20 (the extraction landscape: six paths, eight prompts, the 37%/0% finding, the filters as a deviation surface, the live unvalidated geocoder) and §21 (the admin screenshot upload). §16.7 and the V1.1 changelog line corrected a second time. No code changed, no database row touched.** (`extraction-paths-comparison-report.md`, `screenshot-upload-build-report.md`)

### 🔴 THE LOAD-BEARING FINDING — PROMPT WORDING BEATS EVERYTHING AROUND IT

- 🧪 **A (discovery, `:1230`) captures a postcode on 1,100 of 2,952 rows (37%). C (HatchGrab loop, `:2075`) captures one on 0 of 108 (0%).** Same model, **same file**, same Puppeteer capture, same database. 🔎 The only material difference is A's rule 7: *"Postcodes, addresses, or extra event details go into the `Notes` field."*
- 🔴 **Every structural explanation is held constant and cannot account for the gap.** **So prompts must be treated as DATA WITH ONE OWNER AND A VERSION** — a refactor that unifies the code and leaves eight prompt strings scattered has consolidated the part that was not costing anything. §20.2
- ⚠️ **Not fully ruled out:** if C's pages contain no postcodes, 0% is a property of the input. **Checkable from the logged page text; NOT CHECKED. OPEN.**

### 🔴 THE POSTCODES.IO CLAIM IS NARROWED FOR A SECOND TIME — AND THIS TIME IT IS OPERATOR-FACING

- **OLD VALUE (V1.1 `:143`, as narrowed in V1.4):** *"Every coordinate now comes from **postcodes.io** or the venue is stored with none"* → *"true of the scraper only… and false of this script [the Apps Script]"*.
- 🔴 **STILL TOO NARROW.** 🔎 `app/api/manage/geocode/route.ts:16-22` asks Gemini *"You are a geocoding service. Return ONLY a JSON object with the latitude and longitude"* — **no postcodes.io lookup, no sentinel test, no distance check** — and 🔎 three dashboard call sites (`app/manage/[token]/page.tsx:3384`, `:6982`, `:7045`) write the result into **`truck_events`**. ⚠️ The `confidence` the prompt asks for is **discarded**.
- 🧪 **25 of 57 `truck_events` rows with `source='manual'` carry those coordinates (44%), at a 🔴 0% `venue_id` rate**, against the bridge's 61 of 80 (76%) taken from a matched — already validated — venue.
- 🔴 **FIXING ONE WRITER OF A CLASS IS NOT FIXING THE CLASS.** **OPEN, and the highest-priority item in this batch: it is live and operator-facing, on the table the trading truck sells from.** §20.5

### THE OTHER CORRECTIONS

- 🔴 **`scrape_rules` must not be merged.** 🔎 `:1198` emits `freq`/`day`/`startDate`/`endDate` — a recurring **rule**, not a dated event; 🔎 `ExtractedEvent` has no field for any of them. **It is a rule compiler.** §20.3
- ⚠️ **Two scraper inputs have no equivalent anywhere else:** per-site `ai_instructions` (🧪 **30 sites carry hand-written prose rules**) and the six-strategy dispatch, of which 🔎 `manual`/`manual_single` **fetch no page at all**. **A merge that drops either breaks those sites while the run stays green.** §20.4
- 🔴 **Three exclusion matchers, no two alike** — the app's keeps spaces, matches by **substring**, is applied to the **VENUE** name and is scoped **per `truck_id`**, against two global truck-name matchers. **And two invalid-venue lists, 5 entries matched by exact equality against 9 matched by equality-or-`startsWith`** — so *"Closed for refurbishment"* is dropped by one and kept by the other. **Live divergence. OPEN.** §20.6
- ✅ **§19.0 stands unchanged and is restated because it has been mis-cited:** v6.57's vendor-email path has inserted **no** event, ever. The six `Email Scheduler` rows carry the **May migration's** timestamp and a **pre-v6.57 `ai_notes` format**; a silent 401 is ruled out because the screenshot path put **344 post-migration rows through the same mirror**. ⚠️ **"Six events in four months" overstates it — the correct figure is ZERO from this code.**

### THE SCREENSHOT UPLOAD — BUILT, UNVERIFIED

- ✅ A **tab on `/admin`** behind `verifyAdmin`; processed on drop/paste/pick with **no button**; one request in flight; 🔴 **nothing stored server-side** — the browser holds the file, so a failed or empty row can be re-dropped. §21.1
- 🔎 **The Drive defect it replaces:** v6.57 `:748` `setTrashed` sits **after both branches**, so a zero-event result **binned the only copy** while a thrown error kept it. §21.2
- 🔴 **`/api/inbound-schedule` bridges to `truck_events` (`:212`) and EMAILS the operator a dashboard-token link (`:250`)**, gated on a linked truck whose `scraper_preference` is not `manual`. **Recorded as a property of the ROUTE, not of the new page** — the Apps Script and the HatchGrab loop inherit it too. §21.3
- ✅ 🧪 **The new matcher is a strict subset:** 0 trucks refused only by it, 8 refused only by the Apps Script — and those 8 were false positives from `"dis"` normalising to `"di"`. §21.4
- ⚠️ 🧪 **Four live trucks cannot get events from this path** — Just Baked by Sophie, The Linton Kitchen, Dessert MK, Axle & Hop. **Faithful to the old path; a real gap in both; a data problem.** §21.5
- ⚠️ 🧪 **0 rows produced. No admin session is obtainable, so the UI and the auth path have NEVER been exercised. OPEN.** §21.6

### THE STANDING LESSONS FROM THIS PASS

- 🔴 **A measured difference between two prompts is stronger evidence than any reasoning about the code around them.** 37% vs 0% with model, file, fetch and database all held constant settles in one table what a week of reading the surrounding code could not.
- 🔴 **Fixing one writer of a bad-data class is not fixing the class.** The gauntlet was declared for coordinates on 7 September; **two other writers were never enumerated**, and one of them is operator-facing. **Enumerate the writers before declaring a class fixed** — `grep` for the table, not for the fix.
- ⚠️ **Three pagination failures in one pass printed plausible wrong numbers before being caught.** A default page size, an ignored `Range` header, and an error object concatenated into an array each produced a confident, wrong, *small* total. **A paged read that stops early looks exactly like a small dataset.** Assert the fetched length against a `count=exact` header every time.

## V1.6 — 9 September 2026 (late evening) — THE VENDOR EMAIL PATH IS WRITTEN DOWN AS RULES BEFORE ITS TRIGGER IS TURNED OFF, ITS SIX EVENTS TURN OUT NOT TO BE ITS OWN, AND NINETEEN OF §16'S LINE POINTERS DID NOT LAND

**Delta — new §19 (the vendor email path as rules, not code: intake, extraction, identity, write, five anti-requirements, five keeps, the two-domain question left open); §16's `processVendorEmails` and screenshot pointers corrected against the source; no code changed, no database row touched, no Sheet cell touched.** (`vendor-email-rules-report.md`)

### 🔴 THE LOAD-BEARING CORRECTION — THE SIX "VENDOR EMAIL" EVENTS WERE NOT WRITTEN BY THE VENDOR EMAIL PATH

- **The brief's established figure:** *"`discovery_events` holds SIX events from the vendor email path, all May 2026, one truck, none since."* 🧪 **The six rows exist and are one truck (`Spud & Slice`, dates 22–30 May 2026). The attribution is wrong.**
- 🧪 **All six carry `created_at` `2026-05-22T14:58:43.562393+00:00` — inside the 661-row single-second batch that is the one-off `migrate-from-sheets.cjs` Sheet→DB import.** They came from the Sheet, not from this function's mirror.
- 🧪 **Their `ai_notes` is bare `[✉️ Email]`, but 🔎 `:426` writes the action suffix unconditionally. Zero rows in the whole 4,300-row table carry `| [ADD]`, `| [AMEND]` or `| [CANCEL]`.** So the six predate the current format: **v6.57's vendor-email write has never produced an observable database row.**
- ✅ **A silent-401 explanation is RULED OUT by a control, not by a log:** the screenshot path uses the **same** mirror, route and secret and 🧪 produced **344** rows after the migration batch. The mirror works. §19.0
- ⚠️ **But "it processed nothing" still has three holes, and they are recorded rather than glossed:** a CANCEL writes nothing by design; an AMEND can overwrite instead of insert, and 🧪 `updated_at` never diverges from `created_at` on **any** of the 4,300 rows, so that check is **uninformative, not exculpatory**; and the Gmail label counts were not read. §19.0

### 🔴 NINETEEN OF §16'S LINE CITATIONS DID NOT LAND — THE BEHAVIOURS WERE RIGHT, THE POINTERS WERE NOT

- 🧪 Verified every `processVendorEmails` pointer against the original export. **The described behaviour is correct in every case; the line numbers drift by −18 to +9 and are not a constant offset.** Examples: the Exclusions `appendRow` is **`:243`**, not `:232` (`:234` is the `exclusionsToAdd` assignment); the retro-delete is **`:253`**, not `:245` (`:245` is its `logToSheet`); the AMEND/CANCEL replace is **`:429`**, not `:424` (a `tableRows` line); the mirror call is **`:432`**, not `:427`; Trucks `appendRow` **`:340`** not `:349`; Venues `appendRow` **`:362`** not `:380`; contact capture **`:369-373`** not `:401-405`; the Brevo reply **`:463`** not `:456`.
- 🧪 **The drift is not confined to the email path:** `file.setTrashed(true)` is **`:748`**, not `:752`; the screenshot Trucks/Venues appends are **`:679`/`:732`**, not `:668`/`:711`.
- ✅ **All corrected in place in §16.1, §16.2, §16.5, §16.6, §16.7 and §16.8.** ⚠️ **This is why the copy's own header says a line citation is a claim, not a fact.** Only the lines cited in §16 for these two functions were re-verified; **the rest of §16 was not re-checked line by line.**

### ⚠️ ONE EARLIER REPORT IS SUPERSEDED

- `exclusions-provenance-report.md` §7 point 3 concluded *"No other automated writer to the tab is evidenced."* It was written 8 September, **before** the Apps Script was read. 🔎 **There are two writers: `run-scraper.js:784` and `processVendorEmails:243` — and only the second also deletes.** The report's central finding (attribution of individual rows is impossible) is unaffected. §19.5 A1

### 🔴 THE TRIGGER IS BEING DISABLED

- Recorded with **what dies**: truck and venue auto-creation from email, **sender-email capture into Trucks col K / Venues col F — the only automated writer of those columns, and the one loss with no upside**, and the Brevo diff reply (so vendor threads will accumulate unanswered under *Process Schedule*). **The retro-delete and the unguarded exclusion append stop, which is pure benefit.** 🧪 The database is unaffected either way. §19.8

## V1.5 — 9 September 2026 (evening) — A NUMBER CARRIED FORWARD THREE TIMES WAS STILL WRONG, `excluded` TURNS OUT TO GOVERN VISIBILITY AND NOT MATCHING, THE OBVIOUS FIX FOR IT WOULD HAVE STOPPED THE TRADING TRUCK BEING RECOGNISED, AND THREE SWITCHES NOW EXIST OF WHICH NONE MAY BE FLIPPED

**Delta — the migration's first three data steps applied, three source switches built, the auto-exclusion loop closed, and Pass B cut loose from the Sheet. New §17 (where the migration stands), §18 (`excluded`, the cohort and the three real defects), §3.4 (Pass B), §11.2 rewritten from OPEN to CLOSED. No default flipped.** (`migration-steps-1-3-report.md`, `migration-step-3-fix-report.md`, `exclusions-from-switch-report.md`, `sites-from-switch-report.md`, `sites-from-preconditions-report.md`, `sites-from-widened-report.md`, `auto-exclusion-write-report.md`, `match-from-switch-report.md`, `match-from-recheck-report.md`, `passb-sheet-decoupling-report.md`)

⚠️ **Everything here post-dates the body below and the V1.4 entry beneath it, written this morning.**

### 🔴 THE LOAD-BEARING CORRECTION — STEP 1 OF THE MIGRATION DISSOLVED ON INSPECTION

- **OLD VALUE (audit §1 R5 → retirement plan step 1, costed at "~1 h; 81 rows"):** *"81 have a Sheet URL and a null `schedule_url` — the site list cannot be rebuilt from the DB today."*
- 🔴 **FALSE.** 🔎 The rule is `row[8] || row[6]` — Schedule URL **else Website**. 🧪 The Sheet's Schedule URL column is non-empty on **26** rows, all 26 already in the DB byte-identical; the other **80 are WEBSITES**, all already in `discovery_trucks.website`. 🧪 **`coalesce(schedule_url, website)` reproduces the site list 106/106, 0 mismatch. There was nothing to backfill.**
- 🔴 **And doing it would have destroyed the schedule-page/homepage distinction** — after it you could not tell the 26 with a real schedule page from the 80 with only a homepage. **Zero rows were proposed.** §17.2

### ✅ APPLIED — THE DATA GAPS ARE CLOSED

- 🧪 **`discovery_exclusion_terms` created, 143 terms imported**, ⚠️ **4** poison-flagged in the live table against **5** in the import file — one import, one `created_at`, so the SQL run was not the file on disk. **Cause UNRESOLVED, benign.** §17.1
- 🧪 **`venues` 559 → 814**: 255 Sheet-only venues imported — **168 with a postcodes.io coordinate, 88 deliberately coordinate-less**, 38 refused for no village, 36 held as near-duplicates (five of them rows the 8 September merge had deleted). `venues_backup_20260909` holds 559.
- ⚠️ **80% of the Sheet's own venue coordinates are >1 km from their own postcode, median 4.13 km** — the signature of village-centroid geocoding (§16.7). **No Sheet coordinate was imported.** §17.3
- ⚠️ **`venues.scraper_strategy` markers nulled 100 → 0.** 🔴 The **Sheet still holds 342** and `:1981` still writes them, so the two disagree on that column **by design**; the DB is the correct side. §3.4

### 🔴 THREE SWITCHES, NONE FLIPPED — AND THE PATTERN IS THE DURABLE PART

- **The shape:** both sources built every discovery run · diffed for **DECISION equivalence, not set equality** · the flag selects which is USED · 🔴 **an unrecognised value falls back to `sheet` with a message, never to `db`** · failure rules gated on `RUN_DISCOVERY`.
- ✅ **`EXCLUSIONS_FROM` — DEPLOYED.** 🧪 143/143, **0 disagreements** across 176 names.
- ⚠️ **`SITES_FROM` — uncommitted.** 🧪 **116/116, IDENTICAL on every field.** 🔴 **Widened deliberately**: 🔎 the membership rule (**`:871-874`**, ⚠️ *not* `:625-628` — that pointer went stale when `MATCH_FROM` added ~214 lines above it) is `hasUrl || hasInstructions`, so **`ai_instructions` decides whether a truck is scraped at all** — 🧪 `Louigi's Pizza` and `MumTas` are sites only because of it, and a list without it yields 114 where the Sheet yields 116.
- 🔴 **`MATCH_FROM` — uncommitted and NOT equivalent.** 🧪 **64 of 176 truck names and 59 of 931 venue cases decide differently**, including matches to the **WRONG** truck (`Eat Greek → Eat Is Greek`) which a count comparison would have passed. 🧪 **93 Sheet venues the DB cannot match — each becomes a NEW venue on a green run.** §17.5

### 🔴 `excluded` GOVERNS VISIBILITY, NOT MATCHING — NEW, AND IT SURPRISED US

- 🔎 The DB matching builder at **`:705`** is `select('name, aliases')` — **no `excluded` filter, and the column is not even selected.**
- 🧪 **Setting 55 rows `excluded = true` moved the disagreement counts by ZERO**, and **43 of the 64 match to rows that are now excluded** — which is also how the re-run proved it was reading changed data rather than stale.
- 🔴 **AND THE OBVIOUS FIX IS WRONG.** 🧪 `.eq('excluded', false)` resolves **41** and **breaks 14**, because **Pizzeria Gusto, Real Thai Food and Tikka Tonic all carry `excluded = true`** by the graduated-shadow convention (§7.3). **The trading truck would stop being recognised and start being created as new.** The right predicate is nearer *exclude the EMPTY rows*. **OPEN; nothing proposed.** §18.2
- 🔴 **Three genuine matching defects, distinct from the 34 missing ones:** `Between Buns`/`Between Buns Royston` · `Test Kitchen` · **`Pimp My FIsh`/`Pimp My Fish` — one truck stored twice, both active.** §18.3

### ✅ THE AUTO-EXCLUSION LOOP IS CLOSED (§11.2, rewritten)

- 🔎 Repointed to `discovery_exclusion_terms`, **awaited**, failures into `dbWriteFailures`, carrying `term_key`, `source` and 🔴 **`created_by: scraper:<site>`** — provenance the Exclusions tab never had. **`excluded_terms` is no longer written at all.**
- ✅ **The poison guard consults `validTrucks` at last** and refuses any term matching a truck **name or alias**, loudly, writing to **neither** store. 🧪 Refuses `Steak & Honour` by name.
- 🔴 **Order reversed — database first, Sheet second** — so a DB failure skips the Sheet append and the two cannot diverge. ⚠️ The remaining window (DB succeeds, Sheet throws) is **stated, not hidden**.
- ⚠️ The guard reads `validTrucks`, bound to the flag-selected set, **so it follows `MATCH_FROM`.**

### THE 3 SEPTEMBER COHORT, AND THE OLDER ONE

- 🧪 **55 rows created in one instant**, name-only, no URL, no events, unverified, names spanning **Cornwall, London and Cumbria**. Now `excluded`, both show flags false. ⚠️ **A Hatches Up import is INFERRED, not established.**
- ⚠️ **A separate May cohort: 27 zero-event rows** — *not* the 23 previously stated — **untouched**. 🧪 **88 of 231 rows have no event at all.** §18.4

### ✅ PASS B NO LONGER READS THE SHEET

- 🧪 Proven **by running with the credentials genuinely absent**: committed code **exits 1**, new code **exits 0**. ⚠️ Same environment, two codes, two outcomes — a reachable Sheet could not have shown that. §3.4

### ⚠️ CORRECTED — THE TRIGGER OWNERSHIP RISK IS DOWNGRADED

- V1.4 recorded the four Apps Script triggers as *"owned by an account that is not the one viewing… OPEN RISK"*. ⚠️ **They are Dominic's own, on a second Google account** (operator-confirmed; not verifiable from here). 🔴 **The silent-stop property still holds and no monitor exists**, and ⚠️ **frequencies remain UNKNOWN.** §16.1

### THE STANDING LESSONS FROM THIS PASS

- 🔴 **A number repeated three times is not better established than when it was written once.** The audit's "write key", the "81 missing URLs" and the "348 venues" were each carried forward unchallenged, and each was wrong when finally re-derived.
- 🔴 **Matching and visibility read different columns.** Hiding a row does not stop it being matched to — and the fix that looks obvious would have broken the trading truck.
- 🔴 **A forced disagreement against a noisy baseline proves nothing.** Removing an alias against 64 existing disagreements showed 64 → 64; equalising the sets first, then mutating one side, showed 0 → 1 and named the truck.

## V1.4 — 9 September 2026 — THE APPS SCRIPT IS READ: IT NEVER HELD A DATABASE KEY, IT DELETES FROM THE SHEET IN FOUR PLACES AND NEVER FROM THE DATABASE, IT CREATES TRUCKS AND VENUES THE DATABASE NEVER SEES, IT GEOCODES WITHOUT A GAUNTLET, AND ITS FOUR TRIGGERS BELONG TO SOMEONE ELSE

**Delta — one document read for the first time: the Google Apps Script bound to the Sheet, "ULTIMATE MASTER PRODUCTION BUILD (v6.57)", 1,425 lines, copied verbatim to `docs/apps-script/village-foodie-v6.57.js` and documented function by function in new §16. Three claims in this manual and two reports corrected in place. No code changed.** (`docs/apps-script-documentation-report.md`)

### 🔴 THE LOAD-BEARING CORRECTION — IT DOES NOT WRITE THE DATABASE. IT POSTS TO THE APP.

- **OLD VALUE (audit §5, plan §5, this manual §8.4 and UNREAD):** *"An external writer holds a Supabase write key"* / *"writes `discovery_events` directly"*. 🔎 **`mirrorEventsToSupabase:32-52` is a `UrlFetchApp.fetch` of `https://www.villagefoodie.co.uk/api/inbound-schedule` with `INBOUND_SCHEDULE_SECRET`.** The only Supabase key in the file is `SUPABASE_ANON_KEY`, used for one **GET** (`:850`). **The `Drive Screenshot` rows were real; the inference was wrong.** §16.4.
- 🧪 **The data confirms the route:** `Drive Screenshot` rows carry `venue_id` on 426/511 and `discovery_truck_id` on 476/511 — the route's `findVenue` enrichment — while the scraper's own `URL:` rows carry `venue_id` on 1,133/2,952. **Every Apps-Script event went through `findVenue`; no scraper event did.**
- 🔴 **And the route's answer is never checked** — `muteHttpExceptions: true`, no `getResponseCode()`, then `logToSheet("Mirrored …")` unconditionally (`:54`). **A "Mirrored" line in the Logs tab proves a POST, not a write.**

### 🔴 THE RETRO-DELETE — exclusion-poisoning was DESTRUCTIVE, not merely silencing (new §16.2)

- 🔎 `processVendorEmails:230-245`: a model-proposed `exclusionsToAdd` term is appended to the Exclusions tab with the same three checks as `run-scraper.js:780-782` and **no check against the Trucks tab** — **and then every Events-tab row whose truck name contains or is contained by it is deleted.** §11 described the silencing half; **this is the erasing half, and it runs on a time trigger.**
- 🧪 One term (`azaharspanish`) would delete 1 future row today. Who added this afternoon's three removed truck names stays UNRESOLVED — but 🔎 this is the only automated writer of that tab that also deletes.

### 🔴 TWO `isFuzzyMatch`, ONE NORMALISER (new §16.3)

- 🔎 Apps Script `:1243` is **substring containment**; `run-scraper.js:66-92` is **1-edit Levenshtein**. 🧪 `kerief`/`keriefkitchen`: containment TRUE, Levenshtein false; `pizzamondo`/`pizzamundo`: the reverse. 🧪 **The 143 exclusion terms poison 5 Sheet truck names under the scraper's rule and 7 under the script's** (`+ Azahar, Wintringham`) — **and the destructive function uses the looser rule.**
- 🔎 `normalizeTruckKey` and `normalizeName` are **identical regex for regex** and 🧪 **identical on all 3,536 real strings**; the only difference is `String()` coercion (the scraper throws on a number, the script does not).

### 🔴 DELETES NEVER MIRROR; CREATES NEVER MIRROR (new §16.5, §16.6)

- 🔎 **Four `deleteRow` sites** — `removePastEvents:1323`, `removeDuplicateEvents:1314`, the retro-delete `:245`, the AMEND/CANCEL replace `:424` — **none followed by any call outside the Sheet.** **This is the whole explanation for 3,577 past rows in the database against 0 in the Sheet** (§8.3–8.4): the pruner is `removePastEvents`, on a trigger, against the Sheet only.
- 🔴 **A vendor's emailed CANCEL deletes the Sheet row and appends nothing, so the event stays live on the public map.** An AMEND with a venue change adds a second DB row and leaves the old one.
- 🔴 **Hard constraint on the migration, now source-read:** the Sheet is a pruned view and the DB the unpruned ledger **by construction**. `DEDUP_FROM=db` inherits every containment-duplicate and every cancelled row; the suppression table must be fed by these four sites too.
- 🔎 `trucksSheet.appendRow` (`:349`, `:668`) and `venuesSheet.appendRow` (`:380`, `:711`) reach the Sheet only. 🧪 **Of the 348 Sheet-only venues, 203 carry the SCRAPER's marker and 145 are unmarked — so at most 145 (ceiling, not count) are the script's; 122 of those have coordinates and no postcode, the script's exact shape.** The prompt's premise that Sheet-only creation "accounts for" the 348 is **wrong by a majority**: the scraper's 42P10 era does.
- 🔎 `'Yes - New Truck'` has **three writers**: the script → Sheet col T (`:344`, `:666`); the scraper → **DB** `exclude_reason` (`run-scraper.js:1689`, while writing plain `'Yes'` to the Sheet); `migrate-from-sheets.cjs:72`. 🧪 Sheet 22 / DB 12. **The Sheet's are the script's; the DB's cannot be attributed.**

### 🔴 A SECOND GEOCODER, UNVALIDATED (new §16.7)

- **OLD VALUE (V1.1, `:143`):** *"Every coordinate now comes from postcodes.io or the venue is stored with none."* ⚠️ **Corrected: true of the scraper only.** 🔎 Four functions call the Google Maps Geocoding API and write the first result into the Sheet — `:368-374`, `:694-700`, `:1406-1410`, `:780-793` — with **no postcode check, no gauntlet, no sentinel test.** 🧪 **158 `venues` rows carry coordinates and no postcode today.** Step 3 of the plan must run the gauntlet over rows that "already have coordinates".

### THE TRIGGERS, AND AN OPEN RISK (new §16.1)

- 🧪 **Four time triggers, read by the owner from the editor on 9 September:** `removePastEvents`, `removeDuplicateEvents`, `processVendorEmails`, `processFoodTruckScreenshots` — **frequencies UNKNOWN (column cut off); recorded as AUTOMATED, not inferred from the code.** The retro-delete therefore runs **unattended**.
- ⚠️ **[CORRECTED V1.5] All four are "Owned by: Other user" — and that account is DOMINIC'S OWN, a second Google account** (confirmed by the operator, 9 September 2026; not independently verifiable from here). ~~**OPEN RISK.**~~ **The account is not unknown.** 🔴 **The silent-stop property still holds:** if that account loses access all four stop **with no error anywhere** — not in Logs, Actions or the app — and **no monitor exists**. ⚠️ Frequencies remain **UNKNOWN**.
- Also read: `Vendor Ingest`, `Manual Checks`, `Facebook Posts` and the Trucks `Sheet ID` column are **named nowhere in the script** — the plan's open question on `Vendor Ingest` closes (drop). The Logs tab is a **500-row rolling window** (`:83-85`); `file.setTrashed(true)` fires on success **and** on zero events (`:752`); an event with **no truck logo is never emailed** (`:871`); `[⚠️ TIME CLASH]` is written into Events col 9 and read by nothing (`:1303`).

### THE STANDING LESSONS FROM THIS PASS

- 🔴 **"It writes the database" was inferred from timestamps and a log line for three reports. One read of the source overturned it.** A row's `created_at` proves a writer exists, not what key it held.
- 🔴 **A log line written after a fetch with `muteHttpExceptions` is a claim about the fetch, not the result.** Name what the line proves.
- 🔴 **Two functions with one name and different semantics will be read as one function.** The divergence was invisible until both were executed on the same 143 strings.

## V1.3 — 8 September 2026 (afternoon) — THE HEADLINE OF V1.1 AND V1.2 WAS WRONG AGAIN AND IS ONE DAY OLD, A TRUCK CAN BE SILENCED IN THREE PLACES OF WHICH ONE HAS A UI, THE FILTER THAT ATE SIX GOOD EVENTS IS FIXED WHILE THE LOOP THAT POISONS IT IS NOT, AND A RULE I PROPOSED THIS MORNING IS WITHDRAWN BECAUSE I MEASURED IT

**Delta — a documentation pass over seven investigations and two shipped changes (`scroll-lazy-silence-report.md`, `exclusion-check-position-report.md`, `exclusions-provenance-report.md`, `saffron-walden-extraction-report.md`, `truck-radius-report.md`, `ai-notes-postcode-report.md`, `postcode-flag-guard-report.md`). The 51-silent-trucks section rewritten; new §10 (three silencers), §11 (the exclusion filter), §12 (Saffron Walden), §13 (the third guard and two dead rules), §14 (`ai_notes` postcodes), §15 (today's deploy).**

⚠️ **Everything in this entry post-dates the body below and post-dates the V1.2 entry above it, which was written THIS MORNING. Where they disagree, this entry is current.**

### 🔴 THE LOAD-BEARING CORRECTION — THE SILENT-TRUCK DIAGNOSIS WAS WRONG TWICE, AND THE SECOND VERSION WAS ONE DAY OLD

- 🔴 **OLD VALUE (V1.1 heading and V1.2 body): "100% of failures are `scroll_lazy`; every `manual` / `click_next` / `scrape_rules` truck works."** 🧪 **CONTRADICTED.** Of **57 silent site-list trucks: 43 `scroll_lazy` (blank default), 4 `scroll_lazy` (explicit), 10 `manual`.**
- 🧪 **Failure rates: `scroll_lazy` 47/82 = 57%, `manual` 10/22 = 45%.** ⚠️ **Much closer than 100% vs 0%, and PARTLY BASE RATE — 82 of 109 sites are `scroll_lazy`, so it would dominate any failure list even if strategy were irrelevant.** **The original claim was a base rate mistaken for a mechanism.**
- ✅ **The single label is replaced by FOUR DISTINCT CAUSES**: exclusion-filter kills (**proven**, 5), trucks **genuinely with no events** (**not a fault**), **Facebook pages behind logged-out walls** (33), and **10 `manual` trucks that never fetch a page at all and remain UNEXPLAINED**.
- ✅ **[RESOLVED] A Facebook page has now actually been fetched** — 🧪 a 2,272-character logged-out wall, not a listings page. **Nobody had ever fetched one before making claims about them.**
- 🔴 **The 10 `manual` trucks stay OPEN. Do not let the four-cause table read as closed.**

### 🔴 A TRUCK CAN BE SILENCED IN THREE PLACES AND ONLY ONE HAS A UI (new §10)

- `discovery_trucks.excluded` (✅ admin toggle) · **the Sheet's Exclusions tab (🔴 no interface anywhere)** · **hard-coded prose inside a site's `ai_instructions` (🔴 free text, no interface)**. **They share no state and no audit trail.**
- 🔴 **An operator can read `excluded = false` in the console, look fine, and still be silent.** 🧪 Steak & Honour was exactly that.
- 🧪 **The Common's instruction says "Do NOT extract Kerief or Just Baked By Sophie" — and both are on The Common today.** **That pass under-extracts two trucks a week and nothing reports it.** ⚠️ **A rule written as prose ages silently; nothing type-checks a sentence.**

### THE EXCLUSION FILTER — FIXED IN ONE PLACE, STILL OPEN IN ANOTHER (new §11)

- ✅ **FIXED.** 🔎 The check tested the **model's extracted** name **twenty lines before the `finalTruck = site.name` stamp** (now `:859-869` and `:885` — the prompt's `:851` / `:871` are stale) — so on a truck's own page the set was applied to that truck. 🧪 **Steak & Honour lost six correctly-extracted events from a page that fetched, captured and extracted perfectly.** Now gated on `site.sourceType !== 'truck'`; 🧪 **143/143 terms still excluded on a venue page, 0/143 on a truck page.** ⚠️ Accepted cost recorded: **a truck page listing a quiz night will now keep it** (🧪 0 of 143 terms fire there today).
- 🔴 **STILL OPEN: `:784-790` appends the model's raw `exclusionsToAdd` — only the three checks at `:780-782` — and never consults `validTrucks`, which is in scope at `:455`.** **A self-poisoning loop whose only symptom is silence.** ⚠️ **Deferred deliberately** — its guard sits two lines from the awaited-writes hunk and cannot be staged separately.
- ⚠️ **UNRESOLVED: who added or removed the three truck names (146 → 143 rows in two hours).** 🧪 No timestamps, no author column, and **the Drive revision history is unreadable — the Drive API is disabled on project `227274860029`.** 🔴 **I could not tell machine rows from human rows and did not guess.**

### SAFFRON WALDEN — ROOT CAUSE FOUND, FIX STILL OPEN (new §12)

- 🧪 **The URL is listed TWICE in the Venues tab (rows 359/360), so the page is parsed twice per run**, both passes receiving the identical **1,542-char flat `innerText`** with both pitch lists. **Server-rendered — client-side rendering ruled out.**
- 🔴 🔎 **`:920` stamps `finalVenue = site.name` unconditionally for venue-sourced sites, discarding the model's own venue field.** **STILL OPEN, and it affects all 7 venue-page sites, not just this one.**
- **Intermittency is instruction asymmetry:** *stop-at-marker* (The Common, 🧪 obeyed on every date) vs *skip-the-prefix over the longer list* (Railway Arms, 🔴 fails ~25%). 🧪 Reproduced live: 9 trucks returned where the true split is 7 / 2.
- ⚠️ **CORRECTION — OLD VALUE: "on 4 June the same URL produced nine trucks at nine DISTINCT pitches".** 🧪 **The page has only ever had two pitches.** 4 June was 7 rows across 2 pitches. **The substance — 12 of 16 dates are clean — holds.**

### 🔴 TWO RULES DIED THIS AFTERNOON, ONE OF THEM MINE FROM THIS MORNING (new §13)

- 🔴 **POSTCODE ARBITRATION IS WITHDRAWN, NOT GATED.** It minimises **candidate-coordinate to candidate-postcode** — **a quantity with no term for where the EVENT is** — so it elects the tidiest row. 🧪 **`findVenue` alone 11/15; with arbitration 3/15.** 🧪 **It overrode 753 of 1,011 rows** and 🧪 **won one tie from 97 km away.** ⚠️ **It had been validated on ONE case where the right answer and the tidiest row coincided. One passing case is not a control.**
- 🔴 **TRUCK-RADIUS IS A REVIEW TRIGGER, NOT AN AUTO-REJECT** — COMPACT 25 km / REGIONAL 50 km / WIDE 100 km. 🧪 **Catches 15 of 21 known-bad links but ACCEPTS the 44.1 km Swan mislink.** 🧪 **61% of trucks (105/173) have 0 or 1 anchor and must HOLD, never accept.**
- ⚠️ **The gauntlet removed only 7.5% of pairs and HALVED the pooled p95, 383 km → 194 km. Bad coordinates were manufacturing the upper half of the distribution** — the "trucks travel hundreds of km" impression was an artefact.
- ⚠️ **The gauntlet fails 20 venues today, not V1.1's 103.** Those corrections have landed; **V1.1's figure is stale, not wrong-at-the-time.**
- ✅ **SHIPPED: guard three — a postcode DISAGREEMENT FLAG that does not adjudicate.** 🧪 **46.7% confirmed / 34.1% flagged.** 🔴 **`Thirsty` [Cambridge] flags at 24.14 km where the POSTCODE is the wrong half — had the guard been allowed to decide, it would have decided wrongly on its own showcase case.** ⚠️ **205 of 221 rows are UNCHECKED (93%)**, and 🔴 **it sees only UNLINKED candidates, so the already-linked `Worlington` and `Wilbraham` rows that motivated it are invisible to it as wired.**

### `ai_notes` CARRIES POSTCODES AND NOTHING READS THEM (new §14)

- 🧪 **774 of 2,229 unlinked rows carry a full UK postcode. No code path reads it.**
- 🔴 **Coverage is STRUCTURAL, not random: 1,100 of 1,104 come from `URL:` alone; `Drive Screenshot` (511 rows, only `[📱 Drive]`), `hg_scraper`, `hatchesup_scraper` and `Manual Entry` produce ZERO.** ⚠️ **It is not a sample, and any rule needing it is unavailable for 1,455 rows by construction.**
- ⚠️ **Only 146 distinct postcodes — 731 placeable rows are 145 places. 731 of 2,229 = 32.8%.**
- ✅ 🧪 **It gets both known `findVenue` failures right and catches a venue stored 370 km away in Cumbria (`Worlington` / `Workington`) — a class the coordinate gauntlet structurally cannot see, because a coordinate 370 km away is still a valid coordinate.**
- 🔴 **Good at catching, proven bad at choosing. Different jobs.**

### TODAY'S DEPLOY (new §15)

- 🧪 **Three commits, `HEAD` = `origin/main` = `6fe8634`, pushed 17:38.** ⚠️ Two admin files remain uncommitted behind it.
- 🔴 **The scraper's red-on-failure changes mean runs that previously went GREEN MAY NOW GO RED, starting with the 06:00 cron. A red run tomorrow is not automatically a regression** — check which failure it names.
- 🔴 **`supabase/migrations/20260907_discovery_run_log.sql` is WRITTEN AND NOT APPLIED.** The code **warns once on `42P01` and continues**, so the run log **does not exist yet**. ⚠️ A survivable warning is one that is easy to stop noticing.
- ⚠️ **"Deployed" is asserted, not verified here** — I read the commits and the push, not a Vercel build record.

### THE STANDING LESSONS FROM THIS PASS

- 🔴 **A headline can be wrong twice.** "One strategy" survived from V1.1 into V1.2 because nobody re-measured it; the four-cause table exists because someone finally did. ⚠️ **Check the base rate before naming a mechanism.**
- 🔴 **Measure your own proposal before documenting it as a plan.** Postcode arbitration read beautifully and scored **3/15**. **It was killed by the same method that would have prevented it.**
- 🔴 **A guard that would decide wrongly on its showcase case must not be allowed to decide.** That is the entire argument for FLAG over FIX.
- ⚠️ **Fixing one end of a loop is not fixing the loop.** The exclusion filter no longer eats trucks; the writer that puts trucks into it is untouched.

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
- 🔴 **The pruning that does exist acts on the Sheet's Events tab and belongs to the Apps Script outside this repo** — which 🧪 also ~~**writes `discovery_events` directly**~~ ⚠️ **[CORRECTED V1.4: it does NOT write the database directly — it POSTs to `/api/inbound-schedule` with the shared secret; §16.4]** and **creates `venues`** ~~in the database~~ **[V1.4: in the SHEET only; §16.6]**. ~~It is now load-bearing in three reports and its code is **UNREAD**.~~ ✅ **[READ V1.4 — `docs/apps-script/village-foodie-v6.57.js`, §16.]**
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

⚠️ **SUPERSEDED IN PART BY V1.3: the last clause of this heading — "51 SILENT TRUCKS THAT TURNED OUT TO BE ONE STRATEGY" — IS WRONG. There are four causes, not one strategy. See the V1.3 entry and §on the silent trucks.**

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
- ✅ **THE MODEL IS DEMOTED FROM GEOCODER TO POSTCODE SUGGESTER.** ~~Every coordinate now comes from **postcodes.io** or the venue is stored with none.~~ ⚠️ **[CORRECTED V1.4: TRUE OF THE SCRAPER ONLY. The Apps Script still calls the Google Maps Geocoding API from four functions and writes lat/lng straight into the Sheet with no postcode check, no gauntlet and no sentinel test — §16.7. 🧪 158 `venues` rows carry coordinates and no postcode today.]** 🔴 **[FURTHER CORRECTED V1.7: AND A THIRD WRITER IS LIVE IN THE APP — `app/api/manage/geocode/route.ts` → `truck_events`, 🧪 25 of 57 `manual` rows. Fixing one writer was not fixing the class. §20.5]** The model still suggests a postcode; it no longer decides where a place is.
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

### 🔴 THE 51 SILENT TRUCKS — ⚠️ **NOT ONE STRATEGY. FOUR DIFFERENT CAUSES, ONE OF WHICH IS NOT A FAULT** (corrected V1.3)

> 🔴 **THE HEADING ABOVE USED TO END "ONE STRATEGY, NOT FIFTY-ONE FAULTS", AND THAT WAS THE ERROR.** Collapsing them under one label is what stopped anyone fetching a page for a day. 🧪 The four causes, measured 8 September:
>
> | cause | count | status |
> |---|---|---|
> | **Exclusion-filter kills** — the truck's own name is in the Sheet's Exclusions tab | **5** | 🟢 **PROVEN and FIXED** — §4.8, §11 |
> | **Genuinely no events** — the page says so | 2 of 2 Hatches Up pages tested | 🟢 **NOT A FAULT AT ALL** — counting these as failures was a measurement error |
> | **Facebook logged-out walls** | **33** of the 52 non-excluded | 🔴 real capture failure, different fix, **may not be fixable** |
> | **`manual` trucks that never fetch a page** | **10** | 🔴 **UNEXPLAINED — outside every hypothesis this section ever contained** |
>
> ⚠️ 🔎 A `manual` truck sets `cleanText = ""` and builds a rules prompt instead (`:637-641`), **so whatever silences those ten cannot be a fetch or capture problem and cannot be `scroll_lazy`.** OPEN.

- 🔴 **52 URL-SCRAPED TRUCKS HAVE ZERO FUTURE EVENTS. ONLY 44 OF 175 HAVE ANY.**
- 🔴 **[CORRECTED V1.3 — THIS LINE WAS WRONG, AND IT WAS ONE DAY OLD.]** It read: *"THERE IS SEVERE CLUSTERING BY STRATEGY. **100% OF FAILURES ARE `scroll_lazy`. EVERY `manual`, `click_next` AND `scrape_rules` TRUCK WORKS.**"* 🧪 **Measured 8 September: of 57 silent site-list trucks, 43 are `scroll_lazy` (blank default), 4 are `scroll_lazy` (explicit) and 10 are `manual`.** Failure rates: **`scroll_lazy` 47/82 = 57%, `manual` 10/22 = 45%** — close, not 100% vs 0%. ⚠️ **And the clustering is partly base rate: 82 of the 109 site-list entries ARE `scroll_lazy`**, so the strategy dominating the failures is largely the strategy dominating the population. **The date-clustering half of the original claim — 33 separate stop days — still stands.**
- ✅ **[RESOLVED V1.3] A FACEBOOK PAGE HAS NOW BEEN FETCHED.** 🧪 `scroll_lazy` against `A Taste of Jamrock` captured **2,272 characters** — of a **logged-out wall**: "Log in", a cookie-consent dialog, page metadata, and one post truncated at "See more". **No date, no venue, no schedule.** The scroll ran; there was nothing behind it. ⚠️ **One page fetched, not thirty-three.** (`docs/scroll-lazy-silence-report.md`)
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

## 3.4 ✅ PASS B NO LONGER READS THE SHEET (V1.5)

🔎 The four-tab read, the credential requirement and the Sheets client are now gated on `RUN_DISCOVERY`. **Until 8 September the read ran unconditionally**, so a Sheet outage took the three operator trucks' schedule updates down within the hour — for a file 🧪 Pass B uses **not one byte of**, traced consumer by consumer.

🧪 **Proven by running with the credentials genuinely absent from the process environment** (verified with `env`, from a directory where `dotenv` could not restore them): **the committed code exits 1; the new code exits 0** and reaches Pass B's own log lines. ⚠️ **Same environment, two codes, two outcomes** — a Sheet that merely happened to be reachable would not have shown that. (`docs/passb-sheet-decoupling-report.md`)

⚠️ **`venues.scraper_strategy` markers nulled: 100 → 0.** 🧪 All 100 were created in one 9-second burst on 2026-05-22 — the migration — and **none was a site** (all had a null `schedule_url`), which is why nulling them changed no behaviour. 🔴 **THE SHEET STILL HOLDS 342 MARKERS IN COLUMN L AND `:1981` STILL WRITES THEM**, so the two sources now **disagree on that column by design.** **The database is the correct side** — `[⚠️ NEW FROM SCRAPER]` is a provenance marker, not a strategy. ⚠️ The root fix is the Sheet write, which is out of scope and OPEN.

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

🔎 **`:885` region** (~~`:871`~~, ~~`:762-792`~~ — ⚠️ **re-read 8 September (evening): the exclusion-position fix added five lines above this, so `:871` is now stale**; that older range is the *exclusion* write). If the site is a **truck** page, the truck **is** the site (`finalTruck = site.name`) — no matching. Otherwise: fuzzy-or-substring against Sheet truck names **and aliases**. No match ⇒ new truck, title-cased, queued with 🔴 **`newTruckRow[19] = 'Yes'`** — *"Flag as excluded/pending verification"*. **New trucks arrive excluded and need a human to admit them.**

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

🔎 Built from the Exclusions tab, normalised (**`:453`**, ~~`:430`~~). Applied fuzzily (**`:860`**, ~~`:851`~~, ~~`:744`~~ — ⚠️ **re-read 8 September (evening); the V1.3 fix moved it**). 🔎 The AI is also asked to return `exclusionsToAdd`, which are appended back to the Sheet (`:784`) and upserted into `excluded_terms` (**`:792`**, ~~`:688`~~) — ⚠️ that write is also `console.warn`-on-error.
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

🔴 **But the two features mean different things.** The operator feature means *"**this truck** does not want this term"*. The scraper's exclusion set means *"this string is **not a food truck at all**"* — 🔎 applied globally at **`:860`** (~~`:851`~~ — re-read 8 September, evening) against every extracted name, and its members are things like `TBC`, `live music`, `quiz nights`. **A global term has no `truck_id` to put in a NOT NULL column.** Sharing the table needs a sentinel truck row or a nullable `truck_id` with a partial unique index — and a nullable `truck_id` reintroduces the §5.3 nulls fault for real. **OPEN: no fix is proposed here, and the two features cannot both use this table as it stands.**

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
| 12 | ✅ **FIXED V1.3 — the exclusion filter was applied to trucks on their own pages** | 🔎 The check tested the extracted name **20 lines before the `finalTruck = site.name` stamp** (pre-fix `:851` / `:871`; **now `:859-869` and `:885`**). 🧪 **Steak & Honour lost six correctly-extracted events.** Now gated on `site.sourceType !== 'truck'`; 🧪 **143/143 excluded on venue pages, 0/143 on truck pages.** §11.1 |
| 13 | ✅ **CLOSED V1.5 — the unguarded `exclusionsToAdd` append is fixed** | 🔎 Repointed to `discovery_exclusion_terms` (`:1356`), awaited, failures into `dbWriteFailures`; the poison guard now consults `validTrucks` (`:1312`) and refuses any term matching a truck name or alias, writing to NEITHER store. 🧪 Refuses `Steak & Honour` by name. §11.2 |
| 18 | 🔴 **NEW V1.5 — `excluded` GOVERNS VISIBILITY, NOT MATCHING** | 🔎 The DB matching builder at `:705` is `select('name, aliases')` — no `excluded` filter, and the column is not even selected. 🧪 Setting 55 rows `excluded = true` moved the disagreement counts by **ZERO**, and 43 of the 64 match to rows that are now excluded. 🔴 The obvious fix is WRONG — §18 |
| 19 | 🔴 **NEW V1.5 — three genuine matching defects** | 🧪 `Between Buns` / `Between Buns Royston` · `Test Kitchen` · 🔴 `Pimp My FIsh` / `Pimp My Fish` — **one truck stored twice, both active**. No flag setting fixes these. §18.3 |
| 20 | ⚠️ **NEW V1.5 — 88 of 231 `discovery_trucks` rows have ZERO events** | 🧪 55 from the 3 September import (now `excluded`), **27** from the 22 May migration (untouched), 6 others. §18.4 || 14 | 🔴 **STILL OPEN — `:920` stamps `finalVenue = site.name` unconditionally** | 🔎 Source-read. Discards the model's own venue field on **all 7 venue-page sites**. 🧪 Reproduced live on Saffron Walden: 9 trucks returned where the true split is 7 / 2. §12 |
| 15 | 🔴 **STILL OPEN — prose rules inside `ai_instructions` age silently** | 🧪 The Common's instruction says *"Do NOT extract Kerief or Just Baked By Sophie"* and **both are on The Common today** — **that pass under-extracts two trucks a week and nothing reports it.** §10 |
| 16 | 🔴 **STILL OPEN — 10 silent `manual` trucks, UNEXPLAINED** | 🧪 They never fetch a page, so none of the three explained silence causes applies. §on the four causes |
| 17 | ⚠️ **NEW V1.3 — the `discovery_run_log` table does not exist** | 🧪 `supabase/migrations/20260907_discovery_run_log.sql` is **written and NOT APPLIED**; the code warns once on `42P01` and continues. **Nothing is being recorded.** §15 |

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

🧪 The Sheet's **Events** tab holds **713 rows, all future, none past** — against 3,577 past rows in the database. 🔎 The scraper only appends to it. 🔴 **An Apps Script project outside this repo prunes that tab, and because `existingEvents` is built from it (§4.5), that pruner defines the dedup window.** The same project ~~writes `discovery_events`~~ **[V1.4: POSTs to `/api/inbound-schedule`]** and creates `venues` **[V1.4: in the Sheet only]**. ~~**Its predicate and schedule are UNREAD.**~~ ✅ **[READ V1.4 — the predicate is `removePastEvents` (§16.5): every row dated before today in the Sheet's timezone, on a time trigger; frequency UNKNOWN.]**

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

- ~~🔴 The Apps Script's code, triggers and Events-tab predicate.~~ ✅ **[RESOLVED V1.4 — code read (§16); four time triggers listed by the owner on 9 September 2026, frequencies UNKNOWN; predicate is `removePastEvents`.]**
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

# 10. 🔴 THE THREE INVISIBLE SILENCERS — AND ONLY ONE HAS A UI

**A truck can be silenced in three independent places. They share no state, no interface and no audit trail. That they are separate is the finding.** (`docs/exclusions-provenance-report.md`, `docs/scroll-lazy-silence-report.md`, `docs/saffron-walden-extraction-report.md`)

| # | mechanism | where it lives | interface | audit |
|---|---|---|---|---|
| 1 | `discovery_trucks.excluded` | database column | ✅ **admin toggle** (🔎 `app/admin/page.tsx:1362-1370`) and it gates the public API (🔎 `app/api/discovery/events/route.ts:146, 254, 339`) | none |
| 2 | **The Sheet's Exclusions tab** | Google Sheet, one column | 🔴 **NONE. No UI anywhere.** | 🔴 none — no timestamp, no author, single column |
| 3 | **Hard-coded prose inside a site's `ai_instructions`** | Sheet, Venues col K / Trucks col O | 🔴 **NONE, and it is free text** | 🔴 none |

🔴 **An operator can be `excluded = false` in the admin console, visibly fine, and still be silent — because of (2) or (3), neither of which the console shows.** 🧪 That is exactly what happened to Steak & Honour: `excluded = false`, page rendering perfectly, six events extracted correctly, all discarded.

**On (3), the mechanism most likely to be forgotten:** 🧪 the Venues-tab instruction for *Off The Beaten Truck - The Common* contains, verbatim, **"Do NOT extract Kerief or Just Baked By Sophie."** 🧪 On today's page **both of those trucks are listed under The Common.** The instruction hard-codes a truck→pitch assignment that has since changed, so **that pass under-extracts two trucks every week and nothing reports it.**

⚠️ **This is the shape to watch for, not just these three instances: a rule written as prose ages silently.** Nothing type-checks a sentence.

---

# 11. THE EXCLUSION FILTER — FIXED IN ONE PLACE, STILL OPEN IN ANOTHER

## 11.1 ✅ FIXED 8 September 2026 — the check was in the wrong place

🔎 The check tested `normalizeName(truckName)` — the **model's extracted** name — and `continue`d, **twenty lines before the line that sets `finalTruck = site.name` for truck pages.** ⚠️ **POINTERS, RE-READ AGAINST THE COMMITTED FILE 8 September (evening): the check is now `:859-869`, `isExcluded` at `:861`; `finalTruck = site.name` is at `:885`. The prompt-era numbers `:851` / `:871` are STALE — the fix itself added five lines, so the gap reads as 25 now and was 20 before it.** So on a truck's own page the set was asking *"is this truck a non-truck?"* about a truck whose identity was already settled by the site list.

🧪 **Cost: Steak & Honour lost six correctly-extracted events**, from a page 🧪 `scroll_lazy` read perfectly (617 chars, all six with postcodes) and 🧪 the real Gemini prompt extracted perfectly (6 events, valid JSON). **Fetch, capture and extraction all succeeded; the filter threw the result away.**

✅ **The fix (`docs/exclusion-check-position-report.md`):** the match is split into `termHit`, and `isExcluded = termHit && site.sourceType !== 'truck'`. 🧪 **Proven by feeding all 143 tab terms back in against both source types: 143/143 still excluded on a VENUE page, 0/143 on a TRUCK page.** ⚠️ `!== 'truck'` rather than `=== 'venue'` so a source type added later keeps the filter **on** by default.

⚠️ **A near-miss log was added with it**, because without one the fix is invisible — a poisoned term simply stops biting and nobody learns the tab still holds a truck name. 🧪 All three currently-blocked trucks trip it on the next run.

⚠️ **Accepted cost, recorded rather than discovered later: a truck page that lists a quiz night will now keep it.** 🧪 Zero of the 143 terms fire on truck pages today, so nothing is being let through — but the exposure is real.

## 11.2 ✅ CLOSED V1.5 — `exclusionsToAdd` IS REPOINTED AND GUARDED

**What it was** (V1.3–V1.4, quoted so the correction is legible): *"🔴 STILL OPEN: `:784-790` appends the model's raw string to the live exclusion set. Its only checks are non-empty, is-a-string, and not-already-present. `validTrucks` is in scope at `:455` and nothing consults it — a self-poisoning loop whose only symptom is silence."*

✅ **THE WRITE IS REPOINTED.** 🔎 `:1356` now upserts **`discovery_exclusion_terms`** on `term_key`, carrying `term`, `term_key` (the value the fuzzy check actually compares), `source: 'scraper'` and 🔴 **`created_by: scraper:<site name>` — provenance the Exclusions tab never had.** It is **awaited**, and its failure is collected into `dbWriteFailures`, so a failure turns the run red. 🔴 **`excluded_terms` is no longer written at all** — 🧪 it appears in the scraper only in three comments and no executing line, and its 0 rows and `(truck_id, term)` constraint are untouched.

✅ **THE POISON GUARD EXISTS AT LAST.** 🔎 `:1312` builds the known-truck key set from `validTrucks` — the list §11.2 recorded as *"in scope and never consulted"* — and refuses any proposed term whose key matches a truck **name or alias** under the SCRAPER's 1-edit Levenshtein (⚠️ **not** the Apps Script's containment; §16.3 measured 5 terms hitting a truck under one against 9 under the other). 🔴 **The refusal is loud and names the term, the truck it would have silenced and the source URL**, and the term is written to **NEITHER** store. 🧪 It refuses **`Steak & Honour`** by name — the truck the original fault silenced — and refuses via an alias (`la pizza` → `La Piazza`), and refuses a term that normalises to the empty string.

🔴 **THE ORDER IS REVERSED, AND THAT IS THE POINT.** It was Sheet-then-DB, and the DB write was refused every time — so a proposed term reached the Sheet and nothing else, and **the two sources diverged the moment it fired.** That divergence is what blocked `EXCLUSIONS_FROM=db`. It is now **database first, Sheet second**: a DB failure skips the Sheet append, so the term reaches **neither** and the two stay in step, while the run still goes red.

⚠️ **The remaining window, stated rather than hidden:** if the DB write succeeds and the **Sheet** append then throws, the DB has a term the Sheet lacks. Collected and red, but real — and the smaller of the two, because the Sheet is the source currently in use.

⚠️ **The guard reads `validTrucks`, which is bound to the flag-selected set, so it FOLLOWS `MATCH_FROM`** — it governs the same truck list the scraper matches against, whichever source that is. **Renaming that variable would have left the guard silently pointing at the Sheet while matching moved to the database.**

⚠️ **PROVEN BY RUNNING THE BLOCK'S OWN SOURCE TEXT** (96 lines, extracted verbatim) against recording stubs and the live 152 trucks / 28 aliases, across seven branches including the no-op one. 🔴 **NOT proven to land**: there is no local Postgres, so what was proven is the exact payload emitted and that it satisfies the live schema — **the first real insert will be the 06:00 cron.** (`docs/auto-exclusion-write-report.md`)

## 11.3 ⚠️ PROVENANCE OF THE REMOVED ROWS — UNRESOLVED

🧪 The Exclusions tab went **146 → 143 rows** between two readings two hours apart, and the three removed were exactly `Steak & Honour`, `The Noodle & Dumpling Bar` and `Kerief`. **Who removed them, and who added them, is UNKNOWN.**

🔴 **It cannot be established from here.** The tab has no timestamps, no author column and 🧪 zero rows carrying anything beyond column A. 🧪 The Drive revision history — which records `lastModifyingUser` and would settle it outright — **is unavailable: the Drive API is disabled on Google Cloud project `227274860029`.**

⚠️ **What IS established: the automated writer exists, is unguarded, and needs no approval (§11.2), and much of the tab is unmistakably machine-generated** — Facebook page-metadata labels (`Page · Food Truck`), a sentence truncated mid-word, dish names (`TACO TUESDAY`, `WINGS WEDNESDAY`), operator absence text (`Transit Mot due`, `Haircut`). 🔴 **That attributes no specific row, and the three truck names are exactly the rows a human might also have added. I could not tell them apart and did not guess.**

---

# 12. SAFFRON WALDEN — THE ROOT CAUSE, AND WHY IT IS INTERMITTENT

(`docs/saffron-walden-extraction-report.md`)

🧪 **`https://www.offthebeatentruck.co.uk/saffron-walden` is listed TWICE in the Venues tab — rows 359 and 360** — as two separate sites. 🔎 `:501-514` pushes both, so **the page is fetched and parsed twice per run.**

🧪 Both passes receive the identical **1,542-character flat `innerText`** containing BOTH pitch lists. The page is **server-rendered**, not a shell — so client-side rendering is *not* the cause, and that had to be ruled out separately. Truck→pitch association survives only as **document order**; nothing in the text marks the boundary except the address line itself.

🔴 🔎 **`:920` then stamps `finalVenue = site.name` unconditionally for venue-sourced sites, discarding the model's own `Venue Name` field entirely** (`finalVenue` is initialised at `:914`). ⚠️ **`:906` in the task prompt is STALE; `:920` re-read against the committed file 8 September (evening).** So every truck a pass returns is written to that pass's pitch, whatever the model said.

**Why it is intermittent — the asymmetry, which is the whole explanation:**

| row | instruction shape | result |
|---|---|---|
| 359 The Common | *"**stop reading** the moment you see the heading The Railway Arms"* — a **stop-at-marker** rule | 🟢 obeyed on every date |
| 360 The Railway Arms | *"**ignore** the intro text and **the entire list of trucks for The Common**"* — a **skip-the-prefix** rule over the longer list | 🔴 fails ~25% of runs |

🧪 **On all four broken dates the Railway Arms list is a strict superset of The Common's.** The Common pass never leaks the other way — not once in 16 dates. 🧪 **Reproduced live: the Railway Arms pass returned all 9 trucks when the true split is 7 / 2.**

🔴 **`:920` IS STILL OPEN, AND IT AFFECTS EVERY VENUE-PAGE SITE — all 7, not just this one.** ⚠️ Two venue sites (`Nethergate Brewery`, `The White Horse`) were **never fetched**, so "only Saffron Walden is multi-pitch" is **not established**.

⚠️ **CORRECTION.** An earlier account of this said *"on 4 June the same URL produced nine trucks at nine DISTINCT pitches"*. 🧪 **The page has only ever had two pitches.** 4 June was 7 rows across 2 pitches (5 + 2); the nine-row date is 11 June (7 + 2), still one pitch each. **The substance — that clean days are the norm, 12 of 16 — holds.**

---
# 13. THE THIRD LINKING GUARD, AND THE TWO RULES THAT DIED

(`docs/truck-radius-report.md`, `docs/ai-notes-postcode-report.md`, `docs/postcode-flag-guard-report.md`)

## 13.1 🔴 POSTCODE ARBITRATION IS WITHDRAWN — NOT GATED, NOT DEFERRED

**The idea:** when `findVenue` returns several candidates, pick the one whose coordinate is nearest the postcode in `ai_notes`.

🔴 **It is structurally wrong and no threshold rescues it.** It minimises the distance **from a candidate's coordinate to a candidate's own postcode** — a quantity **with no term for where the EVENT is.** It therefore elects **the internally tidiest row**, which is not the same question.

🧪 **Measured on 15 hand-checked rows: `findVenue` alone 11/15 correct; `findVenue` + arbitration 3/15.** 🧪 **It overrode 753 of 1,011 rows** — it is not a tie-breaker, it is a replacement — and 🧪 **one tie was won from 97 km away**.

⚠️ **How it survived to the proposal stage: it was validated on a single case where the right answer and the tidiest row happened to coincide.** One passing case is not a control. **That is the lesson worth keeping, more than the rule itself.**

## 13.2 🔴 TRUCK-RADIUS IS A REVIEW TRIGGER, NOT AN AUTO-REJECT

**Measured ceilings — COMPACT 25 km / REGIONAL 50 km / WIDE 100 km** (`docs/truck-radius-report.md`).

🧪 **They catch 15 of 21 known-bad links — and accept the 44.1 km Swan mislink**, which sits inside a REGIONAL truck's honest range. **A rule that admits a known-bad case must not be allowed to reject on its own.**

🔴 **The reason it can never auto-reject: 🧪 61% of trucks (105 of 173) have 0 or 1 anchor point.** A radius derived from one point is not a radius. **Those trucks must HOLD for review — never ACCEPT, never REJECT.**

⚠️ **A finding worth more than the thresholds: the coordinate gauntlet removed only 7.5% of pairs but HALVED the pooled p95, 383 km → 194 km.** **Bad coordinates were manufacturing the entire upper half of the distribution** — the "trucks travel hundreds of km" impression was an artefact of the data, not of trucks.

⚠️ **The gauntlet fails 20 venues today, not V1.1's 103.** The corrections between have landed. **V1.1's figure is stale, not wrong-at-the-time.**

## 13.3 ✅ SHIPPED — GUARD THREE: A POSTCODE DISAGREEMENT FLAG THAT DOES NOT ADJUDICATE

`scripts/linking-guards.ts`, appended (+99 lines, 0 removals). `POSTCODE_CONFIRM_KM = 0.5`, `POSTCODE_FLAG_KM = 2`; `checkPostcode` returns `CONFIRMED` / `NOTED` / `FLAGGED` / `UNCHECKED{reason}`. 🔴 **It returns a state. It never picks a venue and never rejects one.**

🧪 **46.7% CONFIRMED / 34.1% FLAGGED** on the rows it can see.

🔴 **The case that defines it: `Thirsty` [Cambridge] flags at 24.14 km — and the POSTCODE is the wrong half of that pair, not the venue.** ⚠️ **Had this guard been allowed to decide, it would have decided wrongly on its own showcase case.** That is why it flags.

⚠️ **Two limits, carried forward rather than resolved:**
- 🧪 **In the scripts' future-only scope, 205 of 221 rows are UNCHECKED — 93%.** The guard is real but currently near-silent.
- 🔴 **It sees only UNLINKED candidates.** The already-linked `Worlington` and `Wilbraham` rows — the ones that motivated it — **are invisible to it as wired.**

⚠️ **A correction produced by testing it: there are TWO `Worlington` rows, and one of them is genuinely in Workington, Cumbria.** An earlier account treated them as one row.

---

# 14. `ai_notes` CARRIES POSTCODES AND NOTHING READS THEM

(`docs/ai-notes-postcode-report.md`)

🧪 **774 of 2,229 unlinked `discovery_events` rows carry a full UK postcode**, already extracted from the source page and already stored. 🔴 **No code path reads it.** It is written and never consulted.

🔴 **The coverage is STRUCTURAL, not random — this is the part that decides how it can be used:**

| source | postcode-bearing rows |
|---|---|
| `URL:` | 🧪 **1,100 of 1,104** |
| `Drive Screenshot` (511 rows) | 🧪 **ZERO** — they contain only `[📱 Drive]` |
| `hg_scraper` | 🧪 **ZERO** |
| `hatchesup_scraper` | 🧪 **ZERO** |
| `Manual Entry` | 🧪 **ZERO** |

⚠️ **So it cannot be treated as a sample.** Anything measured on postcode-bearing rows is measured on **web-scraped rows only**, and a rule that needs one will be **unavailable for 1,455 rows by construction, not by chance.**

⚠️ **And the resolution is coarse: only 146 DISTINCT postcodes across 731 placeable rows — 145 places.** 🧪 **731 of 2,229 = 32.8% placeable.**

✅ **What it is genuinely good for — the reason guard three exists at all:** 🧪 it gets **both known `findVenue` failures right**, and 🧪 it catches a venue stored **370 km away in Cumbria** (`Worlington` matched to `Workington`) — **a class of error the coordinate gauntlet structurally cannot see, because a coordinate 370 km away is still a perfectly valid coordinate.**

🔴 **Good at catching. Proven bad at choosing (§13.1). Those are different jobs and the difference is the whole finding.**

---

# 15. WHAT WAS COMMITTED AND DEPLOYED ON 8 SEPTEMBER 2026

🧪 **Three commits today, and 🧪 `HEAD` = `origin/main` = `6fe8634` — pushed:**

| commit | time | subject |
|---|---|---|
| `e024b26` | — | Add category-name and bad-coordinate refusal guards to venue linking scripts |
| `6820d7b` | — | Track scraper reference manual (V1.1 to V1.2) and update app manual to V12.4 |
| `6fe8634` | 🧪 17:38 | landing and SEO |

⚠️ **The tree is NOT empty behind it:** 🧪 at the time of writing `app/admin/page.tsx` and `app/admin/outreach/page.tsx` are still MODIFIED and uncommitted (the Outreach button and the Y/N + upcoming-count table).

🔴 **WHAT THIS CHANGES OPERATIONALLY, STARTING WITH THE 06:00 CRON: the scraper's red-on-failure changes mean runs that previously went GREEN MAY NOW GO RED.** **A red run tomorrow is not automatically a new fault — it may be the first honest report of an old one.** ⚠️ Do not read the first red run as a regression without checking which failure it names.

🔴 **`supabase/migrations/20260907_discovery_run_log.sql` IS WRITTEN AND NOT APPLIED.** 🧪 The file exists (5,469 bytes, 7 Sep 11:59). The code **warns once on `42P01` and continues**, so **the run log does not exist yet and nothing is being recorded into it.** ⚠️ The warning is designed to be survivable, which also means it is easy to stop noticing.

⚠️ **Deployment itself is asserted, not verified from this repository.** What I can prove from here is that the commits exist and are pushed to `origin/main`; **I did not query Vercel, so "deployed" rests on the push plus the user's statement, not on a build record I read.**

---
# 16. THE APPS SCRIPT — READ AT LAST (v6.57)

**Source:** `docs/apps-script/village-foodie-v6.57.js` — a verbatim copy (SHA-256 of the body `7fd1ad21…6827a1`) taken 9 September 2026 from the live editor's export, behind a 26-line reference header. 🔴 **Line numbers below are the ORIGINAL file's; add 26 for the repo copy. The live project is the only one that executes, and this copy will drift silently — diff before trusting a line.**

**What it is:** one bound Apps Script project on the `VillageFoodie_Master` spreadsheet, 1,425 lines, 30 functions. It reads seven tabs (🔎 `getSheetByName`: Events ×5, Venues ×5, Trucks ×4, Exclusions ×2, Subscribers ×2, Logs ×1, Unsubscribes ×1) and 🔎 **never names `Vendor Ingest`, `Manual Checks`, `Facebook Posts` or the Trucks `Sheet ID` column** (grep exit 1 on all four) — so the retirement plan's open question on `Vendor Ingest` closes: **nothing automated reads it; it can be dropped.**

## 16.1 Every function — what it reads, what it writes, and where the write goes

**Triggers, 🧪 as read from the Apps Script editor by the owner on 9 September 2026 — four time-based triggers, all "Owned by: Other user", all 0% error rate.** ⚠️ **The frequency column was cut off; every one is recorded as AUTOMATED, FREQUENCY UNKNOWN. Nothing below infers a schedule from the code.**

| trigger | last run |
|---|---|
| `removePastEvents` | 8 Sep 02:32:13 |
| `removeDuplicateEvents` | 8 Sep 12:48:51 |
| `processVendorEmails` | 8 Sep 18:43:25 |
| `processFoodTruckScreenshots` | 8 Sep 18:30:05 |

⚠️ **[CORRECTED V1.5 — DOWNGRADED FROM OPEN RISK TO A NOTED FACT.] The four triggers belong to a second Google account that is DOMINIC'S OWN** (confirmed by the operator 9 September 2026; ⚠️ user-reported, not verifiable from this repository). The original entry read *"an account that is not the one viewing the editor"*, which was true and read as unknown-owner. 🔴 **What has NOT changed: the silent-stop property.** If that account loses access to the Sheet, the project, or Google Workspace, **all four stop and no error appears anywhere** — not in the Logs tab (which the script itself writes), not in Actions, not in the app. The last-run column above is the only place the stop would show, and only to someone who opens the trigger list.

| function | reads | writes | goes to | how it runs |
|---|---|---|---|---|
| `onOpen` `:89-105` | — | the 🍔 menu | UI | on opening the Sheet |
| `triggerTestEmail` `:107` / `triggerLiveEmail` `:109-121` | — | → `runEmailJob(true/false)`; the live one asks `ui.alert` YES/NO **only if a UI exists** — 🔎 `:113-119`: **with no UI it sends to everyone without asking** | — | **MENU** |
| `runEmailJob` `:814-1018` | 🔎 `discovery_events` from **Supabase via `SUPABASE_ANON_KEY`, READ ONLY** (`:839-855`, `event_date` today…+7d); Trucks (logo/photo/type/`Is Meal?`/`Exclude?`/aliases); Venues (coords, aliases cols N/O/P); Subscribers; Unsubscribes | calls `geocodeNewSubscribers` first (`:817`); Brevo sends (`:1009-1012`); Logs | **Brevo + Sheet (Subscribers coords)**; **no Supabase write** | MENU (via the two triggers above). ⚠️ Not in the trigger list — **UNKNOWN whether it also runs on a timer** |
| `geocodeNewSubscribers` `:767-812` | Subscribers col D postcode, I/J lat-lng | 🔎 Google Maps Geocoding `:780`, then `setValue` lat, lng, village (`:789-793`) | **Sheet** | called by `runEmailJob`; own trigger UNKNOWN |
| `buildHtmlEmail` `:1020-1105`, `sendBrevoBlast` `:1107`, `sendBrevoReply` `:1123` | — | Brevo `POST /v3/smtp/email`, sender `schedule@villagefoodie.co.uk` | Brevo | helpers |
| `processVendorEmails` `:140-481` | Gmail label **Process Schedule** + **Awaiting Retry**; Trucks, Venues, Events, Exclusions | 🔎 Gmail labels (`:168`, `:176`, `:268`, `:270`, `:464`, `:470`, `:473`, `:477`; created `:145-148`); escalation forwards to `ADMIN_EMAIL` (`:175`, `:469`, `:476`); **Exclusions `appendRow` `:243`**; 🔴 **Events `deleteRow` twice — the retro-delete `:253` and the AMEND/CANCEL replace `:429`**; Events `setValues` `:431`; **Trucks `appendRow` `:340`**; **Venues `appendRow` `:362`**; sender email into Trucks col K / Venues col F (`:369-373`); Brevo reply (`:463`); Logs; **`mirrorEventsToSupabase(rowsToAppend)` `:432`** | **Sheet + Gmail + Brevo + (appends only) Supabase via the API** | **AUTOMATED, freq UNKNOWN** + MENU |
| `analyzeEmailWithGemini` `:483-543` | thread text (5,000 chars) + ≤1 image | Gemini 2.5 Flash, JSON, temp 0; asks for `updates[]` with `Action ADD\|AMEND\|CANCEL` **and `exclusionsToAdd[]`** (`:495`, `:501`) | Gemini | helper |
| `processFoodTruckScreenshots` `:545-765` | Drive folder `1D_v3fO…` (`:18`, `:553`); Trucks, Venues, Exclusions | Gemini per image (`:596`); **Trucks `appendRow` `:679`**; **Venues `appendRow` `:732`** (with Google-geocoded lat/lng `:719-726`); Events `setValues` `:740`; **`mirrorEventsToSupabase(finalRows)` `:741`**; 🔴 **`file.setTrashed(true)` `:748` — on success AND on "no valid events"** (both branches reach `:752`; only a thrown error keeps the file); Logs; `Utilities.sleep(15000)` between files | **Sheet + Drive + Supabase via the API** | **AUTOMATED, freq UNKNOWN** + MENU |
| `mirrorEventsToSupabase` `:29-59` | rows | 🔎 **`UrlFetchApp.fetch("https://www.villagefoodie.co.uk/api/inbound-schedule", { payload: { secret: INBOUND_SCHEDULE_SECRET, events } })`** `:32-52` | **Supabase — through the app's route, never directly** | helper. 🔴 **`muteHttpExceptions: true` and NO status check: `logToSheet("Mirrored N event(s)…")` at `:54` runs whatever the route answered.** A 401 (rotated secret) or 500 is logged as success. **The Logs tab's "Mirrored" lines prove a POST was attempted, not that anything was written.** |
| `getExclusions` `:123-130` | Exclusions col A | — | — | helper (normalised set) |
| `removeDuplicateEvents` `:1264-1315` | Events | 🔎 `sheet.deleteRow` `:1314` for duplicates (`:1284-1290`: same date **and** containment-equal truck **and** containment-equal venue **and** village equal-or-blank); **`[⚠️ TIME CLASH]` into col 9** `:1300-1305` | **Sheet only** | **AUTOMATED, freq UNKNOWN** + MENU |
| `removePastEvents` `:1317-1324` | Events | 🔎 `sheet.deleteRow` for every row whose date `< today` in the Sheet's timezone `:1321-1323` | **Sheet only** | **AUTOMATED, freq UNKNOWN** + MENU |
| `sendDailyNewTrucksReport` `:1142-1197` | Events, Trucks (+aliases) | Brevo to `ADMIN_EMAIL`: future events whose truck fuzzy-matches **no** Trucks-tab name | Brevo | MENU; trigger UNKNOWN |
| `fetchVenueGoogleData` `:1352-1367` | Venues lacking website (I) or photo (M) | Google **Places** find+details → `setValue` website col 9, photo col 13 | **Sheet** | MENU |
| `backfillMissingVenueCoords` `:1397-1425` | Venues lacking lat/lng | 🔎 Google Maps Geocoding `:1406`, `setValue` cols 4/5 `:1409-1410` | **Sheet** | **editor only** — not in the menu, not in the trigger list |
| `logToSheet` `:63-86` | — | Logs `appendRow`; 🔎 **`if (getLastRow() > 500) deleteRow(2)`** `:83-85` — a 500-row rolling window | Sheet | helper |
| `normalizeTruckKey` `:1235`, `isFuzzyMatch` `:1240`, `parseEventDate` `:1247`, `normalizeTime` `:1221`, `toTitleCase` `:1214`, `formatFriendlyDate` `:1199`, `calculateDistance` `:1326`, `getMinutesSinceMidnight` `:1333`, `formatEmailImageUrl` `:1342`, `cleanGeminiResponse` `:132` | — | — | — | pure helpers |
| `testFolderAccess` `:1369`, `testLogSheet` `:1383`, `testAllKeys` `:1388` | — | `Logger.log` only | — | editor only |

**Keys** (🔎 `:14-16`, `:33`, `:840-841`, `:1391`): `GOOGLE_API_KEY`, `BREVO_API_KEY`, `GEMINI_API_KEY`, `INBOUND_SCHEDULE_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` — all from Script Properties. 🔴 **There is no service-role key anywhere in the file** (grep for `SERVICE_ROLE` → nothing). See §16.4.

*What the table would look like if it proved nothing:* a function-name inventory. Every "writes" cell above cites the `appendRow` / `setValue` / `setValues` / `deleteRow` / `UrlFetchApp.fetch` line that executes it, and the tab-name census is a grep over `getSheetByName(...)`, not a reading of comments.

## 16.2 🔴 THE RETRO-DELETE — why exclusion-poisoning was DESTRUCTIVE, not merely silencing

🔎 `processVendorEmails:234-253`, executing lines:

```js
exclusionsToAdd.forEach(ex => {                                   // :239  — the MODEL's list (:234)
  const cleanEx = normalizeTruckKey(ex);                          // :241
  if (!Array.from(exclusions).some(existing => isFuzzyMatch(existing, cleanEx))) {
    exclSheet.appendRow([ex]);                                    // :243  — Exclusions tab, no guard
    exclusions.add(cleanEx);
    const tempEvs = eventsSheet.getDataRange().getValues();       // :246
    for (let i = tempEvs.length - 1; i >= 1; i--) {
      if (isFuzzyMatch(normalizeTruckKey(tempEvs[i][3]), cleanEx)) retroRowsToDel.push(i + 1);   // :249-250
    }
    Array.from(new Set(retroRowsToDel)).sort((a,b)=>b-a).forEach(r => eventsSheet.deleteRow(r));  // :253
```

**Three facts, each from an executing line:** (1) the term comes from Gemini's reply with the **same three checks** as the scraper's `:780-782` (string, non-empty, not already present) and **no check against the Trucks tab**; (2) it is appended to the Exclusions tab that **both** this script (`getExclusions`) and 🔎 `run-scraper.js:453` read as their exclusion set; (3) 🔴 **every Events-tab row whose truck name CONTAINS or IS CONTAINED BY the term is deleted, immediately, from the Sheet** — and §16.5 explains why that delete never reaches the database.

**So V1.3 §11 described half the mechanism.** §11 established that a poisoned term *silences* a truck on future scrapes (the filter at `run-scraper.js:860`). **This is the other half: the moment the term lands, the truck's existing FUTURE events are erased from the Sheet** — which is the dedup set, so the scraper then re-adds them on its next run *only to have the filter at `:860` refuse them*. The truck goes from "present" to "gone and unable to return" in one automated step, unattended (§16.1: `processVendorEmails` runs on a time trigger). ⚠️ **And the containment matcher makes the blast radius wider than the scraper's** — §16.3.

🧪 **Measured today against the live Exclusions tab and Events tab:** one term (`azaharspanish`) would retro-delete **1** future Events row right now. The three terms removed this afternoon (`Steak & Honour`, `The Noodle & Dumpling Bar`, `Kerief`, `exclusions-provenance-report.md`) are the shape this produces; **whether they were added by this function or by a person is still UNRESOLVED** (no timestamp, no author, Drive API disabled) — but 🔎 **this is the only automated writer of that tab besides `run-scraper.js:784`, and it is the only one that also deletes.**

## 16.3 🔴 TWO `isFuzzyMatch`, ONE `normalizeName` — verified, not assumed

**The matchers are different functions with the same name:**

| | Apps Script `:1240-1245` | `run-scraper.js:66-92` |
|---|---|---|
| executing rule | `if (str1.includes(str2) \|\| str2.includes(str1)) return true;` | length difference ≤ 1, then at most **one** substitution / insertion (Levenshtein ≤ 1) |
| `kerief` vs `keriefkitchen` | 🧪 **TRUE** (containment) | 🧪 **false** |
| `pizzamondo` vs `pizzamundo` | 🧪 **false** | 🧪 **TRUE** (one edit) |
| `bell` vs `bellinn` | 🧪 **TRUE** | 🧪 false |

🧪 **On the real data: the 143 Exclusions terms fuzzy-match 5 Sheet truck names under the scraper's rule (`Axle & Hop`, `Dessert MK`, `Just Baked by Sophie`, `The Linton Kitchen`, `Off The Beaten Truck`) and 7 under the Apps Script's** — the same five plus **`Azahar`** (term `azaharspanish`) and **`Wintringham`** (terms `wintringhamcommunityday`, `wearewintringham`). **A term that is safe under one matcher poisons under the other, and the destructive one (§16.2) uses the looser rule.** ⚠️ The app's `lib/venue-signature.ts` `venuesFuzzyMatch` is documented as a byte-mirror of the *scraper's* rule; the Apps Script's rule has no mirror anywhere in the repo.

**The normalisers are the same function under two names.** 🔎 Apps Script `:1235-1238` vs `run-scraper.js:55-64`, regex chain by regex chain: `.toLowerCase()` → `.replace(/&/g,'and')` → `.replace(/[^a-z0-9\s]/g,'')` → `.replace(/\b(the|street|st|food|ltd|co|company|and)\b/g,'')` → `.split(/\s+/)` → `.map(w => w.replace(/s$/,''))` → `.join('')`. **Identical, character for character, in every regex and every step.** 🧪 **Run over 3,536 real strings** (every Sheet truck name, venue name, village, exclusion term and Events-tab truck/venue): **3,536 identical outputs, 0 different.** The one difference is the guard: the Apps Script wraps the input in `String(name)`; the scraper calls `.toLowerCase()` on it directly — 🧪 `normalizeName(46276)` **throws** (`name.toLowerCase is not a function`), `normalizeTruckKey(46276)` returns `"46276"`. Relevant because Sheet cells can be numbers or Dates (the Events date column *is* serial numbers, `sheet-retirement-plan-report.md` §2.2); the scraper only ever receives strings because it reads with `FORMATTED_VALUE`.

## 16.4 🔴 HOW IT REACHES SUPABASE — and the correction to two reports

🔎 `mirrorEventsToSupabase:32-52`: it builds nine-column rows and **`UrlFetchApp.fetch("https://www.villagefoodie.co.uk/api/inbound-schedule", { method:'post', payload: JSON.stringify({ secret: INBOUND_SCHEDULE_SECRET, events }) })`**. 🔎 `SUPABASE_ANON_KEY` appears in exactly two places: `runEmailJob:841` (declared) and `:850-851` (headers of a **GET** on `/rest/v1/discovery_events`). **No PostgREST write, no service key, no `insert`/`upsert` anywhere in the file.**

⚠️ **CORRECTION.** `docs/sheet-migration-audit-report.md` §5 wrote: *"**An external writer holds a Supabase write key.** ▶ `Drive Screenshot` rows were created in `discovery_events`…"* and §10: *"The `created_at` timestamps of `Drive Screenshot` rows prove a direct DB writer exists; its identity and key are inferred (⚠), not read."* `docs/sheet-retirement-plan-report.md` §5 repeated it: *"it holds a Supabase write key"*. This manual's §8.4 and its UNREAD list said *"writes `discovery_events` directly"*. **All of those are corrected in place (V1.4).** The `Drive Screenshot` rows and their :30-past-the-hour timestamps were real; the inference from them was wrong. **The writer is the app's own route, keyed by the shared `INBOUND_SCHEDULE_SECRET` — the same route Pass B uses.** The audit's own §10 hedge ("inferred, not read") was the right instinct.

**What `/api/inbound-schedule` does with what it receives** (🔎 `app/api/inbound-schedule/route.ts`):
1. `:41` refuses without the secret (**401**) — which the Apps Script would log as *"Mirrored"* (§16.1).
2. `:50-62` maps each event, **`toISODate(e.event_date)`** (`DD/MM/YYYY` → ISO), drops rows with no date or no truck.
3. `:67-68` loads every `discovery_trucks` name and every `venues` row once; `:76` resolves each row's venue with **`findVenue`** (`lib/venue-matcher.ts`); `:82-89` resolves `discovery_truck_id` by containment on `normName`.
4. `:107-111` **upserts `discovery_events` on `(event_date, truck_name, venue_name)` with `ignoreDuplicates: false`** — i.e. **`ON CONFLICT DO UPDATE`**: a re-POST of an existing key **overwrites** times, notes, `venue_id`, `discovery_truck_id` and the visibility flags (`visibility:'public'`, `show_on_vf/hg: true`, `:98-100`). ⚠️ **That is the opposite of the scraper's own DB mirror** (`run-scraper.js:1721`, no `ignoreDuplicates` flag → also DO UPDATE, but with no `venue_id` in the payload) and of the venue upsert (`DO NOTHING`).
5. `:119-248` **bridges** rows whose truck matches a `discovery_trucks.hatchgrab_truck_id` into `truck_events` — after the operator's `scraper_preference` gate, **reject-memory** (`rejected_event_signatures`, `:163-171`) and dedup — then emails the operator.

🧪 **The data agrees with the trace:** `Drive Screenshot` rows carry `venue_id` on **426 of 511** and `discovery_truck_id` on **476 of 511** — the route's enrichment — while `URL:` rows written by the scraper's own mirror carry `venue_id` on only 1,133 of 2,952 (the hand backfills). **Every Apps-Script event in the database went through `findVenue`; every scraper event did not.** That is why the map shows screenshot events pinned and scraper events not (V1.3 §2.5), and it is a second reason the scraper should write through the same route.

## 16.5 🔴 DELETES NEVER MIRROR — the Sheet and the DB disagree BY DESIGN

Four `deleteRow` sites, none with a counterpart call to anything outside the Sheet:

| site | what it deletes | mirrored? |
|---|---|---|
| `removePastEvents:1321-1323` | every row dated before today (Sheet tz) | 🔎 **no** — the function body is one loop and one `deleteRow` |
| `removeDuplicateEvents:1314` | containment-duplicates on (date, truck, venue, village) | 🔎 **no** |
| `processVendorEmails:253` — the retro-delete | every row whose truck contains / is contained by a new exclusion term | 🔎 **no** |
| `processVendorEmails:429` — the AMEND / CANCEL replace | the old row for an amended or cancelled event | 🔎 **no** — and 🔴 **for a CANCEL nothing is appended either (`:409-414` builds only a strike-through table row), so `mirrorEventsToSupabase` is never called: a vendor's emailed cancellation removes the event from the Sheet and leaves it live on the public map.** For an AMEND the new row is appended and mirrored (`:426`, `:431-432`), which **updates** the DB row if date/truck/venue are unchanged (§16.4 step 4) or **adds a second row** if the venue changed — the old one stays. |

**This is the whole explanation for 🧪 3,577 past-dated rows in `discovery_events` against 0 in the Sheet** (V1.3 §8.3–8.4): `removePastEvents` runs on a trigger against the Sheet and only the Sheet. There was never a database rule to find.

🔴 **HARD CONSTRAINT ON THE MIGRATION** (`sheet-retirement-plan-report.md` §2.1 assumed this; it is now source-read): **the Sheet's Events tab is a pruned view and the database is the unpruned ledger, by construction.** Moving the dedup set to the database inherits every row the Sheet has removed — past rows (harmless, filtered by `event_date >= today`), **duplicates the containment rule folded (not harmless: the DB's unique index is exact, so containment-duplicates like `The Bell` / `The Bell Inn` exist there as two rows and will both be dedup targets)**, and **every cancelled and retro-deleted row**, which are the tombstones. The suppression table in the plan must be written **by this script's four delete sites too**, or the plan's `DEDUP_FROM=db` flip brings back everything vendors have cancelled by email.

## 16.6 🔴 SHEET-ONLY CREATION — new trucks and venues never reach the database

🔎 `trucksSheet.appendRow(newTruckRow)` at `:340` (emails) and `:679` (screenshots); `venuesSheet.appendRow(newVenueRow)` at `:362` and `:732`. **No call follows either that leaves the Sheet.** `mirrorEventsToSupabase` carries only the nine event columns (`:35-45`) — a new truck's *events* reach the database (through the route, which then fails to resolve a `discovery_truck_id` for a truck that exists only in the Sheet), the truck row does not.

**Does this account for the 348 Sheet-only venues? Partly, and measurably not mostly.** 🧪 Of the 348 distinct `(name, village)` pairs in the Sheet and not the database: **203 carry the scraper's own marker `[⚠️ NEW FROM SCRAPER]` in column L** (🔎 written by `run-scraper.js:1806-1808`; 🔎 the Apps Script writes **no** marker — `newVenueRow` at `:359-361` fills only cols A, B, D, E). Those 203 are the 42P10-era scraper venues of V1.1 §3.2. **The remaining 145 have a blank column L**, which is what *both* the Apps Script and a human produce; 🧪 **122 of those 145 carry coordinates and no postcode — exactly the shape `:359-361` writes (lat/lng from Google, no postcode column)**, and 0 carry an owner email. ⚠️ **So: at most 145 of the 348 are Apps-Script-created, and probably around 122; the majority are the scraper's. Human-added rows are indistinguishable from the script's, so 145 is a ceiling, not a count.**

**Is `newTruckRow[19] = 'Yes - New Truck'` the origin of that `exclude_reason` value? Of the SHEET's, yes; of the DATABASE's, no — the string has three writers.** 🔎 The Apps Script writes `'Yes - New Truck'` into Trucks col T at `:337` and `:677`. 🔎 The scraper writes plain `'Yes'` to the Sheet (`run-scraper.js:906`) **but `exclude_reason: 'Yes - New Truck'` to the database** (`:1689`). 🔎 `migrate-from-sheets.cjs:72` copied col T into `exclude_reason` once, in May. 🧪 Sheet col T today: `Yes - New Truck` ×22 (Apps Script), `Yes` ×15 (scraper or human). 🧪 `discovery_trucks.exclude_reason`: `Yes - New Truck` ×12, `Yes` ×5, `yes` ×1. **The 22 Sheet rows are the script's; the 12 DB rows could be the scraper's mirror or the May migration, and nothing on the row says which.** ⚠️ `runEmailJob:869` treats both spellings as excluded (`exclude === 'yes' || exclude === 'yes - new truck'`), so the distinction has no effect on the blast.

## 16.7 🔴 A SECOND GEOCODER, UNVALIDATED — the V1.1 claim was true of the scraper only

**Old claim (V1.1 changelog, `:143`):** *"Every coordinate now comes from **postcodes.io** or the venue is stored with none."* ⚠️ **Corrected in place. It is true of `run-scraper.js` (the gauntlet in `geo-validate.js`) and false of this script.**

🔴 **[FURTHER CORRECTED V1.7 — THE V1.4 NARROWING WAS ITSELF TOO NARROW.]** *"true of the scraper only… and false of this script"* named **two** writers and implied the class was otherwise clean. **There is a THIRD, in the app, operator-facing and running today:** 🔎 `app/api/manage/geocode/route.ts` asks Gemini for raw lat/lng with no postcodes.io check and three dashboard call sites write it into **`truck_events`**. 🧪 **25 of 57 `source='manual'` rows carry those coordinates, at a 0% `venue_id` rate.** **The 7 September gauntlet fixed ONE WRITER, NOT THE CLASS.** §20.5

🔎 Four functions call `https://maps.googleapis.com/maps/api/geocode/json?address=…&key=GOOGLE_API_KEY` and write the first result straight into the Sheet: `processVendorEmails:354-360` (new venue → cols D/E), `processFoodTruckScreenshots:719-726` (same), `backfillMissingVenueCoords:1406-1410` (any venue lacking coords → cols 4/5), `geocodeNewSubscribers:780-793` (subscriber postcode → cols 9/10/11). **In none of them:** no postcode lookup, no distance-to-village check, no sentinel test, no `partial_match` check, no result-type check — `if (geoRes.status === "OK" && geoRes.results.length > 0)` and the first hit wins. The address sent is `name + ", " + village + ", UK"` — a venue name Google cannot find resolves to the **village centroid**, or to a same-named place elsewhere in the UK, silently. (`fetchVenueGoogleData:1352-1367` uses the Places API for website/photo only — not coordinates.)

🧪 **Where those coordinates are now:** `venues` has **158 rows with coordinates and no postcode** — the shape this path produces and the scraper's current path cannot (it stores the postcode it validated against). And 🧪 122 of the 145 unmarked Sheet-only venues (§16.6) are this shape. **The gauntlet must run over every row this script has ever created, in the Sheet and in the DB, before they are trusted — the plan's step 3 already routes the import through `geo-validate.js`; this section is why it must not be skipped "because they already have coordinates".**

## 16.8 What else it touches

- **Gmail** — four labels created if absent (`:145-148`: *Process Schedule*, *Awaiting Retry*, *Processed Schedules*, *No Events Found*); the pending and retry labels are **removed before processing** (`:168`); a thread that fails twice in >1 h is **forwarded to `dominic@villagefoodie.co.uk`** and marked done (`:172-177`); quota and API-busy errors re-label to retry (`:473`); other errors forward and mark done (`:476-477`). ⚠️ The Gmail account is whichever account owns the trigger — "Other user".
- **Brevo** — every vendor gets an HTML reply from `schedule@villagefoodie.co.uk` (`:463`, `sendBrevoReply`); the blast goes to every subscriber within their radius (`:1009-1012`); the daily new-trucks report goes to the admin (`:1196`). None of these checks Brevo's response.
- **Drive** — folder `1D_v3fOuNqfvfl182PpmBKCvXAwlq-ZwG` (`:18`); 🔴 **`file.setTrashed(true)` at `:748` runs for a file that produced events AND for one that produced none** — only a thrown error (safety filter, quota, parse failure) leaves a file in place. A screenshot Gemini simply misread is gone after one pass.
- **Logs** — 🔎 `:83-85`: over 500 rows, **row 2 is deleted on every append** — a rolling window of ~500 lines, which at the observed rate (227 email-job lines in 19 h) is under two days. **The Logs tab cannot prove anything did not happen** (V1.3 §8.7 already said so; this is the line that makes it true).
- **The email-blast filter** — 🔎 `runEmailJob:865-871`: an event is dropped if its truck is not in the Trucks tab (by name or alias), if `Exclude?` is `yes` or `yes - new truck`, if `Is Meal?` is `no`, **or if the truck has no logo URL** (`:871`); and if its venue does not match a Venues row with coordinates (`:874-890`). ⚠️ **"No logo → no email"** is a rule nobody has written down; it silently excludes every new truck.
- **The time-clash flag** — 🔎 `removeDuplicateEvents:1292-1306`: two same-day rows for one truck at different venues with overlapping times get `[⚠️ TIME CLASH]` appended to **Events col 9 (AI Notes)** via `setValue` (`:1303`). **Nothing reads it** — not the scraper (which reads col I only to build nothing), not the app. And because it is written into the AI-notes cell, the scraper's mirror would copy it into `discovery_events.ai_notes` on the next append of *that row* — except the row is never re-appended. It is a note to a human who sorts the tab.
- **Contact capture** — 🔎 `:369-373`: the sender's address is appended to Trucks col K (*Contact Email*) or Venues col F (*Owner Email*) — the only automated writer of those two columns. 🧪 Six venue rows carry one today.

## 16.9 🔴 WHAT THE MIGRATION MUST DO ABOUT IT — per function

| function | verdict | why, and what it needs |
|---|---|---|
| `mirrorEventsToSupabase` | **KEEP, add one line** | already DB-via-API. Check `getResponseCode()` and log a failure as a failure; today a 401 is "Mirrored". |
| `processVendorEmails` | 🔴 **REWRITE** | reads four tabs and writes four; the truck/venue/exclusion lookups move to the DB (`discovery_trucks` incl. `contact_email`, `venues`, `discovery_exclusion_terms`); **ADD** stays on the route; **AMEND/CANCEL need a route that deletes-with-tombstone** (`discovery_event_suppressions`, plan §2.1) — there is no such endpoint today; **the retro-delete STOPS** — an exclusion term is recorded (with the poison flag, plan §3.4), never used to delete. The Gmail and Brevo halves are unchanged. |
| `analyzeEmailWithGemini` | **UNCHANGED** | pure; but the prompt's `exclusionsToAdd` ask (`:495`) is the poison source and should be dropped or quarantined to a review list. |
| `processFoodTruckScreenshots` | 🔴 **REWRITE the lookups and the creates** | Trucks/Venues/Exclusions from the DB; new trucks and venues **through an API that runs the gauntlet** (today they are Sheet-only and Google-geocoded); the event append already goes through the route. Drive handling unchanged — but `setTrashed` should require ≥1 event. |
| `runEmailJob` | **POINT AT THE DB** | it already reads events from Supabase; Trucks (logo/photo/type/is_meal/excluded), Venues (coords), Subscribers and Unsubscribes need DB reads — **blocked on the Subscribers decision** (plan §5). The anon read of `discovery_events` depends on that table's public SELECT policy staying. |
| `geocodeNewSubscribers` | **REWRITE through postcodes.io** | a postcode → coordinate lookup is exactly what postcodes.io does, validated; and it is a subscriber PII path writing into a Sheet. |
| `buildHtmlEmail`, `sendBrevoBlast`, `sendBrevoReply` | **UNCHANGED** | Brevo, not the Sheet. |
| `sendDailyNewTrucksReport` | **STOP** (or point at the DB) | the admin view's "trucks with no `discovery_trucks` row" is the same report without the email. |
| `removeDuplicateEvents` | 🔴 **STOP** | the DB's unique index does the exact half; the containment half must **not** be ported (it folds `The Bell`/`The Bell Inn`). The time-clash flag needs a DB home if anyone wants it. |
| `removePastEvents` | 🔴 **STOP** | the DB keeps history by design; "future only" is a `WHERE`, not a delete. |
| `fetchVenueGoogleData` | point at `venues.website` / `photo_url`, or stop | menu-only, harmless. |
| `backfillMissingVenueCoords` | 🔴 **STOP, and never run it again** | it is the unvalidated geocoder over the whole Venues tab; `geo-validate.js` replaces it. |
| `logToSheet` | **REWRITE** to a DB log | the same shape as `discovery_run_log`; the 500-row window goes. |
| `getExclusions` | point at `discovery_exclusion_terms` | and match with the scraper's rule, not containment. |
| `onOpen`, `trigger*`, tests | drop with the Sheet | — |

🔴 **What breaks if the Sheet goes and this script is untouched:** the project is **bound** to the spreadsheet — if the file is deleted the project goes with it; if it is merely unshared or emptied, every function's first `getSheetByName(...).getDataRange()` throws (🔎 `:156` before any label is touched, so emails stay queued; `:558` after the Drive folder is opened, so screenshots stay untrashed). **All four triggers fail on every fire, and the failure is visible only in the owning account's trigger list** (§16.1). Concretely, within a day: **no vendor email is processed** (the 227-per-19h job stops; the *Process Schedule* label accumulates), **no screenshot is processed** (12 events/day stop reaching the database — the only input the scraper does not have), **no weekly blast can be sent**, and the Sheet-only prunes stop — which, since they never reached the database anyway, changes nothing there. **The database keeps working; the two human-fed inputs stop.**

---

# 17. THE SHEET MIGRATION — WHERE IT ACTUALLY STANDS (9 September 2026)

## 17.1 ✅ APPLIED — the data gaps are closed

🧪 Verified live at the time of writing:

| | |
|---|---|
| `discovery_exclusion_terms` | **created and populated — 143 terms** (`docs/migration-steps-1-3-report.md`) |
| …of which poison-flagged (`hits_truck` set) | ⚠️ **4 in the live table** — see the correction below |
| `venues` | **559 → 814** — 255 Sheet-only venues imported |
| …with a **postcodes.io** coordinate | **168** |
| …**deliberately coordinate-less** | **88** (30 unresolvable postcodes, 58 with none) |
| refused for **no village** | **38** — a null village can never conflict in a unique index (§5.3), so it would duplicate for ever |
| **held** as near-duplicates | **36**, five of them rows the 8 September CERTAIN merge had deleted |
| `venues_backup_20260909` | **559** — the pre-import snapshot, retained |

⚠️ **CORRECTION TO THE APPLIED STATE, carried from `docs/auto-exclusion-write-report.md` §6.** The import file on disk carries **5** rows with `hits_truck` set; 🧪 **the live table has 4** — `Off The Beaten Truck` is present with `hits_truck = null`. 🧪 All 143 rows share one `created_at`, so this was a single import, not a double run: **the SQL executed was not byte-identical to the file now on disk.** 🔴 **Why is UNRESOLVED** — the value may have been edited before running, or amended after. ⚠️ Benign (nothing reads `hits_truck`), and arguably the better value, since *Off The Beaten Truck* is a venue operator rather than a truck. **Recorded, not tidied away.**

## 17.2 🔴 STEP 1 DISSOLVED — THE "81 MISSING `schedule_url` VALUES" WERE NEVER MISSING

**OLD VALUE, carried from `docs/sheet-migration-audit-report.md` §1 R5 into the retirement plan's step 1 and costed there at "~1 h; 81 rows":** *"81 have a Sheet URL and a null `schedule_url` — the site list cannot be rebuilt from the DB today."*

🔴 **FALSE, and it was carried forward twice without being re-derived.** 🔎 The site-list rule is `row[8] || row[6]` — Schedule URL **else Website**. 🧪 The Sheet's Schedule URL column is non-empty on **26** rows, and all 26 are already in `discovery_trucks.schedule_url`, **byte-identical**. For the other 80 the Sheet value is the **WEBSITE**, and 🧪 all 80 are already in `discovery_trucks.website` — 80 identical, 0 null, 0 different.

🧪 **The definitive test: DB `coalesce(schedule_url, website)` vs Sheet `row[8] || row[6]` — 106 IDENTICAL, 0 MISMATCH.** **The database could already reproduce the entire site list. There was nothing to backfill.**

🔴 **And performing the backfill would have been actively harmful.** It would duplicate 80 values across two columns with nothing keeping them in step, and it would **destroy the schedule-page/homepage distinction**: after it you could no longer tell *"this truck has a real schedule page"* (26) from *"this truck has only a homepage"* (80). **That distinction is recoverable today and would not have been.**

⚠️ **The one genuine defect found while checking:** 🧪 Sheet row 86, `Shika Shack`, holds `shikashack.co.uk` with **no `http://` scheme**, and 🔎 it is passed to `page.goto` which requires one. **A Sheet cell to fix, not a database row** — and it means that site has probably never loaded.

## 17.3 ⚠️ WHY THE VENUE IMPORT TOOK POSTCODES.IO ONLY

🧪 Measured on the 177 imported venues where both a Sheet coordinate and a resolvable postcode existed:

| | |
|---|---|
| **> 1 km** from their own postcode | **141 of 177 — 80%** |
| > 5 km | 78 · **> 20 km** | 6 |
| **median disagreement** | **4.13 km** |

⚠️ **A large distance means the two sources disagree, not automatically that the Sheet is wrong** — §13.3's `Thirsty` case is one where the *postcode* was the wrong half. **But a 4 km median across 177 rows is the signature of village-centroid resolution**, which is exactly what the Apps Script's `"<name>, <village>, UK"` geocode returns when Google cannot find the name (§16.7). **No Sheet coordinate was imported.** 🧪 16 of the 31 unresolvable postcodes are **terminated** (retired 1994–2021); their coordinates were deliberately not used either — a postcode retired in 1994 is not evidence of where a van parks in 2026.

## 17.4 🔴 THREE SWITCHES BUILT, NONE FLIPPED — AND THE PATTERN IS THE DURABLE PART

**The shape, which is the thing to keep:**

1. **The flag selects which source is USED.** It defaults to `sheet`, and 🔴 **an unrecognised value falls back to `sheet` WITH A MESSAGE — never to `db`.** An env typo must not silently change behaviour. `DB`/`Db` are accepted (case-insensitive, matching `SCRAPE_MODE`'s own `.toLowerCase()`); `true`, `1`, anything else is announced and ignored.
2. **BOTH sources are built on every discovery run**, whatever the flag says. The unselected one is comparison-only and cannot reach the consumer.
3. 🔴 **The diff measures DECISION equivalence, not set equality.** Two sets can differ in membership and behave identically (a term nothing matches); two sets can match in COUNT and still differ in content. Only *"would every name this run have been treated the same way?"* answers the question that precedes a flip.
4. **Failure rules are asymmetric and gated on `RUN_DISCOVERY`** — Pass B reads none of this, and both workflows share one env block.

| switch | state | control result |
|---|---|---|
| **`EXCLUSIONS_FROM`** | ✅ **deployed** (`9e83a5e`) | 🧪 **143/143 terms, 0 decision disagreements** across 176 truck names |
| **`SITES_FROM`** | ⚠️ **uncommitted** | 🧪 **116/116 entries, IDENTICAL on every field** (name, url, instructions, strategy, sourceType) |
| **`MATCH_FROM`** | ⚠️ **uncommitted** | 🔴 **NOT equivalent — see §17.5** |

🔴 **`SITES_FROM` HAD TO BE WIDENED, AND THE REASON IS STRUCTURAL.** 🔎 The membership rule (**`:871-874`** in the Sheet builder, **`:940-942`** in the DB builder — ⚠️ *not* `:625-628`, which was correct before `MATCH_FROM` added ~214 lines above it) is `if (hasUrl || hasInstructions)`, where `hasInstructions = ai_instructions.length > 10`. **So `ai_instructions` decides whether a truck is scraped AT ALL.** 🧪 `Louigi's Pizza` and `MumTas` are sites **only** because of that clause — both have no URL whatsoever — and a list built without it yields **114** where the Sheet yields **116**. `scraper_strategy` had to come too: it dispatches the scrape function and, comma-split, decides how many entries a row produces. ⚠️ **`aliases` stayed out** — it feeds truck *matching*, not the site list, and moved with `MATCH_FROM`.

## 17.5 🔴 `MATCH_FROM` IS NOT EQUIVALENT, AND MUST NOT BE FLIPPED

🧪 Measured over **176 distinct truck names** and **931 distinct venue+village cases** drawn from all 4,300 `discovery_events`:

| | disagreements |
|---|---|
| **trucks** | 🔴 **64 of 176** |
| **venues** | 🔴 **59 of 931** |

🔴 **The dangerous shape is not the failure to match — it is the match to the WRONG truck:** 🧪 `Eat Greek → Eat Is Greek`, `DBC Grill Shack → The Shack Street Food`. **A count comparison would have passed both**, because each set matched *something*. Only decision equivalence catches them.

🔴 **And 93 venues exist in the Sheet that the database cannot match at all.** Under `MATCH_FROM=db` each becomes a **NEW venue** rather than a match — **silently, on a green run.** ⚠️ That is why the matching set is the most dangerous of the four: an empty site list fails loudly (`assertSitesToScrape`); an empty matching set does not fail at all.

**The floor that guards it:** 🔎 the DB set must be ≥ 50% of the Sheet set built in the same run — a self-calibrating yardstick rather than a hard-coded count that would rot. 🧪 Today the DB holds 152% of the Sheet's trucks and 87% of its venues, so it is nowhere near binding. **It is a floor against a truncated read, not a quality gate; the quality gate is the diff.**

---

# 18. 🔴 `excluded` GOVERNS VISIBILITY, NOT MATCHING — AND THE OBVIOUS FIX IS WRONG

## 18.1 The finding

🔎 **The DB matching builder at `:705` is `supabase.from('discovery_trucks').select('name, aliases').limit(10000)`.** There is no `.eq('excluded', false)`, no filter of any kind — **and `excluded` is not even in the `select` list, so the builder cannot see it.**

🧪 **Proven by experiment, not inference.** 55 rows were set `excluded = true`; the disagreement counts moved by **ZERO** — 64 and 59 before, 64 and 59 after (`docs/match-from-recheck-report.md`).

🔴 **And the run carried its own proof that it saw the change**, because an unchanged number is exactly what a stale read produces: 🧪 of the 231 rows read, **110 were `excluded=true`** (against 55 at the first measurement), and 🧪 **43 of the 64 disagreements match to a row that is now excluded** — including both `Eat Is Greek` and `The Shack Street Food`. **The matcher demonstrably matched to excluded rows.**

⚠️ **`excluded` is a gate on the PUBLIC API** (🔎 `app/api/discovery/events/route.ts:146, 254, 339`, §7.2) — it decides whether a truck reaches the map, not whether the scraper matches against it. **Hiding a row does not stop it being matched to.**

## 18.2 🔴 WHY `.eq('excluded', false)` WOULD BE WRONG

🧪 Measured as a counterfactual, not proposed:

| | as built | if `excluded=false` filtered |
|---|---|---|
| truck rows in the DB set | 231 | 121 |
| truck disagreements | 64 | **37** |
| **resolved** | — | **41** |
| 🔴 **newly BROKEN** | — | **14** |

🔴 **All three graduated shadows carry `excluded = true` by the documented convention** (§7.3: *"a truck that graduates keeps a scraped shadow row carrying `excluded = true`"*): 🧪 **Pizzeria Gusto**, **Real Thai Food** and **Tikka Tonic**, each with a `hatchgrab_truck_id`, **none of them in the 3 September cohort.** Filtering them out makes the DB path fail to match them:

```
"Pizzeria Gusto" — sheet → Pizzeria Gusto · db → (new truck)
"Real Thai Food" — sheet → Real Thai Food · db → (new truck)
"Tikka Tonic"    — sheet → Tikka Tonic    · db → (new truck)
```

🔴 **The trading truck would stop being recognised and start being created as new.**

⚠️ **The right predicate is nearer "exclude the EMPTY rows" than "exclude the excluded"** — something like `excluded AND hatchgrab_truck_id IS NULL AND no URL AND no events`. 🔴 **OPEN. Nothing has been proposed and nothing changed.**

## 18.3 🔴 THREE GENUINE MATCHING DEFECTS — distinct from the missing matches

Of the 37 that would remain under the counterfactual, 34 are `db → (new truck)` — the Sheet knows a truck the database does not. **Those are missing matches.** These three are wrong ones, and 🧪 all three target an **ACTIVE** row:

| extracted name | matches | why it is a defect |
|---|---|---|
| `Between Buns` | **`Between Buns Royston`** | a different, active row |
| `Test Kitchen` | **`Test Kitchen`** (Sheet says new truck) | an active DB-only row |
| 🔴 `Pimp My FIsh` | **`Pimp My Fish`** | **one truck stored twice, both active — a capitalisation twin** |

🔴 **No flag setting fixes these. They are data.**

## 18.4 THE 3 SEPTEMBER IMPORT COHORT

🧪 **55 `discovery_trucks` rows created in a single instant — `2026-09-03T21:52:24.672542+00:00`**, one distinct timestamp across all 55. Name only: **0 have a URL** (`schedule_url` or `website`), 0 have events, no type, unverified, and `show_on_vf` / `show_on_hg` both `true` at creation. ⚠️ Names span **Cornwall, London and Cumbria** — far outside the pipeline's East Anglian footprint.

✅ **Now `excluded = true`, both show flags `false`.** That removes them from the public map, which is what it was for. 🔴 **It changed nothing about matching (§18.1).**

⚠️ **PROVENANCE IS INFERRED, NOT ESTABLISHED.** A Hatches Up import is the natural reading — the shape matches the June `hatchesup_scraper` cohort — **but nothing on the row says so**, and no script in this repository is scheduled to have written them. **Recorded as inference.**

⚠️ **A SEPARATE, OLDER COHORT EXISTS AND IS UNTOUCHED.** 🧪 Of the 123 rows created on **2026-05-22** (the migration), **27 have zero events** — ⚠️ *not* the 23 previously stated. 🧪 In total **88 of 231 `discovery_trucks` rows have no event at all**: 55 from September, 27 from May, 6 others. **The May cohort has not been excluded and no decision has been taken about it.**

# 19. THE VENDOR EMAIL PATH — THE RULES, NOT THE CODE

**Why this section exists.** `processVendorEmails` is being switched off (its trigger disabled) and may be
rebuilt later, on either domain. Gmail retention is 30 days, so **the threads are already gone and the
behaviour cannot be reconstructed from examples** — only from the script, and the script is a copy that
will drift. This is the rules it encoded, written so a rebuild starts from intent. **A rebuild will not be
Apps Script**, so *what it decided* is recorded ahead of *how*.

**Source:** `docs/apps-script/village-foodie-v6.57.js`, function `processVendorEmails` 🔎 `:140-481` and
`analyzeEmailWithGemini` 🔎 `:483-543`. 🔴 **Original line numbers (repo copy = original + 26).**

## 19.0 🔴 READ THE USAGE FIGURE BEFORE READING THE RULES

🧪 **`discovery_events` holds SIX rows whose `source` is `Email Scheduler`. All six are one truck —
`Spud & Slice` — with event dates 22–30 May 2026. There are no others, and none since.**

🔴 **AND THE SIX WERE NOT WRITTEN BY THIS PATH.** 🧪 All six carry `created_at`
`2026-05-22T14:58:43.562393+00:00` — **inside the 661-row single-second batch that is the one-off
`migrate-from-sheets.cjs` Sheet→DB import** (last run 22 May 2026). 🧪 Their `ai_notes` is bare
`[✉️ Email]`, but 🔎 `:426` writes `"[✉️ Email] | [" + fu.action + "]"` — the action suffix is
**unconditional**. 🧪 **Zero rows in the whole 4,300-row table carry `| [ADD]`, `| [AMEND]` or
`| [CANCEL]`.** So the six are Sheet rows the migration copied in, written by an **older** version of this
function; **v6.57's vendor-email write has never produced an observable row in the database.**

⚠️ **The control that makes this readable rather than speculative:** the *screenshot* path calls the **same**
`mirrorEventsToSupabase` through the **same** route with the **same** secret, and 🧪 produced **344** rows
*after* the migration batch (167 inside it, 511 total, latest 8 September 2026). **So the mirror, the route
and the secret all work.** A blanket 401 — the failure mode §16.9 warns about, which would be logged as
*"Mirrored N event(s)"* — is therefore **ruled out as the explanation for this path's silence.**

⚠️ **THREE HOLES IN "IT PROCESSED NOTHING", STATED RATHER THAN GLOSSED:**
1. 🔴 **A CANCEL writes nothing by design** (§19.4.4). A vendor who only ever emailed cancellations would
   produce exactly this evidence while the path worked perfectly.
2. 🔴 **An AMEND can be invisible.** The route upserts on `(event_date, truck_name, venue_name)` with
   `DO UPDATE` (§16.4), so an AMEND that keeps those three overwrites a row instead of inserting one.
   🧪 I tried to detect that by `updated_at`: **0 of 4,300 rows have `updated_at` more than a minute after
   `created_at`** — which means **`updated_at` is not maintained on UPDATE at all**, so the check is
   *uninformative*, not exculpatory. **This hole is open.**
3. ⚠️ Gmail retention is 30 days; the *Processed Schedules* and *No Events Found* label counts would bound
   the traffic and **were not read**.

**So the defensible statement is: 🔴 this path has inserted no event into the database in the ~3.5 months
it has been running, and the six rows attributed to it came from the Sheet via the May migration.**
⚠️ Whatever is rebuilt should be justified by demand, **not by the existence of this code.**

## 19.1 INTAKE — Gmail labels as a queue

| # | Rule | Executing line |
|---|---|---|
| I1 | **Four labels are the whole state machine**, created if absent: *Process Schedule* (inbox), *Awaiting Retry*, *Processed Schedules* (terminal), *No Events Found* (terminal). | 🔎 `:145-148` |
| I2 | **The queue is `Process Schedule` + `Awaiting Retry`**, concatenated — a retry is not a separate pass. | 🔎 `:149` |
| I3 | **Both queue labels are removed BEFORE work starts**, so a crash mid-thread loses the thread from the queue rather than looping it forever. ⚠️ It also means **a crash between `:168` and the terminal label leaves the thread in no queue at all** — silently dropped. | 🔎 `:168` |
| I4 | **Only the LAST message of a thread decides the work**; the previous two are context only. | 🔎 `:170`, `:179` |
| I5 | **Age-based escalation:** a thread already carrying *Awaiting Retry* whose newest message is **older than 1 hour** is forwarded to `ADMIN_EMAIL` with an `[ESCALATION]` prefix and marked done — **it is never retried again.** | 🔎 `:172-177` |
| I6 | **Wall-clock budget 200 s**, checked **at the top of each thread**, so it stops *between* threads and never mid-write. Unprocessed threads keep their labels and are picked up next fire. | 🔎 `:142`, `:164-167` |
| I7 | **A second, tighter budget of 180 s guards the model call** and throws `TIME_LIMIT`, which routes to *Awaiting Retry* (I8). | 🔎 `:518` |
| I8 | **Failure routing is by message text, not by type:** `bandwidth quota exceeded` → tell the admin, mark **done** (give up for the day); `demand`/`quota`/`limit`/`TIME_LIMIT` → **Awaiting Retry**; anything else → forward to admin, mark **done**. | 🔎 `:466-478` |

🔴 **THE RULE THAT MATTERS MOST FOR A REBUILD: the queue is durable and the work is idempotent-by-label.**
A rebuild on any stack needs the same three properties — a durable pending set, a terminal state that is
reached exactly once, and a **bounded** retry that escalates to a human instead of spinning.

## 19.2 EXTRACTION — the prompt, verbatim

🔎 `:491-505`, assembled (`<…>` marks an interpolation):

```text
CRITICAL CONTEXT: Today is <today.toDateString()>.
TASK: You are a schedule updater and data cleaner.
DATE RULES: If the year is not explicitly stated, assume <currentYear>. If the current month is December
and the scheduled event is in January, you MUST use <currentYear+1>. If a schedule only lists days of the
week (e.g., 'Wednesday', 'Thursday'), map them to the exact DD/MM/YYYY dates for the CURRENT week based on
Today's Date.
CURRENT SCHEDULE ON FILE FOR SENDER:
<currentScheduleContext, or the literal "None">
1. Read the LATEST email message to figure out what needs to change.
2. Determine the specific actions required: ADD a new event, AMEND an existing event (e.g. time/venue
change), or CANCEL an event.
3. Use the 'CURRENT SCHEDULE' to fill in missing details (like Venue) if they say 'change tomorrow' or
'cancel Friday'.
4. Output ONLY the events that need to be added, amended, or cancelled. Do NOT output events that are not
changing.
5. Look for explicit mentions that something is NOT a food truck (e.g. "Live Music is not a truck").
Extract those names into the 'exclusionsToAdd' list.
Date format MUST be "DD/MM/YYYY". Times MUST be "HH:MM". If no time is explicitly listed, leave TimeStart
and TimeEnd as empty strings "". Do NOT use "00:00".

JSON FORMAT ONLY:
{
  "updates": [{ "Action": "ADD|AMEND|CANCEL", "DateStart": "DD/MM/YYYY", "TimeStart": "HH:MM",
                "TimeEnd": "HH:MM", "Truck Name": "Name", "Venue Name": "Name", "Village": "Town" }],
  "exclusionsToAdd": ["Name of non-truck"]
}

THREAD HISTORY: """<body.substring(0, 5000)>"""
```

| # | Rule | Executing line |
|---|---|---|
| E1 | **`gemini-2.5-flash`, `temperature: 0`, `responseMimeType: "application/json"`.** | 🔎 `:485`, `:515` |
| E2 | **The ADD / AMEND / CANCEL model is the core idea.** The model returns a **diff**, not a schedule — *"Output ONLY the events that need to be added, amended, or cancelled."* | 🔎 `:494-497` |
| E3 | 🔴 **THE SENDER'S CURRENT SCHEDULE IS INJECTED INTO THE PROMPT.** This is what makes *"cancel Friday"* resolvable — the model is told which Friday, at which venue. Built at 🔎 `:192-217`: every Events row dated ≥ today whose truck fuzzy-matches a truck owned by this sender, formatted `- DD/MM/YYYY (HH:MM-HH:MM) @ Venue, Village`. Absent a match it is the literal string `"No upcoming events found for this sender."` | 🔎 `:192-217`, `:493` |
| E4 | **History window = the last 3 messages**, plain body, concatenated under `[MESSAGE]:` headers, then **truncated to 5,000 characters**. ⚠️ The truncation is on the *concatenation*, so a long quoted trail can push the newest message out. | 🔎 `:179-180`, `:505` |
| E5 | 🔴 **AT MOST ONE IMAGE.** Attachments are filtered to `image/*`, then deduplicated **by byte size** and capped at **one**, and each must be **< 3.5 MB**. A vendor sending a four-week poster set gets one week read. | 🔎 `:182`, `:507-513` |
| E6 | **Retry: 8 attempts, on HTTP 429 only, backing off 5 s +5 s each time**, aborting early on the 180 s budget. Exhaustion throws `"demand"` → *Awaiting Retry*. | 🔎 `:517-525`, `:543` |
| E7 | ⚠️ **THE BANDWIDTH FALLBACK — a genuinely good idea.** If the call fails with `Bandwidth quota exceeded` **and an image was attached**, it **retries once, text-only**, rather than failing the email. A schedule described in the body still lands when the image cannot be sent. | 🔎 `:532-538` |
| E8 | **Missing times are empty strings, never `"00:00"`** — stated twice. A midnight sentinel is worse than a blank. | 🔎 `:499` |
| E9 | **Shape tolerance:** `updates` is preferred; a bare `events` array or a top-level array is accepted and **every element is forced to `AMEND`**. | 🔎 `:227-233` |
| E10 | 🔴 **NO POSTCODE IS ASKED FOR.** The JSON contract stops at Village. See §19.6. | 🔎 `:502` |

## 19.3 IDENTITY — how a sender becomes a truck or a venue

| # | Rule | Executing line |
|---|---|---|
| D1 | **The sender's address is the key.** Extracted from `From:` between angle brackets, else the whole field; trimmed and lower-cased. | 🔎 `:183` |
| D2 | **A truck is matched when Trucks column K (*Contact Email*, index 10) CONTAINS the sender address** — `includes`, not equality, so the column can hold a comma-separated list. | 🔎 `:185-187` |
| D3 | **A venue is matched the same way on Venues column F (*Owner Email*, index 5).** | 🔎 `:188-191` |
| D4 | ⚠️ **Both are `includes` on a lower-cased cell, so `joe@x.com` matches a cell containing `notjoe@x.com`.** Substring-on-email is a real collision risk in a rebuild; use an exact match against a parsed list. | 🔎 `:187`, `:191` |
| D5 | 🔴 **THE ONE-MATCHED-TRUCK SHORTCUT.** If the model's truck name matches nothing in the Trucks tab **and the sender owns exactly one truck**, the event is assigned to **that truck** and it is no longer "new". This is what lets a vendor write *"we're at the Bell on Friday"* with no truck name at all. | 🔎 `:303-305` |
| D6 | **The venue equivalent is narrower:** it fires only when the venue is still literally `"TBC"` **and** the sender owns exactly one venue. | 🔎 `:326-328` |
| D7 | **`isVenueSender` — the heuristic that flips the whole email's meaning.** True if the sender matched **any** venue, **or** if they matched **no truck** *and* the extracted events name **more than one distinct truck**. | 🔎 `:275` |
| D8 | **What it changes:** the reply table swaps its Venue/Village columns for a **Food Truck** column (🔎 `:411`, `:421`, `:434`); the sender address is written to **Venues col F** instead of **Trucks col K** (🔎 `:369-373`); and a newly created truck does **not** get the sender's address stamped on it (🔎 `:337`). | 🔎 `:275`, `:337`, `:369-373` |
| D9 | ⚠️ **The heuristic is positional, not verified** — "no truck matched and ≥2 trucks named" is a good guess at a pub landlord and a wrong guess at a new operator listing their own two vans. **A rebuild should ask, not infer**, or record the guess as reversible. | 🔎 `:275` |

## 19.4 WRITE — what it changes, in order

### 19.4.1 The four-pillar duplicate check

🔎 `:379-403`. For each proposed change, the Events tab is scanned **bottom-up** and an existing row is
"the same event" when **all four** hold:

1. **Date** — string-equal after both are normalised to `DD/MM/YYYY` (🔎 `:381`, `:392`).
2. **Truck** — `normalizeTruckKey` equal **or either containing the other** (🔎 `:393`).
3. **Venue** — the same containment rule (🔎 `:395`).
4. **Village** — containment-equal **or either side blank** (🔎 `:396`).

**A match deletes the old Sheet row and the new one is appended in its place** (🔎 `:397`, `:429`) — an
amend is *delete + append*, never an update. ⚠️ **Containment on three of the four pillars folds
`The Bell` into `The Bell Inn`** — the same over-broad rule §16.9 says must not be ported.

### 19.4.2 🔴 The AMEND-with-TBC venue carry-forward

Two separate mechanisms, both worth keeping in spirit:

- **Pre-match carry-forward** 🔎 `:284-294`: if the model returned `TBC`/empty for venue **or** village, the
  Events tab is searched for a row with the **same date and a fuzzy-matching truck**, and the missing venue
  and village are **copied from it**. This is what turns *"we'll be 30 minutes later on the 12th"* into a
  complete row.
- **In-loop carry-forward** 🔎 `:398-401`: during the duplicate scan, an **AMEND** whose venue is `tbc`/empty
  **adopts the matched row's venue and village outright** and deletes that row.

⚠️ **Both trust the FIRST match found and neither records that a value was inherited** — the appended row is
indistinguishable from one the vendor stated.

### 19.4.3 What it deletes

| site | what | mirrored to the DB? |
|---|---|---|
| 🔎 `:253` **the retro-delete** | every Events row whose truck contains / is contained by a newly proposed exclusion term | 🔴 **no** |
| 🔎 `:429` **the AMEND/CANCEL replace** | the matched old row for every amended **or cancelled** event | 🔴 **no** |

### 19.4.4 🔴 What it writes — and the hole in it

- **Appends** (non-CANCEL only) a 9-column row `[date, start, end, truck, venue, village, "", "Email
  Scheduler", "[✉️ Email] | [ACTION]" (+ " | [⚠️ NEW TRUCK]")]` 🔎 `:426`, written with one `setValues`
  🔎 `:431`, then **`mirrorEventsToSupabase(rowsToAppend)`** 🔎 `:432`.
- 🔴 **A CANCEL is never appended and never mirrored** — 🔎 `:409-414` builds a strike-through table row and
  nothing else. See §19.5.
- **Creates a truck** in the Sheet: `appendRow` with name in col A, the sender's address in col K (unless
  `isVenueSender`), `'Yes - New Truck'` in col T 🔎 `:340`.
- **Creates a venue** in the Sheet: `appendRow` with name, village and **Google-geocoded lat/lng** 🔎 `:362`.
- **Captures the sender's address** onto the matched Trucks col K / Venues col F, appending to a
  comma-separated list if one is present 🔎 `:369-373`.
- 🔎 **Neither the truck nor the venue leaves the Sheet** (§16.6).

### 19.4.5 The Brevo reply with the struck-through diff table

🔎 `:441-463`. A confirmation is sent to the sender for **every** processed email, from
`schedule@villagefoodie.co.uk`.

| # | Rule | Executing line |
|---|---|---|
| R1 | **The table is a DIFF, not a schedule.** Only changed events appear. | 🔎 `:426`, `:409` |
| R2 | 🔴 **A cancellation is shown struck through in red** (`text-decoration:line-through;color:#ef4444`) — the vendor sees the removal, not a silent absence. | 🔎 `:408`, `:410-413` |
| R3 | **Changed fields are bolded against the OLD value** — start, end and venue are each compared with the row that was replaced and wrapped in `<b>` only if they differ. | 🔎 `:416-419` |
| R4 | **Columns follow `isVenueSender`** (D8): a venue sees *Food Truck*; a truck sees *Venue* and *Village*. | 🔎 `:434` |
| R5 | **A new truck is flagged inline with `*`** and a footnote saying it appears once verified. | 🔎 `:407`, `:459` |
| R6 | **A deep link to the sender's own public page** is included when it can be resolved four ways (single matched truck → single matched venue → first update's truck → first update's venue). | 🔎 `:435-449` |
| R7 | **Empty diff still replies**, with *"No changes detected."* | 🔎 `:454` |
| R8 | ⚠️ **The reply says the inbox is not monitored** and points at `hello@villagefoodie.co.uk`. | 🔎 `:461` |
| R9 | 🔴 **Brevo's response is never checked** (§16.8) — a bounced or rejected send is invisible. | 🔎 `sendBrevoReply:1123` |

## 19.5 🔴 WHAT MUST NOT COME BACK — anti-requirements

**These are not "bugs to fix later". They are behaviours a rebuild must be specified NOT to have.**

### A1 — 🔴 THE RETRO-DELETE. A model-proposed term erases existing events.

🔎 `:234` takes `exclusionsToAdd` **from the model's own reply**; `:243` appends it to the Exclusions tab
with **no check against the Trucks tab**; `:246-251` then scans the whole Events tab and `:253` **deletes
every row whose truck name contains or is contained by the new term.**

**Why it must not return:** the term is *proposed by a language model reading a vendor's email*, and the
consequence is an **immediate, unattended, unlogged deletion of a real truck's future events** — plus
permanent silencing, because the same tab is the scraper's exclusion set (§16.2, §11). ⚠️ **And it uses the
looser of the two matchers** (containment, §16.3), so its blast radius is wider than the scraper's.

🔴 **PROVENANCE OF THE THREE TRUCK-NAME TERMS IS UNRESOLVED, AND BOTH READINGS MUST BE RECORDED.**
`Steak & Honour`, `The Noodle & Dumpling Bar` and `Kerief` were in the Exclusions tab and were removed by
hand on 8 September (§11.3).

- **Reading 1 — a person put them there on purpose.** A truck may have **asked to be delisted**, or an
  operator may have been removing a bad listing. Under this reading the terms are a *legitimate* record and
  deleting the mechanism loses a real capability (see §19.6).
- **Reading 2 — the model proposed them and one of the two unguarded writers appended them.** Much of the
  tab is unmistakably machine-generated (Facebook page-metadata labels, a sentence truncated mid-word) and
  a truck name is exactly what a misfire produces.

🔴 **THEY CANNOT BE TOLD APART: the tab has no timestamp, no author column and no adjacent data, and the
Drive revision history that would settle it is unavailable (Drive API disabled on GCP project
`227274860029`).** ⚠️ **This supersedes `exclusions-provenance-report.md` §7 point 3** — written 8 September,
*before* the Apps Script was read — which concluded *"No other automated writer to the tab is evidenced."*
🔎 **There are two:** `run-scraper.js:784` and this function at `:243`, **and only this one also deletes.**

⚠️ **A rebuild may record a proposed term. It must never let one delete, and never let one take effect
without a human approving it.** (The scraper's side of this is now guarded — §11.2.)

### A2 — 🔴 A CANCEL THAT NEVER REACHES THE DATABASE.

🔎 `:409-414` builds a strike-through reply row; 🔎 `:426` is inside the `else`, so **nothing is appended**;
🔎 `:429` deletes the Sheet row; **`mirrorEventsToSupabase` is only called when `rowsToAppend` is non-empty**
🔎 `:430-433`. **Net effect: the vendor is emailed a confirmation that their event is cancelled, the Sheet
agrees, and the event stays live on the public map indefinitely.** The confirmation makes it worse — the
vendor has been told it is handled. ⚠️ A rebuild needs a **delete-with-tombstone endpoint**, which does not
exist today (§16.9, plan §2.1).

### A3 — 🔴 THE UNVALIDATED GEOCODER.

🔎 `:354-360`: `maps.googleapis.com/maps/api/geocode/json?address=<venue>, <village>, UK`, and
`if (status === "OK" && results.length > 0)` **writes the first result's lat/lng straight into the Sheet**.
**No postcode lookup, no distance check against the village, no `partial_match` check, no result-type check,
no sentinel test.** A venue name Google cannot find silently resolves to the **village centroid** or to a
same-named place elsewhere in the UK. 🧪 158 `venues` rows carry coordinates and no postcode — the shape
this path produces (§16.7). ⚠️ **`geo-validate.js` exists and must be the only way coordinates are created.**

### A4 — 🔴 A MIRROR THAT DOES NOT CHECK THE RESPONSE.

🔎 `mirrorEventsToSupabase:29-59`: `muteHttpExceptions: true`, **no `getResponseCode()`**, then 🔎 `:54`
`logToSheet("Mirrored " + rows.length + " event(s) to Supabase.")` **unconditionally**. **A 401 from a
rotated secret logs as success.** ⚠️ This is why §19.0 had to rule the failure mode out by a *control*
(the screenshot path's 344 rows) rather than by reading a log: **the log cannot distinguish a write from a
refusal.** A rebuild must fail loudly, and the log line must be derived from the response.

### A5 — 🔴 THE UNGUARDED `exclusionsToAdd` APPEND.

🔎 `:240-243`. The **only** checks before a model-proposed string joins the live exclusion set are:
truthy, `typeof === 'string'`, and not already fuzzy-present. **Nothing compares it against the Trucks tab**,
though that data is loaded and in scope at 🔎 `:157`. ⚠️ Distinct from A1: A1 is the *deletion*, this is the
*write*. Either alone is enough to silence a truck. **The scraper's equivalent is now guarded and provenance-
stamped (§11.2); this one never was.**

## 19.6 WHAT SHOULD COME BACK

| # | Keep | Why | Where it is |
|---|---|---|---|
| K1 | 🔴 **The context injection.** | It is the single idea that makes email work as an interface. Without it *"cancel Friday"* is unresolvable and the vendor must restate their whole schedule. **Any rebuild should send the sender's current schedule with the request.** | 🔎 `:192-217`, `:493` |
| K2 | 🔴 **The diff-table reply, with strike-through and bolded changes.** | It closes the loop: the vendor sees exactly what was understood, in their own terms, without logging in. It is also the only error-detection this path has — a wrong reading is visible to the one person who knows it is wrong. | 🔎 `:404-463` |
| K3 | **The escalation path.** | Bounded retry, then a **human** gets the email, and the thread leaves the queue. It fails towards a person rather than towards silence. ⚠️ Keep the bound; drop the "message text contains 'quota'" classification. | 🔎 `:172-177`, `:466-478` |
| K4 | **The bandwidth fallback** (text-only retry). | Degrades instead of failing. | 🔎 `:532-538` |
| K5 | **Empty string, never `00:00`, for an unknown time.** | A sentinel that looks like data is worse than a blank. | 🔎 `:499` |
| K6 | 🔴 **THE POSTCODE — ADD IT. IT WAS NEVER HERE.** | 🔎 `:502`: the JSON contract asks for Date, Times, Truck, Venue and **Village, and stops.** 🧪 The result, measured over `ai_notes` (there is **no `postcode` column** on `discovery_events`): **0 of 6 `Email Scheduler` rows and 0 of 511 `Drive Screenshot` rows carry a postcode — both Apps Script Gemini paths, zero — against 1,100 of 2,952 scraper rows.** ⚠️ The app's own extractor **asks for a postcode**, which is why `findVenue` can anchor its rows. **Asking for it is the better behaviour and costs one line of prompt.** | 🔎 `:502`; 🧪 measured 9 Sep 2026 |

## 19.7 THE TWO-DOMAIN QUESTION — RECORDED AS OPEN

🔴 **The two products have structurally different relationships with a truck, and this path was built for
only one of them.**

- **HatchGrab operators have a login.** They have a dashboard and manage their own schedule directly; the
  bridge in `/api/inbound-schedule` already pushes matching discovery events into their `truck_events` as
  `unconfirmed` **and emails them** (§16.4 step 5). **For them, email is a second, weaker path to something
  they can already do better themselves.**
- **Village Foodie trucks have no login at all.** There is no dashboard, no token, no account. 🔎 **Email is
  their only channel** — which is precisely why this function exists and why 🔎 `mirrorEventsToSupabase:32`
  posts to **`https://www.villagefoodie.co.uk/api/inbound-schedule`**, the Village Foodie domain.

⚠️ **The asymmetry is the decision.** Rebuilding this on both domains would give HatchGrab operators a
redundant channel that can silently contradict their own dashboard (A2 makes that concrete: an emailed
cancellation that never lands leaves their dashboard and the map disagreeing). Rebuilding it on neither
leaves Village Foodie trucks with no way to correct their listing at all.

🔴 **NOTHING IS PROPOSED HERE. This is Dominic's design decision.** ⚠️ Recorded only so the constraint is
not rediscovered: **a form, a tokenised link, or the existing operator dashboard extended to Village Foodie
trucks may each beat email outright** — email was chosen when there was no app to point anyone at, and that
is no longer the situation.

## 19.8 THE TRIGGER IS BEING DISABLED — WHAT DIES WITH IT

**Recorded 9 September 2026: the `processVendorEmails` time trigger is being turned off.** The function and
its menu item 🔎 `:101` remain; nothing is deleted. The other three triggers are unaffected.

**What stops, none of which has any other implementation:**

| Capability | Consequence |
|---|---|
| 🔴 **Truck auto-creation from email** 🔎 `:340` | A vendor emailing about a truck nobody has listed no longer creates the Trucks row (Sheet-only anyway — §16.6). |
| 🔴 **Venue auto-creation from email** 🔎 `:362` | Same, and it also stops A3's unvalidated geocoding — **a benefit**. |
| 🔴 **Sender-email capture** 🔎 `:369-373` | **The only automated writer of Trucks col K / Venues col F.** 🧪 Six venue rows carry one today. Contact addresses stop accruing, and identity (§19.3) depends entirely on that column — so the path gets *harder* to rebuild the longer it is off. ⚠️ **This is the one loss with no upside.** |
| 🔴 **The Brevo diff reply** 🔎 `:463` | Vendors who email get **no answer at all** — the inbox is unmonitored by its own admission 🔎 `:461`. ⚠️ **Threads will accumulate under *Process Schedule* with nobody reading them.** Consider an auto-responder pointing at a human address. |
| **The retro-delete (A1) and the unguarded exclusion append (A5)** | **Stop. Both are pure benefit.** ⚠️ The scraper's own append remains, now guarded (§11.2). |
| **The A2 cancel hole** | Stops being reachable — no new silently-ignored cancellations. **Existing ones are not repaired**; nothing has ever reconciled them. |

⚠️ **The database is unaffected in every case**: §19.0 establishes this path has inserted nothing since the
May migration, and §16.5 establishes its deletes never left the Sheet.

---

# 20. THE EXTRACTION LANDSCAPE — SIX PATHS, EIGHT PROMPTS, MEASURED

**Source:** `docs/extraction-paths-comparison-report.md` (9 September 2026). Read-only comparison; no code
changed. ⚠️ This section is about **what exists**, not what should replace it — the recommendation lives in
the report and nothing has been merged.

## 20.1 The real caller list — 🔴 not the three that were assumed

🧪 Established by sweeping for **both** Gemini mechanisms (the REST URL *and* the SDK) plus every importer
of `lib/schedule-extract`. **Nothing was scoped by extension.**

| # | Path | Prompt site | Fetches | Writes | Where |
|---|---|---|---|---|---|
| **A** | Scraper **discovery pass** — event branch | 🔎 `run-scraper.js:1230` | Puppeteer, 6 strategies | 🔎 **direct upsert** `:2312` | `discovery_events` + Sheet |
| **B** | Scraper **discovery pass** — RULE branch | 🔎 `run-scraper.js:1198` | same | recurring **rules**, not events | Sheet |
| **C** | Scraper **HatchGrab loop** (`buildHgPrompt`) | 🔎 `run-scraper.js:2075` | Puppeteer, 2 rules | 🔎 **POST** `:2197` | `/api/inbound-schedule` |
| **D** | Operator importer — **file/text** | 🔎 `lib/schedule-extract.ts:25` | nothing — upload or paste | returns to browser | `truck_events` later, via `upsert_event` |
| **E** | Operator importer — **URL** | 🔎 `lib/schedule-extract.ts:25` | Puppeteer, 2 rules raced | returns to browser; pins `trucks.scraper_rule` | as D |
| **F** | **Admin screenshot** (built 9 Sep) | 🔎 `lib/admin/screenshot-events.ts:103` | nothing — upload | 🔎 **POST** `route.ts:129` | `/api/inbound-schedule` |
| **G** | Apps Script **vendor email** | 🔎 v6.57 `:491` | Gmail | POST | `/api/inbound-schedule` |
| **H** | Apps Script **Drive screenshots** | 🔎 v6.57 `:594` | Drive folder | POST | `/api/inbound-schedule` |

⚠️ **E was not in the brief's list and is a distinct caller** with its own gate and its own side effect.
⚠️ **B is not an event extractor at all** — see §20.3.

🔴 **A ninth Gemini site is not extraction but is load-bearing:** `app/api/manage/geocode/route.ts` — §20.5.

## 20.2 🔴 THE CENTRAL FINDING — 37% vs 0% BETWEEN TWO PROMPTS IN ONE FILE

🧪 Measured over the full 4,300-row table (fetched length asserted against the `count=exact` header):

| path | rows | postcode present in `ai_notes` |
|---|---|---|
| **A** scraper discovery `:1230` | 2,952 | 🔴 **1,100 (37%)** |
| **C** scraper HatchGrab loop `:2075` | 108 | 🔴 **0 (0%)** |
| **H** Apps Script screenshots | 511 | 0 (0%) |
| **G** Apps Script vendor email | 6 | 0 (0%) |

**A and C are the same model, the same file, the same Puppeteer capture and the same database.** The only
material difference is the prompt: 🔎 A's rule 7 says *"Postcodes, addresses, or extra event details go into
the `Notes` field"*; C's prompt has no such catch-all.

🔴 **SO PROMPT WORDING IS THE DOMINANT VARIABLE, NOT THE SURROUNDING CODE.** Every structural explanation —
model, retry policy, fetch strategy, parser — is held constant across A and C and cannot account for a
37-point gap. ⚠️ **The consequence for any consolidation: prompts must be treated as DATA WITH ONE OWNER
AND A VERSION**, not as string literals scattered across the paths that happen to need them. A refactor that
unifies the *code* while leaving eight prompt strings in place has consolidated the part that was not
costing anything.

⚠️ **What it would look like if it proved nothing:** if C's pages simply contain no postcodes, 0% is a
property of the input, not the prompt. 🔴 **NOT RULED OUT — this is checkable and was not checked.** The
captured page text is logged; A's 37% comes from pages of the same kind, which is suggestive and not proof.
Carried forward as OPEN.

## 20.3 🔴 `scrape_rules` MUST NOT BE MERGED

🔎 `run-scraper.js:1198` emits a **different kind of object**: `{ venue, village, proof, rawTimeStart,
rawTimeEnd, freq, day, pos, startDate, endDate }` — a **recurring rule** ("every Saturday 11:45–13:45 at
Wickhambrook MSC"), not a dated event. 🔎 `lib/schedule-extract.ts:1-9`'s `ExtractedEvent` has
`event_date` and no `freq`, `day`, `startDate` or `endDate`. **The shapes are not convertible without
inventing dates**, which is precisely what a rule exists to avoid.

**It is a rule compiler, not an extractor. Leave it where it is.**

## 20.4 ⚠️ THE SCRAPER'S TWO IRREPLACEABLE INPUTS

Neither has any equivalent in D, E, F, G or H.

1. 🔴 **Per-site `ai_instructions`** — 🔎 injected at `:1201` (`CRITICAL HINT FROM USER`) and `:1236`
   (`🚨 CRITICAL USER HINT FOR THIS WEBSITE`). 🧪 **30 sites carry hand-written prose rules.** These are
   accumulated human knowledge about individual awkward pages. **An operator entering one URL has nothing
   like them, and no surface exists for writing one.**
2. 🔴 **Strategy dispatch — six strategies plus a default**, 🔎 `:41-49`: `scroll_lazy`, `click_next`,
   `frames` (`performFrameDump`), `manual`, `manual_single`, `scrape_rules`. 🔎 **`manual` and
   `manual_single` fetch no page at all** (`:1165-1172`) — they build events from the instructions alone,
   which is the only way a truck with no usable website gets a schedule. **D/E have two strategies and no
   manual mode.**

🔴 **A merge that drops either silently breaks those sites, and the breakage is invisible** — the run stays
green and the events simply stop. ⚠️ **Both must become parameters of any shared core before A or B moves.**

## 20.5 🔴 AN UNVALIDATED COORDINATE WRITER IS LIVE — AND IT IS NOT THE APPS SCRIPT

**§16.7 recorded the Apps Script as the second geocoder. There is a THIRD, in the app, operator-facing and
running today.**

🔎 `app/api/manage/geocode/route.ts:16-22` asks Gemini directly:

> *"You are a geocoding service. Return ONLY a JSON object with the latitude and longitude for this
> location… `{ "lat": 52.1234, "lng": 0.5678, "confidence": "high|medium|low" }`"*

**No postcodes.io lookup. No sentinel test. No distance-to-village check. No `partial_match` check.** The
model's numbers are returned as-is (🔎 `:52-56`) and the `confidence` it is asked for is **discarded by the
caller** (🔎 `app/manage/[token]/page.tsx:6572-6574` destructures only `lat, lng`).

🔎 Three dashboard call sites write it: `:3384` (onboarding schedule save), `:6982` (manual event edit),
`:7045` (**the schedule-import review save**) — each into `api('upsert_event', { …, latitude, longitude })`
→ 🔎 `app/api/manage/route.ts:838` → **`truck_events.latitude/longitude`**.

🧪 **25 of 57 `truck_events` rows with `source='manual'` carry those coordinates (44%), and that population
has a 🔴 0% `venue_id` rate** — coordinates with no validated venue behind them. By contrast the
bridge-written rows (`source='scraper'`) carry `venue_id` on 61 of 80 (76%) with coordinates **from the
matched venue**, i.e. already through the gauntlet.

🔴 **CORRECTION TO A CLAIM THIS MANUAL HAS CARRIED TWICE.** §16.7 and the V1.4 changelog both narrowed the
V1.1 claim to *"true of the scraper only… and false of this script [the Apps Script]"*. **That narrowing was
itself too narrow.** The complete statement is: **the postcodes.io gauntlet governs `scripts/run-scraper.js`
alone. Two other writers put unvalidated coordinates into the database — the Apps Script (into the Sheet)
and the app's own operator path (into `truck_events`).** ⚠️ `truck_events` is the table the trading truck
sells from.

⚠️ **The 7 September gauntlet fixed ONE WRITER, NOT THE CLASS.** **OPEN, and the highest-priority item in
this batch** — it is live and operator-facing. Nothing is proposed here.

## 20.6 THE FILTERS ARE A DEVIATION SURFACE

**Three exclusion matchers, no two alike**, and they disagree on all three axes:

| | normaliser | match rule | applied to | scope | executing line |
|---|---|---|---|---|---|
| **scraper** (A/C) | `normalizeName` — strips stop-words **and spaces** | **Levenshtein ≤ 1** | 🔴 **TRUCK** name | global | 🔎 `run-scraper.js:55`, `:67`, used `:1450` |
| **Apps Script** (G/H) | `normalizeTruckKey` — **byte-identical** to the above | 🔴 **containment** | 🔴 **TRUCK** name | global | 🔎 v6.57 `:1235`, `:1243` |
| **app** (D/E) | `normaliseExclusionTerm` — **KEEPS spaces** | 🔴 **substring** | 🔴 **VENUE** name | 🔴 **per `truck_id`** | 🔎 `lib/schedule-extract.ts:13`, `:17`; call sites `app/manage/[token]/page.tsx:7525, 7526, 7579` |

⚠️ **The app's asks a different question of a different field on a different scope.** Reusing it on a truck
path would silently change which trucks are dropped. *(The admin screenshot path deliberately reuses the
scraper's rule rather than adding a fourth — §21.4.)*

**And two invalid-venue lists of different lengths:**

| | entries | match rule | line |
|---|---|---|---|
| app | **5** — Closed, N/A, TBC, Unavailable, Cancelled | **exact equality** | 🔎 `lib/schedule-extract.ts:11`, applied `:186` |
| admin screenshot | **9** — adds TBA, No event, No service, None | equality **or `startsWith`** | 🔎 `lib/admin/screenshot-events.ts` |
| scraper (A) | 🔴 **none at all** | — | — |

🔴 **A venue reading "Closed for refurbishment" is dropped by the 9-entry list and KEPT by the 5-entry one**,
because the 5-entry list matches only on exact equality. **Same input, two live answers.**

⚠️ **Consolidation target alongside the prompts — and a live source of divergent behaviour today, not a
tidiness concern.** OPEN.

## 20.7 WHAT THE COMPARISON COULD NOT SETTLE — carried forward

- 🔴 **Whether C's 0% is prompt or input** (§20.2). Checkable from the logged page text; not checked.
- ⚠️ **Which `truck_events` `source='manual'` rows came from the importer** vs hand entry. No column
  distinguishes them. The coordinate provenance is identical either way, so §20.5 holds regardless.
- ⚠️ **F's extraction quality.** 🧪 **Zero rows in production.** Its prompt and filters were proven
  directly; **its output has never been measured.** §21.
- ⚠️ **Whether A's 37% is representative** or dominated by a few postcode-rich sites. Not broken down.
- ⚠️ **Whether the two Puppeteer implementations behave identically.** 🔎 `verify-schedule-url:63` says
  *"copied from scripts/run-scraper.js"*; they were compared **by reading, not by running both against one
  URL.** 🧪 **Not a bug, but a naming hazard:** the discovery pass calls button-hunting `click_next`
  (🔎 `:43`) while the HatchGrab loop and the operator route call it `scroll_next` (🔎 `:2000`,
  `verify-schedule-url:186`). The HG loop uses its own `scrapeWithRule` (`:2003`) rather than the
  `STRATEGIES` map, **so the operator-written pin is consumed correctly.** ⚠️ **This was initially read as a
  live bug and it is not.** Two names for one behaviour, in two columns.

---

# 21. THE ADMIN SCREENSHOT UPLOAD — BUILT, AND UNVERIFIED

**Source:** `docs/screenshot-upload-build-report.md` (9 September 2026). Replaces the Apps Script's
`processFoodTruckScreenshots`. ⚠️ **The Apps Script path is NOT removed and keeps running until its trigger
is turned off.**

## 21.1 What it is

✅ A **tab on `/admin`** (not a route — the standalone page was deleted), behind `verifyAdmin`. Files are
processed **on drop, paste or pick with no button**; **one request is in flight at a time**; and 🔴 **nothing
is stored server-side** — no bucket, no object. Events are written with `source = 'Admin Screenshot'` so
this path stays separable from the Apps Script's in the data.

🔎 `app/api/admin/screenshot-events/route.ts`, `lib/admin/screenshot-events.ts`,
`components/admin/ScreenshotsPanel.tsx`.

## 21.2 The Drive defect it replaces — and how not storing is still safe

🔎 v6.57 `:748` `file.setTrashed(true)` sits **after BOTH branches** of its if/else, so **a call that
succeeded but yielded zero usable events binned the only copy.** Only a *thrown* error kept the file — the
inverse of what you want.

**Storing server-side was one way to prevent that; it is not the only one.** Here **the browser holds the
file**: a row that failed, extracted nothing, or had rows dropped **stays in the client list and can be
re-dropped**, and the copy is on the admin's own device throughout. **Nothing is ever in one place only.**

## 21.3 🔴 THE ROUTE BRIDGES AND EMAILS — A PROPERTY OF `/api/inbound-schedule`, NOT OF THIS PAGE

🔎 `app/api/inbound-schedule/route.ts:212` inserts into **`truck_events`** with `status:'unconfirmed'`, and
🔎 `:250-270` **emails the operator** a link carrying `${NEXT_PUBLIC_HATCHGRAB_URL}/manage/${truck.dashboard_token}?tab=schedule`.

**Gate** (🔎 `:137-153`): the extracted truck name must match a `discovery_trucks` row carrying a
**`hatchgrab_truck_id`**, **and** that truck's `scraper_preference` must not be `'manual'`; then
reject-memory and dedup.

🔴 **So a screenshot naming a linked truck reaches that operator's dashboard AND their inbox.**
⚠️ **This was NOT introduced by this change** — the Apps Script did exactly the same through the same route,
as does the scraper's HatchGrab loop. **Record it against the ROUTE.** Any path POSTing there inherits it.

## 21.4 The matcher is a strict subset of the one it replaces

🧪 Measured over all 231 real `discovery_trucks` names × the real 143 terms:

- same decision: **223**
- refused **only by the new path**: 🔴 **0**
- refused **only by the Apps Script**: **8** — Azahar, India Express, Taco Banditos, Hyderabadi Dhaba,
  Wintringham, The Foodie Shack, Dirty Fryer Boys, Bad Boi Burritos

✅ **It never refuses a truck the old path accepted.** 🧪 And the 8 it releases were **false positives**: the
term `"dis"` normalises to `"di"`, which under the Apps Script's containment rule blocked *any* truck name
containing "di" (5 of the 8, including India Express and Taco Banditos); `"bad"` took Bad Boi Burritos.
**The narrower rule is a fix, not a loosening.**

## 21.5 ⚠️ FOUR LIVE TRUCKS CANNOT GET EVENTS FROM THIS PATH

🧪 Four `discovery_trucks` rows with `excluded = false` have names that **are** exclusion terms:

| truck | by term |
|---|---|
| Just Baked by Sophie | `justbakedbysophie` |
| The Linton Kitchen | `lintonkitchen` |
| Dessert MK | `dessertmk` |
| Axle & Hop | `axlehop` |

**The Apps Script refuses them too** (containment subsumes exact match), so this is **faithful to the path
being replaced, not a regression.** 🔴 **But it is a real gap in BOTH, and it is a data problem, not a code
one** — the terms belong in the tab's cleanup, not in a matcher change. ⚠️ Related to §11.3's unresolved
provenance question. **OPEN.**

## 21.6 ⚠️ UNVERIFIED — the UI and the auth path have never run

🔴 **No agent session as an admin is obtainable** (V12.6 — Dominic is the sole admin and minting a test
credential is blocked), so `verifyAdmin` could not be satisfied and **the route was never exercised over
HTTP.** The extraction, the filters and the payload shaping were proven directly against real Gemini and the
real 143 terms; **the page, the drop zone, the queue and the auth path were not.**

🧪 **`discovery_events` holds 0 rows with `source = 'Admin Screenshot'`.** **No quality claim about this path
is possible yet.** **OPEN until Dominic opens the tab.**

---

---
# WHAT I COULD NOT READ OR VERIFY

- ✅ **[RESOLVED V1.2] The Google Sheet.** 🧪 Read live 8 September 2026: **ten tabs**, of which the scraper reads four — Trucks **152**, Venues **933**, Events **713**, Exclusions **146**. **109 of the 152 truck rows enter `sitesToScrape`**; of those, 67 have a blank strategy and 21 carry aliases. §3.1. ⚠️ Still unread: the six Apps-Script/human tabs' *writers*.
- 🔴 **The GitHub Actions run logs.** Every silent failure in §2.3 prints there and nowhere else. **Whether the scraper is currently succeeding is unreadable from here.**
- 🔴 **Whether the Actions secrets are set or valid.** A different store from Vercel's.
- ✅ **[RESOLVED V1.2 — and one of them WAS a second 42P10.]** `discovery_events` and `discovery_trucks` resolve (§5.4). 🔴 **`excluded_terms` does not: its live key is `(truck_id, term)` and the scraper names `term`. §5.6.** ⚠️ Still UNREAD: the *definitions* — `pg_indexes` is unreachable through PostgREST, so `NULLS NOT DISTINCT` on `venues_name_village_key` remains unread (below).
- 🔴 **Whether `venues_name_village_key` is `NULLS NOT DISTINCT`.** The duplication behaviour was proven empirically; **the index definition was not read** — PostgREST cannot query `pg_indexes`.
- 🔴 **The `discovery_trucks` upsert's conflict key** — not visible in the block I read.
- ✅ **[RESOLVED V1.4 — READ. A verbatim copy is at `docs/apps-script/village-foodie-v6.57.js` and §16 documents every function. Two claims in the rest of this bullet are now corrected: it does NOT write `discovery_events` directly (it POSTs to `/api/inbound-schedule`, §16.4), and the venues it creates go to the SHEET, not the database (§16.6). The trigger list is in §16.1; frequencies remain UNKNOWN.]** ~~🔴 **The Apps Script schedule-image pipeline — STILL NOT IN THIS REPOSITORY, AND NOW KNOWN TO BE LOAD-BEARING.**~~ Referenced at `:1366` (*"Apps Script paths also use gemini-2.5-flash"*). 🧪 Its own Logs tab, read live 8 September 2026, proves three things this manual previously listed as unknown: it **writes `discovery_events` directly** (`"Mirrored N event(s) to Supabase"`), it **creates `venues`** (`"Auto-Created & Geocoded New Venue from Screenshot"` — so `run-scraper.js:1833` is *not* the only venue creator), and it runs roughly every five minutes. 🔴 **Its code, its Events-tab pruning predicate and its schedule are UNREAD and unreadable from here.** It now appears as load-bearing in three separate reports. **Read it at Sheet → Extensions → Apps Script.** ⚠️ The Logs tab covers only ~19 hours and rotates, so it cannot prove the absence of anything.
- ⚠️ **The fixed venue write has never run.** Semantics proven against the real schema with a synthetic row; the scraper itself was not executed.
- ⚠️ **`process-next-truck.yml`** ("Hatchesup Menu Scraper") was read only for its trigger. Its body is unread.
- ⚠️ **Whether the 46 NULL-village venues are duplicates** of properly-villaged rows. Counted, not investigated.
- 🔴 **[NEW V1.3] WHO EDITED THE EXCLUSIONS TAB.** 🧪 The tab went 146 → 143 rows in two hours; the three removed were `Steak & Honour`, `The Noodle & Dumpling Bar`, `Kerief`. **Unreadable from here: the tab has no timestamps and no author column, and the Drive revision history — which carries `lastModifyingUser` and would settle it outright — is unavailable because the Drive API is DISABLED on Google Cloud project `227274860029`.** ⚠️ **An automated writer that needs no approval exists (`:784-790`, guarded only by `:780-782`), and much of the tab is unmistakably machine-generated — but that attributes no specific row. I did not guess.** §11.3.
- 🔴 **[NEW V1.3] THE 10 SILENT `manual` TRUCKS.** They **never fetch a page at all**, so none of the three explained causes applies. **UNEXPLAINED.** ⚠️ Do not let §on the four causes read as closed.
- ⚠️ **[NEW V1.3] TWO VENUE-PAGE SITES WERE NEVER FETCHED** — `Nethergate Brewery` and `The White Horse`. **So "Saffron Walden is the only multi-pitch venue page" is NOT established**, and `:920` (~~`:906`~~) affects all 7 venue sites regardless. §12.
- 🔴 **[NEW V1.3] WHETHER THE 8 SEPTEMBER DEPLOY REACHED PRODUCTION.** 🧪 The commits exist and `HEAD` = `origin/main` = `6fe8634`. **I did not query Vercel and read no build record.** §15.
- 🔴 **[NEW V1.3] WHETHER THE 06:00 CRON GOES RED TOMORROW.** The red-on-failure changes are deployed and **have never run on a schedule**. §15.
- 🔴 **[NEW V1.5] THE RIGHT `excluded` PREDICATE FOR MATCHING.** `.eq('excluded', false)` is wrong — 🧪 it resolves 41 disagreements and breaks 14, including all three graduated shadows. Something nearer `excluded AND hatchgrab_truck_id IS NULL AND no URL AND no events` is indicated. **Nothing proposed. OPEN.** §18.2
- 🔴 **[NEW V1.5] THE 93 SHEET-ONLY VENUES AND 97 DB-ONLY TRUCKS.** Until they are reconciled `MATCH_FROM=db` creates 93 venues on a green run. **A data problem, not a code one. OPEN.** §17.5
- 🔴 **[NEW V1.5] THE THREE GENUINE MATCHING DEFECTS** — `Between Buns`/`Between Buns Royston`, `Test Kitchen`, and 🔴 `Pimp My FIsh`/`Pimp My Fish` (one truck stored twice, both active). **No flag fixes these.** §18.3
- ⚠️ **[NEW V1.5] PROVENANCE OF THE 3 SEPTEMBER COHORT.** 55 rows in one instant, names spanning Cornwall, London and Cumbria. A Hatches Up import is **inferred, not established** — nothing on the row says so. §18.4
- ⚠️ **[NEW V1.5] THE 27 ZERO-EVENT ROWS FROM THE 22 MAY MIGRATION.** Untouched; no decision taken. 🧪 88 of 231 rows have no event at all. §18.4
- ⚠️ **[NEW V1.5] WHY `Off The Beaten Truck` HAS A NULL `hits_truck`** where the import file sets it. 🧪 One import, one `created_at` — so the SQL run was not the file on disk. Benign; cause UNRESOLVED. §17.1
- 🔴 **[NEW V1.5] WHETHER THE REPOINTED AUTO-EXCLUSION WRITE LANDS.** No local Postgres, so the payload and its schema-validity were proven, **not the insert**. The 06:00 cron is the first real one. §11.2
- ⚠️ **[NEW V1.5] THE SHEET'S 342 COLUMN-L MARKERS.** `:1981` still writes them; the DB is nulled. The two disagree by design and the Sheet-side fix is OPEN. §3.4
- 🔴 **[NEW V1.6] WHETHER THE VENDOR EMAIL PATH EVER PROCESSED AN AMEND OR A CANCEL.** **Structurally undetectable from the database.** A CANCEL writes nothing by design (§19.5 A2); an AMEND that keeps `(date, truck, venue)` **overwrites** a row rather than inserting one (§16.4 step 4); and 🧪 `updated_at` is more than a minute after `created_at` on **0 of 4,300 rows**, which means it is **not maintained on UPDATE** — so that check is uninformative, not exculpatory. **"It processed nothing" is established for INSERTS only.** §19.0
- ⚠️ **[NEW V1.6] THE GMAIL LABEL COUNTS WERE NEVER READ.** *Processed Schedules*, *No Events Found* and the *Process Schedule* backlog would bound how much traffic this path actually saw, independently of the database. 🔴 **Gmail retention is 30 days, so the threads themselves are already gone** — the counts are the last remaining evidence and they will not survive the account. **Read them before the trigger is disabled, or the question closes for good.**
- 🔴 **[NEW V1.6] THE TWO-DOMAIN DECISION.** HatchGrab operators have a dashboard; Village Foodie trucks have no login and email is their only channel. **Nothing proposed — Dominic's design decision.** ⚠️ A form or a tokenised link may beat email outright. §19.7
- ⚠️ **[NEW V1.6] WHETHER THE REST OF §16'S LINE POINTERS LAND.** 🧪 Nineteen were wrong for `processVendorEmails` and `processFoodTruckScreenshots` and are corrected; **the pointers for the other 28 functions were NOT re-verified line by line.** Treat any uncorrected §16 citation as unchecked. §16
- 🔴 **[NEW V1.7] THE UNVALIDATED COORDINATE WRITER IN THE APP.** 🔎 `app/api/manage/geocode/route.ts` → `truck_events`, via three dashboard call sites, with no postcodes.io check. 🧪 25 of 57 `manual` rows. **LIVE, OPERATOR-FACING, AND THE HIGHEST-PRIORITY OPEN ITEM HERE.** Nothing proposed. §20.5
- 🔴 **[NEW V1.7] WHETHER THE HATCHGRAB LOOP'S 0% POSTCODE RATE IS PROMPT OR INPUT.** If its pages carry no postcodes, the prompt is exonerated and the 37%/0% comparison proves less than §20.2 claims. **Checkable from the logged page text. NOT CHECKED.** §20.2
- 🔴 **[NEW V1.7] THE THREE EXCLUSION MATCHERS AND THE TWO INVALID-VENUE LISTS.** Different normalisers, different match rules, different subjects (truck vs venue), different scopes (global vs per-truck); 5 entries by equality against 9 by equality-or-prefix. **Divergent behaviour today, not a tidiness concern.** §20.6
- ⚠️ **[NEW V1.7] THE ADMIN SCREENSHOT PATH HAS PRODUCED ZERO ROWS.** 🧪 No `source = 'Admin Screenshot'` row exists. The UI and `verifyAdmin` have never been exercised — no admin session is obtainable from here. **No quality claim is possible.** §21.6
- ⚠️ **[NEW V1.7] FOUR LIVE TRUCKS WHOSE NAMES ARE EXCLUSION TERMS** — Just Baked by Sophie, The Linton Kitchen, Dessert MK, Axle & Hop. Refused by the new path **and** the old one. **A data problem; no code change would fix it.** §21.5
- ⚠️ **[NEW V1.7] WHETHER THE TWO PUPPETEER IMPLEMENTATIONS BEHAVE IDENTICALLY.** Compared by reading, **not by running both against one URL.** ⚠️ `click_next` (discovery) and `scroll_next` (HG loop, operator route) name the same behaviour in two columns — 🧪 **not a live bug**, since the HG loop uses its own `scrapeWithRule`. §20.7
