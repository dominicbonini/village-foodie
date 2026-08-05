# Reference manual V11.1 -> V11.2

**Date:** 5 August 2026. **Documentation only** — no code changed, no migration, no SQL, `next dev` / `next build` not run.
File read from disk (`docs/reference-manual.md`), never from an attachment.

**One working-practice rule added.** No architecture change.

---

## INTEGRITY GATE

### Census BEFORE — 69 distinct non-ASCII characters, 5,766 occurrences

| U+ | Char | Count | Name |
|---|---|---|---|
| 2014 | — | 3107 | EM DASH |
| 2192 | -> | 1131 | RIGHTWARDS ARROW |
| 00A7 | § | 440 | SECTION SIGN |
| 26A0 | (warn) | 149 | WARNING SIGN |
| FE0F | | 147 | VARIATION SELECTOR-16 |
| 1F534 | (red) | 109 | LARGE RED CIRCLE |
| 00B7 | · | 80 | MIDDLE DOT |
| 00D7 | × | 68 | MULTIPLICATION SIGN |
| 2013 | – | 63 | EN DASH |
| 00A3 | £ | 62 | POUND SIGN |
| 2713 | | 59 | CHECK MARK |
| 2026 | … | 55 | HORIZONTAL ELLIPSIS |
| 2260 | ≠ | 47 | NOT EQUAL TO |
| 2212 | − | 40 | MINUS SIGN |
| 2264 | ≤ | 21 | LESS-THAN OR EQUAL TO |
| 21D2 | | 14 | RIGHTWARDS DOUBLE ARROW |
| 2265 | ≥ | 13 | GREATER-THAN OR EQUAL TO |
| 2194 | | 11 | LEFT RIGHT ARROW |
| 221E | ∞ | 10 | INFINITY |
| 2705 | | 10 | WHITE HEAVY CHECK MARK |
| 2208 | ∈ | 8 | ELEMENT OF |
| 25CF | | 7 | BLACK CIRCLE |
| 2190 | | 6 | LEFTWARDS ARROW |
| 1F4B3 | | 6 | CREDIT CARD |
| 1F4B7 | | 6 | BANKNOTE WITH POUND SIGN |
| 03A3 | Σ | 5 | GREEK CAPITAL LETTER SIGMA |
| 270F | | 5 | PENCIL |
| 27FA | | 5 | LONG LEFT RIGHT DOUBLE ARROW |
| 00B0 | ° | 4 | DEGREE SIGN |
| 00B1 | ± | 4 | PLUS-MINUS SIGN |
| 2248 | | 4 | ALMOST EQUAL TO |
| 2728 | | 4 | SPARKLES |
| 2757 | | 4 | HEAVY EXCLAMATION MARK SYMBOL |
| 00E9 | é | 3 | LATIN SMALL LETTER E WITH ACUTE |
| 21A9 | | 3 | LEFTWARDS ARROW WITH HOOK |
| 222A | ∪ | 3 | UNION |
| 26A1 | | 3 | HIGH VOLTAGE SIGN |
| 2715 | | 3 | MULTIPLICATION X |
| 1F355 | | 3 | SLICE OF PIZZA |
| 1F381 | | 3 | WRAPPED PRESENT |

*(Plus 29 characters at 1-2 occurrences each: 2016, 2284, 23F3, 23F8, 24D8, 25B6, 2717, 1F44B, 1F4CB, 1F4E4, 1F510, 1F6AB, 00BB, 2032, 203A, 21B3, 226B, 2286, 2699, 27F7, 27F9, 2B07, 1F336, 1F4CD, 1F4DD, 1F4E6, 1F514, 1F528, 1F5D1. Captured and diffed mechanically; the tail is omitted for length, not skipped.)*

**Curly quotes at baseline: U+2018 = 0, U+2019 = 0, U+201C = 0, U+201D = 0. U+FFFD = 0.**

### Census AFTER — 69 distinct, 5,791 occurrences

**NEW characters: NONE. REMOVED: NONE. Curly quotes: 0, 0, 0, 0. U+FFFD: 0.**

| U+ | Char | Before -> After | Delta | Explanation |
|---|---|---|---|---|
| 2014 | — | 3107 -> 3119 | **+12** | em dashes in the new subsection and the changelog entry |
| 00A7 | § | 440 -> 444 | **+4** | the `§22` cross-references, and **the literal `§` quoted twice** in the download-to-disk rule as an example of a character that breaks in transit |
| 1F534 | (red circle) | 109 -> 112 | **+3** | the WHY blockquote, the changelog bullet, and the pointer added to the existing report-flow line |
| 00A3 | £ | 62 -> 64 | **+2** | **the literal `£` quoted twice**, same reason as `§` |
| 2192 | -> | 1131 -> 1133 | **+2** | `planning → coding` in the amended line, and `docs/…` flow prose |
| 26A0 | (warning) | 149 -> 150 | **+1** | the kept-report caution |
| FE0F | (var sel) | 147 -> 148 | **+1** | **matches the warning-sign delta exactly** |

The `§` and `£` increments are the ones worth checking twice, because this edit **quotes those characters as examples of characters that get corrupted**. Both survived intact — `+2` for `£` is exactly the two literal occurrences in the new text, and the `§` delta decomposes as 2 cross-references plus 2 literal examples. The FE0F/26A0 pair moved together by 1. The pre-existing 2-count asymmetry between them (149/147 before, 150/148 after) is unchanged.

### The gate did not fire

**No new character was introduced and nothing had to be removed.** Noted because it fired on three of the five previous passes (curly quotes, `✨`, a stopwatch emoji), and because this particular edit was the highest-risk one yet for it — the rule text deliberately contains `§`, `£` and `—` as literals.

### Already-garbled spans

**None found in the edited region or file-wide.** No U+FFFD, no mojibake sequences (`â€`, `Ã©`, BOM). Nothing flagged, nothing repaired.

---

## 🔴 EXTENDED AN EXISTING ENTRY — I did not add a free-standing one

**The rule was NOT already recorded**, in whole or in part, as a mechanism. I checked before writing:

| Search | Result |
|---|---|
| `docs/*-report.md` convention | **zero hits anywhere in the file** |
| "full report to" | **zero hits** |
| "two-line summary" | **zero hits** |
| garbled / attachment / non-ASCII / character census / curly quote / download-to-disk | **zero hits** |

**But one line was a partial record, and it is the line this belongs under.** §22 `## Two-chat pattern` closes with:

> *"Instructions flow planning → coding; audit reports flow coding → planning."*

That states the **direction** of the return leg and names **no mechanism**. So rather than adding a disconnected subsection, I did both halves of an extension:

1. **Amended that line in place** to point at the mechanism: `🔴 **A report flows back as a FILE, not as pasted chat text** — the mechanism is below.` The existing sentence stays; it now has somewhere to go.
2. **Added `### Every Cursor task ends with a written report (V11.2)`** immediately beneath the V6.7 fenced-code-block rule, inside `## Two-chat pattern`.

The new subsection opens by naming its relationship to what is already there — *"the V6.7 rule governs how a prompt travels out; this governs how the answer travels back"* — so the two read as one practice with two directions rather than two rules that happen to be adjacent.

### Where it sits, and why there

`# 22. Development process` -> `## Two-chat pattern` -> `### Every Cursor task ends with a written report (V11.2)` — **line 3702**, after the V6.7 `RULE` blockquote and before `## Audit before build`.

Placed after the V6.7 blockquote rather than before it because that blockquote tightens the *"ONE clean copy-paste block"* bullet directly above it; inserting between them would have separated a rule from the bullet it modifies.

### Conventions matched

| Convention | Followed |
|---|---|
| Heading depth | `###`, matching the sibling `### Working with the planning chat (Dominic's method, V6.6)` |
| Version marker in the heading | `(V11.2)`, matching `(Dominic's method, V6.6)` and `(V6.2, extended V6.3)` |
| Rule framing | opens with a `> **RULE (V11.2)**` blockquote, matching `> **RULE (V6.7) — …**` two lines above |
| Bullets | `- ` with a **bold lead phrase**, matching the surrounding subsection |
| Markers | `🔴` for the load-bearing WHY, `⚠️` for the secondary caution — the file's established two-tier scheme |
| Changelog | `## V11.2 — 5 August 2026` above V11.1, opening with a bold `Delta over V11.1 —` line then bullets, matching every prior entry |
| Version bump | all three sites — line 1, the `**Version 11.2**` title block, and the running footer (line 5654) |

---

## CONTENT NOTES

All five clauses from the brief are recorded. Three carry an added sentence of reasoning, in the file's style of saying *why* a rule survives contact with the next person who reads it:

- **On overwriting:** added that a report kept because *"it might be needed later"* is a second unmaintained copy of something that should have been promoted here — **the overwrite is what forces the promotion.** This is the file's own recurring lesson about duplication, applied to itself.
- **On naming:** added why a task name beats a date — a named report *"can be legitimately overwritten by the next pass at the same problem, which a date cannot."* The naming rule and the overwrite rule are the same rule seen twice.
- **On the two-line summary:** added that most tasks never need the file opened, *"which is the point of asking for both"* — otherwise the two outputs read as redundant.

I also connected the WHY clause to the census protocol already in daily use, since the brief's stated cause (characters break in transit) is exactly what a census detects: *"a silent substitution is indistinguishable from an edit until something counts the characters."*

---

## ⚠️ FLAGGED — WHAT I COULD NOT CORROBORATE

1. **That long pasted reports actually arrive garbled.** This is your operational observation, not something verifiable from the repo. Written as the rule's stated rationale — which is what it is — and not as a measured finding. I have no counter-evidence and every reason to believe it; I am flagging the provenance, not the claim.
2. **That `§`, `£`, `—` and emoji are the specific characters that break.** Same provenance. Recorded as the brief stated it. ⚠️ Worth noting the list is plausible but probably not exhaustive — this file contains 69 distinct non-ASCII characters, and nothing establishes that the other 65 survive transit. The census protocol catches any of them regardless of which ones are named, which is why I tied the rule to the census rather than to the four-character list.
3. **Nothing else.** The two-chat pattern, the V6.7 fenced-block rule and the report-flow line are all read directly from the file, and the absence of any prior record of this rule is grep-verified across four independent search terms.

---

## VERIFICATION

- **Census:** 69 distinct / 5,766 before; **69 distinct / 5,791 after.** No new characters, none removed, every delta explained above. Curly quotes 0 throughout, U+FFFD 0.
- **Structure:** new heading at `###` under `## Two-chat pattern` under `# 22. Development process` — verified by reading the surrounding depth, not assumed.
- **Version:** V11.2 at all three sites — line 1, `**Version 11.2**`, and the running footer.
- **File:** 5,644 -> 5,661 lines.
- **No code changed.** This task wrote `docs/reference-manual.md` and `docs/manual-update-report.md` and nothing else. `next dev` / `next build` not run.
