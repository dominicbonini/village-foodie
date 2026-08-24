# Cost comparison — question 3's caption

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**

🔴 **PROMPT INTEGRITY — ONE THING TO FLAG, AND IT DID NOT STOP THE BUILD.** No span arrived garbled.
See §1: **the caption the brief quotes does not exist in the file.** The problem it describes is real,
the task is unambiguous, and acting on it required no guess — so I built it and am telling you rather
than stopping.

✅ **ONE CODE LINE OUT, FOUR IN, IN ONE FILE.** Everything else in the diff is comment.

---

# §1 — 🔴 THE BRIEF'S PREMISE: THE CAPTION DOES NOT SAY WHAT THE BRIEF SAYS IT SAYS

> **THE PROBLEM — Question 3's caption reads "Card sales for one truck".**

🔴 **THE STRING `Card sales` DOES NOT OCCUR ANYWHERE IN THE FILE.** The caption actually read:

```
  One truck · about {Math.round(m.orders)} orders
```

**Named the scope. Never named the kind of money at all.**

⚠️ **THIS CHANGES NOTHING ABOUT WHETHER THE FIX IS RIGHT — IT MAKES IT MORE SO.** "Card sales" would
at least have said *card*; "One truck · about 166 orders" says nothing that excludes the window. **The
defect is worse than the brief described**, so the replacement wording is if anything more necessary.

⚠️ **Recording it because a brief that asserts a state commissions work from that state.** Same class
as V11.39's *"a premise written confidently into a brief is inherited by everything built from it"* —
which the manual gained this morning.

---

# §2 — THE CHANGE

```
  BEFORE
     One truck · about 166 orders                          £2,500
     [────────── slider ──────────]

  AFTER
     about 166 orders                                      £2,500
     Only orders placed through your ordering page — not cash or card at the window.
     [────────── slider ──────────]
```

✅ **The wording is yours, verbatim.** ✅ **The order count stays beside the amount** — it is the
self-check, and an operator who knows they take forty online orders a month spots a mismatch the
moment the count disagrees.

## 2.a "One truck ·" WAS DROPPED — DELIBERATE, AND FLAGGED

It was part of the caption being replaced, not part of the count. **The scope is still stated twice**
without it: the card's own title is *"Online orders per month, per truck"*, and the allowance line
below says *"included per truck"*.

⚠️ **It also fixed a latent tightness** — see §3.

## 2.b THE CAPTION IS ITS OWN LINE, BELOW THE AMOUNT

🔴 **Sharing the row was never possible.** It sits above the slider rather than below it, because it
explains what number to enter and the reader needs that **before** they drag.

---

# §3 — 🔴 WIDTHS: IT COULD NOT HAVE SHARED THE ROW, BY A FACTOR OF TWO

```
  BUDGET  375px  -40 page px-5  -2 card border  -40 card p-5   =  293px inside the card

  the new caption at text-sm                                    ~518px
  the amount '£2,500' at text-3xl                                ~98px

  IF IT SHARED THE ROW:   518 + 12 gap + 98  =  ~628px  vs 293px   ->  OVER BY ~335px
```

🔴 **Over by more than the entire width of the card.** This was not a close call and no amount of
padding or truncation would have made it one.

**As built:**

```
  row 1   'about 166 orders' 110px + 12 gap + '£2,500' 98px = ~221px   ->  FITS, ~72px spare
          (the OLD caption+count would have been 186 + 12 + 98 = ~296px  ->  over by ~3px)
```

✅ **So dropping "One truck ·" also removed an existing hairline overflow on that row** — it was
already a shade over budget before this change.

## 3.a THE RENDERED ROW AT BOTH WIDTHS

```
  PHONE (375px, 293px inside the card)          the caption WRAPS TO TWO LINES:
     about 166 orders                £2,500
     Only orders placed through your ordering        (~267px)
     page — not cash or card at the window.          (~247px)

  DESKTOP (~582px inside the card at md:p-6)    the caption is ONE LINE:
     about 166 orders                          £2,500
     Only orders placed through your ordering page — not cash or card at the window.
```

✅ **The row itself does NOT wrap at either width** — only the caption below it does, and a paragraph
wrapping is a paragraph behaving. ✅ **No `whitespace-nowrap` was added**, deliberately: this text is
prose and must be free to wrap.

## 3.b 🔴 IT IS A CALCULATION, NOT A MEASUREMENT

Same standard as the previous three reports: **there is no Geist font file on disk and no `fontTools`
here**, so no advance width was measured. The model assumes 0.52em lowercase, 0.60em digits and
em-dash, 0.26em spaces.

⚠️ **The margins here are wide enough not to care** — 72px of spare on the row, and the caption is a
wrapping paragraph whose exact break point is cosmetic. **A ±12px model error changes where line one
breaks and nothing else.** This is the first change in this sequence where the error bar does not
threaten the conclusion.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **1 code line out, 4 in** |
| The slider | full `<input type="range">` span | ✅ **byte-identical** |
| The order count | expression + 60-char window | ✅ **identical** |
| The allowance line | full JSX span | ✅ **byte-identical** |
| The memo | `useMemo(` → deps array | ✅ **byte-identical** |
| The hero panel | full span to `{heroVerb}` | ✅ **byte-identical — not gone near** |
| The plan panel | full span | ✅ **byte-identical** |
| The fee-mode toggle | full span | ✅ **byte-identical** |
| The detail card, `YearLine` | forward windows | ✅ **identical** |
| Cards 1, 2, 4, 5 | 700-char forward window each | ✅ **identical** |
| No grid token, no width token | token scan, question 3 + hero panel | ✅ **NONE in either** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The caption has never been seen at either width.
2. 🔴 **THE FIX IS A COPY FIX AND ITS SUCCESS IS BEHAVIOURAL, NOT VISUAL — SO NOTHING I CAN DO
   VERIFIES IT.** Whether an operator now enters online-only takings instead of total takings is not
   something the page can tell you and not something a browser settles either. **The most that can be
   said is that the sentence now excludes the window explicitly, where nothing did before.**
3. ⚠️ **The caption is `text-slate-500`, the same weight and colour as the order count beside it.**
   Two lines of identical grey stacked under a large black number **may read as one block of small
   print rather than as a count and an instruction.** If it does, the count is the one that should
   stay quiet and the caption the one that should not.
4. ⚠️ **Two lines at phone width push the slider ~20px further down**, into a card that is already the
   tallest of the five once the allowance line renders. **Unmeasured against the fold.**
5. ⚠️ **The em-dash may break awkwardly.** At 293px the model puts the break after "ordering", leaving
   the dash to open line two — **plausible, unverified, and cosmetic either way.**
6. ⚠️ **Carried forward:** the hero panel's three-truck fit at ~7px against a ±12px error bar, the
   segmented toggle's lopsided wrap, the plan panel never rendered, the `mt-8` two-year separator, the
   stale `YearLine` comment, and the pricing gate, which has still never fired.
