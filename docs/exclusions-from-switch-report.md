# `EXCLUSIONS_FROM` — the first of the four read switches

**Date:** 9 September 2026 · **Change:** `scripts/run-scraper.js`, one file, **+178 / −5**, uncommitted. **No database row inserted, updated or deleted. No Sheet cell modified. No migration applied. Nothing staged, committed or pushed; `git add` not run.** The default is **not** flipped, the Sheet read is **not** removed, and `excluded_terms` is **not** touched.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (command and output quoted) · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped — `grep -n` over `scripts/run-scraper.js` (**JavaScript**) and `.github/workflows/*.yml` by explicit path; every search's output is quoted below, and the two `grep -c` calls on the workflows returned `0`/`0` with exit 1 (a true negative), not exit 2 (a failed search).

---

## 0. Row counts and working tree — START and END

| | START 20:35:17Z | END 20:42:07Z |
|---|---|---|
| `venues` | **814** | **814** |
| `discovery_exclusion_terms` | **143** | **143** |
| `excluded_terms` | **0** | **0** |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_trucks` | 231 | 231 |
| `scraper_run_log` | **418** | **418** |

🧪 All three of the prompt's established facts confirmed rather than assumed: `venues` **814**, `discovery_exclusion_terms` **143**, and `excluded_terms` still **0**. ⚠️ `scraper_run_log` is unchanged at 418 even though my hatchgrab test runs call `pruneScraperRunLog` — 🧪 0 rows are older than 90 days, so the delete removed nothing.

**`git status --short`** — identical at START and END (5 `M`, 11 `??`, `HEAD` = `6fe8634`, nothing staged). The only file whose content changed is `scripts/run-scraper.js`.

### Step 1 — stop conditions

🧪 `git diff --stat scripts/run-scraper.js` at START: **+20 / −3**, and the full diff is **only** the Pass B Sheet decoupling — the `RUN_DISCOVERY` gate on the credential check, the Sheets client and the four-tab read, exactly as `docs/passb-sheet-decoupling-report.md` describes. **Nothing else was in the file. STOP condition not met; proceeded.**

⚠️ **Line numbers: the prompt cites `:453` and `:861`; those are correct for the file at `HEAD`.** In the working tree the uncommitted Pass B change shifts everything after it by +17, so the build was at **`:470`** and the filter at **`:877-878`** when I started. Both are right for their version — recorded because the manual's standing rule is that a stale pointer is worse than none.

---

## 1. Step 2 — the switch

🔎 The whole of it:

```js
const EXCLUSIONS_FROM_RAW = (process.env.EXCLUSIONS_FROM || '').trim();
const EXCLUSIONS_FROM = EXCLUSIONS_FROM_RAW.toLowerCase() === 'db' ? 'db' : 'sheet';
if (EXCLUSIONS_FROM_RAW && !['db', 'sheet'].includes(EXCLUSIONS_FROM_RAW.toLowerCase())) {
  console.log(`   ⚠️  EXCLUSIONS_FROM="${EXCLUSIONS_FROM_RAW}" is not recognised — falling back to 'sheet'. …`);
}
```

🔴 **The ternary can only ever yield `db` or `sheet`, and only the exact string `db` (case-insensitively) yields `db`. Every other value — including a typo — falls to `sheet` by construction, not by a branch that could be got wrong.**

**Behaviour for the four values asked about, 🧪 each one executed:**

| value | result | announced? |
|---|---|---|
| `EXCLUSIONS_FROM=DB` | 🧪 **db** — `🔀 EXCLUSIONS_FROM=db → using 143 term(s) from the DATABASE.` | no warning — it is the same word |
| `EXCLUSIONS_FROM=Db` | 🧪 **db** — identical | no warning |
| `EXCLUSIONS_FROM=true` | 🧪 **sheet** — `⚠️ EXCLUSIONS_FROM="true" is not recognised — falling back to 'sheet'.` | 🔴 **yes, loudly** |
| `EXCLUSIONS_FROM=""` | 🧪 **sheet** — `🔀 EXCLUSIONS_FROM=sheet (default)` | no warning |
| *(unset)* | 🧪 **sheet (default)** | no warning |
| `EXCLUSIONS_FROM=sheet` | 🧪 **sheet** | no warning |

**Why case-insensitive rather than strict.** 🔎 `SCRAPE_MODE` in the same function already does `(process.env.SCRAPE_MODE || '').toLowerCase()` — matching the file's existing idiom matters more than a stricter rule that would surprise anyone who has read the twenty lines above it. `DB` is not a typo; `true` is, and it is the one that gets a message. ⚠️ **An empty value is deliberately silent** — "unset" is the normal state, and warning on it would train the reader to ignore the warning that matters.

---

## 2. Step 4 — what the DB set is, and the proof

🔴 **I read `term_key` directly. I did not re-normalise `term`.**

**Why:**
1. 🔎 The column is *defined* as the value the scraper compares (`supabase/migrations/20260909_discovery_exclusion_terms.sql`), and the **UNIQUE index is on `term_key`** — so it is the value whose distinctness the database guarantees.
2. 🔴 Re-normalising would apply **today's** `normalizeName` to a value normalised by whatever version wrote it. If the normaliser ever changes, two stored keys could collapse into one and **the set would silently shrink with no error**.

**The proof the prompt asked for** — 🧪 executed against all 143 live rows with `normalizeName` copied verbatim from `run-scraper.js:55-64`:

```
rows: 143
identical: 143/143
DIFFERENT: 0
empty term_key: 0   distinct: 143
```

**So the choice changes nothing today** — both routes give the same 143-term set. It is a choice about which one stays correct later.

⚠️ **And because "the same today" is not "the same forever", the read verifies it every run:**

```js
dbKeyDrift = exRows.filter(r => normalizeName(r.term || '') !== (r.term_key || ''));
```

🔴 If a stored key ever stops matching what this scraper's normaliser produces, the terms and the truck names they are compared against are being normalised differently — **terms silently stop matching, which is under-filtering, which is invisible.** With the flag on `db` that **throws**; with the flag on `sheet` it warns (filtering is unaffected). 🧪 0 drift today.

---

## 3. Step 3 — the control

🔴 **Both sets are built on every discovery run, whatever the flag says.** The one the flag did not select is built for comparison only and **cannot reach the filter**, because the filter reads `excludedTerms` and only the selected set is ever copied into it:

```js
const excludedTerms = new Set(EXCLUSIONS_FROM === 'db' ? dbExclusionSet : sheetExclusionSet);
```

At the filter site the two concerns are **separate statements**, so the control structurally cannot influence the decision:

```js
const termHit = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
recordExclusionControl(truckName, normRawTruck, site.url);   // return value discarded
const isExcluded = termHit && site.sourceType !== 'truck';
```

**What it reports.** At startup, membership: each side's count, and the terms in one and not the other. At the end of Pass A, 🔴 **decision equivalence** — whether the two sets gave the same verdict on **every extracted truck name this run** — with each disagreement named.

🔴 **Decision equivalence, not set equality, and the difference is the whole point.** Two sets can differ in membership and filter identically (a term nothing matches); two sets can have **equal counts** and still disagree on a name. Both cases are demonstrated in §5.

⚠️ **One asymmetry the control papers over, recorded in the code so it is not lost:** when the model proposes a new exclusion mid-run, 🔎 the append at `:800` writes it to **the Sheet only** — nothing writes it to `discovery_exclusion_terms`. I add it to both in-memory control sets so the diff stays a comparison of the two *sources* rather than an artefact of which was selected, **but after the default flips an auto-exclusion would not survive the run.** That is the still-open `:784-790` guard problem (manual §11.2) and **must be settled before `EXCLUSIONS_FROM=db` becomes the default.**

---

## 4. Step 5 — failure behaviour

🔴 **An empty exclusion set does not fail; it quietly lets everything through** — "live music", "quiz night", "TBC", "Transit Mot due" all become trucks, on a green run. So the rules are asymmetric by design, because the consequence differs by which set is in use:

| condition | flag = `db` | flag = `sheet` |
|---|---|---|
| DB read errors | 🔴 **THROW — run goes red** | ⚠️ warn; the control is marked NOT RUN; scraping continues |
| DB returns **0 rows** | 🔴 **THROW** | ⚠️ warn |
| stored `term_key` drift | 🔴 **THROW** | ⚠️ warn |

**The reasoning for the right-hand column:** when the Sheet set is in use a DB failure cannot affect filtering, so failing the run would take scraping down **for a comparison**. Loud, not fatal.

🧪 **Executed, with a bogus service key to force the read to fail:**

```
db    + DB unreadable → exit=1
   💥 SCRAPER RUN FAILED: EXCLUSIONS_FROM=db but discovery_exclusion_terms could not be read:
      [undefined] Invalid API key. Refusing to scrape with no exclusion set — set
      EXCLUSIONS_FROM=sheet to fall back deliberately.

sheet + DB unreadable → exit=0
   ⚠️  Exclusion control unavailable — could not read discovery_exclusion_terms: [undefined] Invalid API key
   🔬 EXCLUSION CONTROL: NOT RUN (the database set could not be read). No comparison was made this run.
```

### 🔴 A real bug this found, caught by running and not by reading

🧪 My first version gated the *read* on `RUN_DISCOVERY` but not the *failure rules*. So `EXCLUSIONS_FROM=db` in a **hatchgrab** run left `dbExclusionSet` null and threw:

```
SCRAPE_MODE=hatchgrab EXCLUSIONS_FROM=db  →  exit=1
   💥 SCRAPER RUN FAILED: EXCLUSIONS_FROM=db but discovery_exclusion_terms could not be read: null.
```

🔴 **Pass B does not use the exclusion set at all, and both workflows carry the same env block — so a copy-pasted flag would have killed the hourly operator-truck job on a set it never reads.** That is exactly the fault the Pass B Sheet decoupling removed, reintroduced through the back door. Fixed by gating the rules on `RUN_DISCOVERY`, with the reason recorded in the code. 🧪 Re-tested: `hatchgrab + db → exit=0`, reaching `NO-OP: 3 truck(s) enrolled, 0 due this run`, while `discovery + db + unreadable` still exits 1.

---

## 5. Step 6 — proof, run not asserted

### 5.1 The real script, executed

🧪 `SCRAPE_MODE=discovery node scripts/run-scraper.js "__no_such_truck__"` — a target matching no truck, so **0 sites, 0 Gemini calls, 0 Sheet appends, 0 database writes** (row counts in §0 are identical at both ends).

| run | output |
|---|---|
| **flag unset** | `🔀 EXCLUSIONS_FROM=sheet (default) → using 143 term(s) from the SHEET.` · `🔬 EXCLUSION CONTROL — sheet 143 term(s), db 143 term(s).` · `✅ membership identical.` · exit 0 |
| **`=db`** | `🔀 EXCLUSIONS_FROM=db → using 143 term(s) from the DATABASE.` · same control lines · exit 0 |
| **`=nonsense`** | `⚠️ EXCLUSIONS_FROM="nonsense" is not recognised — falling back to 'sheet'.` then `🔀 EXCLUSIONS_FROM=sheet` · exit 0 |

⚠️ **All three also printed:** `🔬 EXCLUSION CONTROL: 0 truck names reached the filter, so decision equivalence is UNTESTED this run.` **That is honest and it is the point** — with no sites, the membership diff ran and the decision diff could not. **It is reported as untested rather than as agreement.**

### 5.2 🔴 Decision equivalence, and forcing the divergence

A 0-site run cannot exercise the filter, and a real Pass A run would scrape ~109 sites and **write**. So decision equivalence was proven with a harness that **extracts the file's own source text at runtime and executes it** — `normalizeName`, `isFuzzyMatch`, `recordExclusionControl` and the selection expression are pulled out of `scripts/run-scraper.js` by regex and evaluated in one scope mirroring the file's. **Nothing is retyped:**

```
EXTRACTED VERBATIM from scripts/run-scraper.js — the file's own source text, not retyped:
   normalizeName 10L · isFuzzyMatch 27L · recordExclusionControl 7L
   selection expression: const excludedTerms = new Set(EXCLUSIONS_FROM === 'db' ? dbExclusionSet : sheetExclusionSet);
```

Inputs are live and read-only: the Sheet's 143 Exclusions rows, the 143 DB rows, and **176 distinct real truck names** from all 4,300 `discovery_events`.

| # | scenario | sets | decision disagreements | filtering |
|---|---|---|---|---|
| **1** | **today's real data, unmutated** | 143 / 143 | 🧪 **0** across 176 names | 🧪 **identical** — both exclude the same 5 |
| **2** | 🔴 **`Pizza Mondo` added to the DB set only** | 143 / 144 | 🧪 **1** — `"Pizza Mondo" — sheet: keep · db: EXCLUDE` | 🧪 **DIVERGE** — 5 vs 6; db-only: `["Pizza Mondo"]` |
| **3** | one sheet term swapped for `Buffalo Joes` | 143 / 143 — **counts match** | 🧪 **1** — `"Buffalo Joe's" — sheet: EXCLUDE · db: keep` | 🧪 **DIVERGE** — 6 vs 5 |
| **4** | a term no name matches added to the DB | 143 / 144 — **membership differs** | 🧪 **0** | 🧪 **identical** |

🔴 **What this would look like if the switch were doing nothing.** A flag read nowhere and a flag read correctly produce identical output whenever the two sets agree — and on today's data they agree exactly (scenario 1). **Scenario 2 is the discriminator: with a term in one source only, the two paths exclude different sets of real truck names.** A flag that was not wired could not produce that. **Scenario 3 shows why equal counts prove nothing, and scenario 4 shows why set inequality over-reports** — together they are the reason the control measures decisions rather than membership.

### 5.3 ⚠️ A finding from scenario 1, not part of the task

🧪 The five real truck names both sets exclude **today** are `Just Baked by Sophie`, `The Linton Kitchen`, `Dessert MK`, `Axle & Hop`, `Off The Beaten Truck` — **exactly the five terms flagged `hits_truck` in Step 2.** 🔴 **These are five real trucks being silenced right now, by both sources equally.** The switch neither causes nor fixes it; it is the standing poison problem (manual §11, §16.2) confirmed against live data. **Flipping the default will not change it, and neither will leaving it.**

---

## 6. What changed, and what has not

**One file, `scripts/run-scraper.js`, +178 / −5.** The whole exclusion block is new; the two edits to existing lines are the `recordExclusionControl` call beside the filter and the control summary beside the existing Pass A tally.

🔴 **NOTHING CHANGES UNTIL THIS IS DEPLOYED AND THE FLAG IS SET IN A WORKFLOW.** 🧪 `grep -c EXCLUSIONS_FROM` on both workflow files returns **0** and **0**. The scraper runs on GitHub Actions from the checked-out commit, so until this is committed and pushed the crons run the old code; and once pushed, with no flag set, **`EXCLUSIONS_FROM` defaults to `sheet` and the filtering is byte-for-byte what ran yesterday.** The first run to exercise it is the next `daily_scrape.yml` at `0 6 * * *` — which will print the membership diff and, because it scrapes real sites, **the first genuine decision-equivalence result.**

**Explicitly not done, as instructed:** the default is **not** flipped · the Sheet read is **not** removed (`:470`'s `sheetExclusionSet` is built exactly as before) · `excluded_terms` is **not** touched (still 0 rows) · the scraper's own broken write at `:809` is unchanged · no database row and no Sheet cell was written.

**Before the default can be flipped, on the evidence here:** several real runs with **0 decision disagreements**, and the `:784-790` auto-exclusion persistence gap (§3) settled — because under `db` a mid-run auto-exclusion currently reaches the Sheet and not the database.

**No span of the prompt arrived garbled. No instruction contradicted another.**
