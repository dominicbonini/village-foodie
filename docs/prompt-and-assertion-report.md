# The two prompt edits, and the mirror assertion

Both applied. **No schema change, no migration, no database write, no scrape, nothing installed.**
`truck_events` was neither read nor written. The rendering guards from last task, the matcher, the dedup
gate's rules, the URL guards, the outreach console, templates, the events tab and the schedule popup were
not touched.

---

# 🔴 3 · WHAT IS UNVERIFIED — READ THIS FIRST

**A prompt change cannot be tested without running the model, and I have not run it.** The scraper was
not run and no scrape has happened since the edit.

**The claim is only this:** the two edited rules now carry the same escape clause as `buildHgPrompt`,
which is the control that has produced **0** invented villages in 86 rows. It is not a claim that the
model will behave. Whether it does is unknown until a scrape runs, and the assertion in §2 is what turns
that unknown into a red run rather than a quiet data change.

Everything else below — the diffs, the assertion's behaviour, the counts — is measured.

---

## ⚠️ A NUMBER IN THE BRIEF IS THE WRONG SUBSET, AND IT IS MY ERROR

The brief says *"62 carry village = venue_name"*. 🧪 Re-derived today, normalised the way the diagnosis
query does:

| scope | rows |
|---|---|
| **whole table** | **76** |
| …by exact string equality rather than normalised | 69 |
| future-dated only | **71** |
| **written by the manual prompt (`Manual Entry`)** | **62** ← the figure the brief carries |

**62 is the `Manual Entry` subset, not the table count.** It came from a cross-tab in the diagnosis and I
carried it into `docs/extraction-prompt-fix-report.md` as though it were the whole-table figure. The
by-writer split today is `Manual Entry` 62, `URL:` 12, other 2. **The assertion is unaffected** — it
counts only what a run writes, never the table — but the baseline to quote from now on is **76**.

Other figures, re-derived: `discovery_events` **933** · `venue_id` NULL **326** (up from 321, consistent
with the five wrong links you nulled) · village NULL **28**.

---

# 1 · THE TWO PROMPT EDITS

Applied verbatim from §B2 of `docs/venue-matching-fix-report.md`. Nothing was improved, reformatted or
re-worded.

## ① The rule / manual-schedule prompt

**Before:**
> `6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.`

**After:**
> `6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

## ② The event prompt

**Before:**
> `6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name.`

**After:**
> `6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text, use "" (an empty string) — do NOT repeat the venue name and do NOT guess.`

## 🔴 THE WHOLE-LITERAL DIFFS — nothing adjacent moved

Each template literal was extracted in full by line range and diffed end to end. **One line changed in
each, and the rules either side are byte-identical.**

```
── literal ① (31 lines) ────────────────────────────────────────────────────────
   5. IGNORE PRIVATE EVENTS: Do not extract any event labeled as "private"…
 - 6. VILLAGE (MANDATORY): Always extract the town, village, or city into a separate "village" field.
 + 6. VILLAGE: Extract the town, village, or city into a separate "village" field. If the town or village…
   (blank)
   JSON FORMAT ONLY:

── literal ② (33 lines) ────────────────────────────────────────────────────────
   5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
 - 6. **VILLAGE (MANDATORY):** You must extract the town, village, or city name.
 + 6. **VILLAGE:** Extract the town, village, or city name. If it truly cannot be determined from the text…
   7. **NOTES:** Postcodes, addresses, or extra event details go into the "Notes" field.
   8. **DOUBLE DAYS:** …
   9. **MISSING TIMES:** If no time is explicitly stated for a venue, output "" (an empty string)…
```

🧪 **File-level confirmation:** `git diff --numstat` on the prompt change alone was **2 added, 2
removed** — the two rules and nothing else. `node --check` passes. 🧪 `VILLAGE (MANDATORY)` now appears
**0** times in the repository.

## `buildHgPrompt` — the control — is untouched

🧪 `buildHgPrompt` appears **2** times, exactly as before, and **0** lines mentioning it or its
`TOWN RULES` block appear anywhere in the diff.

⚠️ **The false negative you warned about reproduced exactly, and I did not act on it.** Its escape
sentence wraps across two lines, so a single-line grep for `town truly cannot be determined` returns
**0** and reads as though the control had been deleted. The wrap-safe check, `truly cannot be`, returns
**3** — one in the control, two in the rules I just edited. That is the expected arithmetic.

## 🔴 AN INSTRUMENT FAILURE CAUGHT BEFORE IT WAS USED — the fifth

My first attempt to extract the literals scanned forward from `` prompt = ` `` to the next backtick. It
returned a literal of **221 bytes and 6 lines** for a prompt that has twelve numbered rules, because both
literals contain **nested template literals** inside `${…}` interpolations
(`${site.instructions ? \`…\` : ""}`), and the scan stopped at the first nested backtick. Had I trusted
it, the "whole-literal diff" above would have covered a fifth of one prompt while looking complete. It
was replaced with an extraction by line boundary, checked by asserting that each range contains exactly
one `VILLAGE (MANDATORY)` and that `buildHgPrompt` falls outside both.

---

# 2 · THE MIRROR ASSERTION

**New export `assertNoInventedVillages` in `scripts/geo-validate.js`**, beside `assertInboundOk` and
`assertNoWriteFailures` — the file whose exit code the workflow actually reads.

```js
export function assertNoInventedVillages(rows, label = 'Pass A') {
  const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const bad = (rows || []).filter((r) => {
    const v = norm(r && r.village);
    return v.length > 0 && v === norm(r && r.venue_name);
  });
  if (bad.length > 0) throw new Error(/* names every offending row */);
}
```

**Wired into the run** immediately after `assertNoWriteFailures`, reading `newRowsToAdd` — the rows this
run is writing, `r[4]` the venue and `r[5]` the village:

```js
assertNoInventedVillages(newRowsToAdd.map(r => ({ venue_name: r[4], village: r[5] })), 'Pass A');
```

Three properties, each deliberate:

- 🔴 **It sees only this run's rows.** An assertion over the table would throw on the existing 76 every
  night and be switched off within a week.
- 🔴 **No threshold.** The historical 76 will not repair themselves; what must never happen again is a
  **new** one, so the test is `> 0`.
- ⚠️ **An empty village is not a match, and the length check is load-bearing.** `norm('')` is `''` on
  both sides, so a naive equality test would flag every honestly-blank row — precisely the rows the
  prompt edit exists to produce — and turn the fix into a permanently red run.

It is placed **after** `assertNoWriteFailures` on purpose: a failed write is the more urgent of the two
reports, and throwing first would hide it.

**The ratio assertion was not built**, as instructed. It needs a post-change run to calibrate against.

## 🔴 PROOF THAT IT FIRES, AND THAT IT DOES NOT FIRE ON EVERYTHING

12 cases; the script exits 0 only if **every** case matches its expectation. It exited **0**.

| case | expect | got |
|---|---|---|
| village === venue name, exact | **THROWS** | ✅ |
| differing only by **case** | **THROWS** | ✅ |
| differing only by **punctuation/spacing** (`church-view  campsite`) | **THROWS** | ✅ |
| one bad row hidden among **99 clean ones** | **THROWS** | ✅ |
| a normal row (`The Plough` / `Shepreth`) | passes | ✅ |
| **empty village — what the prompt fix wants** | passes | ✅ |
| null village · undefined village · empty both | passes | ✅ |
| village is a **substring**, not equal (`Debenham Vets` / `Debenham`) | passes | ✅ |
| no rows · null argument | passes | ✅ |

**Against the real table**, as the strongest check that it recognises the actual shape:

```
live rows 933 · matching the invented shape 76 · clean 857
  ✅ fires on the 76 real bad rows
  ✅ passes on all 857 clean rows
  ✅ passes on the 28 rows that already have an EMPTY village
  exit 0
```

**And the harness was checked before its output was trusted.** The same 12 cases were run against a
deliberately broken assertion that never throws: it reported **4 mismatches and exited 1**. A test that
cannot fail would have reported the same green as one that works.

---

# CHECKS

`node --check` passes on both scripts. `npx tsc --noEmit` exits 0. `eslint scripts/run-scraper.js
scripts/geo-validate.js` reports **9 problems (0 errors, 9 warnings) before and after** — unchanged.

**Files changed:** `scripts/run-scraper.js` (two prompt rules, one import, one assertion call) and
`scripts/geo-validate.js` (the new export). Nothing else.

# WHAT HAPPENS NEXT, AND WHAT TO WATCH

The next unattended run at 06:00 is the first test of the wording. Two outcomes are worth naming:

- **The assertion fires.** The invented-village behaviour is back and the run goes red with the offending
  rows named. That is the assertion working, not a regression in it.
- **The run is green.** That means no new row had a village equal to its venue name. It does **not** mean
  the model started declining honestly — a green run is also what you get if it simply invented a
  *different* wrong village. The whole-table count of 76 should stop rising; the ratio assertion, when
  there is a run to calibrate it against, is what would catch the rest.

The query to check the morning after is in the chat.

**Not done:** no scrape, no schema change, no migration, no database write, no ratio assertion, no
install, and `buildHgPrompt` untouched.
