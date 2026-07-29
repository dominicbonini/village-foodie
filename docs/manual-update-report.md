# Manual update report — V9.3 → V9.4 payments deltas

**Date:** 29 July 2026
**Source:** `~/Downloads/manual-v94-deltas.md` (read from disk, UTF-8, 44,880 bytes)
**Target:** `docs/reference-manual.md`
**Status: ✅ COMPLETE — all seven edits applied, all eight checks pass.**

---

## Pre-flight

**Source path.** The instruction named `docs/manual-v94-deltas.md`; that path does not
exist. The file was found on disk at `~/Downloads/manual-v94-deltas.md` and read from
there. The chat attachment of the same file was **mojibake-corrupted again** (its own
glyph-integrity line rendered as `Â§ Â£ â â â â â  â Ã Î£ â ð´ â ï¸`) and was
**not used** — confirming the corruption is a chat-transfer artifact, not a source defect.

**Glyph-integrity gate — PASS.** The on-disk file's line 5 renders correctly:

```
§ £ — – → ↔ ≠ − × Σ ❗ 🔴 ⚠️
```

All thirteen glyphs intact, so no repairs were attempted or needed.

**Method.** Applied by script, with the seven blocks extracted **byte-exactly** from the
deltas file between its `<<<BEGIN …>>>` / `<<<END …>>>` markers. Nothing was retyped,
reworded, re-punctuated or restructured. Anchors were likewise extracted from the
deltas' own fenced blocks. The script verified every anchor count **before** writing a
single byte — a mismatch would have aborted the whole run. A pre-edit backup was taken
to the session scratchpad.

---

## Anchor verification — all exact

| Edit | Target | Matches | Expected |
|---|---|---|---|
| 1 | `# Changelog` + `## V9.3 — 28 July 2026` | 1 | 1 ✅ |
| 2 | §13 `operators` line (phantom columns) | 1 | 1 ✅ |
| 3 | §16 `operators` line | 1 | 1 ✅ |
| 4 | §16 `orders` line | 1 | 1 ✅ |
| 5 | `# 27. Open backlog (June 2026)` | 1 | 1 ✅ |
| 6 | `# 36. Android app platform notes (V9.2, verification status V9.3)` | 1 | 1 ✅ |
| 7 | `HatchGrab Engineering Reference Manual · V9.3` | 2 | 2 ✅ (by design) |

## Edits applied

1. **V9.4 changelog entry** inserted between `# Changelog` and `## V9.3 — 28 July 2026`,
   blank line either side. V9.4 now sits above V9.3.
2. **§13 `operators`** — phantom `billing` / `stripe_customer_id` removed, replaced with
   the thirteen live-verified columns plus the 🔴 correction blockquote.
3. **§16 `operators`** — replaced with the complete thirteen-column list.
4. **§16 `orders`** — replaced with the complete thirty-five-column list, the CHECK-
   constraint blockquote and four V9.4 RULE blockquotes.
5. **§27** — V9.4 backlog block inserted immediately after the heading, before
   `## Built this session (V7.8 §22–§38)`. Heading itself unchanged.
6. **§35** — ten new invariants appended, immediately before the §36 heading.
   **The §36 heading text was not altered.**
7. **§37 Payments** appended before the footer; both version strings bumped to `· V9.4`.

**Block fidelity:** all seven blocks confirmed present **verbatim** in the output
(33, 3, 1, 15, 31, 26 and 75 lines respectively).

---

## VERIFICATION — 8 of 8 PASS

**1. `grep -c "^# "` → 37** ✅ (was 36)

**2. `grep -c "· V9.3"` → 0** ✅
The §36 heading's `verification status V9.3` is untouched, as instructed — it is not a
`· V9.3` version string and correctly does not match.

**3. `grep -c "· V9.4"` → 2** ✅ — line 1 (title) and the final line (footer).

**4. `stripe_customer_id`** ✅ **on intent; one literal discrepancy worth recording.**
The original phantom assertion is gone (`grep -c "billing, stripe_customer_id"` → **0**),
and **zero** occurrences claim the column exists. It now appears three times, all
stating it does **not** exist:

| Line | Location |
|---|---|
| 31 | V9.4 changelog, "FOUR SCHEMA CORRECTIONS" |
| 2640 | **§13 correction** — the one the check names |
| 2871 | §16 entry, "NO `stripe_customer_id`" |

The check as written says "appears ONLY inside the §13 correction". Taken literally that
is false — but the two extra occurrences are text **the deltas file itself mandates**
(blocks 1 and 3), so the check is internally inconsistent with its own instructions. The
substantive condition — no surviving claim that the column exists — is met. Flagged
rather than silently marked green.

**5. `wc -l` → 4,693** ✅ (deltas estimated ~4,697; the `~` covers it)
Net **+185** lines, reconciled exactly:

```
+34 (E1)  +2 (E2)  +0 (E3)  +14 (E4)  +32 (E5)  +27 (E6)  +76 (E7)  =  +185
4,508 + 185 = 4,693 ✓
```

Every line is accounted for, so the 4-line gap is estimation slack, not lost content.

**6. Changelog order** ✅ — `## V9.4 — 29 July 2026` (line 19) sits above
`## V9.3 — 28 July 2026` (line 53), above V9.2 (line 67).
**The V9.3 entry is byte-identical to before** — verified with `cmp` on the extracted
15-line block. Not renumbered, not merged, content untouched.

**7. Heading diff** ✅ — the only difference is one addition:

```
36a37
> # 37. Payments — commercial model and architecture decisions (V9.4)
```

Nothing removed, nothing reworded, nothing reordered.

**8. `git diff --stat`** ✅ — the modified-file set is **identical to the session-start
baseline** (11 files). The other ten carry pre-existing uncommitted work from the
Android and capacity workstreams and were **not touched**. Only
`docs/manual-update-report.md` is newly untracked, which is this report.

`docs/reference-manual.md`: **248 insertions, 9 deletions** vs `HEAD`. The 9 deletions
reconcile exactly — 6 from the pre-existing Android work, 3 from this pass (the single
replaced lines in edits 2, 3 and 4):

```
-HatchGrab Engineering Reference Manual · V9.2        (Android bump, now → V9.4)
-**Version 9.2**                                       (Android)
-- **operators** — account holder. … stripe_customer_id.   ← EDIT 2
-- **operators** — first_name, … billing.                  ← EDIT 3
-- **orders** — order_key (V6.3, uuid, PRIMARY KEY …       ← EDIT 4
-**A JS `try`/`catch` around a Capacitor plugin call …** (Android)
-# 36. Android app platform notes (V9.2)                (Android)
-**Verification asymmetry, worth knowing …**            (Android)
-HatchGrab Engineering Reference Manual · V9.2          (Android bump, now → V9.4)
```

**Android work confirmed still present:** `VERIFICATION STATUS (V9.3, 28 July 2026)`,
the fail-closed/fail-open invariant, and both `Bridge.callPluginMethod` references.

---

## Notes

- No file other than `docs/reference-manual.md` and this report was modified.
- The §36 heading remains `# 36. Android app platform notes (V9.2, verification status V9.3)`.
- The file still ends with a trailing newline; the footer is the last line.
- `❗` (U+2757) appears as specified in the EDIT 1 and EDIT 5 blocks.
- Backup of the pre-edit file retained in the session scratchpad as
  `reference-manual.BEFORE.md` (md5 `e429f3d6cfcb3dab844841df76950d53`, 4,508 lines).
