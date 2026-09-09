# The auto-exclusion write — repointed, and guarded

**Date:** 9 September 2026 · **Change:** `scripts/run-scraper.js`, one contiguous hunk, **+73 / −13** on top of the uncommitted `SITES_FROM` work. **No database row inserted, updated or deleted. No Sheet cell modified. `excluded_terms` untouched.** Nothing staged, committed or pushed; `git add` not run.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -n` over `scripts/run-scraper.js` — **JavaScript** — and `supabase/migrations/*.sql` by path. 🧪 The `excluded_terms` sweep **exited 0 with 3 hits**, all in comments; exit codes were read on every search.

---

## 0. STOP CONDITION — hunk separability, checked before editing

🧪 `git diff --stat scripts/run-scraper.js` at START: **+169 / −3**, the `SITES_FROM` work, in **four** hunks:

```
@@ -614,7  +614,38  @@      @@ -629,7 +660,7 @@      @@ -644,7 +675,7 @@      @@ -652,6 +683,141 @@
```

🔎 The last `SITES_FROM` hunk covers new-file lines **683–823**. 🔎 The auto-exclusion site sits at **1083–1112**. **A 260-line gap — far beyond `git add -p`'s 3-line context, so the two cannot merge into one hunk.** ✅ Proceeded.

🧪 **Confirmed after editing:** the diff now has **five** hunks, mine being `@@ -915,35 +1081,95 @@` — separate from all four `SITES_FROM` hunks. **You can stage and ship them independently.**

---

## 1. Row counts and working tree — START and END

| | START 21:17:48Z | END 21:19:29Z |
|---|---|---|
| `discovery_exclusion_terms` | **143** | **143** |
| **`excluded_terms`** | **0** | **0** |
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `scraper_run_log` | 418 | 418 |

🧪 **And the Sheet:** Exclusions **143**, Events **725**, Trucks **152** — unchanged. My test runs appended nothing.

**`git status --short`** at END is START plus nothing new: ` M DEBUG_SCRAPED_TEXT.txt` (⚠️ carried over from the previous pass — 🔎 `run-scraper.js:945` rewrites it on every site scraped; not reverted, per the standing instruction), ` M scripts/run-scraper.js`, and five untracked docs/SQL paths. `HEAD` = `origin/main` = `9e83a5e`. Nothing staged.

### The established facts, verified rather than assumed

| claim | 🧪 verified |
|---|---|
| the write targeted `excluded_terms` with `onConflict: 'term'` | 🔎 confirmed in the pre-edit source |
| that table is `unique(truck_id, term)`, `truck_id text not null` | 🔎 `20260604_exclusion_terms.sql:3-9`, and the live OpenAPI agrees: `required=['created_at','id','term','truck_id']` |
| it holds 0 rows | 🧪 **0**, at START and END |
| `discovery_exclusion_terms` holds 143 rows with those columns | 🧪 **143**; live columns `id, term, term_key, source, hits_truck, created_by, created_at` |
| `term_key` holds the normalised value the fuzzy check compares | 🔎 the `EXCLUSIONS_FROM` DB path reads `term_key` directly |

---

## 2. Step 1 — the write, repointed

🔎 Now:

```js
const { error: exErr } = await supabase.from('discovery_exclusion_terms').upsert({
  term: ex,
  term_key: cleanEx,                     // 🔎 the value the fuzzy check actually compares
  source: 'scraper',
  created_by: `scraper:${site.name}`,    // provenance the Exclusions tab never had
}, { onConflict: 'term_key', ignoreDuplicates: true });
if (exErr) { dbWriteFailures.push(`discovery_exclusion_terms "${ex}": [${exErr.code}] ${exErr.message}`); … }
```

✅ **Awaited**, and its failure **collected into `dbWriteFailures`**, matching the deployed awaited-writes work — 🔎 `assertNoWriteFailures('Pass A database', dbWriteFailures)` turns any failure into a red run.

⚠️ **`created_by` records the proposing site**, not just "the scraper". The Exclusions tab has one column, no timestamp and no author — which is exactly why the three terms removed on 8 September could not be attributed to a person or a machine. Every term this writes from now on names the page that proposed it.

🧪 **The payload satisfies the live schema, checked against the OpenAPI rather than the migration file:** unknown columns in the payload — **none**; NOT NULL columns neither supplied nor defaulted — **none**.

🔴 **`excluded_terms` is untouched.** 🧪 It appears in `run-scraper.js` now only in **three comments** (`:1080`, `:1131`, `:1139`) and in **no executing line**. Its rows (0), its `unique(truck_id, term)` constraint and `app/api/manage/route.ts` are all unchanged. **The scraper no longer writes that table at all.**

---

## 3. Step 2 — the poison guard

🔎 Built from `validTrucks`, which V1.4 §11.2 / defect 13 records as *"in scope at `:455` and never consulted"* — now consulted:

```js
const poison = knownTruckKeys.find(t => isFuzzyMatch(t.key, cleanEx));
if (poison) {
  console.log(`   🚫 REFUSED auto-exclusion ${JSON.stringify(ex)} (key "${cleanEx}") — it matches the known truck ${poison.label}. Writing it would silence that truck on every future run. Proposed by: ${site.url}`);
  continue;   // 🔴 NOT written to the database AND NOT written to the Sheet.
}
```

- 🔎 **The SCRAPER's matcher** — `isFuzzyMatch`, 1-edit Levenshtein — **not the Apps Script's containment.** This guard governs what *this file* does, and 🧪 the step-2 import measured **5 terms hitting a truck under Levenshtein against 9 under containment**.
- ⚠️ **Aliases are included.** A term matching an alias silences that truck just as surely, because the truck matcher checks both. 🧪 The live Sheet supplies **152 truck names + 28 aliases**.
- 🔴 **The refusal is loud and names all three things** — the proposed term, the truck it would have silenced, and the source URL. **A silent skip is indistinguishable from nothing being proposed, which is exactly how the original fault stayed invisible.**
- 🔴 **A refused term reaches neither store** — not the database, and **not the Sheet**.
- ⚠️ **A term normalising to the empty string is also refused** — it could never match anything and would sit in the tab for ever.
- ⚠️ **Recorded in the code:** `validTrucks` is Sheet-derived, so **when `MATCH_FROM` moves truck matching to the database this guard's source must move with it** or it goes stale.

---

## 4. Step 3 — what happens now when a term is proposed, and in what order

🔴 **DATABASE FIRST, SHEET SECOND. The order was reversed, deliberately.**

| | old order (Sheet → DB) | new order (DB → Sheet) |
|---|---|---|
| both succeed | both have it | both have it |
| **DB write fails** | 🔴 **Sheet has it, DB does not — the two diverge, and the term IS applied** | ✅ **the Sheet append is skipped; NEITHER has it; the run still goes red via `dbWriteFailures`** |
| Sheet append fails | DB never reached it (the DB write was refused every time anyway) | ⚠️ DB has it, Sheet does not — collected into `dbWriteFailures`, run goes red |

**The reasoning:** divergence is the failure mode worth designing out, because it is what blocks `EXCLUSIONS_FROM=db`. *"The term was not applied this run"* is not — it is recoverable on the next run, and the run goes red either way. So a DB failure now stops the Sheet write too, and the two sources stay in step.

⚠️ **The remaining asymmetry, stated rather than hidden:** if the DB write succeeds and the *Sheet* append then throws, the DB has a term the Sheet lacks. That is caught, collected and turns the run red, but it is a real window. It is the smaller of the two, because the Sheet is the source currently in USE — so a term missing from the Sheet is simply not applied, whereas a term missing from the DB would block the flag flip.

✅ **The `EXCLUSIONS_FROM` control's in-memory adds are unchanged** and now tell the truth: they run only *after* both stores have the term.

---

## 5. Step 4 — proof, run not asserted

### 🔴 What I ran against, stated exactly

**There is no local Postgres** — 🧪 `which psql postgres docker` finds none — so I could not execute a real `INSERT` against a scratch database or a rolled-back transaction, and I did not run one against production. **What I did instead, and its exact limits:**

1. **The block's real source text was extracted verbatim** from `scripts/run-scraper.js` — 🧪 96 lines, 6,826 chars, confirmed to contain `discovery_exclusion_terms`, `onConflict: 'term_key'`, `knownTruckKeys` and `REFUSED auto-exclusion` — and executed with `normalizeName` and `isFuzzyMatch` also extracted verbatim.
2. **`supabase` and `sheets` were replaced with recording stubs**, so every call is captured and nothing is written anywhere.
3. **`validTrucks` came from the live Sheet** — the real 152 trucks and 28 aliases.
4. 🧪 **The payload's validity against the real table was checked separately**, against the live OpenAPI schema (§2).

⚠️ **So this proves what the real code emits and that the emission is schema-valid — it does not prove the row lands.** The first real insert will be the 06:00 cron. That limit is stated rather than papered over.

### The seven branches

| # | scenario | DB upserts | Sheet appends | outcome |
|---|---|---|---|---|
| **1** | 🔴 **model proposes nothing** | **0** | **0** | ✅ the no-op branch — see below |
| **2** | genuine non-truck term `Quiz Night` | **1** → `discovery_exclusion_terms {"term":"Quiz Night","term_key":"quiznight","source":"scraper","created_by":"scraper:The Chequers"} onConflict=term_key` | **1** → `Exclusions!A:A [["Quiz Night"]]` | ✅ **reaches both** |
| **3** | 🔴 poison — **`Steak & Honour`** | **0** | **0** | 🚫 `REFUSED … it matches the known truck "Steak & Honour"` |
| **4** | 🔴 poison via **alias** `la pizza` | **0** | **0** | 🚫 `REFUSED … matches the known truck "La Piazza" (via alias "la pizza")` |
| **5** | 🔴 **DB write fails** (`42P01`) | 1 attempted | **0** | ✅ Sheet skipped; `dbWriteFailures: ["discovery_exclusion_terms \"Live Music\": [42P01] relation does not exist"]`; in-memory sets **empty** |
| **6** | term normalising to `""` (`The Street`) | **0** | **0** | 🚫 refused, named |
| **7** | mixed batch `["Bingo Night","Dessert MK"]` | **1** (`Bingo Night`) | **1** | ✅ good one through, `Dessert MK` refused — **per-term, not per-batch** |

🔴 **Scenario 3 uses the actual truck the original fault silenced.** The guard refuses the exact term that cost Steak & Honour six correctly-extracted events.

### 🔴 What this would look like if it were doing nothing

**A run where the model proposes no exclusions is indistinguishable from a repointed write that never fires.** Both branches were therefore forced:

- **Scenario 1** (nothing proposed): **0 DB, 0 Sheet, no log line.**
- **Scenario 2** (something proposed): **1 DB upsert naming `discovery_exclusion_terms`, 1 Sheet append, and `🤖 Auto-Excluded via Scraper: Quiz Night → discovery_exclusion_terms + Exclusions tab`.**

The two are distinguishable, and the recorded upsert names the **new** table with the **new** conflict key — which the old code could not have produced.

### `excluded_terms` and hatchgrab

🧪 **`excluded_terms` holds 0 rows at START and END**, its constraint is untouched (🔎 no migration edited), and 🧪 the scraper references it only in comments.

🧪 **Hatchgrab mode — the bug class the last two passes each found:**

| run | exit |
|---|---|
| `SCRAPE_MODE=hatchgrab` | **0** — `Google Sheet not read` → `NO-OP: 3 truck(s) enrolled, 0 due` → `scraper_run_log pruned` |
| `SCRAPE_MODE=hatchgrab SITES_FROM=db EXCLUSIONS_FROM=db` | **0** — identical |

**No throw.** 🔎 The auto-exclusion block sits inside the Pass A site loop, which a hatchgrab run never enters.

🧪 **And a discovery run still starts cleanly:** `EXCLUSIONS_FROM=sheet … 143 term(s)`, `SITES_FROM=sheet … 116 site(s)`, `✅ IDENTICAL on every entry and every field`, then `[1/116] A Taste of Jamrock`.

---

## 6. What has and has not changed

🔴 **`node --check` passing is not verification, and neither is the block above on its own** — the stubs prove the call, not the landing.

🔴 **NOTHING TAKES EFFECT UNTIL THIS IS DEPLOYED.** The scraper runs on GitHub Actions from the checked-out commit; until this is committed and pushed, the crons run the old code, which still points at `excluded_terms` and still has no guard. 🔴 **The first thing to exercise it is the 06:00 `daily_scrape.yml` discovery cron** — and only on a site where the model actually proposes an `exclusionsToAdd` term, which is not every run.

**What this closes:** the persistence gap. A proposed term now reaches `discovery_exclusion_terms` and the Sheet, in that order, so the two sources no longer diverge the moment it fires — which was the blocker on flipping `EXCLUSIONS_FROM`.

**What it does not do:** it does not flip any default; it does not touch `excluded_terms`, its 0 rows, its constraint or the manage route; it does not remove the Sheet append; it does not backfill anything for terms proposed in the past. ⚠️ **And it does not make the guard's source future-proof** — `validTrucks` is Sheet-derived and must move when `MATCH_FROM` does.

**No span of the prompt arrived garbled. No instruction contradicted another** — the one point needing judgement, whether "DB first" or "Sheet first" better serves *"say what your ordering does about that and why"*, is argued in §4 rather than chosen silently.
