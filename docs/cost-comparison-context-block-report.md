# Cost comparison — hero context block and the two-year line

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me — you ran it mid-task and
that is how the wrapping defect in §3 was caught.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`.** The figure, the verb, the percentage
line, the anchor sentence, the CTAs, the five question cards and the `YearLine` rows are all untouched —
proven in §5, not asserted.

---

# §1 — TASK 1: THE PANEL

```
   ┌──────────────────────────────────────────────┐   #F8FAFC, rounded-xl, px-5 py-4
   │   Right now you pay        £25,200 a year    │   slate-500
   │   With HatchGrab           £10,140           │   slate-700, SEMIBOLD
   │                            across 3 trucks   │   slate-400, text-xs
   └──────────────────────────────────────────────┘
```

## 1.a 🔴 THE AMOUNTS SHARE A COLUMN — AND MY FIRST ATTEMPT ONLY *LOOKED* LIKE IT DID

The first build put the amounts in one right-aligned column as `{gbp(m.theirsYear)} a year`. Exercising
it showed the flaw immediately:

```
   Right now you pay      £2,520 a year        <- ends at the shared edge
   With HatchGrab                £1,084        <- ends at the shared edge
```

🔴 **The two spans shared a line END. The two NUMBERS did not line up at all** — `£2,520` sat seven
characters left of `£1,084`, so they could not be read down a column, **which is the one thing the panel
exists to do.**

**The fix is a third grid column.** The numerals occupy the middle column and share its right edge;
`a year` hangs off to the right of the first row only, in `slate-400` so it reads as a qualifier:

```
   Right now you pay      £2,520 a year
   With HatchGrab         £1,084
```

⚠️ **`a year` was NOT deleted to buy the alignment.** Without it these figures can be read as monthly,
and that misreading flatters us. The comment at the site says so.

## 1.b THE GAP IS STATED, NOT LEFTOVER

The old block was `max-w-xs` (a fixed 20rem) with `justify-between`, which pushed each label and its
amount to opposite ends of **a width that had nothing to do with the text** — that is what made the pair
read as two sentences. The gap is now `pr-6` on the label, a stated 24px.

⚠️ **`pr-6`/`pl-1.5`, NOT `gap-x-6`** — a single gap value would have put the same 24px between the
number and its own qualifier.

Rows are `gap-y-0.5` (2px) against the old `mt-1` (4px), with `leading-snug`. **Closer, as asked** — and
the panel's own fill is what now binds them, so they no longer need separation to read as a pair.

---

# §2 — THE THREE JUDGEMENT CALLS

## 2.a THE RULE ABOVE THE VERB — **REMOVED**

The `mt-4 border-t #F1F5F9` hairline is gone. **The panel's own edge does that job**, and a fill plus a
rule 16px below it would have been two separators doing one job.

⚠️ **The verb's `mt-5` was left EXACTLY as it was.** Removing the rule removes ~20px of space above the
verb; I did **not** enlarge `mt-5` to put it back. **That would be compensating for something I have not
seen**, which you told me not to do.

## 2.b THE WEIGHT ON THE SECOND AMOUNT — **`font-semibold text-slate-700`**

Darker and semibold. 🔴 **NOT orange** — orange belongs to the figure below, and a second orange number
in the hero gives the card two subjects and kills the contrast it runs on. `slate-700` is `SLATE`, a
colour already in this file's palette.

🔴 **THE WEIGHT IS UNCONDITIONAL, AND THAT IS A DECISION.** It marks **our** row, not the **winning**
row — so in the negative case the emphasis still sits on our number, which is then the dearer one. **I
did not make it flip with the result.** A weight that changed sides depending on who won would be
presenting the same comparison two different ways on a page built to be shown to people shopping around.
⚠️ **If you would rather it flipped, that is a one-line change and a commercial decision, not a fix.**

## 2.c THE SEPARATOR ABOVE THE TWO-YEAR LINE — **SPACE (`mt-8`), NOT A RULE**

🔴 **The reason is the rule itself.** An identical `#F1F5F9` hairline already separates Year one from
Year two inside that card. **A second one would enrol the summary as a third peer row — the precise
misreading Task 2 exists to fix.** `mt-8` (32px) steps up from the 20px rhythm the year blocks use.

⚠️ **HONEST LIMIT: the ruled gap between the year blocks totals ~41px (20 + 1 + 20).** Whether 32px of
plain space out-separates it is exactly what a browser settles. **I picked one value and stopped rather
than inflating it to pre-compensate.**

---

# §3 — 🔴 THE WRAPPING DEFECT YOU CAUGHT, AND WHAT ACTUALLY CAUSED IT

You reported the panel rendering across **five lines instead of two**.

**The cause was `inline-block`, and it is a sizing bug, not a spacing one.** `inline-block` is
**shrink-to-fit**: the panel took the width its grid could be *squeezed* to — near min-content, since
every `auto` column may wrap — rather than the width its content *wanted*. Each cell then broke onto its
own line.

**Fixed by measuring it the right way, not by padding it out:**
- `mx-auto w-max` — `width: max-content`, so the panel is sized by the row that genuinely needs the most
  space, and centred as a block rather than relying on the parent's `text-center`;
- `whitespace-nowrap` on the grid — no label or amount breaks mid-phrase inside it.

🔴 **A FIXED WIDTH, A `min-w-`, OR MORE PADDING WOULD EACH HAVE MASKED THIS WITHOUT FIXING IT.** The box
was never too narrow by some amount; it was being measured the wrong way. The comment at the site says
that, so the next person does not "tidy" `w-max` back to `inline-block`.

⚠️ **This is the one thing on this page that has now actually been seen — by you, not by me** — and it
is the second time a class that typechecks and reads correctly turned out to render wrongly.

---

# §4 — TASK 2: THE TWO-YEAR LINE

**Was:** `mt-5 text-sm text-slate-500`, left-aligned.
**Now:** `mt-8 text-center text-base text-slate-600`. Amount unchanged — `<strong>`, `tabular-nums`,
`ORANGE`.

✅ **NOT UNDERLINED, AND NOT A LINK.** Everything else in that region is a link or a button, so an
underline would be read as clickable and the click would go nowhere. The orange is emphasis, not
affordance. The comment records this as a prohibition.

✅ **One size up for the whole line, not a mixed-size sentence.** A centred line with the amount set
larger than its own words reads as a pull-quote, which is a different thing from a summary.

⚠️ **A STALE COMMENT WAS OVERRIDDEN, NOT LEFT TO ROT.** That line carried `⚠️ Left, not centred, so the
whole detail card shares one edge with the year blocks.` **Your instruction contradicts it directly** —
and sharing the year rows' left edge is precisely what made it read as a third row. The comment now
records the override, dated, with the reason, rather than silently disagreeing with the code above it.

✅ **The `isRealSaving(m.twoYear)` gate is untouched** — a two-year total that prints as £0 is still
never announced.

---

# §5 — VERIFICATION

## 5.a THE FOUR HERO STATES

```
══ TYPICAL POSITIVE ══                  ══ LARGE FLEET ══
   Right now you pay   £2,520 a year       Right now you pay   £25,200 a year
   With HatchGrab      £1,084              With HatchGrab      £10,140
                                                               across 3 trucks
   verb     : "You save"                   verb     : "You save"
   figure   : £1,436  ORANGE               figure   : £15,060 ORANGE
   two-year : rendered, centred            two-year : rendered, centred

══ EXACT ZERO ══                        ══ NEGATIVE ══
   Right now you pay   £1,200 a year       Right now you pay   £600 a year
   With HatchGrab      £1,200              With HatchGrab      £948
   verb     : "About the same"             verb     : "You'd pay extra"
   figure   : £0      SLATE                figure   : £348    SLATE
   two-year : NOT RENDERED                 two-year : NOT RENDERED
```

✅ **THE ZERO CASE READS SENSIBLY: two identical amounts under two different labels.** That is a
statement of fact and it is the correct thing to show — "you pay £1,200 either way" is exactly what the
arithmetic says, and no claim is attached to it.

✅ **THE NEGATIVE CASE READS SENSIBLY AND UNFLATTERINGLY, WHICH IS RIGHT.** `£600 → £948`, ascending, so
the panel shows plainly that we are the dearer option, with the verb "You'd pay extra" below it and no
anchor sentence. ⚠️ **The semibold sits on £948 — see 2.b.** Nothing here claims a saving.

✅ **The two-year line renders in exactly the two states where there is a real two-year saving**, and is
absent in both non-saving states.

## 5.b CHECKS

| Check | Method | Result |
|---|---|---|
| Change confined to the two regions | comment-stripped diff | ✅ **11 code lines out, 10 in** |
| Figure / verb / percentage line | byte-compare of each span | ✅ **identical** |
| Anchor sentence | 400-char window around `anchor(m.saveY1)` | ✅ **identical** |
| `YearLine` component | 400-char window around its declaration | ✅ **identical** |
| Question cards, CTAs, months-free input | token counts before/after | ✅ **all unchanged** |
| Amounts genuinely share a column | 3-col grid, numerals in the middle column | ✅ **§1.a** |
| Four states | real `gbp`/`isRealSaving`/`rendersAsZero`, types stripped by `tsc` | ✅ **§5.a** |
| No interpolated Tailwind classes added | scan for `` className={` `` | ✅ **3, all pre-existing CTA constants** |
| Calculator outside `.hg-landing` | `page.tsx` — chrome only | ✅ **`* { margin: 0 }` cannot reach `mt-8`** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **THE PANEL HAS NOT BEEN SEEN SINCE THE FIX.** You saw the broken five-line version. `w-max` +
   `whitespace-nowrap` is the diagnosis acted on — **it has not been confirmed on screen, and confirming
   it is one reload.**
2. 🔴 **THE `mt-8` SEPARATOR IS THE WEAKEST CALL ON THE PAGE** (2.c). 32px of space against a ~41px
   ruled gap. **If the two-year line still reads as attached to Year two, that is the number to change,
   and it needs one look to tell.**
3. ⚠️ **The verb now sits 20px closer to the panel** than it did to the old hairline, because the rule
   went and `mt-5` deliberately did not grow. **If the verb now crowds the panel, that is where to look**
   — and it is a consequence I chose rather than pre-corrected.
4. ⚠️ **`w-max` at 375px is untested.** The widest row is roughly 200px of text inside `px-5`, within a
   card at `px-6`, so it should fit a 375px viewport with room — **but `whitespace-nowrap` means that if
   it ever does not fit, it will OVERFLOW rather than wrap.** That is the trade the fix makes.
5. ⚠️ **The fleet note now right-aligns to the panel's content edge**, which sits past the numerals
   because of the `a year` column — so it lines up with `a year`, not with the amounts. **Still clearly
   inside the panel and attached to those figures, but it is not the edge it aligned to this morning.**
6. ⚠️ **The `#F8FAFC` fill was chosen over cream** because the cream trust footer is at the bottom of
   this same card, and cream at the top would bracket the figure in two matching tones. **Unseen — if it
   reads as too cold against the orange border, cream is a one-value change.**
7. ⚠️ **Carried forward, unchanged:** the zero-state £0 at 92px, the range focus ring, the nav anchors
   unfollowed, and the gate, which has still never fired.
