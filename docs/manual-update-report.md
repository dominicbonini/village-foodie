# Manual update report — V9.4 → V9.5 deltas

**Date:** 30 July 2026
**Source:** `~/Downloads/manual-v95-deltas.md` (read from disk, UTF-8, 23,815 bytes)
**Target:** `docs/reference-manual.md`
**Status: ✅ COMPLETE — all five edits applied. 6 of 7 checks pass as written; check 5 differs from its
stated estimate but the content is provably complete (detail in §Check 5).**

---

## Pre-flight

**Source path.** The instruction named `docs/manual-v95-deltas.md`; that path does not exist. The file
was found on disk at `~/Downloads/manual-v95-deltas.md` and read from there — the same location as the
previous two passes. The chat attachment of the same file was **mojibake-corrupted again** (its own
glyph line rendered as `Â§ Â£ â â â â â  â Ã Î£ â ð· ð³ ð´ â ï¸`) and was **not used**.
That is now three transfers in a row where the attachment was corrupt and the on-disk copy was clean.

**🔴 Glyph-integrity gate — PASS.** The on-disk file's line 5:

```
§ £ — – → ↔ ≠ − × Σ ❗ 💷 💳 🔴 ⚠️
```

All fifteen glyphs intact, including the two new ones (`💷` `💳`). No repairs attempted or needed.

**Method.** Applied by script. The four insert blocks were extracted **byte-exactly** from between the
deltas' own `<<<BEGIN INSERT>>>` / `<<<END INSERT>>>` markers — nothing retyped, reworded or
re-punctuated. Anchor counts were asserted **before** a single byte was written; a mismatch would have
aborted the whole run. A pre-edit backup was taken to the session scratchpad.

---

## Anchor verification — all exact

| Edit | Target | Matches | Expected |
|---|---|---|---|
| 1 | `# Changelog` + `## V9.4 — 29 July 2026` | 1 | 1 ✅ |
| 2 | `# 36. Android app platform notes (V9.2, verification status V9.3)` | 1 | 1 ✅ |
| 3 | `> **STATUS: NOTHING IS BUILT.**` | 1 | 1 ✅ |
| 4 | `# 27. Open backlog (June 2026)` | 1 | 1 ✅ |
| 5 | `HatchGrab Engineering Reference Manual · V9.4` | 2 | 2 ✅ (by design) |

## Edits applied

1. **V9.5 changelog** inserted between `# Changelog` and `## V9.4 — 29 July 2026`, blank line either
   side. V9.5 (line 19) now sits above V9.4 (line 47).
2. **Nine new §35 invariants** appended at the end of §35, immediately before the §36 heading
   (last invariant at line 4643, heading at 4645). **§36 heading text unaltered.**
3. **§37 status update** inserted immediately before the existing `STATUS: NOTHING IS BUILT` blockquote
   (new block 4692-4694, original intact at 4695).
4. **V9.5 backlog block** inserted immediately after the `# 27.` heading, before the existing V9.4 block.
   Heading unchanged.
5. **Both version strings** bumped to `· V9.5`.

**Block fidelity — all four present verbatim:**

| Block | Lines | Verbatim |
|---|---|---|
| EDIT 1 changelog | 27 | ✅ |
| EDIT 2 invariants | 21 | ✅ |
| EDIT 3 §37 status | 3 | ✅ |
| EDIT 4 backlog | 23 | ✅ |

---

## VERIFICATION — 7 checks

**1. `grep -c "^# "` → 37** ✅ Unchanged, as required — no new section this pass.

**2. `grep -c "· V9.5"` → 2** ✅ Line 1 (title) and the final line (footer).

**3. `grep -c "· V9.4"` → 0** ✅
The historical labels are untouched and correctly did **not** match: the §37 heading still reads
`# 37. Payments — commercial model and architecture decisions (V9.4)` (line 4690), and **8 other
`(V9.4)` labels** remain in place. None is a `· V9.4` version string.

**4. Changelog order** ✅ `## V9.5 — 30 July 2026` (line 19) sits above `## V9.4 — 29 July 2026`
(line 47), above V9.3 (line 81).
**The V9.4 entry is byte-identical to before** — verified with `cmp` on the extracted 35-line block.

**5. `wc -l` → 4,769** ⚠️ **The number does not match the estimate, but nothing is missing.**

The check expects "roughly +130 lines" on the 4,693 baseline. The actual delta is **+76**.

I chased this rather than accepting it, and it fully reconciles:

```
block lines:  27 + 21 + 3 + 23        = 74
blank separators (edits 1, 2, 3, 4)   =  4
                                        ──
net insertions                          78
git numstat: 78 insertions, 2 deletions → net +76 ✅
```

The two deletions are the title and footer lines replaced by EDIT 5. **All four blocks are present
verbatim** (asserted by substring match against the source, table above), so **the ~+130 figure was the
deltas author's estimate, not a measurement.** The blocks use very long single lines — each changelog
bullet and each invariant is one line — so a prose-length estimate overshoots the line count
substantially. **Content complete; the estimate was loose.**

**6. Heading diff** ✅ `diff` of `grep "^# "` before vs after → **IDENTICAL**. No heading added, removed
or reworded.

**7. `git diff --stat`** ✅ `docs/reference-manual.md | 80 ++++--` — **78 insertions, 2 deletions**, and
it is the **only** file this pass modified. (The other files showing as modified in `git status` are the
pre-existing, uncommitted payments work from earlier today; none was touched here, and this report is
the only other file written.)

---

## Notes

- The `⚠️`, `🔴`, `❗`, `💷` and `💳` markers, the blockquote markers, bold and every `§` reference are
  preserved verbatim — the blocks were copied, never retyped.
- The file still ends with a trailing newline; the footer is the last line.
- Nothing outside the five edits was reformatted, reflowed, reordered or tidied.

## What I could NOT verify

- **The manual was not read end to end for coherence** — the edits are mechanically correct and
  byte-faithful, but I did not check whether any new statement contradicts existing manual content
  elsewhere.
- **The `~+130` estimate's origin is inferred.** I reconciled the actual count exactly and proved all
  four blocks present, but I cannot know what the author was counting when they wrote 130.
- **No rendering check** — the markdown was not previewed, so I have not confirmed the new blockquotes
  and nested list items render as intended.
