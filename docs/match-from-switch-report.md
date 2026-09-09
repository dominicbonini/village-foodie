# `MATCH_FROM` — built, defaulting to sheet, and 🔴 the control says it must not be flipped

**Date:** 9 September 2026 · **Change:** `scripts/run-scraper.js`, **three hunks**, +249 / −58 on top of the two existing workstreams. **No database row inserted, updated or deleted. No Sheet cell modified.** Nothing staged, committed or pushed; `git add` not run. The default is **not** flipped and the Sheet read is **not** removed.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I` over the repo with only `node_modules`/`.next`/`.git`/`docs` excluded, plus `grep -n` over `scripts/run-scraper.js` — **JavaScript** — by path. 🧪 Exit codes read on every sweep: the `validVenues` sweep **exited 0 with one hit**; the post-edit `venueData.filter|validTrucks.find` sweep **exited 1** — a true negative, not a failure.

---

## 0. Stop condition, row counts, working tree

🧪 `git diff --stat scripts/run-scraper.js` at START: **+242 / −16** in **five** hunks — four `SITES_FROM` (old lines 614, 629, 644, 652) and one auto-exclusion (old 915–949).

🔎 The matching code sits at **594–601** (the set builders) and **1267 / 1307** (the two matchers). 🔴 **Both regions are outside every existing hunk**: 594–601 ends **12 old lines** before the first `SITES_FROM` hunk at 614 (git merges only within 2×3 context lines, so 12 is clear), and the matchers sit **88+ lines** after the auto-exclusion hunk ends. ✅ **Separable — proceeded.**

🧪 **Confirmed after editing: eight hunks, mine at old-lines 591, 1038 and 1077, none touching the five that were there.** You can stage all three workstreams independently.

| | START 21:25:05Z | END 21:34:08Z |
|---|---|---|
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_exclusion_terms` | 143 | 143 |
| `scraper_run_log` | 418 | 418 |

🧪 **Sheet unchanged too:** Trucks 152 · Venues 936 · Exclusions 143 · Events 725.

**`git status --short`** at END is START plus this report. ⚠️ ` M DEBUG_SCRAPED_TEXT.txt` is carried over from a previous pass — 🔎 `run-scraper.js` rewrites it on every site scraped; not reverted, per the standing instruction. `HEAD` = `origin/main` = `9e83a5e`, nothing staged.

---

## 1. Step 1 — what matching actually reads, enumerated

### 🔴 The retirement plan is CORRECT on both counts, and I confirmed rather than assumed

🧪 **`validVenues` IS dead code.** A repo-wide sweep finds **one hit — its own declaration at `:601`** — and no reader anywhere. 🔎 **Venue matching reads `venueData` raw rows by position: `v[2]` postcode, `v[0]` name, `v[1]` village — three columns, not one.**

⚠️ **I left `validVenues` in place.** Deleting unrelated dead code as a side effect of a switch is how a diff stops being reviewable; it is noted in the code instead.

### Truck matching

| Sheet column | feeds | DB equivalent | 🧪 completeness |
|---|---|---|---|
| `[0]` Truck Name | `validTrucks[].name` | `discovery_trucks.name` | **19 Sheet trucks have no DB row**; **97 DB trucks have no Sheet row** |
| `[17]` Alias | `validTrucks[].aliases` | `discovery_trucks.aliases` (`text[]`) | ✅ **21 with aliases on both sides · 133 identical · 0 DB-null where the Sheet has one · 0 differing** |

✅ **The audit's `aliases 21/21` reproduces exactly.** ⚠️ The other two audit figures — `scraper_strategy 42/42`, `ai_instructions 29/30` — belong to `SITES_FROM`, which already shipped them; 🧪 that pass re-derived them as 41/41 and 30/30 and its control reports `116/116 IDENTICAL`.

### Venue matching

| Sheet column | feeds | DB equivalent | 🧪 completeness |
|---|---|---|---|
| `[0]` Venue Name | `v[0]`, both branches | `venues.name` | **936 Sheet rows vs 814 DB rows** |
| `[1]` Village | `v[1]`, the ±50/−20 village score | `venues.village` | Sheet **855** vs DB **771** |
| `[2]` Postcode | `v[2]`, 🔴 **the FIRST branch** | `venues.postcode` | Sheet **698** vs DB **597**; distinct postcodes **577 vs 519** |

### 🔴 Where the DB is INCOMPLETE — the headline

🧪 **93 venues exist in the Sheet and not the database** (by normalised name + village). 🔴 **Under `MATCH_FROM=db` each one stops matching and becomes a NEW venue — silently, on a green run.** And 🧪 **97 trucks exist in the database and not the Sheet**, so the DB path matches names the Sheet path calls new.

**That is not a switch, it is a behaviour change — and it is exactly why the control exists.** The switch is safe to *build* (default `sheet` changes nothing); it is the *flip* that would write garbage.

---

## 2. Step 2 — the DB path

🔎 Reads `discovery_trucks(name, aliases)` and `venues(name, village, postcode)`.

- **Aliases:** `text[]` in the DB, a comma-separated string in Sheet column 17 — both normalise to an array of trimmed non-empty strings, so the matcher cannot tell them apart.
- **Venue rows are POSITIONAL, deliberately:** `[name, village, postcode]` at 0/1/2, mirroring the Sheet, **so the matching algorithm stays byte-identical between the two sources.** That is the whole point of a control — a rewritten matcher would compare two different algorithms as well as two different sets. ⚠️ It also preserves a positional convention that should die with the Sheet; the code says so.

🔴 **Where a DB column is NULL and the Sheet has a value, the DB row carries `''`** — matching the matcher's own falsy tests (`v[2] &&`, `match[1] || ""`), so a null village or postcode simply stops contributing to the score. **It does NOT fall back to the Sheet:** that would make the flag a blend of both sources and the control meaningless.

---

## 3. Step 3 — the control, and Step 4 — the guard

**Both matchers were lifted out of the loop into `matchTruckIn()` and `resolveVenueFrom()`** — bodies moved verbatim, same comparisons, scores, order and tie-breaks. Inline, they could only ever run against one set; the control needs to run them against both.

🔴 **Decision equivalence, not set equality.** At each match site the used set decides, and a `record*MatchControl()` call runs the same algorithm against the other source and records any disagreement. Their return values are discarded, so neither can influence the run. The end-of-Pass-A summary names each disagreement as `sheet → X · db → Y`, with `(new truck)` / `(new venue)` where one source would **create** a row the other **matched**.

### 🔴 Step 4 — the poison guard follows the flag, with no edit to the auto-exclusion hunk

🔎 The guard reads `validTrucks` (`:1312`). **I bound the flag-selected set to that existing name** — so the guard automatically governs the same truck list the scraper matches against, whichever source that is. **Renaming it would have left the guard silently pointing at the Sheet while matching moved to the database**, which is the failure the brief names. ✅ **And because the binding is at the builder, the auto-exclusion hunk is untouched — the two workstreams stay independently stageable.**

---

## 4. Step 5 — failure behaviour, and the threshold

🔴 **An unreadable or truncated matching set does not fail — it makes every truck look new and every venue unmatched, and exits green.** So, gated on `RUN_DISCOVERY && MATCH_FROM === 'db'`:

| condition | behaviour |
|---|---|
| read error | 🔴 **throw** |
| either set **empty** | 🔴 **throw** |
| either set **< 50% of the Sheet set built in the same run** | 🔴 **throw** |
| flag = `sheet`, DB unreadable | ⚠️ warn, control marked unavailable, run continues |

**Why a ratio and not a fixed count:** both sets are built every run, so the Sheet set is a **self-calibrating yardstick** — a hard-coded number would rot as the data grows. ⚠️ **50% is a floor against catastrophe** (a truncated page, a broken filter), **not a quality gate**: 🧪 today the DB holds **152%** of the Sheet's trucks and **87%** of its venues, so it is nowhere near binding. **The quality question is answered by the control diff, and today that diff is large.**

🧪 **Executed** (bogus service key): `MATCH_FROM=db` → **exit 1**, *"the matching sets could not be read… an unreadable matching set does not fail, it makes every truck look new and every venue unmatched."* `MATCH_FROM=sheet` → **exit 0**, control marked unavailable.

---

## 5. Step 6 — proof, run not asserted

🧪 Real runs, alarm-killed inside the scrape loop (`timeout` is not on macOS). All writes happen after the loop and `discovery_run_log` is still 404, so nothing was written — the counts in §0 confirm it.

| run | result |
|---|---|
| **flag unset** | `🔀 MATCH_FROM=sheet (default) → matching against 152 truck(s) and 936 venue row(s) from the SHEET.` |
| **`MATCH_FROM=db`** | `🔀 MATCH_FROM=db → matching against 231 truck(s) and 814 venue row(s) from the DATABASE.` |
| **`MATCH_FROM=nonsense`** | `⚠️ MATCH_FROM="nonsense" is not recognised — falling back to 'sheet'.` then `🔀 MATCH_FROM=sheet` |
| 🔴 **hatchgrab + all three flags on `db`** | **exit 0** — `Google Sheet not read` → `NO-OP: 3 truck(s) enrolled, 0 due` → `pruned`. **No throw.** |

**Every run printed the membership diff:**

```
🔬 MATCH CONTROL — trucks: sheet 152 vs db 231 · venues: sheet 936 vs db 814
   membership — trucks: 19 sheet-only, 97 db-only · venues: 93 sheet-only, 6 db-only
   🔴 93 venue(s) the DATABASE cannot match. Under MATCH_FROM=db each becomes a NEW venue
      rather than a match — silently, on a green run.
```

### 🔴 Decision equivalence on real data — and it is NOT equivalent

Run against **176 distinct truck names** and **931 distinct venue+village cases** from all 4,300 `discovery_events`, using `matchTruckIn`, `resolveVenueFrom` and both `record*` functions **extracted verbatim from the file**:

| | disagreements |
|---|---|
| **trucks** | 🔴 **64 of 176** |
| **venues** | 🔴 **59 of 931** |

Examples, each `sheet → · db →`:

```
TRUCK "Eat Greek"        — sheet → Eat Greek        · db → Eat Is Greek
TRUCK "DBC Grill Shack"  — sheet → DBC Grill Shack  · db → The Shack Street Food
TRUCK "The Copper Tree"  — sheet → The Copper Tree  · db → (new truck)
TRUCK "Pimp My FIsh"     — sheet → Pimp My FIsh     · db → Pimp My Fish
VENUE "The railway arms" — sheet → The railway arms · db → Off The Beaten Truck - The Railway Arms
VENUE "Cavendish Five Bells" — sheet → Cavendish Five Bells · db → The Five Bells
VENUE "The Pod"          — sheet → The Pod          · db → (new venue)
```

🔴 **`db → Eat Is Greek` and `db → The Shack Street Food` are the dangerous shape: not a failure to match, but a match to a DIFFERENT truck.** A count comparison would have passed those — both sets matched *something*. **Only decision equivalence catches them.**

### 🔴 Forcing a disagreement — and why the first attempt was not proof

My first attempt removed an alias from the DB set and the disagreement count stayed **64 → 64**: with a baseline that noisy, the mutation was invisible. ⚠️ **That is not a demonstration, and reporting it as one would have been wrong.**

So I isolated it: **both sets equalised** (the Sheet set copied to both), giving a clean baseline, and an alias chosen that is 🧪 **unreachable from its own truck's name** — `normalizeName("The Dirty Burger Co")` = `dirtyburger` vs `normalizeName("DBC Grill Shack")` = `dbcgrillshack`, so the match can only come via the alias:

```
BASELINE — both sets identical:        176 names → 0 disagreements  ✅
REMOVE the alias from the DB set only:   1 disagreement
   TRUCK "The Dirty Burger Co" — sheet → DBC Grill Shack · db → (new truck)
```

🔴 **One path matches the truck; the other creates it new. The flag is demonstrably wired** — identical output when the sources agree could not distinguish that, which is why the baseline had to be forced to zero first.

⚠️ An earlier synthetic attempt (`"la pizza"` against `La Piazza`) gave 0 disagreements because `lapizza`/`lapiazza` is a **one-edit Levenshtein match on the name alone** — the alias was never load-bearing. Recorded because it looked like a failed test and was actually a correct result.

---

## 6. What has and has not changed

🔴 **NOTHING CHANGES UNTIL DEPLOYED AND THE FLAG IS SET IN A WORKFLOW.** 🧪 `grep -c MATCH_FROM` on both workflow files returns **0** and **0**. Until this is committed and pushed the crons run the old code; once pushed, with no flag set, `MATCH_FROM` defaults to `sheet` and matching is byte-for-byte what ran this morning. The first run to exercise it is the next `daily_scrape.yml` at `0 6 * * *`, which will print the membership diff and the **first real decision-equivalence numbers**.

**Not done, as instructed:** default not flipped · Sheet read not removed · `excluded_terms` untouched · `validVenues` left in place.

### 🔴 What must happen before this default can EVER be flipped

Unlike the previous two switches, which reported `IDENTICAL` on today's data, **this one reports 64 truck and 59 venue disagreements.** Flipping it now would, on today's data:

- match **64 truck names differently**, including to the **wrong truck**, not merely to a new one;
- turn **93 venues** into new-venue creations;
- lose **101 postcode targets** from the first matching branch.

**The gap is a data problem, not a code one:** the 93 Sheet-only venues and the 97 DB-only trucks have to be reconciled first. ⚠️ **The control will keep printing those numbers on every run until they are.**

**No span of the prompt arrived garbled. No instruction contradicted another.**
