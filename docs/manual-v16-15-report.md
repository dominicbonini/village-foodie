# manual-v16-15: the reference manual at V16.15

*9 November 2026. Nothing deployed, no database write, no migration. No .env file was opened, read, listed, parsed or tested.*

## Summary

- `docs/reference-manual.md` is at **V16.15**: the header, the front matter and a dated changelog entry (9 November 2026).
- **New §88** records compare-ux-1 and its 9 November follow-up (jp-nav-1) in seven parts:
  - the page layout;
  - the six-value table;
  - the shared sticky table header;
  - the admin banner;
  - the footer's Compare link;
  - the narrow-phone language fixes (Czech, Greek, Japanese);
  - the Google Play badge check.
- **Four invariants**, 35.aq-13 to 35.aq-16: the six-value set, detail never visually hidden, one shared sticky table header, no "In short" section.
- **Five older statements that compare-ux-1 overturned** are marked corrected in the manual's own style.
- **Commit:** `e7bd7361` on main, by explicit path. This report is committed separately.

## 0 · Pre-check and flags

- **Pre-check passed:** compare-ux-1 and the follow-up (the Japanese nav fix and "Doesn't apply") were committed on main (`488073ee`, `ab7cb920`, `4ab4d956`, `49aa0a6e`), the tree was clean, and no other Claude session was running (`ListAgents`).
- **No span of the brief arrived garbled.**
- **No instructions contradicted each other**, so I did not stop. Three points needed a reading:
  1. **"The shared sticky-header / sticky-first-column scrolling table used by /features and comparison pages" is not quite what the code does, so I recorded the code.**
     - /features and the comparison pages share **one sticky-header mechanism**, `components/StickyTableHead.tsx`.
     - **/features' plan table does not scroll sideways**, and has no sticky first column and no swipe hint. Those are the comparison page's own CSS.
     - §88.3 says this with a ⚠️ line. Invariant 35.aq-15 is worded as "one shared sticky table header", which is true, rather than "one shared scrolling table", which is not.
     - The compare-ux-1 report flagged the same mismatch when the brief asked for "same behaviour as /features".
  2. **The reason "In short" was removed** ("it broke the never-card-readers/tills rule") is recorded as your stated reason, dated 9 Nov, with the sentence that broke it quoted: "Card readers and tills cover payment at the truck and complement an ordering system."
     - Strictly, 35.aq-4 governs "Which suits your food truck?", and the "In short" sentence named card readers and tills as complements, not as a competitor's strength.
     - So §88.1 points to 35.aq-4 rather than claiming a rule that covered "In short" by name. 35.aq-16 now forbids the section outright.
  3. **"Change nothing else" against "in the existing style".** I read "change nothing else" as leaving unrelated content alone. The manual's style for a fact a later change overturns is to strike it and add "⛔ Corrected Vx" with a pointer. Recording compare-ux-1 without that would leave the manual contradicting itself in five places. So those five lines are marked (§3), and nothing else outside the new material changed. If you would rather they stayed untouched, the marks are self-contained and easy to revert.
- **The invariant numbers.** The brief says "section 35 (next free numbers)". I continued 35.aq (35.aq-13 to 35.aq-16) and added "; COMPARISON PAGES READABLE ON ANY DEVICE (V16.15)" to its heading. That is the precedent of 35.ao, which V16.11 extended the same way. A new block, 35.ar, would also have fitted the manual's pattern; it is a one-line rename if you prefer it.
- **Deployment, OBSERVED (9 Nov 12:59 UTC, read-only GETs of public pages):**
  - **compare-ux-1 is live:** the UK comparison page has the legend and no "In short"; `/uk`'s footer has the Compare link and no column.
  - **jp-nav-1 is committed but not pushed:** main was 2 commits ahead of origin before this brief, and `/jp/features` has no break character yet.
  - The manual says both.

## 1 · What was added

| Where | What |
|---|---|
| Header, front matter | V16.14 → **V16.15** (both strings; grep checked) |
| **Changelog V16.15** (9 November 2026) | Seven bullets: layout; table; phones; admin banner; footer; narrow phones and badges; what is live. Each with its § and invariant pointers |
| **§88.1** Comparison page layout | "Which suits your food truck?" as the short answer directly under the title and checked-date line. "In short" removed everywhere: the page, Markdown, word list, all messages and back-translations; the JSON and meta never had it. The reason as stated. The breadcrumb no longer sticks over the header (why: landing.css's rule for every `<nav>`) |
| **§88.2** The table | The six values, with colours, accessibility and price amounts; "Doesn't apply" only where the feature doesn't exist for that kind of service, with the kind in the note. The ⓘ as a native `<details>` in the server HTML. The legend text. No public badges or category line. The twins keep full detail |
| **§88.3** Phones | `StickyTableHead.tsx`: measuring, `pin`, `data-overflows`. The ⚠️ that /features shares the header only. The comparison page's CSS below and from 900px. What was measured, including the phone bug that could not be reproduced |
| **§88.4** Admin banner | The one line that reflects auto-publish. "Details". The manual checklist items removed |
| **§88.5** Footer | One "Compare" link in the row after FAQ: live in the server HTML, admin through AdminOnly, off nothing. The `{null}` slot that keeps React's ids. The phone rules: four to a row, nine items 4 / 4 / 1, measured in 29 languages. The 15 pages it changed |
| **§88.6** Narrow-phone language fixes | The base (non-English wrap; ja/zh keep-all). Czech and Greek (cwv-1's ≤400px block). Japanese (jp-nav-1's break character: why it is in the words, not the CSS, what was measured, and the guard harnesses). 🔴 The open "ログイン" overlap, with its proposed fix, waiting for your decision |
| **§88.7** Google Play badges | 27 SVGs and zh-HK's PNG byte-identical to Google's. The English SVG differs by one trailing newline. Nothing changed |
| **35.aq-13** | One of six values per cell, the same set in every language. "Doesn't apply" and "—" never swapped. The legend explains all six |
| **35.aq-14** | A cell's detail is in the server HTML inside a native ⓘ: never visually hidden, never fetched on demand. The twins keep full detail |
| **35.aq-15** | `StickyTableHead.tsx` is the only code that measures or pins a table header. No second mechanism |
| **35.aq-16** | No "In short" anywhere; "Which suits" is the short answer and follows 35.aq-4 |

## 2 · Sources

- `docs/compare-ux-1-report.md`, including its §12 (jp-nav-1) and §13 ("Doesn't apply").
- The code at `49aa0a6e`, for file and class names.
- The live check above.

## 3 · The five statements marked corrected

| Section | Was | Now marked |
|---|---|---|
| §86.3 "Built for AI and search" | An answer-first "Kurz gesagt" | ~~struck~~, ⛔ Corrected V16.15: removed everywhere (§88.1, 35.aq-16) |
| §86.3 "Code" | The `LandingFooter` "Vergleich" column | ~~struck~~, ⛔ Corrected V16.15: one "Compare" link in the row, same live/admin rule (§88.5) |
| §86.3 "Go-live checklist" | At least 2 verified competitors; the Impressum decision recorded | each ~~struck~~, ⛔ Removed V16.15 (§88.4). The other two items are untouched |
| §86.9 (the big POS players) | "Comparison pages show a group label under each tool" | ⛔ V16.15: admin view only; the twins keep it (§88.2) |
| §87.3 | "Which suits": below the table, above the methodology | ~~struck~~, ⛔ Corrected V16.15: directly under the title (§88.1) |

- **Left alone:** the "Added V16.7" backlog line "the Impressum decision" for the Germany go-live (`lib/comparison-decisions.ts`). That is a legal decision that may still be needed, not the banner item.

## 4 · Checks

- **The diff removes exactly 9 lines:** the 2 version strings, the 35.aq heading (re-added with "(V16.15)"), and the 6 overturned lines (re-added struck, with their corrections). Everything else is additions: 150 lines in all.
- `grep -nE "V16\.1[45]|Version 16\.1[45]"` shows the header, the front matter and the changelog all at V16.15.
- No code, message, migration or harness changed in this brief, so no sweep was needed. The last full sweep, on the code this manual describes (`49aa0a6e`), was 205 harnesses with 204 passing. The one failure is `event-types-render`, which was failing before these briefs.

## 5 · Commits

- `e7bd7361` manual-v16-15: the reference manual at V16.15 for compare-ux-1 and jp-nav-1 (`docs/reference-manual.md`).
- The commit adding this report (`docs/manual-v16-15-report.md`), with one pointer in §88.2 made exact (§86 → §86.9).

Both are on main, by explicit paths. Nothing is pushed or deployed.
