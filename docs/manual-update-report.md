# Reference manual → V11.3 (not V11.2 — see below)

**Date:** 5 August 2026. **Documentation only.** `docs/reference-manual.md` is the only file edited. No source file touched, no `cap sync`, no `next dev`, no `next build`.

---

## 🔴 ONE PREMISE IN THE BRIEF WAS OUT OF DATE — FLAGGED, NOT RESOLVED SILENTLY

> *"docs/reference-manual.md, currently V11.1 → V11.2"*

**The file was already at V11.2 on disk.** V11.2 was written earlier the same day for the Cursor-report working-practice rule (§22), and its changelog entry is intact at line 25.

**Writing this content as V11.2 would have destroyed that entry.** I took **V11.3** instead, which preserves both, and recorded the reason in the changelog itself so the gap in numbering is not later read as a lost version. If you would rather the two be merged, that is a one-off edit — but they are different sessions and different subject matter.

---

## INTEGRITY GATE

### Census BEFORE — 69 distinct non-ASCII characters, 5,791 occurrences

| U+ | Char | Count | Name |
|---|---|---|---|
| 2014 | — | **3119** | EM DASH |
| 2192 | → | **1133** | RIGHTWARDS ARROW |
| 00A7 | § | **444** | SECTION SIGN |
| 26A0 | ⚠ | **150** | WARNING SIGN |
| FE0F | | **148** | VARIATION SELECTOR-16 |
| 1F534 | 🔴 | **112** | LARGE RED CIRCLE |
| 00B7 | · | 80 | MIDDLE DOT |
| 00D7 | × | 68 | MULTIPLICATION SIGN |
| 00A3 | £ | **64** | POUND SIGN |
| 2013 | – | 63 | EN DASH |
| 2713 | ✓ | 59 | CHECK MARK |
| 2026 | … | 55 | HORIZONTAL ELLIPSIS |
| 2260 | ≠ | 47 | NOT EQUAL TO |
| 2212 | − | 40 | MINUS SIGN |
| 2264 | ≤ | 21 | LESS-THAN OR EQUAL TO |
| 21D2 | ⇒ | 14 | RIGHTWARDS DOUBLE ARROW |
| 2265 | ≥ | 13 | GREATER-THAN OR EQUAL TO |
| 2194 | ↔ | 11 | LEFT RIGHT ARROW |
| 221E | ∞ | 10 | INFINITY |
| 2705 | ✅ | 10 | WHITE HEAVY CHECK MARK |
| 2208 | ∈ | 8 | ELEMENT OF |
| 25CF | ● | 7 | BLACK CIRCLE |
| 2190 | ← | 6 | LEFTWARDS ARROW |
| 1F4B3 | 💳 | 6 | CREDIT CARD |
| 1F4B7 | 💷 | 6 | BANKNOTE WITH POUND SIGN |
| 03A3 | Σ | 5 | GREEK CAPITAL LETTER SIGMA |
| 270F | ✏ | 5 | PENCIL |
| 27FA | ⟺ | 5 | LONG LEFT RIGHT DOUBLE ARROW |
| 00B0 | ° | 4 | DEGREE SIGN |
| 00B1 | ± | 4 | PLUS-MINUS SIGN |
| 2248 | ≈ | 4 | ALMOST EQUAL TO |
| 2728 | ✨ | 4 | SPARKLES |
| 2757 | ❗ | 4 | HEAVY EXCLAMATION MARK |
| 00E9 | é | 3 | E WITH ACUTE |
| 21A9 | ↩ | 3 | LEFTWARDS ARROW WITH HOOK |
| 222A | ∪ | 3 | UNION |
| 26A1 | ⚡ | 3 | HIGH VOLTAGE SIGN |
| 2715 | ✕ | 3 | MULTIPLICATION X |
| 1F355 | 🍕 | 3 | SLICE OF PIZZA |
| 1F381 | 🎁 | 3 | WRAPPED PRESENT |

*(Plus 29 characters at 1–2 occurrences: 2016, 2284, 23F3, 23F8, 24D8, 25B6, 2717, 1F44B, 1F4CB, 1F4E4, 1F510, 1F6AB, 00BB, 2032, 203A, 21B3, 226B, 2286, 2699, 27F7, 27F9, 2B07, 1F336, 1F4CD, 1F4DD, 1F4E6, 1F514, 1F528, 1F5D1 — all captured and diffed mechanically.)*

**Curly quotes: U+2018 = 0, U+2019 = 0, U+201C = 0, U+201D = 0. U+FFFD = 0.**

### Census AFTER — 69 distinct, 6,033 occurrences

**NEW characters: NONE. REMOVED characters: NONE. Curly quotes: 0, 0, 0, 0. U+FFFD: 0.**

### 🔴 CHARACTERS WHOSE COUNT DROPPED: **NONE**

The gate's specific test — *"any character whose count DROPS other than by an edit you can name"* — **fires on nothing. Every one of the 69 characters is at or above its starting count.** No corruption, and nothing to justify.

**All 13 changes are increases, all from added text:**

| U+ | Char | Before → After | Δ | From |
|---|---|---|---|---|
| 2014 | — | 3119 → 3211 | **+92** | em dashes in new prose |
| 1F534 | 🔴 | 112 → 152 | **+40** | load-bearing markers |
| FE0F | | 148 → 178 | **+30** | ⚠️ emoji-presentation halves |
| 26A0 | ⚠ | 150 → 179 | **+29** | **+30 vs +29 — see the note below** |
| 00A7 | § | 444 → 466 | **+22** | cross-references to §4, §11, §16, §22, §27, §35, §40 |
| 00A3 | £ | 64 → 73 | **+9** | £29/£49/£1,500/£2,000 in the DRY entry |
| 2192 | → | 1133 → 1141 | +8 | `V11.1 → V11.2`, `unsatisfied→satisfied`, `dashboard↔KDS` |
| 00B7 | · | 80 → 84 | +4 | separator lists |
| 2705 | ✅ | 10 → 13 | +3 | established-fact markers |
| 00D7 | × | 68 → 70 | +2 | `trial branch ×2` |
| 2194 | ↔ | 11 → 12 | +1 | `dashboard↔KDS` |
| 2026 | … | 55 → 56 | +1 | quoted Apple text |
| 26A1 | ⚡ | 3 → 4 | +1 | quoted `CAPLog.print("⚡️ …")` |

⚠️ **The FE0F/26A0 pair moved +30 / +29, not identically.** That is **explained, not corruption**: one new FE0F belongs to the **⚡️** in the quoted `CAPLog.print` line, which is `U+26A1 + U+FE0F` rather than a warning sign. `26A1` is itself `+1`, and `30 = 29 + 1` reconciles exactly. **The pre-existing 2-count gap between 26A0 and FE0F is unchanged.**

### Already-garbled spans

**None found.** No U+FFFD, no `â€` / `Ã©` / BOM mojibake anywhere. Nothing flagged for repair and nothing repaired.

---

## SECTIONS TOUCHED — extended in place, one new section

| Where | What |
|---|---|
| Header / title / footer | V11.2 → **V11.3**, 3 sites |
| **Changelog** | New `## V11.3 — 5 August 2026`, 8 bullets, opening with the numbering flag |
| **§4** Plan tiers | **2 new subsections** — per-truck suppression, and the pricing-figures drift audit |
| **§11** Native app | **`## Wake lock and screen-on` CORRECTED IN PLACE** + a new `## The native shell` subsection |
| **§16** Database schema | New `### Live-schema facts — per-truck pricing (V11.3)` |
| **§22** Development process | New `### Standing rules (V11.3)` |
| **§27** Open backlog | New `## 🔴 V11.3` block — 2 open defects, /admin, 3 found-not-fixed, 3 App Store blockers |
| **§35** Invariants | **5 new invariants** |
| **§40** *(NEW)* | **iOS App Store — commerce posture** |

**File: 5,661 → 5,919 lines.**

### Why §40 is new rather than an extension

The brief said to extend rather than create a parallel section. **No App Store or iOS-platform section existed.** §36 is *Android* platform notes, §37 is the *payments commercial model*, §4 is the product's own feature gating. The commerce posture spans guideline interpretation, code and backlog, and belonged in none of them. **§40 is the next free number and is cross-referenced from §4, §11, §27 and the changelog.** Everything else in this update extended an existing section.

### Corrections made IN PLACE (no version left standing beside its replacement)

| # | Where | Was | Now |
|---|---|---|---|
| 1 | **§11 Wake lock** | the entry described the module with no mention that the release path had been removed, or why that was wrong | `### 🔴 CORRECTED V11.3` — the process-wide iOS fact, the false Android-derived premise, the rule, and the withdrawn instruction |
| 2 | **§40** | 3.1.3(f) assumed to be the route | 🔴 **"i.e." not "e.g."; reviewer response confirms exhaustive; not the route.** Explicit instruction to correct any prior note |
| 3 | **§22 Standing rules** | earlier entries treat Test Kitchen and RTF as live trucks | ⚠️ noted inline: **only Gusto counts**; the older entries are flagged rather than rewritten |

⚠️ **On correction 3** — I flagged the older references rather than editing every one. Rewriting every historical mention of RTF/Test Kitchen would have touched a dozen dated changelog entries and rewritten history. **Say if you want them swept; it is a separate pass and I did not want to do it silently.**

---

## ⚠️ RECORDED AS UNCONFIRMED, AS INSTRUCTED

Nothing labelled unconfirmed in the brief is recorded as verified:

- **The two-scroller header hypothesis** — written as *"Leading hypothesis — UNCONFIRMED, and it must not be recorded as more than that"*, with what **is** established from source (`bounces = false`; nothing writes `contentOffset`) separated from what is **not** (whether iOS chains inner-scroller momentum — WebKit internals), plus the single `window.scrollY` reading that settles it.
- **Both iPad display defects** — in the **backlog**, marked open, intermittent and not reproducing. Not recorded as resolved.
- **The CMA consultation** — closed 28 July 2026, Apple contesting, **no decision**; with an explicit instruction not to build on the assumption it changes.
- **The DRY findings** — recorded as **known drift risk, NOT fixed**, with an explicit note that nothing is broken today.

**Recorded as verified only where the brief said so:** `trucks.hide_pricing` (migration **applied and verified** against the live schema, 5 August 2026, Gusto set true) and the Apple guideline text (**checked against live text, last updated 8 June 2026**).

## VERIFICATION

- **Census:** 69 distinct / 5,791 → 69 distinct / 6,033. **No new characters, none removed, and NO COUNT DROPPED.** Curly quotes 0 throughout; U+FFFD 0. The one non-identical FE0F/26A0 delta reconciles exactly against ⚡️.
- **Version:** V11.3 at all three sites — line 1, `**Version 11.3**`, and the running footer (line 5918).
- **Structure:** `# 40.` follows `# 39.`; all new subsections sit at the correct depth under their parent section; the running footer is still the last line.
- **Only `docs/reference-manual.md` was edited.** No source file touched. `cap sync`, `next dev`, `next build` not run.
