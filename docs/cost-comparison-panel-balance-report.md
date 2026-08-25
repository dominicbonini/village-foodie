# Cost comparison — rebalancing the hero context panel

**Date:** 25 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **THE CONSTRAINT THAT OUTRANKS EVERYTHING WAS HELD.** Two flex rows. Token scan over the whole
block returns **grid = NONE, width/basis = NONE** (§4). Centring is still the wrapper's
`flex justify-center`; the panel declares no width. **Nothing that broke this block three times was
reintroduced, and no instruction required one.**

✅ **FIVE CODE LINES OUT, NINE IN.** The memo, plan panel, fee-mode toggle, two-year line, scroll cue,
figure, verb, percentage line, anchor sentence, CTAs, detail card, `YearLine`, all five question cards
and the fleet note are **byte-identical** (§4).

---

# §1 — TASK 1: THE BALANCE, INVERTED

## 1.1 WHAT CHANGED

```
  BEFORE — one size, one colour, no hierarchy at all
     label   text-sm sm:text-base   slate-500
     theirs  text-sm sm:text-base   slate-500   (normal weight)
     ours    text-sm sm:text-base   slate-700   font-semibold

  AFTER — three tiers, with the row's own size as the middle one
     label      text-xs sm:text-sm              slate-400    ← a caption, one step DOWN
     theirs     (row size) font-semibold        slate-600
     ours       (row size) font-bold            slate-800    ← keeps its one-step lead
     qualifier  (row size) font-normal          slate-400
```

🔴 **THE DEFECT WAS THAT A LABEL AND A FIGURE CARRIED IDENTICAL EMPHASIS**, which is exactly why the
rows read as prose. The label now moves *down* a step as well as the amounts moving *up* — the gap
between them is two moves wide, not one.

✅ **Our amount keeps its existing extra weight relative to theirs.** It was semibold/slate-700 against
normal/slate-500 — a one-step lead. It is now bold/slate-800 against semibold/slate-600. **Same lead,
both ends shifted.**

## 1.2 THE QUALIFIERS — ✅ **LIGHT, AND SET IN THE LABEL'S COLOUR**

`" a year"` and `" in year one"` are wrapped in `font-normal text-slate-400` — **the label's colour, not
the amount's**, and normal weight against the amount's semibold/bold.

**The reasoning, recorded at the site:** they *qualify* the amount rather than being part of it. In the
amount's weight the timeframe reads as a second figure — which is the failure the panel already had, at
a smaller scale.

⚠️ They keep the row's SIZE (they sit inside the amount span) and lose only weight and colour. Dropping
their size too would have made three sizes in one row.

## 1.3 🔴 WHY IT STOPS AT slate-800 AND NOT slate-900

You set the test: *"if the amounts approach the percentage line's weight, they have gone too far."*

```
  the percentage line   text-lg  font-semibold  slate-500
  our amount            text-sm sm:text-base  font-bold  slate-800
```

**The amount is heavier and darker but SMALLER.** It stops short of `INK` (`#1A2233`), which the verb
and the figure own. 🔴 **The comment at the site says: DO NOT PUSH THEM TO slate-900 OR text-lg — at
that point the hero has two subjects and the contrast it runs on is gone.**

⚠️ **Whether "heavier and darker but smaller" nets out as subordinate is a rendering judgement I cannot
make.** It is the main thing to look at (§6.2).

---

# §2 — TASK 2: ALIGNMENT — 🔴 **SKIPPED, AND HERE IS EXACTLY WHY**

The two amounts still do **not** start at a shared left edge.

**The labels are different lengths** — `"Right now you pay"` (~123px) against `"With HatchGrab"` (~91px)
— so on one-line rows the amount begins ~32px further right on row one than on row two. To align them
something must fix the label's width. Everything that does is forbidden here:

| Candidate | Why it is out |
|---|---|
| `grid-cols-[auto_auto]` | 🔴 **The exact pattern that collapsed twice.** |
| `w-32` / `min-w-[7rem]` on the label | A width class. |
| `basis-32` | Not caught by the regex, but **it is still a fixed measurement that can fail** — the thing the brief names. Excluded in spirit, and I am not sneaking it past a scan. |
| `flex-1` on the label | Does nothing: the panel is content-sized, so there is no spare space to distribute. |

**One structural option would have been free** — stacking each row as caption-above-amount
(`flex-col`), which aligns both amounts on the panel's own padding edge with no measurement at all.
🔴 **I rejected it and am telling you rather than quietly taking it.** It turns two lines into four and
roughly doubles the panel's height, on a hero already carrying an open concern that the figure falls
below the fold at 375px. **That is a bigger change than the one you asked for, and it trades a known
risk for an alignment benefit you called optional.**

✅ **Per your instruction — the weight change alone carries most of the benefit, and it is what
shipped.** ⚠️ **If you want the alignment, say so and I will do the stacked variant deliberately**, with
the height cost stated up front.

---

# §3 — TASK 3: THE FILL — ✅ **ONE CHANGE, NOT TWO**

```
  #F8FAFC  (slate-50)   →   #F1F5F9  (slate-100)
```

**A border was the other option and was rejected.** The panel sits inside a card that already carries a
**2px orange border**; a hairline here is a second edge inside it. **A fill is a surface — it separates
without drawing another line.**

✅ **`#F1F5F9` is already in this file** — it is the hairline colour between the year blocks in the
detail card — so **no new value entered the palette**.

🔴 **The comment says: DO NOT NOW ADD THE BORDER TOO.** The brief allowed one of the two, and taking
both later would undo the reasoning.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **5 code lines out, 9 in** |
| **No grid token** | token scan over the whole panel block | ✅ **NONE** |
| **No width token** | scan for `w-`/`max-w-`/`min-w-`/`inline-block`/**`basis-`** | ✅ **NONE** |
| The memo | `useMemo(` → deps array | ✅ **byte-identical** |
| The plan panel | full span | ✅ **byte-identical** |
| The fee-mode toggle | full span | ✅ **byte-identical** |
| The two-year line | full span | ✅ **byte-identical** |
| The scroll cue | full span | ✅ **byte-identical** |
| Figure, verb, percentage line, anchor | forward windows | ✅ **identical** |
| The CTAs | 400-char forward window | ✅ **identical** |
| Detail card, `YearLine` | 700-char forward windows | ✅ **identical** |
| Cards 1–5 | 700–900-char forward window each | ✅ **identical** |
| The fleet note | 180-char forward window | ✅ **identical** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |

⚠️ **The `basis-` term was added to the width scan for this brief**, because §2 considered it and
rejected it — a scan that could not have caught it would have been worth nothing.

## 4.1 THE RENDERED ROWS, WITH THE CLASS ON EVERY ELEMENT

```
  ONE TRUCK
     <div class="flex items-baseline gap-3 whitespace-nowrap text-sm sm:text-base">
       <span class="text-xs text-slate-400 sm:text-sm">          Right now you pay
       <span class="font-semibold tabular-nums text-slate-600">  £2,520
         <span class="font-normal text-slate-400">                 a year
     <div class="mt-1 flex items-baseline gap-3 whitespace-nowrap text-sm sm:text-base">
       <span class="text-xs text-slate-400 sm:text-sm">          With HatchGrab
       <span class="font-bold tabular-nums text-slate-800">      £1,084
         <span class="font-normal text-slate-400">                 in year one

  THREE TRUCKS — identical classes, plus the unchanged fleet note
       £25,200 a year   /   £10,140 in year one
     <p class="mt-2 text-right text-xs text-slate-400">          across 3 trucks

  NEGATIVE — identical classes; ours is still the BOLDER row
       £600 a year      /   £948 in year one
```

🔴 **THE WEIGHT IS UNCONDITIONAL, UNCHANGED FROM THE ORIGINAL DECISION.** In the negative case the
`font-bold text-slate-800` still sits on **our** number, which is then the dearer one. It marks our row,
not the winning row.

## 4.2 THE WIDTH — 🔴 **A CALCULATION, NOT A MEASUREMENT**

**No advance width here was measured.** There is no Geist font file on disk and no `fontTools` in this
environment. The model assumes 0.60em digits and `£`, 0.52em lowercase, 0.65em uppercase, 0.26em spaces.

```
  <640px   label text-xs / amount text-sm            budget 283px
     one truck      widest 214  ->  panel 254   FITS, 29px spare
     three trucks   widest 222  ->  panel 262   FITS, 21px spare
     negative       widest 201  ->  panel 241   FITS, 42px spare

  >=640px  label text-sm / amount text-base          budget 548px
     one truck 285 · three trucks 294 · negative 270  — 254px+ spare in every case
```

✅ **THIS CHANGE MADE THE PANEL NARROWER AND CLOSED THE ONE MARGIN THAT WAS INSIDE THE NOISE.** The
previous report flagged the three-truck case at **~7px against a ±12px error bar**. Smaller labels buy
**14px**, taking it to **~21px** — now comfortably outside the model's error. ⚠️ **That is a better
margin, not a measurement.**

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The panel has never been seen at any size, and this is the fourth
   change to it.
2. 🔴 **WHETHER THE AMOUNTS ARE NOW SUBORDINATE OR COMPETING IS THE WHOLE QUESTION AND IS EXACTLY WHAT
   A CLASS NAME CANNOT ANSWER** (§1.3). Bold slate-800 at `text-base` against a semibold slate-500
   `text-lg` is a genuine judgement call. **If the panel now pulls the eye before the figure does, the
   fix is to drop our amount to `font-semibold` — one word, and the first thing I would try.**
3. 🔴 **THE LABELS AND THE FLEET NOTE ARE NOW THE SAME SIZE AND COLOUR BELOW 640px** — both
   `text-xs text-slate-400`. On a phone the note may read as a third label rather than as a scope
   qualifier. **They diverge above 640px** (labels go to `text-sm`), so this is a phone-only risk.
   **The fleet note is out of scope for this brief and was not touched.**
4. ⚠️ **`#F1F5F9` against a white card is roughly a 4% step, up from 2%.** Doubling a very small number
   still leaves a small number. **If it still does not register as an object, the border is the other
   lever — but the brief allowed one, so I took one.**
5. ⚠️ **The multi-line amount spans are new markup.** JSX strips whitespace-with-newlines at line ends,
   so the qualifier's leading space comes from inside its string literal and there should be exactly one
   gap. **Reasoned, not seen — a missing or doubled space before "a year" would show immediately.**
6. ⚠️ **Carried forward:** the segmented toggle's lopsided wrap at 375px, the caption's two-line wrap,
   the plan panel never rendered, the `mt-8` two-year separator, the scroll cue's `scroll-mt-4` landing
   position, and the pricing gate, which has still never fired.
