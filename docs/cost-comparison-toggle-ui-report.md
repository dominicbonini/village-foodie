# Cost comparison — the fee-mode toggle as a segmented control

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.
✅ **Presentation only — the maths was not touched.** The memo, both explanatory sentences and the
small print are **byte-identical**, checked span-by-span rather than by eye (§4).

---

# §1 — WHAT IT LOOKS LIKE NOW

```
   Their rate:                                    <- label, ABOVE the control
   ┌──────────────────────────┬──────────────────┐   #F8FAFC fill, #E2E8F0 border,
   │ includes card processing │ is charged on top│   rounded-lg, p-1
   └──────────────────────────┴──────────────────┘
     └ SELECTED: white fill, INK text, weight 600,   └ UNSELECTED: #64748B,
       1px soft shadow, rounded-md                      no fill, no border, no underline
```

✅ **One rounded container, two halves inside it, no separator character** — the container's edge and
the filled half do that work.
🔴 **NO UNDERLINE ON EITHER HALF.** Scanned: the string `underline` does not occur in the block.
🔴 **NO SEPARATOR CHARACTER.** Scanned: `·` does not occur in the block.
✅ **`text-sm`, `px-3 py-1.5`** — smaller and quieter than the number inputs above it, and nothing like
the large filled answer buttons in cards 1 and 2.

## 1.a WHY THE OLD ONE READ AS A SENTENCE — RECORDED IN THE FILE

Your three causes are now written at the site as a prohibition, so it is not rebuilt that way: **colour
and weight signal emphasis, not selection; an underline signals a link; a middot between two clauses is
punctuation, not a divider.**

---

# §2 — THE THREE JUDGEMENT CALLS

## 2.a THE LABEL GOES **ABOVE**, AND THE REASON IS ARITHMETIC

```
  'Their rate:'  ~73px  + 8px gap  = ~81px
  pill at natural width            = ~326px
  inline total                     = ~407px      vs ~293px available   -> over by ~114px
```

🔴 **INLINE WAS NEVER GOING TO FIT.** Above, it costs one line and nothing else — **and it doubles as
the group's accessible name**, so the two cannot drift apart.

## 2.b `flex-1` ON EACH HALF, AND IT IS NOT A WIDTH CLASS

At their natural widths the halves come to **~326px inside a card that offers ~293px** — the pill would
have overflowed. `flex-1` makes them share the row and lets the longer label wrap **inside its own half**.

✅ **It is a flex class, not a width class**, so the token scan still returns NONE (§4). ⚠️ **No
`min-w-0` was needed:** a flex item will not shrink below its **min-content**, which for wrapping text is
its longest word — `processing` at ~71px against a ~118px text box, so it shrinks and wraps cleanly.

## 2.c `role="group"` + `aria-labelledby`, NOT `radiogroup`

🔴 **`role="radiogroup"` WOULD HAVE REQUIRED DROPPING `aria-pressed`** — it needs `role="radio"` with
`aria-checked` on the halves, and keeping `aria-pressed` was a stated requirement. **The two are
mutually exclusive, so I took the one you asked me to keep.** Flagging it because `radiogroup` is the
more precise semantic and it is available the moment `aria-pressed` is not required.

```
  role                : group
  accessible name     : "Their rate:"        (from aria-labelledby -> the VISIBLE <p id="fee-mode-label">)
  each half           : <button aria-pressed={true|false}>
```

✅ **The name comes from the visible text**, not a hidden `aria-label`, so what is announced and what is
on screen cannot diverge.

---

# §3 — RENDERED STRUCTURE IN BOTH STATES

```
  STATE 'inclusive' (default)
     group  role=group, name "Their rate:"
       half 1  aria-pressed=true    white fill, INK, weight 600, shadow, rounded-md
       half 2  aria-pressed=false   no fill, #64748B

  STATE 'ontop'
     group  role=group, name "Their rate:"
       half 1  aria-pressed=false   no fill, #64748B
       half 2  aria-pressed=true    white fill, INK, weight 600, shadow, rounded-md
```

✅ **Default is `'inclusive'`** — unchanged. ✅ **Both labels' wording is unchanged.** ✅ **The focus
treatment is unchanged**: `focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| The memo | full span, `useMemo(` → deps array | ✅ **byte-identical** |
| Sentence 1 (inclusive) | full JSX span | ✅ **byte-identical** |
| Sentence 2 (on top) | full JSX span | ✅ **byte-identical** |
| Small print | full `<p>` span | ✅ **byte-identical** |
| Cards 1, 2, 3, 5 | 700-char forward window each | ✅ **identical** |
| Q4's fee inputs | 900-char forward window | ✅ **identical** |
| Hero panel | 1000-char forward window | ✅ **identical — not gone near** |
| Plan panel, detail card | forward windows | ✅ **identical** |
| No grid token | token scan, toggle block + hero panel | ✅ **NONE in either** |
| No width token | scan for `w-`/`max-w-`/`min-w-`/`inline-block` | ✅ **NONE in either** |
| No underline | fixed-string scan of the block | ✅ **absent** |
| No separator character | fixed-string scan of the block | ✅ **absent** |
| `aria-pressed`, `role`, name | attribute scan | ✅ **§2.c** |
| Change confined | comment-stripped diff | ✅ **13 code lines out, 14 in** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §5 — DOES IT FIT AT 375px? — 🔴 YES, BY WRAPPING, AND THAT IS A LOOK YOU HAVE NOT SEEN

```
  375px viewport  -40 page px-5  -2 card border  -40 card p-5   =  293px inside the card
  -2 pill border  -8 pill p-1                                   =  283px shared by two halves
  each half 142px  -  px-3 (24px)                               =  118px of text box each

  'includes card processing'  160px  ->  TWO LINES: "includes card" / "processing"
  'is charged on top'         108px  ->  ONE LINE
```

🔴 **SO AT 375px THE PILL IS TWO LINES TALL WITH ONE HALF'S LABEL ON A SINGLE LINE, VERTICALLY
CENTRED.** It fits — it does not overflow, unlike the hero panel — but **it is lopsided**, and that
asymmetry is a real visual outcome I chose over an overflow.

⚠️ **Both halves sit on one line only once the card offers ~378px, i.e. a viewport around 460px.** So
**every phone shows the wrapped version and every tablet and desktop shows the clean one.**

⚠️ **THE USUAL CAVEAT, AND IT MATTERS MORE HERE THAN LAST TIME:** this is arithmetic on assumed glyph
advances (0.52em lowercase, 0.26em spaces at 14px), **not a measurement** — there is no Geist font file
on disk and no `fontTools` here. **A 5% error moves the wrap point by ~20px**, which is enough to change
whether "includes card processing" breaks at all on a 375px screen.

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The control has never been seen, clicked, focused or read by a
   screen reader.
2. 🔴 **THE LOPSIDED WRAP AT 375px (§5) IS THE THING TO LOOK AT FIRST.** A two-line half beside a
   one-line half in a segmented control can read as broken rather than as compact. **If it does, the
   honest fix is shorter labels — "included" / "on top" — not more padding**, and that is a copy decision
   for you, not something I should have taken.
3. 🔴 **WHETHER IT NOW READS AS A CHOICE IS THE ENTIRE POINT AND IS EXACTLY WHAT I CANNOT CHECK.** The
   old version's failure was invisible in the source and obvious on screen; **there is no reason to think
   this one's success is visible in the source either.**
4. ⚠️ **The selected half's `boxShadow` is inline `0 1px 2px rgba(15,23,42,0.08)`** — chosen to lift the
   white half off the tinted track. **Unseen; it may be too faint to do that at all**, in which case the
   fill is carrying the whole signal on its own.
5. ⚠️ **`transition` is on the halves with no duration class**, so it takes Tailwind's default. **The
   colour swap has not been watched.**
6. ⚠️ **The group is announced as "Their rate:" with two toggle buttons inside it.** Better than two
   loose toggles; **still not "option 1 of 2"**, which only `radiogroup` gives (§2.c).
7. ⚠️ **Carried forward:** the estimated 375px overflow of the *hero* panel at `text-base`, the plan
   panel never rendered, the `mt-8` two-year separator, the stale `YearLine` comment, and the gate,
   which has still never fired.
