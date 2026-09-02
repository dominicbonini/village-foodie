# Reference manual merge — V11.55 → V11.56

**Source:** `~/Downloads/manual-delta-evening-session.md` (269 lines, 16,923 B, 22:37).
**Nothing committed. Nothing deployed. No SQL, no migration.**

---

## VERIFICATION

**What I performed: PARSE and EXECUTION.** Not a typecheck.

| Check | How | Result |
|---|---|---|
| Every insertion anchor unique | `grep -Fc` before writing | **all 7 anchors count=1** ✅ |
| Merge is purely ADDITIVE | `diff` against a pre-edit backup | **257 lines added, 1 removed** ✅ |
| The 1 removed line | read from the diff | **the header version string only** ✅ |
| All 11 delta blocks landed | `grep -F` per block | **11/11 present** ✅ |
| Delta fully read | `sed`, 269/269 lines | ✅ |

**Backup of the pre-merge file** is in the session scratchpad as `reference-manual.BEFORE-11.56.md`.

**No span of the delta arrived garbled.**

---

## 🔴 THE VERSION NUMBER IS V11.56, NOT V11.59

**You said "go up to next version number 11.59 i think" — the hedge was right to be there.**

```
manual header before this merge : V11.55
delta contains                  : ONE "new version block at the top"
therefore                       : V11.56
```

**I checked whether earlier deltas were sitting unapplied, which is the only thing that could justify
11.59.** They are not — every delta file in `~/Downloads` is already in the manual:

| Delta file | Applied as |
|---|---|
| `reference-manual-delta-kds-picker.md` (14:00) | **V11.53** |
| `reference-manual-delta-play-submission.md` (14:37) | **V11.54** |
| `manual-delta-dashboard-incident.md` (16:22) | **V11.55** |
| **`manual-delta-evening-session.md` (22:37)** | 🔴 **V11.56 — this merge** |

**Jumping to 11.59 would have left 11.56, 11.57 and 11.58 as numbers that never existed.** ⚠️ **Say the
word and I will renumber**, but I did not invent three empty versions on a hedge.

---

## Where each block went

**The delta cites no section numbers deliberately — placement is by heading text.**

| Delta block | Placed in |
|---|---|
| Changelog | **new `## V11.56`**, directly above `## V11.55` |
| The merge guard | **§9 Kitchen Display System (KDS) rules** |
| Test data and seeding — 2 corrections | ⚠️ **§26 Testing and dev environment** — see below |
| The four-site auth class | **§12 Authentication and access** |
| Write/read timeout asymmetry | **§11 Native app and offline architecture** |
| Three method entries | **§35 Cross-cutting engineering invariants** |
| Analytics and instrumentation | 🔴 **NEW §47** — see below |
| Landing page and marketing surfaces | 🔴 **NEW §48** — see below |
| Deploy posture | 🔴 **NEW §49** |
| Open backlog | **§27 Open backlog**, as a dated `## Open as of V11.56` subsection |

### ⚠️ THREE OF THE DELTA'S NAMED SECTIONS DID NOT EXIST

**The delta names them as though they do. They do not, and I had to choose.** Recorded because it is a
judgement call, not a transcription:

| Delta's title | What existed | What I did |
|---|---|---|
| *"Test data and seeding"* | **No such heading.** Seeding is scattered across 108 mentions | **Subsection of §26 Testing and dev environment** — nearest existing home |
| *"Analytics and instrumentation"* | **No such heading.** PostHog material lived inside §12 Authentication | 🔴 **Created §47.** The material is substantial and is not authentication |
| *"The landing page and marketing surfaces"* | **No such heading.** Landing material split across §38 and §44 | 🔴 **Created §48** |

⚠️ **I did NOT restructure the existing scattered landing and PostHog material into the new sections** —
that would be a rewrite, not a merge. **The new sections hold the V11.56 material only, and the older
content stays where it is.** Consolidating it is a separate decision.

---

## 🔴 ONE BLOCK WAS ALREADY APPLIED — AND I DID NOT DUPLICATE IT

The delta asks to **"CORRECT THE LINE RECORDING OFFLINE WALK-UP CREATION AS NOT BUILT"**, in place.

**It was already corrected at V11.55.** `docs/reference-manual.md` lines 6729–6748 already carry
*"Stage B — Walk-up orders while offline — 🔴 THE WRITE HALF IS BUILT; THE COMPOSE HALF IS NOT
(corrected V11.55)"*, the built/not-built split, **and** the method lesson about understatement
commissioning work twice.

✅ **Restating it would have produced two entries making the same correction.** The new §11 block carries
a one-line pointer to it instead. **OBSERVED by reading the lines, not assumed from the version number.**

---

## Fidelity

| Rule from the delta | Held? |
|---|---|
| *"Do not upgrade a REASONED line when applying this"* | ✅ **Every OBSERVED / REASONED marker copied verbatim.** The session-replay inference is still marked REASONED |
| *"Where a block CORRECTS an existing line, correct it in place"* | ✅ The only such block was already applied — §11 above |
| *"place each block by its section's heading text"* | ✅ For the six that exist; ⚠️ three did not — table above |
| Cross-references | **Added** — §9 ↔ §26 ↔ §27, §47 and §48 named from the backlog |

---

## Scope

| Check | Result |
|---|---|
| Files changed | **`docs/reference-manual.md` only** |
| Net change | **+257 lines, −1 line** (the header version string) |
| Existing content altered | **None** — verified by diff, not by intent |
| Header | `· V11.55` → **`· V11.56`** |
| Sections added | **§47, §48, §49** |
| Code, SQL, migrations, deploys | **None** |

---

## What I could not establish

1. 🔴 **Whether you actually want 11.59.** I applied **V11.56** and have said why. **Renumbering is one
   edit if you disagree.**
2. **Whether §47 and §48 should absorb the older scattered analytics and landing material.** **I left it
   in place deliberately** — merging it is a rewrite and was not asked for.
3. **Whether the manual's claims are true.** **This was a transcription task.** I verified placement and
   that nothing was lost; **I did not re-verify the delta's engineering claims against the code.**
