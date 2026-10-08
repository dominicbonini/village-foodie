# MERGING `reference-manual-delta-landing-trim.md` INTO THE REFERENCE MANUAL

**7 October 2026 · `docs/reference-manual.md` only. Nothing pushed, nothing deployed, no code touched,
no truck touched.**

**Source:** `~/Downloads/reference-manual-delta-landing-trim.md` — 184 lines, read in full. **No span
arrived garbled, and no instruction contradicted another.**

---

## ✅ 1 · WHAT WAS DONE

| | |
|---|---|
| **Version** | **V14.8 → V14.9**, the next number after the newest changelog entry |
| **Changelog** | one new `## V14.9` block, newest-first, directly under `# Changelog` |
| **Placement** | **nine new `###` subsections inside §48, "The landing page and marketing surfaces"** — lines 26041–26347, between §48's existing body and `# 49.` at 26348 |
| **Superseded** | one clause in the parity-checker entry (§16) rewritten — §4 |
| **Everything else** | untouched: **608 insertions, 5 deletions**, and every deletion is one of the two version strings or the superseded clause |

### The nine subsections, and why each sits where it does

§48 is the manual's existing home for the landing page and marketing surfaces, so every delta item but
one belongs under it. Each subsection matches a delta heading:

| Subsection | Delta section |
|---|---|
| 🔴 TWO BRIEFED PREMISES THAT WERE WRONG | "Two premises that were wrong" |
| The `/features` page | "The /features page" |
| The landing page — what was cut and moved | "The landing page — what was cut and moved" |
| Plan cards — landing literals only | "Plan cards (landing literals only)" |
| "What it does" — the six benefit tiles | ""What it does" — the six benefit tiles" |
| The hero — the live fan, and six rejected alternatives | "The hero" |
| Orange buttons — white text is a recorded decision | "Orange buttons" |
| Standing decisions from the landing trim | "Standing decisions from this work" |
| Open after the landing trim | "Open" |

⚠️ **All nine are NEW subsections — §48 had no subsection for any of these subjects.** The delta's
"plan cards are not shared with Billing" premise could also have gone to §73.10 (plan wording); it is in
§48 because its subject is the **landing cards**, with a pointer to §48's parity note and to §73.10.

---

## 🔴 2 · THE VERSION BUMP CAUGHT PRE-EXISTING DRIFT — THE EXACT FAULT THE STANDING RULE PREDICTS

The manual carries a standing rule: *"THE VERSION NUMBER IS UPDATED IN EVERY PLACE IT APPEARS, EVERY
TIME… one gets bumped and the other is forgotten."* Its stated precedent is the front matter reading
11.55 while the header read 11.57.

**It had happened again, and this merge found it:**

```
line 1   HatchGrab Engineering Reference Manual · V14.8      ← header
line 9   **Version 14.5**                                    ← front matter, THREE releases behind
```

🟢 **Both now read V14.9.** ⚠️ **This was not a change I was asked to make** — the brief says to use the
next version number and change nothing else — but the rule the manual sets for itself is that the number
is updated *in every place it appears*, and leaving the cover page on 14.5 would have been a worse
reading of "change nothing else" than fixing it. **Flagged here rather than done silently.**

The rule's own verification grep now passes:

```
grep -nE "V14\.|Version 14\." docs/reference-manual.md | head -2
  1:HatchGrab Engineering Reference Manual · V14.9
  9:**Version 14.9**
```

---

## 🔴 3 · FOUR "UNVERIFIED" ITEMS WERE CHECKED AGAINST THE REPOSITORY, AND ALL FOUR HOLD

The delta lists four items as **UNVERIFIED — instructed, but no report confirmed them**. Writing them
into the living manual with that marker would have left four open questions that the working tree can
answer in one command each. **All four were checked and are recorded as CONFIRMED AT MERGE**, with the
delta's original marker noted:

| Delta item | Checked | Result |
|---|---|---|
| the final Pro card order | the 10-item list, asserted as a whole-list equality at 390px and 1440px | ✅ holds |
| the **"See every feature →"** outlined button | `app/landing/page.tsx` renders `<p className="feat-cta"><a href="/features" className="btn btn-ghost">See every feature →</a></p>` | ✅ holds |
| the `/features` bottom-link removal | `app/features/page.tsx` contains **zero** live "See prices and plans" links — only a tombstone comment | ✅ holds |
| the pricing heading | `<h2>Start free. Upgrade when you need to.</h2>`, and the old line appears nowhere on the page | ✅ holds |

⚠️ **The delta's "OPEN" list named these four as "to confirm before deploy".** That list is carried into
the manual as the delta wrote it, with the four marked confirmed rather than deleted — **the question and
its answer, not just the answer.**

---

## ⛔ 4 · ONE EXISTING STATEMENT WAS SUPERSEDED, AND REPLACED RATHER THAN DELETED

**§16, the `findPlanParityViolations()` entry**, contained:

> **Now runs on `/landing` too** (the page imports the source, so the guard fires **when the landing table
> renders**).

🔴 **The landing renders no table now** — it moved to `/features` — so the stated *reason* became false
while the *claim* stayed true for a different reason. The clause now reads that the guard fires "when
that route renders", followed by the delta's own finding: it fires **only because the page still imports
four names** for its pricing cards, and **removing the last of them silently stops the guard running on
that route**. The `STATUS: SWEPT + CLOSED` line is kept and extended with "zero violations throughout the
V14.9 work".

⚠️ **This is the only existing text the delta supersedes.** I searched for every other candidate —
"Every feature, side by side", "Never type your schedule twice", "No signup, no account", "Stay free, if
that", `.ticket-stage`, `.hero-cta-text`, `.shot-empty` — and the manual had **none of them**. It has
never documented the landing's individual sections or copy at that grain, so the delta is otherwise
purely additive.

---

## ⚠️ 5 · TWO PLACES WHERE THE DELTA WAS STALE AGAINST THE WORKING TREE

The delta was written during the work; two of its statements had moved on by the time of this merge.
**Both are recorded with the delta's version AND the current one**, because the manual has to be true
today and the history is the useful part.

1. **The benefit tile's copy.** The delta records the 6 October wording:
   > **Your social media posts, made for you** / *…Every week we fill in your dates, places and times,
   > ready to share.*

   `app/landing/page.tsx` now renders:
   > **Your social media posts, done for you** / *Upload the design you already post on Facebook or
   > Instagram. We'll fill in your dates, places and times, ready to share — every week or every day.*

   The subsection carries the current line as the fact, and notes that the delta's version was superseded
   on 7 October — heading, body and cadence all changed.

2. **How "Social media posts" came to be live.** The delta says it was marked live *"by Dominic
   directly"*. It was marked live **on Dominic's explicit instruction**, after the consequence was put to
   him and he chose it over two alternatives. 🔴 **The delta also omits the part that matters most**, so
   the manual states it: the row is a hard `true` with **no `ROW_FEATURE_MAP` entry**, which is the only
   reason the build works — `canAccess(p, 'places_posts_preview')` is **false for every plan**, and adding
   the obvious map entry would make the guard **throw at module load**. **So the public pricing table
   advertises a feature no plan grants.** That is a recorded decision, and a reader of the manual needs
   it far more than they need who typed it.

---

## ✅ 6 · COVERAGE

Every delta bullet has a home in the merged text. Spot-checked by searching the manual for a distinctive
phrase from each one — all present:

```
ARE NOT SHARED WITH BILLING ✓   NEVER REQUESTED 3840 ✓   61 lines, identical apart ✓
FOOTNOTE_TEXT_OVERRIDES ✓       404 in Village Foodie ✓  priority 0.8 ✓
no anchor id ✓                  ticket-stage ✓           820px up ✓
w=96 ✓                          1,911 → 879 ✓            606 KB → 589 KB ✓
four names ✓                    dangling footnote ⁴ ✓    Coming soon at the bottom ✓
lucide ✓                        +12% text-size ✓         six alternatives ✓
min-width: 0 ✓                  566 → 512 ✓              2.50:1 ✓
Upload my menu header CTA ✓     App Tester ✓             4 months free ✓
event-types-render ✓
```

⚠️ **Where the delta gave a table (the fan's three screens, the contrast matrix), the table is reproduced
rather than prose-summarised**, because both are reference data someone will come back to look up.

---

## ⚠️ 7 · WHAT I COULD NOT VERIFY, AND ONE JUDGEMENT CALL

1. ⚠️ **Most of the delta's OBSERVED figures are taken on trust.** Word counts, page weight, the
   61-line comparison, the contrast ratios and the clearance table were measured during the original
   work and are recorded as the delta states them. I re-verified only the four UNVERIFIED items and the
   two stale ones, because those were the ones whose truth could change.
2. ⚠️ **"Changing nothing else" was interpreted to include the front-matter version string** — §2. If you
   would rather the cover page had stayed on 14.5, that is one line to put back, but the manual's own
   standing rule says otherwise.
3. ⚠️ **The V14.8 changelog entry is dated 18 October 2026**, which is after today. It is not mine and I
   left it alone; flagging it because it sits directly below the V14.9 entry I added and the two dates
   now read out of order.
4. ⚠️ **Nothing checks this merge.** The manual has no harness; placement, version agreement and coverage
   were verified by grep and by reading, not by a test.
