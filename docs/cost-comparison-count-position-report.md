# Cost comparison — separating the order count from the caption

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **FOUR CODE LINES OUT, FOUR IN, IN ONE FILE.** Everything else in the diff is comment. The slider,
the allowance line, the memo, the hero panel, the plan panel, the fee-mode toggle and the detail card
are **byte-identical as full spans** (§4).

---

# §1 — WHAT IT LOOKS LIKE NOW

```
   £8,000  ~533 orders
   └ text-3xl, black    └ text-sm, slate-400
   Only orders placed through your ordering page — not cash or card at the window.
   └ text-sm, slate-600
   [──────────────── slider ────────────────]
```

✅ **Amount, count and caption now share one left edge**, and the caption owns its line.
✅ **Both stay above the slider** — the caption explains what to enter and must be read first.

---

# §2 — THE THREE DECISIONS

## 2.a `justify-between` IS GONE, NOT LEFT DOING NOTHING

You asked what happened to the space. **The row was `justify-between` with the count on the left and
the amount pushed to the far right. Both items are now on the left, so there is no second item to push
anywhere — `justify-between` is removed entirely and the row is left-packed.**

🔴 **A LEFTOVER `justify-between` WITH ONE EFFECTIVE GROUP SILENTLY DOES NOTHING AND READS AS
INTENT** — the next person would assume the layout depends on it. The file says so at the site.

⚠️ **`gap-3` → `gap-2` as well.** 12px was the distance between two opposed items; 8px binds the count
to the amount it derives from. **Confirmed by scan: `justify-between` no longer occurs anywhere in
question 3.**

## 2.b THE CAPTION WENT **DARKER** — `text-slate-500` → `text-slate-600`

Your call to make, and I took the darker option. **The reason is not that it stopped competing — it is
that this is the one line on the card that stops an operator entering their window takings, and it
should not be the faintest thing there.**

✅ **`text-slate-600` is the same colour as the allowance line further down this same card**, so the
card's two explanatory lines now match rather than sitting one step apart for no reason.

**Three tiers, and the colours carry the hierarchy:**

```
   amount    text-3xl, black         the value
   caption   text-sm, slate-600      the instruction
   count     text-sm, slate-400      the derived check
```

The count dropped a step to `slate-400` so it is quieter than both — **it was the same colour as the
caption before, which is what made them read as one sentence.**

## 2.c ⚠️ "about" BECAME "~" — TAKEN FROM YOUR EXAMPLE, NOT FROM THE BULLETS

Your target rendering reads `~533 orders`; the text was `about 533 orders`. **None of the bullets
mentions the wording**, so I am flagging that I changed it because the example showed it changed.

**It also serves the brief's own requirement** — "smaller and quieter than it, clearly subordinate" —
since `~` is a symbol rather than a word and reads as an annotation. ⚠️ **One word to revert if you
meant only the position.**
⚠️ `tabular-nums` was added to the count so the digits do not jitter as the slider moves.

---

# §3 — THE WIDTH BUDGET

```
  BUDGET  375px  -40 page px-5  -2 card border  -40 card p-5   =  293px inside the card

  the row = amount + gap-2 (8px) + count
     £2,500    "£2,500"   98 + 8 + "~167 orders"  81  =  187px   ->  FITS, 106px spare
     £8,000    "£8,000"   98 + 8 + "~533 orders"  81  =  187px   ->  FITS, 106px spare
     £12,000   "£12,000" 116 + 8 + "~800 orders"  81  =  205px   ->  FITS,  88px spare
```

✅ **£12,000 is the slider's maximum, so 205px is the worst case this row can ever reach** — not a
typical value, the ceiling. **88px of spare at the widest possible state.**

✅ **The move made the row NARROWER**, not wider: the old arrangement at the same maximum was
`"about 800 orders"` 110 + 12 gap + `"£12,000"` 116 = **239px**. Shorter count text and a smaller gap.

## 3.a 🔴 IT IS A CALCULATION, NOT A MEASUREMENT

**No advance width here was measured.** There is no Geist font file on disk and no `fontTools` in this
environment; the model assumes 0.60em digits and `£`, 0.52em lowercase, 0.26em spaces, 0.28em comma.

⚠️ **The margins are wide enough that the error bar does not threaten the conclusion** — 88px of spare
against a model error of roughly ±12px on a 200px row. **This row is not close to the edge in any
state the slider can produce.** That is not the same as having seen it.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **4 code lines out, 4 in** |
| The slider | full `<input type="range">` span | ✅ **byte-identical** |
| The allowance line | full JSX span | ✅ **byte-identical** |
| The memo | `useMemo(` → deps array | ✅ **byte-identical** |
| The hero panel | full span to `{heroVerb}` | ✅ **byte-identical — not gone near** |
| The plan panel | full span | ✅ **byte-identical** |
| The fee-mode toggle | full span | ✅ **byte-identical** |
| The detail card, `YearLine` | forward windows | ✅ **identical** |
| Cards 1, 2, 4, 5 | 700-char forward window each | ✅ **identical** |
| Card 3's title and gate | 110-char forward window | ✅ **identical** |
| No grid token, no width token | token scan, question 3 + hero panel | ✅ **NONE in either** |
| `justify-between` removed | fixed-string scan of question 3 | ✅ **absent** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / carrier-aware selectors | ✅ **clean** |

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The row has never been seen at any width or any slider value.
2. 🔴 **THE AMOUNT MOVED FROM THE RIGHT EDGE TO THE LEFT, AND THAT IS THE BIGGEST UNSEEN CHANGE
   HERE.** It is the only large number in the five question cards and it used to sit alone at the far
   right. **Left-packed beside a small grey annotation is a different object**, and whether it still
   reads as the card's answer is exactly what a browser settles.
3. 🔴 **THE THREE-TIER COLOUR HIERARCHY IS THE WHOLE FIX AND IT IS UNVERIFIED.** `slate-400` against
   `slate-600` is one step of separation. **If it is too subtle the two lines still read as one
   block** — the same failure, quieter.
4. ⚠️ **`~` may read as an approximation symbol or as noise**, depending on the font's tilde. **It was
   never seen; §2.c is a one-word revert.**
5. ⚠️ **The baseline alignment of a 30px number against a 14px annotation** is `items-baseline`, which
   is right in principle — **but the optical gap between them at that size difference has not been
   looked at**, and `gap-2` was chosen on reasoning, not on sight.
6. ⚠️ **Carried forward:** the hero panel's three-truck fit at ~7px against a ±12px error bar, the
   segmented toggle's lopsided wrap at 375px, the caption's two-line wrap, the plan panel never
   rendered, the `mt-8` two-year separator, the stale `YearLine` comment, and the pricing gate, which
   has still never fired.
