# Cost comparison — qualifying the hero panel's second row

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **THREE CODE LINES CHANGED**, all inside the hero panel's two rows. Everything else in the diff is
comment. The memo, the fee-mode toggle, both explanatory sentences and the small print are
**byte-identical as full spans** (§4).

---

# §1 — TASK 1: THE QUALIFIER

```
   Right now you pay      £2,520 a year          <- unchanged: a genuine ongoing rate
   With HatchGrab         £1,084 in year one     <- the fix
```

🔴 **THIS WAS AN HONESTY DEFECT, NOT A WORDING ONE.** `m.oursY1` is `oursMonth * (12 - free)` — **the
free months are inside it** — so it is lower than every year that follows. Labelled "a year" it read as
the **ongoing** rate, and an operator budgeting on that number would have been misled **by us**.

✅ **The qualifier is on the AMOUNT, not the label.** The label is untouched. "With HatchGrab, first
year" plus "£1,084 a year" would have said year twice, exactly as you flagged.

✅ **Row one keeps "a year", and the asymmetry is recorded at the site as deliberate** — 🔴 *"THE TWO
QUALIFIERS DIFFER ON PURPOSE; DO NOT HARMONISE THEM."* Their cost genuinely does not change after twelve
months. Ours does.

---

# §2 — TASK 2: NO THIRD ROW

Recorded in the file, at the row it would have been added to:

> ⚠️ **DO NOT ADD A YEAR-TWO ROW HERE — considered and rejected.** A third row dilutes the two-line
> contrast this panel exists to create, and the detail card's YEAR TWO block already carries that figure
> with its own saving directly beneath it. The panel's job is one comparison, not a schedule.

---

# §3 — TASK 3: THE BREAKPOINT

`text-base` → **`text-sm sm:text-base`** on both rows.

## 3.a 🔴 AS ASKED — BOTH SIZES AGAINST THE 283px BUDGET

⚠️ **"in year one" makes row TWO the widest in all three cases**, where row one was widest before. Your
prediction was right.

```
  text-sm   (<640px)                                    283px budget
     one truck      row1 217   row2 227   panel 267  ->  FITS, 16px spare
     three trucks   row1 225   row2 236   panel 276  ->  FITS,  7px spare
     negative       row1 204   row2 215   panel 255  ->  FITS, 28px spare

  text-base (>=640px)                                   283px budget
     one truck      row1 246   row2 258   panel 298  ->  over by 15px
     three trucks   row1 256   row2 268   panel 308  ->  over by 25px
     negative       row1 232   row2 244   panel 284  ->  over by  1px

  for comparison, BEFORE this change (both rows "a year", text-base at every width):
     one truck 286 (over 3)   three trucks 296 (over 13)   negative 272 (fits)
```

## 3.b 🔴 BUT THE SECOND BLOCK IS A HYPOTHETICAL, AND I AM NOT LETTING IT READ AS A RESULT

**283px is the budget at a 375px viewport. `text-base` no longer renders there.** Measuring it against
283px shows what *would* happen without the breakpoint — which is worth seeing, and is why I have given
it — **but it is not a state the page can reach.** At the width where `text-base` first applies:

```
  640px viewport  -40 page px-5 (max-w-2xl 672px, so w-full wins)  -4 card border-2  -48 card px-6
  = 548px available

     one truck      panel 298  vs 548  ->  FITS, 250px spare
     three trucks   panel 308  vs 548  ->  FITS, 240px spare
     negative       panel 284  vs 548  ->  FITS, 264px spare
```

✅ **SO THE PANEL NOW FITS AT EVERY WIDTH** — with 7–28px to spare below 640px and 240px+ above it. The
overflow my previous report estimated is closed, and Task 1 did not reopen it.

## 3.c 🔴 IT IS A CALCULATION, NOT A MEASUREMENT — SAME STANDARD AS LAST TIME

There is **no Geist font file on disk and no `fontTools` in this environment**, so not one advance width
here was measured. The model assumes 0.60em tabular digits, 0.52em lowercase, 0.65em uppercase, 0.26em
spaces.

🔴 **THE THREE-TRUCK CASE AT `text-sm` HAS 7px OF MARGIN AND MY MODEL'S ERROR IS EASILY ±12px.** That
one is inside the noise — it could still overflow. The one-truck (16px) and negative (28px) cases are
more comfortable but not proven. **Only a browser settles this.**

## 3.d THE MATCH WITH THE ANCHOR SENTENCE, NOTED AT THE SITE

⚠️ The rows and the anchor sentence were deliberately matched at `text-base`. **That match now holds only
above 640px**, and the file says so, so a future reader does not "restore" it:

> ⚠️ `text-sm sm:text-base`, NOT `text-base`. These rows and the anchor sentence were deliberately
> matched at `text-base` — THAT MATCH NOW HOLDS ONLY ABOVE 640px, by design: below it the rows drop a
> step so the panel stays inside a 375px card. The anchor sentence is unchanged and stays `text-base`
> throughout.

✅ **The anchor sentence itself was not touched** — verified byte-identical.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **3 code lines out, 3 in** |
| The memo | full span, `useMemo(` → deps array | ✅ **byte-identical** |
| Fee-mode toggle | full span | ✅ **byte-identical** |
| Both explanatory sentences | full JSX spans | ✅ **byte-identical** |
| Small print | full `<p>` span | ✅ **byte-identical** |
| Figure, verb, percentage line | forward windows | ✅ **identical** |
| Anchor sentence | 300-char forward window | ✅ **identical** |
| Plan panel, detail card | 700-char forward windows | ✅ **identical** |
| Fleet note | 260-char forward window | ✅ **identical** |
| No grid token, no width token | token scan of the panel | ✅ **NONE of either** |
| Row classes | class scan | ✅ **both `text-sm sm:text-base`** |
| Qualifiers | expression scan | ✅ **`theirsYear` "a year" / `oursY1` "in year one"** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |

## 4.a THE RENDERED ROWS

```
  ONE TRUCK                              THREE TRUCKS
     Right now you pay  £2,520 a year       Right now you pay  £25,200 a year
     With HatchGrab     £1,084 in year one  With HatchGrab     £10,140 in year one
                                                               across 3 trucks

  NEGATIVE (we are dearer)
     Right now you pay  £600 a year
     With HatchGrab     £948 in year one
```

✅ **The negative case reads correctly and unflatteringly** — £600 ongoing against £948 **in year one**,
which is if anything a sharper statement than before: it now says plainly that our *cheapest* year is
still the dearer one. Nothing about that claims a saving.

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The rows have never been seen at either size, and the breakpoint
   has never been crossed.
2. 🔴 **THE 7px MARGIN AT THREE TRUCKS (§3.c) IS INSIDE MY MODEL'S ERROR BAR.** If anything on this
   change is going to be wrong on screen, that is it. **One look at 375px with three trucks settles it.**
3. 🔴 **THE ROWS NOW CHANGE SIZE AT 640px AND NOTHING ELSE IN THE CARD DOES.** The figure, the verb, the
   percentage line and the anchor sentence are all fixed-size. **Whether the panel looks deliberately
   compact below the breakpoint or just smaller than everything around it is not something a class name
   can tell me.**
4. ⚠️ **"in year one" is longer than "a year" and now sits under a shorter qualifier.** The two rows
   were already unaligned on the right by design; **this widens that gap and it has not been seen.**
5. ⚠️ **The panel is quieter below 640px than the anchor sentence it was matched to** (§3.d). Intended,
   unobserved.
6. ⚠️ **Carried forward:** the segmented toggle's lopsided wrap at 375px, the plan panel never rendered,
   the `mt-8` two-year separator, the zero-state £0 at 92px, the stale `YearLine` comment, and the gate,
   which has still never fired.
