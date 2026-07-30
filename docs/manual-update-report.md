# MANUAL UPDATE — V9.6 → V9.7 (APPLIED)

**Date:** 30 July 2026 · **Target:** `docs/reference-manual.md`
**Source:** `~/Downloads/manual-v97-deltas.md` (read from disk, UTF-8, 20,060 bytes)
**Status: ✅ ALL FOUR EDITS APPLIED. ALL SIX VERIFICATION CHECKS PASS.**
**Only `docs/reference-manual.md` was edited. +64 lines this pass — reconciled exactly below.**

> This file replaces the previous manual-update report (V9.5 → V9.6). That content is not preserved anywhere.

---

## ✅ GLYPH-INTEGRITY GATE — PASSED

`file` reports **`Unicode text, UTF-8 text`**. Line 5 renders correctly:

```
§ £ — – → ↔ ≠ − × Σ ❗ 💷 💳 🔴 ⚠️
```

A scan for the mojibake markers `Â§` / `â€` / `ð\x9f` returns **0**, and the title line reads
`# HatchGrab Engineering Reference Manual — DELTAS (V9.6 → V9.7)` with a correct em dash and arrow.

**Read from `~/Downloads/manual-v97-deltas.md`** — the same location as the previous passes, as you said.
**No chat attachment was used**, and I did not copy the file into the repo.

---

## ANCHOR MATCHING — every anchor matched exactly as specified

| Edit | Anchor | Matches | Expected |
|---|---|---|---|
| 1 | `# Changelog\n\n## V9.6 — 30 July 2026` | **1** | 1 ✅ |
| 2 | `# 36. Android app platform notes (V9.2, verification status V9.3)` | **1** | 1 ✅ |
| 3 | `# 27. Open backlog (June 2026)` | **1** | 1 ✅ |
| 4 | `HatchGrab Engineering Reference Manual · V9.6` | **2** | 2 (by design) ✅ |

**No STOP condition.** Three `<<<BEGIN INSERT>>>` blocks parsed and inserted **verbatim** — no rewording,
no re-punctuation, no restructuring. Blocks are **7,675 / 4,781 / 4,221** characters.

### Where each block landed

| Edit | Result |
|---|---|
| **1** | `# Changelog` → blank → **`## V9.7 — 30 July 2026`** (line 19) → … → blank → `## V9.6 — 30 July 2026` (line 45). V9.7 sits **above** V9.6. |
| **2** | Appended to the **end of §35**, blank line before `# 36.`. The §36 heading text is **unaltered**. |
| **3** | Immediately after the `# 27.` heading line, **before** the existing V9.6 backlog block. Heading unchanged. |
| **4** | Line 1 and the final line both now read `HatchGrab Engineering Reference Manual · V9.7`. |

⚠️ Block 3 begins with its own newline, so the V9.7 sub-heading sits directly under the `# 27.` heading
with no blank line — **matching how the V9.6 block sat there before this pass**, not imposing new spacing.

---

## THE SIX VERIFICATION CHECKS

### ✅ 1. `grep -c "^# "` → **37** (expected 37)
Unchanged. No section added, and none expected.

### ✅ 2. `grep -c "· V9.7"` → **2** (expected 2)
Title (line 1) and footer (last line).

### ✅ 3. `grep -c "· V9.6"` → **0** (expected 0)
Zero occurrences as a version string. **Historical `(V9.6)` labels are untouched** — they carry no `·` and
were never matched.

### ✅ 4. Ordering + V9.6 entry byte-identical
- `## V9.7 — 30 July 2026` at **line 19**; `## V9.6 — 30 July 2026` at **line 45**. ✅
- **The V9.6 entry is BYTE-IDENTICAL** — captured before the edit, compared after: **432,759 characters,
  exact match.** That span runs from `## V9.6` to the next top-level heading, so it covers **the entire
  changelog below V9.7** — V9.6, V9.5 and every earlier entry. **Nothing below the insertion point moved
  by a byte.**
- **The three-batches-one-day dates were left alone**, as instructed. V9.5, V9.6 and V9.7 all still read
  30 July 2026.

### ✅ 5. `grep "^# "` output identical before and after
Captured before, compared after: **37 headings before, 37 after, lists identical (`True`).** No heading
added, removed or reworded.

### ✅ 6. `git diff --stat` — reconciliation

```
docs/reference-manual.md | 139 ++++++++++++++++++++++++++++++++++++++++++++++-
1 file changed, 137 insertions(+), 2 deletions(-)
```

🔴 **These numbers are CUMULATIVE, not this pass — and that is the part worth stating rather than
glossing.** `git diff` compares against HEAD, and **HEAD's manual is still at V9.5**
(`git show HEAD:docs/reference-manual.md | sed -n 1p` → `… · V9.5`; last commit touching it is `6ac9556`).
**The V9.6 pass was never committed**, so the working-tree diff spans **V9.6 + V9.7 together**.

**This pass alone, measured directly:**

| Source | Newlines added |
|---|---|
| Block 1 (changelog entry) | 25 |
| + separator before `## V9.6` | 1 |
| Block 2 (§35 invariants) | 13 |
| + separator before `# 36.` | 1 |
| Block 3 (§27 backlog) | 24 |
| **Net new lines, V9.7 pass** | **64** |

**Independently confirmed by line count: 4,841 → 4,905 = +64.** ✅

**Reconciling that against git's cumulative figures:**

```
V9.6 pass net  = +71   (reported and reconciled at the time)
V9.7 pass net  = +64   (above)
                ─────
cumulative net = +135

git: 137 insertions − 2 deletions = +135   ✅ exact match

  2 deletions   = the title and footer lines AS AT HEAD (`· V9.5`)
  2 insertions  = their current replacements (`· V9.7`)
135 insertions  = 71 (V9.6) + 64 (V9.7) genuinely new lines
```

**Every one of the 137 insertions is accounted for.** The deletion count stays at **2** rather than 4
because those two lines were rewritten twice (V9.5→V9.6→V9.7) but git only compares HEAD against the
current state — one deletion and one insertion each, regardless of how many times they changed in between.

**Only `docs/reference-manual.md` was edited by this pass.** `git status` also lists
`docs/payments-report.md` and `docs/manual-update-report.md` as modified — those are **my report files
from earlier passes in this session** (and this one), not the manual edit.

---

## CONFIRMATION: NOTHING OUTSIDE THE FOUR EDITS

- **No reformatting, reflowing, reordering or tidying.** Applied by exact-string replacement on
  verified-unique anchors, never by rewriting regions.
- **The V9.6 changelog entry is byte-identical** (432,759 chars verified), as is everything below it.
- **No `(V9.6)` historical label touched.** Only the two title/footer version strings changed.
- **The §36 heading text is unaltered.**
- **The shared 30 July 2026 date on V9.5, V9.6 and V9.7 was left as-is** — not "fixed".
- **Inserted copy is verbatim**: 🔴 ⚠️ ❗ 💷 💳 all present in the result, blockquotes, bold and §
  references preserved; a mojibake scan of the written manual returns **False**.
- **The file still ends with a newline.**
- **No other file was modified.**

---

## What I could NOT verify

- **The manual has not been rendered.** Structure is verified by anchor placement, heading counts and the
  byte-identity check — **not by viewing it.** If a block's nested bullets or backtick spans render
  differently than intended, I would not have seen it.
- 🔴 **I did not proofread the inserted copy for factual accuracy.** You said it is final and not to be
  reworded, so it went in verbatim — including any claims carried over from my own earlier reports, which
  carry those reports' stated limits.
- **Check 5 proves headings are unchanged, not that body text elsewhere is.** The 432KB byte-identity
  check covers the whole changelog below V9.7; the rest rests on only three exact-string replacements
  having been performed.
- ⚠️ **The V9.6 manual change is still uncommitted**, which is why check 6 needed a two-pass
  reconciliation. If you commit before the next manual pass, `git diff --stat` will again describe a
  single pass and the check gets simpler.
- **The deltas file remains in `~/Downloads`** and was not moved, copied or deleted.
