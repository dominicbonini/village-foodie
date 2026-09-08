# A repeatable `venue_id` linking job — design and this run's proposal

**8 September 2026 · READ-ONLY.** No row inserted, updated or deleted. No migration written or applied. Nothing staged, committed, pushed; `git add` not run. Every database call was a `select`; the only writes anywhere were to a scratchpad outside the repo. **The design below is proposed, not built.**

**Tags:** 🔎 SOURCE-READ (file:line quoted) · 🧪 EXECUTED (output quoted) · ⚠ inference, labelled.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. ROW COUNTS — START AND END

| | START 11:32:10Z | END 11:36:21Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| unlinked (`venue_id IS NULL`) | **2,229 (51.8%)** | **2,229 (51.8%)** |

⚠️ The brief's established figure was **2,219 of 4,283**. 🧪 It is now **2,229 of 4,300** — the table took 17 rows since. **The ratio is identical to one decimal place (51.8%); both figures are correct for their moment.** `venues` is **559**, not 558 — 🧪 one venue was created by hand today (`foodPark Cambridge North`), which is the worked example's third case. `git status --short` at END is in §10.

**Extensions searched** (every sweep in this report; **nothing was scoped by extension**): `.md .ts .jpg .sql .tsx .png .xml .svg .json .js .gradle .gitignore .mjs .jpeg .webp .txt .swift .yml .java .csv .cjs .storyboard .properties .plist .entitlements .css .avif .xcscheme .xcprivacy .xcconfig .toml .resolved .pro .pbxproj .log .jar .iml .ico .html .example .bat`. `scripts/run-scraper.js` is `.js` and was in scope throughout.

---

## 🔴 THE HEADLINE, BEFORE THE DESIGN

**On the only ground truth that exists — your Pizza Mondo pass — `findVenue` at HIGH confidence would have got two of nine rows wrong, and the 15 km distance ceiling caught neither.**

| Case | Human chose | `findVenue` returns | Verdict |
|---|---|---|---|
| `foodPark` 09-10 | `foodPark Cambridge North` (created today) | `foodPark` (generic, CB2 0AA) — **HIGH**, d=3.42 km | 🔴 **5.64 km wrong** |
| `Great Wilbraham` 09-12 | `Gt Wilbraham` | `Great Wilbraham` — **HIGH**, d=2.45 km | 🔴 **2.58 km wrong** |
| other 7 | — | agrees, HIGH | ✅ |

🔴 **So a job that auto-applies HIGH is not safe today.** The design below is therefore **propose-and-apply-with-an-arbiter**, not **match-and-write**. Everything else follows from that.

---

## 1. WHAT LINKED THE EXISTING 2,071 ROWS

🔎 **`scripts/backfill-venue-id.ts`** (and its sibling `scripts/backfill-venue-id-low.ts`). 🧪 A repo-wide sweep for anything that writes `venue_id`, all extensions, returns **exactly four sites**, all in those two files: `backfill-venue-id.ts:91` (SQL emit), `:140` (`--apply` path), `backfill-venue-id-low.ts:127` (SQL emit), and the reversal comments at `:15`, `:18-19`, `:88`, `:124`. **Nothing else in the repository ever sets `venue_id` — the scraper does not, and no API route does.**

| Question | Answer | Evidence |
|---|---|---|
| Runnable again? | ✅ **Yes** — `npx tsx scripts/backfill-venue-id.ts` | 🔎 `:22-24` usage block |
| Idempotent? | ✅ **Yes, twice over.** Every emitted statement is `… AND venue_id IS NULL` (🔎 `:91`), and the `--apply` path uses `.is('venue_id', null)` (🔎 `:141`). A re-run affects 0 rows. | 🔎 |
| Re-derives, or reads a file? | ✅ **Re-derives from the database on every run.** 🔎 `:53-63` selects `venues` and `discovery_events WHERE venue_id IS NULL AND event_date >= today` fresh; 🔎 `:74` calls `findVenue` in-process. **The emitted `.sql`/`.json`/`.csv` are outputs, never inputs.** | 🔎 |
| Writes by default? | ❌ **No** — emit-only unless `--apply` is passed (🔎 `:50`, `:137`). | 🔎 |

⚠️ **V1.1's note is confirmed and sharpened.** V1.1 records that every link in the 312-statement pass was re-derived from the database rather than read from the emitted file. 🔎 **That is a property of the script itself, not a discipline someone applied** — it has no code path that reads its own artefacts. The generated `scripts/backfill-output/APPLY-final-pairs.json` and `docs/sql/apply-20260907/*.sql` are dated 7 September and are **stale by construction**: `venues` has changed by 16 deletions and 1 creation since. **A future job must keep this property.**

🔴 **The one thing it does not do is run.** 🧪 There is no cron, no GitHub Actions workflow and no Vercel cron that invokes it — the three workflows are `daily_scrape.yml`, `hatchgrab_scrape.yml`, `process-next-truck.yml`, none of which mentions it, and `vercel.json`'s six crons are order/account/domain scoped. **That is the entire gap this design fills.**

*If this proved nothing:* a grep for `venue_id` could miss a writer that builds the column name dynamically, or a raw REST `PATCH`. Ruled out by also sweeping `.rpc(`, `method:'PATCH'`/`'POST'` against `discovery_events`, and every `.update(` in the tree — no other writer exists.

---

## 2. THE TWO MATCHERS — USE `findVenue`, AND THE V1.1 FIXES ARE PRESENT

### 2.1 They are not the same question and they disagree by construction

| | `normalizeName` + `isFuzzyMatch` — `scripts/run-scraper.js:55-66`, `:67-86` | `findVenue` — `lib/venue-matcher.ts:156-226` |
|---|---|---|
| Question | *"is this the same **string**?"* | *"is this the same **place**?"* |
| Method | 🔎 lowercase → `&`→`and` → strip punctuation → **strip filler words `the\|street\|st\|food\|ltd\|co\|company\|and`** → **chop trailing `s`** → smash to one string; then **1-edit Levenshtein** | 🔎 token containment either direction (`:166-173`) → **village agreement** (`:48-59`) → **distance ceiling** (`:122-129`) → deterministic best-pick (`:138-150`) |
| Uses village? | ❌ never | ✅ it is the deciding rule |
| Uses coordinates? | ❌ never | ✅ as a downgrade only |
| Output | boolean | `{venue, confidence: high\|low\|none}` |

🔴 **They disagree, and the direction is knowable from the executing lines.** 🔎 `normalizeName` strips `street`, so **`The Street` [Capel St. Mary] and `Eat Street MK` both normalise toward the same token soup**, and `isFuzzyMatch` then accepts anything within one edit. It has no village and no coordinate, so it cannot tell two `The Bell`s 102 km apart from one another. 🧪 The venue table contains exactly that: **3 × `The Bell` spread 102.2 km**, **2 × `The Fox` 69.8 km**, **2 × `THE VILLAGE INN` 90.5 km**.

**Use `findVenue`. Do not use `normalizeName` for linking.** `normalizeName` exists for a different job — the scraper's *dedup* key, where a false merge costs a duplicate row, not a wrong map pin. ⚠️ `lib/venue-signature.ts:8,20` is a deliberate byte-mirror of it for the bridge; **that mirror must not be repurposed for linking either.**

### 2.2 Are the V1.1 fixes present? — 🧪 yes, both, at line numbers that have since moved

| Fix | V1.1 / brief says | 🔎 **Actually, today** |
|---|---|---|
| Village rule hoisted into the single-candidate branch | "line 81, not 88" | 🔴 **Neither. It is `lib/venue-matcher.ts:188-193`.** The branch reads `confidence: villageAgrees(village, cands[0].village, venueName) ? 'high' : 'low'`, wrapped in `applyDistanceCeiling`. The helper `villageAgrees` is at `:48-59`. **Line 81 is now inside `haversineKm`.** The line moved because `haversineKm`, `villageAnchors` and `applyDistanceCeiling` (`:75-129`) were inserted above it in the same session. |
| 15 km distance ceiling | present | ✅ 🔎 `export const VENUE_MATCH_MAX_KM = 15` at **`:73`**, applied at `:122-129`, called from `:189`, `:216`, `:221`. |

⚠️ **This is the standing hazard, demonstrated on itself:** a manual that cites `:81` for a fix now points at a distance formula. **Cite the symbol, not the line.** The fix is identifiable by `villageAgrees(` appearing inside the `cands.length === 1` branch — that grep is stable; the number is not.

*If this proved nothing:* finding the string `villageAgrees` in the file would not prove the single-candidate branch calls it — it could be dead. Ruled out by reading the executing line at `:190`, and 🧪 by behaviour: `findVenue` returns `low` for single-candidate matches whose village disagrees, which is only reachable through that call.

---

## 3. THE BACKLOG, SEGMENTED — 🧪 real `findVenue`, real data, all 2,229 rows

```
HIGH 1,057  ·  LOW 627  ·  NO MATCH 545
```

### 3.1 What "HIGH" is actually resting on

| | rows | note |
|---|---|---|
| HIGH whose target has **no coordinate** | **0** | a link that buys no pin |
| HIGH with a **real** distance check (village anchor built from ≥2 venues) | **774** | p50 **0.66** · p90 **3.42** · p99 **9.92** · max **10.58** km |
| 🔴 HIGH anchored to a **single-venue village — the anchor IS the matched venue** | **262** | distance is structurally 0.00 km. **The check did not run; it agreed with itself.** |
| HIGH with **no measurable distance** at all (no anchor) | **21** | risk **UNKNOWN**, not zero |

🔴 **283 of the 1,057 HIGH matches (26.8%) have no independent distance evidence** — 262 self-anchored plus 21 with no anchor. ⚠️ **This is V1.1's "21 low-confidence links covering 185 events" defect, and it is larger than V1.1 recorded**, because V1.1 counted only the no-anchor case and not the degenerate self-anchor case.

### 3.2 NO-MATCH by cause — 🔴 and most of it is not a data quality problem

| Cause | rows | Examples |
|---|---|---|
| **Venue genuinely absent** | **353** | `Black Horse Rampton`, `Wootton Community Centre`, `Estuary Park`, `The White Hart`, `CB1 Station Road` |
| **Festival / show — a real place, no venue row** | **91** | `Bures Music Festival`, `RHS Sandringham Flower Show`, `LeeStock Festival`, `Elmsfest` |
| **`venue_name` IS A TRUCK NAME** (own base / self-referential) | **42** | `Zaket Potato`, `Churro Boyz`, `Steak & Honour`, `Drina Bakes` |
| **village NULL and no candidate** | **39** | `The Pod`, `Downham Cider`, `10 Dereham Rd` |
| **NOT A VENUE — status text** | **20** | `Poss leave`, `Private Hire`, `TBC`, `Private Wedding` |

⚠️ **`village` is NULL on 76 unlinked rows in total**, 39 of which are in NO-MATCH. Where village is NULL, `villageAgrees` returns `false` by construction (🔎 `:54`, `:56`), so **every match for such a row is capped at LOW** — that is correct behaviour, not a bug, and it means a village-less row can never be auto-linked.

🔴 **The 20 status-text rows should not be linked at all — they should be excluded.** `Poss leave` and `Private Hire` are not places. They belong in the exclusion set, which 🔴 **is exactly the mechanism that is broken** (`excluded_terms`, scraper manual V1.2 §5.6 — 0 rows, every write refused). ⚠️ **Do not "fix" them by linking them somewhere.**

⚠️ **AND THE STANDING WARNING APPLIES TO THE 353.** An unusual venue name is not bad data. 🧪 `Incleboro Fields Caravan and Motorhome Club Campsite` (14 rows), `Kings Forest Car Park`, `Beach Street, Felixstowe` are **real pitches named by a nearby business or landmark**, exactly as V1.1 records for `Near the Co op Store`. **The correct action for these is venue creation (§6), not deletion and not a forced link.**

### 3.3 🔴 THE SCOPE FINDING THAT CHANGES THE JOB'S VALUE

🧪 Splitting the same segmentation by date:

| | HIGH | LOW | NO-MATCH | total |
|---|---|---|---|---|
| **FUTURE** (≥ 2026-09-08) | **25** | 248 | 43 | **316** |
| **PAST** | 1,032 | 379 | 502 | **1,913** |

🔴 **A job scoped the way `backfill-venue-id.ts` is scoped — 🔎 `:62`, `.gte('event_date', today)` — would link 25 rows today.** The hand pass on 7 September already took the easy future rows; what is left in the future is the residue it could not resolve. **The 1,032 HIGH rows are all in the past, which the map does not read.**

⚠️ **So "51.8% unlinked" overstates the operational problem and understates the archival one.** The map's exposure is 316 rows; the table's is 2,229. **The job must state which it is for.** My recommendation: **run over all dates**, because past links cost nothing, make the venue-quality problem measurable, and stop the backlog compounding — but **judge the job on the future rows**, because those are the ones a customer sees.

*If this proved nothing:* a matcher that says yes to everything also produces 1,057 HIGH. Three things rule that out here — 545 rows return `none` (🔎 `:174` is the only null path, and it fires on genuine absence); the HIGH population's measured distance distribution is tight (p90 3.42 km) where a yes-to-everything matcher would be flat; and 🧪 on the one ground-truth sample available it is **7/9 correct, not 9/9** — a matcher that said yes to everything would have been 9/9 by accident on a set where every row does have some candidate.

---

## 4. THE DUPLICATE-VENUE PROBLEM UNDERNEATH

🧪 **11 venue names cover 23 rows** as exact-name duplicates — `The Bell` ×3 (102.2 km spread), `The Five Bells` ×2, `THE VILLAGE INN` ×2, `The Fox` ×2, `Co Op` ×2, `The King's Head` ×2, `The Red Lion` ×2, `The Plough` ×2. **Plus the category families the brief names**, which are *not* exact duplicates and so are invisible to that count: 🧪 **9 `foodPark` rows** and **7+ `Off The Beaten Truck - …` rows**.

🧪 **Exposure of the proposal:** 28 of 1,057 HIGH links and 92 of 627 LOW links land on an exact-duplicate name. 🔴 **And 50 HIGH links land on the single generic `foodPark` row (`1a87cc8c`, CB2 0AA)** — the same row that is 5.64 km wrong for the worked example.

### 4.1 Order: 🔴 LINK FIRST, DECIDE THE PROBABLE TIER SECOND

| Order | What breaks |
|---|---|
| **Merge PROBABLE first, then link** | 🔴 **Irreversible on a judgement call.** The PROBABLE tier is 0.5–5 km — the report's own band of doubt — and set 16 still conflicts with a held 29.9 km coordinate correction. A merge deletes a row; §5's evidence shows the *wrong* row can be the tidier one. **Merging on 0.5–5 km before linking bakes an unreviewed decision into rows that cannot be recovered.** |
| ✅ **Link first, merge later** | ⚠️ One pitch is distributed across several ids, so a map shows two pins where there is one place, and per-venue counts are split. **Nothing is lost.** A later merge repoints `venue_id` with an `UPDATE` — 🧪 exactly what today's CERTAIN merge did to 125 rows. |

**Recommendation: link first.** 🔴 **A link is an UPDATE and is reversible; a merge is a DELETE and is not.** 🧪 The measured cost of waiting is bounded and small — **11 HIGH links land on a PROBABLE-tier id today** — and the cost of the other order is unbounded, because a wrong merge cannot be undone once the loser row is gone.

⚠️ **One coupling must be stated:** 🧪 `We Are Wintringham` (`efd231fa`), a PROBABLE-tier member, is **45.7 km from its own postcode** (§5). **It should be corrected or excluded as a link target regardless of what happens to the merge decision** — those are two separate problems that happen to name the same row.

---

## 5. WRONG-PIN PROTECTION — WHAT THE JOB CHECKS ON THE **TARGET**

🔴 **A correct link to a wrong venue is still a wrong pin.** The matcher validates the *match*; nothing today validates the *target*.

### 5.1 The degenerate anchor, quantified

🧪 **209 of 304 villages hold exactly one venue.** For those, `villageAnchors` (🔎 `lib/venue-matcher.ts:90-107`) computes the median of a one-element list — **the matched venue's own coordinate** — so `applyDistanceCeiling` (🔎 `:127`) measures the venue against itself, gets 0.00 km, and passes. 🧪 **262 HIGH matches are in that state.**

🔴 **THE JOB MUST TREAT A SELF-ANCHOR AS "NO EVIDENCE", NOT AS "PASSED".** Concretely: compute the anchor **excluding the candidate itself**; if fewer than 2 venues remain in that village, the distance verdict is **UNKNOWN**, and UNKNOWN never earns HIGH. ⚠️ This is the same principle `applyDistanceCeiling` already applies to a missing coordinate (🔎 `:124-126`, *"absence of distance evidence is absence of evidence"*) — **it is simply not applied to the degenerate case, and the degenerate case is 69% of villages.**

### 5.2 The independent check: the venue against **its own postcode**

The anchor asks "is this venue near the other venues in its village?" — circular where a village has one venue. **A postcode is an outside witness.**

🧪 **Executed against postcodes.io for all 400 venues carrying a postcode** (339 resolved; **20 postcodes are invalid/unresolvable**, e.g. the partial `CB21`):

```
self-consistency distance p50 0.38 · p90 2.53 · p95 3.23 · p99 15.75 · max 76.6 km
🔴 venues >5 km from their OWN postcode: 5 of 339
     76.6 km  "Hinchingbrooke house events" [Hinchingbrooke]  PE20 3RW
     45.7 km  "We Are Wintringham" [Wintringham]              PE8 6HX
     39.1 km  "The 'Case is Altered' pub" [Bentley]           CO10 8BG
     17.6 km  "Place Farm Shop" [Stuston]                     IP22 2TD
     15.8 km  "Sudbourne Village Hall" [Sudbourne]            IP12 3AT
```

🧪 **Exposure: 3 of 1,057 HIGH links and 0 of 627 LOW links target one of those five.**

### 5.3 🔴 AND HERE IS WHERE I MUST NOT REACH FOR A FIT

🧪 **This check does NOT catch the Wilbraham case.** `Great Wilbraham` is **2.56 km** from its own postcode — between p90 (2.53) and p95 (3.23), i.e. **inside the normal population**. No single-venue threshold catches it without flagging a tenth of the table.

**What actually decided it was a comparison between the two candidates:**

```
postcodes.io  CB21 5JQ           → 52.194755, 0.264658
  "Gt Wilbraham"    (pc "CB21", invalid)  0.02 km from that point   ← the human's choice
  "Great Wilbraham" (pc CB21 5JQ)         2.56 km from that point   ← findVenue's choice
```

🔴 **The row that carries the postcode is the row that is wrong about where it is.** So the rule is **not** "trust the candidate holding a postcode" — it is:

> **Postcode arbitration.** When a candidate set has ≥2 members, resolve *every* postcode present anywhere in the set via postcodes.io, and prefer the candidate whose stored coordinate is nearest to a resolved point. A candidate that *claims* a postcode but sits far from it is **demoted, not promoted**.

🧪 On this pair that rule returns `Gt Wilbraham` — the human's answer — by 0.02 km against 2.56 km. ⚠️ **It is verified on one case. It is a rule derived from a single worked example and must be validated on more before it is trusted to run unattended.** I am not going to present one confirmation as a validated rule.

### 5.4 What the job does when the target has no coordinate or a bad one

| Target state | Action |
|---|---|
| no coordinate | 🧪 1 venue (`+++ NEW VENUE +++`, `3e02799a` — junk that should be deleted). **Never link.** A `venue_id` with no coordinate buys no pin — 🔎 `backfill-venue-id.ts:75-80` already refuses these. |
| fails the placeholder / sentinel / UK-box gauntlet | 🧪 **14 venues fail** — 2 placeholder, 12 on the sentinel point `55.3781,-3.436` (the GB centroid). 🧪 **1 HIGH and 53 LOW links target one.** **Hold, report, never auto-apply.** |
| >5 km from its own postcode | 🧪 5 venues, 3 HIGH links. **Hold and report as a venue-correction task, not a linking task.** |
| **no postcode → uncheckable** | 🧪 **21 distinct venues, 56 HIGH links.** 🔴 **Report as UNKNOWN. Never silently treat uncheckable as clean** — that is the degenerate-anchor mistake in a different costume. |

---

## 6. VENUE CREATION — 🔴 THE JOB REPORTS; IT DOES NOT CREATE

**Recommendation: the job never inserts a `venues` row. It emits a candidate list for a human.**

Three reasons, each from evidence rather than caution:

1. 🔎 **`ignoreDuplicates: true` makes a wrong coordinate permanent.** `run-scraper.js:1833` is `ON CONFLICT DO NOTHING`, so once a row exists **no later run can correct it** — only a hand `UPDATE`. **An automated creator would be writing rows that only a human can ever fix, at machine speed.**
2. ⚠️ **The 21% no-pin cost is a decision, not a default.** Every coordinate must come from postcodes.io or the venue is stored with none; ambiguous village names get no pin, at a measured 21%. **A job that creates venues is silently making that trade hundreds of times.**
3. 🧪 **The worked example proves a human judgement is load-bearing.** `foodPark Cambridge North` had to be created *because* the eight existing `foodPark` rows are different sites. **Nothing in the data says "this is a ninth site" rather than "this is the generic one" — `findVenue` says the opposite, at HIGH, and is 5.64 km wrong.**

**What the job emits instead:** for each NO-MATCH cluster, a proposed row — name, village, the postcode it would resolve, the postcodes.io result (or `AMBIGUOUS`/`UNRESOLVED`), the event count, and the trucks involved. 🧪 Today that list is **353 genuinely-absent venues**, of which the largest are `Incleboro Fields Caravan and Motorhome Club Campsite` (14 events) and `Kings Forest Car Park`. ⚠️ **The 91 festival rows and the 42 truck-name rows are proposed as `DO NOT CREATE`** — a festival is a date-bound event, not a standing pitch, and creating one venue per festival pollutes the table permanently.

---

## 7. THE JOB, AS A DESIGN

### 7.1 Shape

**A GitHub Actions workflow, `link-venues.yml`, running `node`/`npx tsx` against the existing script — not a Vercel cron and not an API route.**

| Choice | Why |
|---|---|
| GitHub Actions, not Vercel cron | 🔎 The two existing scraper workflows already hold `SUPABASE_SERVICE_ROLE_KEY` and run Node directly; a Vercel cron has a 60 s ceiling that a 2,229-row × 559-venue pass and ~400 postcodes.io calls would strain. |
| Not an API route | Nothing user-facing triggers this, and an HTTP surface is an attack surface for a service-role write. |
| **Daily, after the discovery scrape** — `30 6 * * *`, 30 minutes after `daily_scrape.yml`'s `0 6 * * *` | Links what the morning scrape just wrote, while the scrape's own venue creations are fresh. |

### 7.2 Two modes, and only one of them writes

- **`--report` (default, and what the cron runs):** re-derives everything from the database, writes the tiered proposal as a workflow artefact, **writes nothing to the database.**
- **`--apply`:** applies **only** rows that pass every gate in §5 **and** are HIGH **and** have a non-degenerate distance check. 🔴 **Manually dispatched (`workflow_dispatch`), never on the schedule** — until the arbitration rule in §5.3 has been validated on more than one case.

⚠️ **This is deliberately less automatic than "an automated job".** The brief asks for a repeatable job rather than a one-off pack, and this is repeatable, scheduled and self-deriving. **What it does not do is write unattended, because §5.3's decisive rule currently rests on a single verified case and the HIGH tier is 7/9 on the only ground truth available.** Auto-apply becomes appropriate when that sample is larger — that is a threshold, not a refusal.

### 7.3 Idempotence and reversal

- **Idempotent by guard:** every write is `UPDATE … WHERE id = $1 AND venue_id IS NULL`, so a re-run affects 0 rows and **can never overwrite an existing link.** 🔎 The existing script already does this (`:91`, `:141`).
- **Reversal:** each run writes a snapshot `{ runId, appliedIds[], updates[] }`; reversal is `UPDATE discovery_events SET venue_id = NULL WHERE id = ANY(...)`. 🔴 **Safe precisely because every target was NULL** — nothing is overwritten, so undo restores the exact prior state.
- ⚠️ **`updated_at` cannot be used for any of this.** 🧪 Zero of the 4,300 rows have `updated_at ≠ created_at`, including the 125 repointed by today's merge. **The snapshot is the only record that a run happened.** The job must therefore also write a row per run to a log table — 🔎 `supabase/migrations/20260907_discovery_run_log.sql` exists for the scraper and is **not applied**; the same table would serve.

### 7.4 🔴 How it goes red — the eight-exits-0 problem

The manual records eight paths that once exited 0 on failure. This job fails loudly on each of:

| Condition | Why it is fatal, not a warning |
|---|---|
| `venues` returns 0 rows, or fewer than 400 | 🔎 `findVenue:161` returns `none` for an empty venue list — **an empty read looks exactly like "nothing matches"** and would report a clean 0-link run. |
| `discovery_events` read errors, or returns 0 unlinked | distinguishes "nothing to do" from "the query failed". |
| postcodes.io unreachable | 🔎 `geo-validate.js:240` already states the rule: **an outage is UNKNOWN, never "no"**. Without it §5 cannot run, so the job must not fall through to applying unverified links. |
| any DB write returns an error in `--apply` | accumulate and **throw at the end**, mirroring the scraper's `dbWriteFailures`/`assertNoWriteFailures`. |
| HIGH count swings >3× from the previous run | a matcher or schema change; stop and report. |

🔴 **AND THE LESSON THE MANUAL EARNED TODAY:** `excluded_terms` has failed loudly on every scraper run since 4 June into `dbWriteFailures`, and nobody read it. **A non-zero exit is only a signal if someone sees it.** This job must fail the **workflow**, so the red tick appears in the Actions tab, and its summary must be written to `$GITHUB_STEP_SUMMARY` where it is visible without opening the log.

### 7.5 🔴 What would prove it worked IN PRODUCTION

Not "the script ran". Not a local dry run. **All four, measured against production after a scheduled run:**

1. 🧪 **`count(*) WHERE venue_id IS NULL` fell by exactly the number of rows the snapshot claims** — and the snapshot's `appliedIds` all read back non-null.
2. 🧪 **The public API's pinnable count rose.** `GET /api/discovery/events` joins `venues!venue_id` and maps coordinates at 🔎 `app/api/discovery/events/route.ts:163`; **the number of returned events carrying `venueLat` is the customer-visible metric** and is the only one that proves a link became a pin.
3. 🧪 **A spot-check of 10 applied links against postcodes.io** — the linked venue within 5 km of the event's village. **Sampled after the fact, from production, not from the job's own output** — a job cannot validate itself with the rule it used to decide.
4. 🧪 **Re-running immediately affects 0 rows.** That is the idempotence claim, and it is the cheapest one to test.

*If these proved nothing:* count 1 alone is satisfied by linking every row to one arbitrary venue. Check 2 fails that (pins would cluster), and check 3 fails it outright. **The four together cannot be passed by a matcher that says yes to everything** — which is the failure mode this design is most exposed to.

---

## 8. WHAT THE JOB WOULD DO ON THIS RUN

🧪 All 2,229 unlinked rows, real `findVenue`, live data, 8 September 2026.

| Tier | Rows | The job's action |
|---|---|---|
| **HIGH — clean** | **~774** *(HIGH with a non-degenerate anchor, minus gauntlet/postcode failures)* | propose for apply |
| **HIGH — held** (self-anchored 262, no anchor 21, bad/uncheckable target 59) | **~283** | 🔴 **hold: no independent distance evidence** |
| **LOW** | **627** | review only, never auto-applied |
| **NO MATCH** | **545** | 353 venue-creation candidates · 91 festivals `DO NOT CREATE` · 42 truck-name rows · 39 village-NULL · 20 not-a-venue |

⚠️ **Of the ~774 proposable, 🧪 only 25 are future-dated** (§3.3). **The visible effect on the map this run is 25 pins.**

### 8.1 HIGH sample (20 of 1,057) — venue chosen and distance

```
2026-06-20 Guerrilla Kitchen  "Off The Beaten Truck - Northstowe"[Northstowe] → same          0.11 km  anchorN=8   ✅
2026-07-01 Pig-Casso's        "foodPark"                        [Cambridge]  → "foodPark"     3.42 km  anchorN=30  🔴 see 8.4
2026-07-21 Spudette           "The Old School"                  [Gt Cornard] → same           0.00 km  anchorN=1   🔴 SELF-ANCHOR
2026-06-10 Big Bite Kebab     "Big Bite Hadleigh"               [Hadleigh]   → same           3.06 km  anchorN=8   ✅
2026-07-23 Just Baked         "Off The Beaten Truck - Railway"  [Saffron W.] → same           0.66 km  anchorN=11  ✅
2026-06-21 Spudette           "Sudbury Market"                  [Sudbury]    → same           1.76 km  anchorN=8   ✅
2026-06-27 Scotties Hot Scotch"Ely Market"                      [Ely]        → same           0.03 km  anchorN=3   ✅
2026-08-28 Nomadough          "FoodPark CB1"                    [Cambridge]  → same           1.21 km  anchorN=30  ✅
2026-09-02 Travelling Friar   "Norwich Road"                    [Claydon]    → same           0.98 km  anchorN=4   ✅
2026-07-19 Eat Greek          "Nethergate Brewery"              [Long Melford]→ same          0.50 km  anchorN=4   ✅
2026-07-09 Wok Wraps          "Beach Street, Felixstowe"        [Felixstowe] → same           0.00 km  anchorN=2   ✅
2026-08-27 Pizza Mondo        "foodPark"                        [Cambridge]  → "foodPark"     3.42 km  anchorN=30  🔴
2026-07-26 Kezmet Turkish     "Nethergate Brewery"              [Long Melford]→ same          0.50 km  anchorN=4   ✅
2026-07-16 Nomadough          "foodPark"                        [Cambridge North] → "foodPark"  d=n/a  anchorN=—   🔴 NO ANCHOR
2026-07-18 Wok Wraps          "Beach Street, Felixstowe"        [Felixstowe] → same           0.00 km  anchorN=2   ✅
2026-06-05 La Biga Pizzeria   "Haslingfield Village Hall"       [Haslingfield]→ same          0.00 km  anchorN=1   🔴 SELF-ANCHOR
2026-06-26 Pimp My FIsh       "The Green"                       [Northstowe] → "The Green"    4.19 km  anchorN=8   ⚠️ category name
2026-08-12 Spudette           "Sudbury Market"                  [Sudbury]    → same           1.76 km  anchorN=8   ✅
2026-08-18 Pimp My FIsh       "Mandeville Hall"                 [Burwell]    → same           0.92 km  anchorN=4   ✅
2026-08-21 Pig-Casso's        "Off The Beaten Truck - Northstowe"[Northstowe]→ same           0.11 km  anchorN=8   ✅
```

### 8.2 LOW sample (20 of 627) — **and why each is low**

```
2026-06-23 Wok Wraps        "Star Wing Events ( Tap Room )"[Diss]        → "The Star"          43.14 km  village disagrees + ceiling breached
2026-07-24 Ice Cream        "OTBT - Wintringham"          [Wintringham]  → "OTBT, Wintringham"  4.65 km  2 candidates, neither exact
2026-06-19 Zaket Potato     "The Railway Tavern"          [Norwich]      → same                23.76 km  ceiling breached — different Tavern
2026-09-24 Travelling Friar "The Street"                  [Capel St Mary]→ "The Street"          d=n/a   🔴 category name, 2 rows, no anchor
2026-09-04 Holy Loaded      "The Bull"                    [Bottisham]    → "The Bull"          26.94 km  3 "The Bell"/"Bull" family, wrong one
2026-07-13 Manna Seoul      "Jesus Green"                 [Cambridge]    → "The Green"         12.56 km  🔴 token overlap only — different place
2026-07-20 Manna Seoul      "The Gog"                     [Cambridge]    → "The GOG Farm Shop"  5.97 km  plausible; unverified
2026-06-11 Real Thai Food   "Needham Market Co-op, Barking"[Needham Mkt] → "Co Op"             28.39 km  🔴 category name, wrong branch
2026-10-09 Perky Beans      "The Bull Pub"                [Great Paxton] → "The Bull Pub"      36.34 km  ceiling breached
2026-08-20 Nomadough        "FoodPark Science Park"       [Milton]       → same                 9.69 km  village mismatch (Milton vs Cambridge)
2026-07-25 Spudette         "Kings Head Public House"     [Unknown]      → same                 0.60 km  village literally "Unknown" ⇒ capped low
2026-08-14 Pimp My FIsh     "foodPark"                    [CB1]          → "foodPark"           d=n/a   village is a postcode fragment
2026-06-05 Pecoro On The Road"Eat Street MK"              [∅]            → "The Street"          d=n/a   🔴 village NULL + category collision
2026-07-29 Spudette         "Mid-Suffolk Light Railway"   [Mid-Suffolk]  → "The Railway Inn"     d=n/a   token overlap only
2026-10-01 White Gold       "Royal Square"                [Royal Square] → same                  d=n/a   village = venue name; no anchor
2026-11-13 Hot Dog Mafia    "Blackpit Brewery"            [Stow-Bridgwater]→ same                d=n/a   no anchor for that village
2026-06-09 Eat Greek        "The Royal Oak"               [Warboys]      → same                  d=n/a   single candidate, village unverifiable
2026-06-14 Drina Bakes      "Taste of East Anglia Food&Dr"[Sudbury]      → same                  0.14 km  ⚠️ festival row that DOES have a venue
2026-07-19 Zaket Potato     "The Railway Tavern"          [Norwich]      → same                23.76 km  duplicate of the 06-19 case
2026-09-08 Travelling Friar "The Street"                  [Capel St Mary]→ "The Street"          d=n/a   category name
```

🔴 **Nothing in this tier is proposed for apply.** The recurring causes are: the ceiling breached (a real "no"), a **category name** matching the wrong branch, and **no measurable distance** — and the last of those is *absence of evidence*, which is why it cannot be promoted.

### 8.3 NO-MATCH sample (20 of 545)

```
2026-06-28 Pizza Passione  "Black Horse Rampton"                    [Rampton]      → CREATE candidate
2026-07-24 BB Pizza        "Wootton Community Centre"               [Wootton]      → CREATE candidate
2026-10-06 Marky D's       "Incleboro Fields Caravan & Motorhome…"  [West Runton]  → CREATE candidate (14 events)
2026-09-27 Pigs In         "Kings Forest Car Park"                  [West Stow]    → CREATE candidate ⚠️ landmark pitch, NOT bad data
2026-08-13 Naked Fish      "Downham Cider"                          [Downham]      → CREATE candidate
2026-06-07 Eat Greek       "School Event"                           [Milton Keynes]→ ⚠️ too generic to create
2026-06-27 Marky D's       "Lingwood England Football"              [Lingwood]     → ⚠️ event, not a pitch
2026-07-09 Test Kitchen    "Music Festival"                         [Bures]        → DO NOT CREATE (festival)
2026-07-05 Manna Seoul     "Stowmarket Food & Drinks Festival"      [Stowmarket]   → DO NOT CREATE (festival)
2026-05-23 PIzza on Green  "LeeStock Festival"                      [∅]            → DO NOT CREATE (festival, village NULL)
2026-09-06 Suffolk Pig Roast"Elmsfest"                              [Elmswell]     → DO NOT CREATE (festival)
2026-09-27 The Forge Kitchen"The Great Feast"                       [Euston Hall]  → DO NOT CREATE (festival)
2026-07-16 Zaket Potato    "Zaket Potato"                           [Norwich]      → truck name as venue (29 rows)
2026-08-22 Churro Boyz     "St Neots"                               [St Neots]     → town, not a pitch
2026-09-12 Marky D's       "Cantly Fun Day"                         [Cantley]      → event
2026-07-12 Belle's Kitchen "PIE Performance Porsche"                [Ipswich]      → ⚠️ business pitch — CREATE candidate
2026-05-26 Belle's Kitchen "Tack & Turnout"                         [Ipswich]      → ⚠️ business pitch — CREATE candidate
2026-06-05 Askers Pizza    "APS Projects"                           [∅]            → business pitch, village NULL
2026-06-06 Smother Spudders"Baron Brewing"                          [∅]            → CREATE candidate, village NULL
2026-09-08 Marky D's       "Transit Mot"                            [Unknown]      → ⚠️ probably not a venue
```

### 8.4 🔴 THE FOUR SITUATIONS FROM YOUR WORKED EXAMPLE

🧪 The nine surviving Pizza Mondo rows, 9–12 September, each run through the real matcher:

| Your case | What `findVenue` does | 🔴 What the job does |
|---|---|---|
| **5 unambiguous** (Thirsty, OTBT-The Common, Darwin Green, FoodPark CB1, The Fox, Three Horseshoes) | ✅ agrees, HIGH, 0.26–3.12 km, all with real anchors | **applies** |
| **1 duplicate of an already-linked row** (`Alconbury Weald` vs `OTBT - Alconbury`) | 🧪 the row is already gone — 9 rows remain of your 10 | 🔴 **the job NEVER deletes.** It emits a `DUPLICATE-SUSPECT` list: same truck + same date + a different `venue_name` resolving within 1 km. **Deletion stays a human act** — the manual records that the only automated deletion in this pipeline is a 90-day log prune, and it should stay that way |
| **1 needs a venue CREATED** (`foodPark` → Cambridge North, CB4 0AE) | 🔴 **returns the generic `foodPark` at HIGH, 3.42 km, anchorN=30 — a 5.64 km error, and the ceiling passes it** | 🔴 **This is the case that forbids auto-apply.** The job routes any match onto a **category-name** target (`foodPark`, `Village Hall`, `The Street`, `The Common`, `Co Op`, `Off The Beaten Truck`) to **HELD**, whatever the confidence, and emits a create-candidate. 🧪 **50 HIGH links target the generic `foodPark` row today** |
| **1 with two candidates 2.5 km apart, tidier name = worse coordinate** (`Great Wilbraham` / `Gt Wilbraham`) | 🔴 **picks `Great Wilbraham` at HIGH** — `pickBest` (🔎 `:143-145`) ranks exact-name first, and the tidier name is the exact match | 🔴 **Postcode arbitration (§5.3).** 🧪 postcodes.io CB21 5JQ → 0.02 km from `Gt Wilbraham`, **2.56 km from the row that carries that very postcode**. The job prefers the nearer candidate — your answer. ⚠️ **Verified on this one case only** |

---

## 9. WHAT REMAINS UNRESOLVED

- 🔴 **The postcode-arbitration rule (§5.3) is validated on ONE case.** It must be run against a larger hand-checked sample before `--apply` runs on a schedule. **Until then this design is deliberately not fully automatic.**
- 🔴 **`findVenue` is 7/9 on the only ground truth that exists.** Nine rows is not a validation set. **The HIGH tier's true precision is UNKNOWN**, and the two failures were both category/duplicate cases, which is a pattern but not yet a measurement.
- ⚠️ **20 of 400 venue postcodes are invalid** (partials like `CB21`) and cannot be arbitrated at all.
- ⚠️ **21 HIGH-target venues carry no postcode** — uncheckable, reported as UNKNOWN.
- 🔴 **`excluded_terms` is still broken** (0 rows, every write refused), so the 20 not-a-venue rows have no mechanism to be excluded through.
- ⚠️ **`+++ NEW VENUE +++`** (`3e02799a`) is a junk row in `venues` with no coordinate. Not investigated.
- ⚠️ **Whether the PROBABLE tier should be merged at all** — unchanged from the consolidation report; this design deliberately does not depend on the answer.

---

## 10. STATE AT END

Row counts END = START: `discovery_events` **4,300**, `venues` **559**, unlinked **2,229**.

`git status --short`:

```
 M .gitignore
 M app/admin/page.tsx
 M app/api/cron/custom-domain-check/route.ts
 M app/api/manage/route.ts
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M app/o/[slug]/page.tsx
 M components/EventListCard.tsx
 M components/dashboard/CustomDomainSetup.tsx
 M components/dashboard/DemoWelcome.tsx
 M components/dashboard/types.ts
 M components/landing/LandingFooter.tsx
 M docs/manual-update-report.md
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/custom-domain/copy.ts
 M lib/custom-domain/dns.ts
 M lib/custom-host.ts
 M lib/landing-table.ts
 M lib/meta/webhook-signature.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M lib/venue-matcher.ts
 M lib/whatsapp/connection-state.ts
 M proxy.ts
 M public/badges/README.md
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/android-golive-landing-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
?? docs/geocoder-validation-report.md
?? docs/hatches-up-comparison-report.md
?? docs/hatches-up-import-report.md
?? docs/hatches-up-recheck-report.md
?? docs/hatches-up-reconciliation-report.md
?? docs/hatches-up-source-report.md
?? docs/hatchesup-events.csv
?? docs/hatchesup-online-ordering.csv
?? docs/hatchesup-online-ordering.md
?? docs/hatchesup-ordering.csv
?? docs/hatchesup-trucks-tagged.md
?? docs/hu-columns-build-report.md
?? docs/hu-columns-report.md
?? docs/hu-reconciliation-report.md
?? docs/local-dev-host-report.md
?? docs/order-link-outage-report.md
?? docs/order-route-rename-report.md
?? docs/order-url-routes-report.md
?? docs/outreach-manual-dates-report.md
?? docs/outreach-modal-report.md
?? docs/outreach-modal-v2-report.md
?? docs/outreach-page-report.md
?? docs/outreach-phone-and-sort-report.md
?? docs/outreach-phone-column-report.md
?? docs/outreach-platform-edit-report.md
?? docs/outreach-tab-report.md
?? docs/outreach-ui-fixes-report.md
?? docs/pimp-my-fish-manual-events-report.md
?? docs/pimp-my-fish-source-report.md
?? docs/platform-detection-report.md
?? docs/pricing-suppression-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-reference-manual.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
?? docs/trucklist.txt
?? docs/venue-consolidation-report.md
?? docs/venue-coords-and-run-log-report.md
?? docs/venue-creation-diagnosis-report.md
?? docs/venue-creation-fix-report.md
?? docs/venue-link-apply-report.md
?? docs/venue-linking-report.md
?? docs/venue-linking-scope-report.md
?? docs/venue-matcher-fix-report.md
?? docs/venue-pipeline-report.md
?? docs/vf-map-events-report.md
?? docs/whatsapp-connections-build-report.md
?? docs/whatsapp-connections-fk-fix-report.md
?? docs/whatsapp-embedded-signup-s4-s5-report.md
?? docs/whatsapp-embedded-signup-scope-report.md
?? docs/whatsapp-embedded-signup-v4-report.md
?? docs/whatsapp-extraction-report.md
?? docs/whatsapp-golive-build-report.md
?? docs/whatsapp-golive-copy-report.md
?? docs/whatsapp-golive-decision-report.md
?? docs/whatsapp-golive-heading-report.md
?? docs/whatsapp-threshold-report.md
?? docs/whatsapp-token-expiry-report.md
?? docs/whatsapp-token-issued-at-report.md
?? docs/whatsapp-v4-landed-report.md
?? lib/app-badges.ts
?? lib/clipboard.ts
?? lib/custom-domain/alert.ts
?? lib/custom-domain/check.ts
?? lib/outreach.ts
?? lib/whatsapp-hint.ts
?? lib/whatsapp/connection-read.ts
?? lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/token-crypto.ts
?? public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
?? scripts/geo-validate.js
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**28 modified, 99 untracked, 0 staged** — the only change this pass made to the tree is this report file itself. `HEAD = 801de1c`, `origin/main = 08ac368`, local ahead 1 with the previously-committed demo-layout change, still unpushed. **No database row written. No migration. No code file changed. Nothing staged, committed or added.**
