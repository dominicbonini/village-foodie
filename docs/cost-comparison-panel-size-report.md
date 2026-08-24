# Cost comparison — panel text size and question 5's wording

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **THREE CODE LINES CHANGED IN ONE FILE** — two `text-sm` → `text-base` on the hero panel's rows, and
question 5's title. Everything else in the diff is comment.

---

# §1 — TASK 1: THE SIZE, AND WHERE IT CAME FROM

🔴 **THE ANCHOR SENTENCE USES `text-base`.** Its full class list, in the same card:

```
  <p className="mx-auto mt-5 max-w-xs border-t pt-5 text-base text-slate-500">
    That&apos;s {anch}.
```

✅ **I READ THAT FIRST AND TOOK ITS CLASS — I did not pick "one step up from `text-sm`" and then notice
it agreed.** The two are now deliberately the same size, and the comment in the file says so, so that if
one moves the other has to.

```
  before:  flex items-baseline gap-3 whitespace-nowrap text-sm
  after:   flex items-baseline gap-3 whitespace-nowrap text-base
```

✅ **KEPT, ALL OF IT:** the `#F8FAFC` fill, `rounded-xl`, `px-5 py-4`, "a year" on **both** rows, our
amount `font-semibold text-slate-700`, the fleet note inside the panel, and the two-flex-row structure.

🔴 **NO GRID TOKEN AND NO WIDTH TOKEN ENTERED THE BLOCK.** Same scan as last time, re-run:

```
  grid tokens : NONE
  width tokens: NONE          (w- / max-w- / min-w- / inline-block)
```

## 1.a THE FLEET NOTE STAYED AT `text-xs` — A DECISION, NOT AN OVERSIGHT

It is not a third row; it is the **scope** of the two above it. Raising it too would have made three
sizes read as three facts, and widening the gap is what keeps that relationship legible.

---

# §2 — 🔴 THE WIDTH, AND IT IS THE PROBLEM YOU ANTICIPATED

## 2.a THE BUDGET, MEASURED FROM THE ACTUAL CONTAINER CHAIN

```
  375px  viewport
   -40   page root  px-5
   -4    results card  border-2
   -48   card inner  px-6
  =283   available to the panel
   -40   panel  px-5
  =243   content budget for the widest row
```

## 2.b THE ROWS AT `text-base`

```
  ONE TRUCK    (£2,520 / £1,084)
     Right now you pay  £2,520 a year   ≈ 246px      panel ≈ 286px  vs 283px  -> OVER by ~3px
     With HatchGrab     £1,084 a year   ≈ 224px

  THREE TRUCKS (£25,200 / £10,140)
     Right now you pay  £25,200 a year  ≈ 256px      panel ≈ 296px  vs 283px  -> OVER by ~13px
     With HatchGrab     £10,140 a year  ≈ 234px

  for comparison, at the old text-sm:  panel ≈ 257px (one truck) / 265px (three)  -> 18–26px SPARE
```

🔴 **SO: AT 375px IT NO LONGER FITS — AND THAT IS THE TRADE YOU NAMED.** `whitespace-nowrap` means the
panel **overflows its card rather than wrapping**, so the visible symptom would be the panel's right edge
running under or past the card's padding, not the five-line collapse of the earlier attempts.

## 2.c 🔴 HOW MUCH TO TRUST THOSE NUMBERS: LESS THAN THEY LOOK

**This is arithmetic on assumed glyph advances, NOT a measurement.** There is no Geist font file on disk
and no `fontTools` in this environment, so I could not measure a single real advance width. The model
assumes 0.60em tabular digits, 0.52em lowercase, 0.65em uppercase, 0.26em spaces at 16px.

🔴 **A 5% ERROR IN THAT MODEL IS ±12px ON A 250px STRING — FOUR TIMES THE ONE-TRUCK MARGIN.** So:
- **one truck: genuinely too close to call.** It could fit.
- **three trucks: overflows on any plausible version of the model.** 13px is inside the error bar too,
  but the sign is consistent across it.

✅ **I DID NOT PRE-COMPENSATE.** No padding was trimmed, no size split between viewports, no `sm:`
breakpoint added. You asked me to report the width, not to defend against it, and the levers are simple
if it does turn out wrong on screen: **panel `px-5`→`px-4` buys 8px, card `px-6`→`px-5` buys another 8px,
and `text-sm sm:text-base` buys all of it back below 640px.** All three are outside this brief.

---

# §3 — TASK 2: QUESTION 5

**Was:** `"How many months free do you get?"`
**Now:** `"Your introductory offer — how many months free?"` — **your wording, used verbatim.**

✅ **I did not deviate**, so there is nothing to justify. Two observations you should have anyway:

⚠️ **It is the longest of the five titles and the only one with two clauses.** But the set was never
uniform — **card 3 is `"Online orders per month, per truck"`, not a question at all** — so this breaks a
pattern that three of five titles follow, not all five.

⚠️ **Rewording it to match cards 1, 2 and 4 would have cost the offer framing**, which is the point of
the change. That is why I took the wording as given rather than reaching for the "closest fit" licence.

✅ **The input, its behaviour and the line beside it are untouched** — the diff is one line.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **3 code lines out, 3 in** |
| Size matched, not guessed | read the anchor sentence's class first | ✅ **both are `text-base`** |
| No grid token in the panel | token scan | ✅ **NONE** |
| No width token in the panel | token scan | ✅ **NONE** |
| Cards 1, 2, 3, 4 | 700-char forward window each | ✅ **identical** |
| Plan panel (question 2) | 700-char forward window | ✅ **identical** |
| Figure / verb / percentage line | forward windows | ✅ **identical** |
| Anchor sentence | 300-char forward window | ✅ **identical** — the class was read, not edited |
| Detail card, `YearLine` | forward windows | ✅ **identical** |
| Width at 375px | container chain + glyph model | 🔴 **§2 — estimated to OVERFLOW** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **THE 375px OVERFLOW IS THE HEADLINE UNKNOWN AND IT IS A CALCULATION, NOT AN OBSERVATION.** §2.c
   says how far I trust it. **One look at a 375px viewport settles what my glyph model cannot**, and it
   is the only check that matters on this change.
2. 🔴 **THE POINT OF THE CHANGE IS UNTESTED.** The rows were raised so they stop reading as too quiet
   against the figure. **Whether `text-base` is now loud enough — or has crossed over into competing with
   the figure, which would cost the hero its single subject — cannot be told from a class name.**
3. ⚠️ **The fleet note is now two steps below the rows** (`text-xs` under `text-base`) where it was one.
   **Intended (§1.a), unseen.**
4. ⚠️ **Question 5's title has not been seen in the card.** It is the longest of the five and card titles
   wrap; **whether it takes two lines at 375px, and whether that unbalances the row of cards, is
   unmeasured.**
5. ⚠️ **Carried forward:** the plan panel from the previous brief has still never been rendered either,
   the `mt-8` two-year separator, the zero-state £0 at 92px, the stale `YearLine` comment quoting question
   2's old wording, and the gate, which has still never fired.
