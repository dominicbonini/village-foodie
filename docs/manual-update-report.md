# MANUAL UPDATE — V9.9 → V10 (BUZZERS), INTEGRATED

**Date:** 3 August 2026 · **Target:** `docs/reference-manual.md`
**Source:** `~/Downloads/reference-manual-V10-buzzers.md` — **16,351 bytes, 283 lines**, UTF-8
**Status: ✅ INTEGRATED. Version bumped V9.9 → V10. Only `docs/reference-manual.md` was edited** (5136 → 5284 lines, +148).
No `next dev` / `next build` run. **The delta file was not deleted** — verified still present at 16,351 bytes after the run.

> This file replaces the previous manual-update report (V9.8 → V9.9). That content is not preserved anywhere.

---

## 0. Prompt integrity

Nothing arrived garbled. One overlap worth naming rather than treating as an error: the rules say
"change no file except `docs/reference-manual.md`", and the FINALLY instruction mandates writing
`docs/manual-update-report.md`. I read the first as scoping the *integration* and the second as the
deliverable, and wrote both. No third file was touched.

---

# ✅ INTEGRITY GATE — PASSED

Strict UTF-8 decode succeeded with no errors and no substitutions. **9 distinct non-ASCII codepoints, 76 total.**

| Codepoint | Count | Char | Name | Expected | ✓ |
|---|---|---|---|---|---|
| U+2014 | 37 | — | EM DASH | 37 | ✅ |
| U+1F534 | 11 | 🔴 | LARGE RED CIRCLE | 11 | ✅ |
| U+26A0 | 10 | ⚠ | WARNING SIGN | 10 | ✅ |
| U+FE0F | 10 | (VS16) | VARIATION SELECTOR-16 | 10 | ✅ |
| U+00D7 | 3 | × | MULTIPLICATION SIGN | 3 | ✅ |
| U+00A7 | 2 | § | SECTION SIGN | 2 | ✅ |
| U+2026 | 1 | … | HORIZONTAL ELLIPSIS | 1 | ✅ |
| U+2192 | 1 | → | RIGHTWARDS ARROW | 1 | ✅ |
| U+1F514 | 1 | 🔔 | BELL | 1 | ✅ |

- **U+FFFD REPLACEMENT CHARACTER: 0** ✅
- **Mojibake tell-tales (`Ã`, `â`, C1 controls): NONE** ✅
- **VS16 pairing: 10 of 10** U+FE0F immediately preceded by U+26A0 — exactly ten well-formed ⚠️ emoji, zero orphans ✅
- **No unexpected codepoints** — the census set is exactly the nine expected, no tenth
- Post-integration re-check: **0 U+FFFD in the manual** ✅

**sha256** `6b7a6d4d0fe794f48807dff3d467b5804d859f4b9e7157173e93f5dce619849d`

## The two § characters — handled as instructed

Both live in the delta's own header warning (its lines 7-9), naming `§38.4` and `§41.4` as the dangling
pointers the V9.8 and V9.9 integrations produced. **They were NOT resolved and NOT imported as
pointers.** The warning's *substance* — that delta numbering does not survive integration, which is why
this delta cites no section numbers — is honoured by the placement method used throughout. The literal
text was not carried into the manual, because it is an instruction to the integrator rather than manual
content. Say the word if you want it recorded as a maintenance note.

---

# Version bump

| Line | Before | After |
|---|---|---|
| 1 | `HatchGrab Engineering Reference Manual · V9.9` | `HatchGrab Engineering Reference Manual · V10` |
| 5283 (footer) | `HatchGrab Engineering Reference Manual · V9.9` | `HatchGrab Engineering Reference Manual · V10` |

Six `V9.9` strings remain, all **historical section labels** (§27's V9.9 backlog block, the §38 heading
`extended V9.9`, `## The landing illustration (V9.9)`, `## Tagline and brand voice (V9.9)`, the
`Update, 31 July 2026 (V9.9)` paragraph, and the still-open CTA-contrast annotation). None is a
current-version marker. Left alone deliberately.

⚠️ **Line 9 still reads `**Version 9.3**`** — a stale block in the title matter that predates this work
and that the V9.4–V9.9 bumps also skipped. Not touched, since it is outside this delta. Flagging it
because it reads as authoritative to anyone opening the file cold.

⚠️ **No changelog block was added.** `# Changelog` stops at V9.7, and **neither V9.8 nor V9.9 got an
entry** — both recorded their state inside their own content section instead. The brief says to give
STATE "the same treatment the V9.8 and V9.9 snapshots received", so V10's state went into §39's own
deploy-state block. Inventing a V10 changelog entry would have broken that precedent, not restored it.

---

# Sections touched

## NEW — `# 39. Buzzers — physical pagers against orders (V10)` · lines 5170-5281

**Section number 39.** The manual's highest was **38** (Brand system); 39 is the next free number.
⚠️ There is **no §29** — the sequence jumps 28 → 30. I did **not** reuse that gap: "next free number
after the current highest" means 39. Verified no duplicate top-level numbers exist after the edit.

Placed after §38 and before the footer, matching how §35-38 were appended.

| Subsection | Lines |
|---|---|
| The three-layer model (table + event-types rationale) | 5174-5184 |
| Schema — all additive, no backfill | 5186-5198 |
| 🔴 The in-use status list is NOT the occupying-status list | 5200-5209 |
| The grid | 5211-5231 |
| Where it appears | 5233-5239 |
| The write | 5241-5247 |
| Offline and conflict resolution | 5249-5257 |
| The losing order's banner | 5259-5265 |
| `### Deploy state — V10, DEPLOYED and live-verified` | 5271-5281 |

## `# 16. Database schema essentials`

**(a) `orders` column list extended — line 2966.** Appended in the list's existing bold-with-version
style: **`buzzer_number` (smallint, null, V10)**, **`placed_at` (timestamptz, null, V10)**,
**`buzzer_lost_at` (timestamptz, null, V10)**. The manual's own rule at that entry — *"if you extend
this table, extend this list"* — required this.

**(b) No-unique-index rule — new blockquote at line 2970**, directly under the two partial unique
indexes, where a reader looking for order indexes will be. Cross-refs §39.

**(c) NEW subsection `### Live-schema facts — triggers on 'orders' (V10 / 3 August 2026)` — lines
3128-3140.** Sits with the two existing `Live-schema facts` subsections (V9 signup+schedule, V9.2
demo+deletion) and opens with the same "the cross-cutting lesson lives in §35" pointer those use.
Holds the full trigger finding and the `pg_trigger` query verbatim.

## `# 35. Cross-cutting engineering invariants` — five entries, lines 4845-4853

Appended after the morphological-closing entry (V9.9) and before §36, so all five silent-failure
lessons now sit in one run: `.hg-landing` specificity (V9.8) → morphological closing (V9.9) → the three
new ones. Converted from the delta's `###` headings to the manual's bold-lead paragraph form, which is
what every other §35 entry uses.

| Entry | Line |
|---|---|
| 🔴 `??` swallows a meaningful `null`, exactly as `\|\|` swallows a meaningful `false` | 4845 |
| 🔴 `mergeOrders` protects the STATUS lifecycle only — every other field is unguarded | 4847 |
| 🔴 Production contains objects with no migration file — this holds for TRIGGERS too | 4849 |
| Trace the interaction; do not enumerate plausible causes | 4851 |
| `update_truck` silently drops unlisted keys | 4853 |

The `??` entry closes with *"Same class as the `.hg-landing` reset and the morphological closing above:
a silent failure that reports clean"* — the phrasing the morphological-closing entry already used to
link itself to the specificity entry, so the run is self-describing.

## `# 27. Open backlog` — new V10 block, lines 3768-3776

`## 🔴 V10 — added 3 August 2026 (buzzers)` inserted **above** the V9.9 block (newest first), with the
existing `### Found, reported, not fixed` sub-heading and bullet style. Six items.
**No second backlog section was created.**

---

# Merges — folded, not repeated

| # | Delta content | Existing manual content | What I did |
|---|---|---|---|
| 1 | Trigger-duplication lesson | §35 *"A swallowed write makes a missing column indistinguishable from a working one"* (line 4708) — same class, for **columns** | **Cross-referenced, not duplicated.** The §35 entry opens *"The existing entry above … records this for columns; triggers are the same class"* and defers the finding + query to §16. §16 defers the lesson to §35. Neither repeats the other. This is the "check, and if so cross-reference" instruction. |
| 2 | Occupying list = 4 values, capacity frees at ready | §71 (line 786) already states the occupying set and *"released AT ready"* | Kept the four values **verbatim** (required), but cited **§71** for the capacity model rather than re-deriving it. The delta's contribution — the *contrast* with the buzzer lifecycle — is what §39 adds. |
| 3 | Backlog: occupying list duplicated in five places | §71 records the set but not the duplication | Kept as a V10 backlog item, cross-referencing §39 and §71. |
| 4 | Backlog item 5: iOS splash / `SplashScreen` not installed | V9.8 backlog final bullet — **near-verbatim duplicate** | **Merged.** The V10 item is one line marked *"Re-confirmed 3 August; recorded once in the V9.8 block below and not duplicated here."* |
| 5 | Backlog item 4: iOS app icon **done** 3 August | V9.8 backlog *"Native icons blocked on `minSdkVersion` … iOS `AppIcon-512@2x.png` (1 file)"* lists it as outstanding | **Merged forward, V9.8 left intact.** The V10 item carries the Android state plus ✅ iOS done, and says explicitly that it updates the V9.8 entry *"which still lists the iOS file as outstanding — that entry is left as written rather than edited in place."* |
| 6 | STATE: `capacitor.config.ts` LAN-IP trap | Line 276 already records *"An iPad CANNOT reach the dev server via `localhost`"*; line 402 records the `CAP_SERVER_URL` sync command | **Merged.** §39's deploy state keeps the delta's new detail (`IS_LOCAL_HTTP`, the blank-screen-no-error symptom, the revert instruction) and adds *"the same asymmetry §8 records for `wakeLock` over LAN"* rather than restating the known part. |
| 7 | `update_truck` drops unlisted keys | Not previously in §35 | New entry, extended with the **van-level equivalent** (`update_van_settings` is a destructure and drops just as silently) — a fact from the phase-1 build, not in the delta. |

**On the phase-1/phase-2 reports seeding overlap:** checked. `grep -ci buzzer docs/reference-manual.md`
returned **0** before this run — no buzzer material had reached the manual from those reports. Nothing
to de-duplicate on that axis.

---

# 🔴 CONTRADICTIONS — nothing changed, your call

## 1. `orders` column count vs the list itself, and vs live

**Manual (§16, unchanged):**
> **orders** — **thirty-five columns as of V9.4. The list below is COMPLETE and live-verified (29 July).**

**The manual's own list**, counted item by item, contained **37** columns before this edit — not 35.
**The live database** returned **37** columns on `orders` in the PostgREST schema dump taken during the
phase-1 diagnosis, agreeing with the list and not with the number. With the three V10 additions the
true count is now **40**.

**I think the LIST is right and the NUMBER is wrong**, because the list agrees with live on both
membership and total, while the prose figure agrees with neither. The likely history is that
"thirty-five" was written when the list was 35 long and two later additions extended the list without
updating the sentence — which is precisely the failure that entry's own warning exists to prevent.

**Changed nothing.** I extended the list (mandated by the entry's own rule) and left `thirty-five`
exactly as written. Extending the list does make the stale figure *more* wrong, which is why it is
first here. **Your call:** change to "forty columns as of V10", or leave and let the list be
authoritative.

## 2. `payment_status` CHECK constraint

**Manual (§16, unchanged):** `payment_status` ∈ `unpaid|paid|refunded|failed`.
**Migration `20260729_orders_payment_status_widen_check.sql`** widened it to
`unpaid|paid|part_paid|refunded|refund_due|failed`.

Not delta content and not in scope, so **changed nothing**. Noting it because it sits four lines from
an edit I did make, and anyone checking buzzer constraints will read it.

**No contradiction was found between the delta and the manual.** Both conflicts above are the manual
against itself or against live.

---

# Verbatim preservation — automated check, all PASS

| Item | Result |
|---|---|
| `BUZZER_IN_USE_STATUSES = pending, confirmed, modified, cooking, ready` | ✅ verbatim |
| `occupying (capacity)   = pending, confirmed, modified, cooking` | ✅ verbatim, incl. spacing |
| `BUZZER_MAX_COUNT` / max 30 | ✅ |
| `20260804_assign_buzzer_atomic.sql` | ✅ |
| migration `20260703` | ✅ |
| `pg_trigger` query, both lines | ✅ verbatim |
| 8% red-green colour-deficiency figure | ✅ |
| All five schema lines (name + type + null + comment, aligned) | ✅ verbatim in the code block |
| Paths: `lib/buzzer.ts`, `lib/slot-bookings.ts`, `lib/capacity-breach.ts`, `lib/slot-capacity.ts`, `components/dashboard/AddOrderPanel.tsx`, `components/dashboard/helpers.ts`, `lib/slot-indicator.ts`, `lib/payments/paid-step.ts`, `capacitor.config.ts`, `android/app/build.gradle`, `variables.gradle`, `AppIcon-512@2x.png` | ✅ all present |

---

# Style conversions applied

The delta's own formatting was **not** imported:

- delta `###` subheads → manual `##` inside §39, and → **bold-lead paragraphs** inside §35 (its universal form)
- delta title matter (`# REFERENCE MANUAL — V10 ADDENDUM`, the integration instruction, the provenance note, the `§38.4`/`§41.4` warning) → **not carried**; the provenance sentence was folded into §39's opening blockquote, which is how §36 and §38 open
- delta `---` rules between major blocks → dropped; the manual uses heading level alone
- delta numbered backlog list → `-` bullets under `### Found, reported, not fixed`, matching V9.8/V9.9
- 🔴 / ⚠️ retained — both are established manual conventions, used identically
