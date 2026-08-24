# Cost comparison — the scroll cue and the percentage's wording

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **TWO CODE LINES OUT, 18 IN, IN ONE FILE.** The hero panel, the memo, the plan panel, the fee-mode
toggle, all five question cards and the two-year line are **byte-identical as full spans** (§4).

---

# §1 — TASK 1: THE CUE

```
   ┌ card 5 ──────────────────────────────┐
   │  Your introductory offer — …          │
   └───────────────────────────────────────┘

              See your saving ↓            <- text-sm, slate-500, underlined, centred

   ┌ the results hero ─────────────────────┐
```

✅ **A centred text button, `text-sm font-semibold text-slate-500`, underlined** — quieter than the
hero's two CTAs and nothing like the filled answer buttons in cards 1 and 2.

## 1.a 🔴 IT IS A NAVIGATION AID AND THE FILE SAYS SO AS A PROHIBITION

The hero **already renders and updates live**; the link only moves the viewport. The reasoning is
recorded at the site, both halves:

1. 🔴 **THE SLIDER NEEDS LIVE FEEDBACK.** A range input whose number does not move as it is dragged
   reads as **broken**, not as deferred.
2. 🔴 **A GATED FIGURE GOES STALE THE INSTANT AN INPUT CHANGES AFTERWARDS** — it would then be showing
   a saving computed from answers no longer on screen, **which is the one thing this page cannot afford
   to do.**

⚠️ **Nothing was hidden, no "calculate" step was added, and the figure does not wait for a click.**

## 1.b THE SCROLL APPROACH — THE CODEBASE ALREADY HAD ONE

✅ **`scrollIntoView({ behavior, block: 'start' })` is already in use** — `app/manage/[token]/page.tsx`
uses exactly that shape, and **`app/trucks/[slug]/order/page.tsx` records why it is preferred over
arithmetic on `window.scrollTo`: the browser applies the target's own `scroll-margin-top`, so the
offset lives on the destination instead of being recomputed by every caller.** No dependency added.

✅ **So the target carries `scroll-mt-4`** rather than the caller carrying a magic offset.

⚠️ **REDUCED MOTION IS HONOURED BY HAND, and it had to be.** `landing.css` has
`html:has(.hg-landing) { scroll-behavior: smooth }` with a `prefers-reduced-motion` override — **but the
calculator is deliberately outside `.hg-landing`, so none of that reaches this page.** The behaviour is
therefore passed explicitly and gated on `matchMedia('(prefers-reduced-motion: reduce)')`.

## 1.c THE BREAKPOINT DECISION — ✅ **SHOWN AT EVERY WIDTH**

**The cards are a single `max-w-2xl` column on every screen**, so five of them push the results below
the fold on a laptop as well as a phone. **This is not a phone-only problem**, and a cue that
disappears at a breakpoint is a second behaviour to reason about for no gain.

⚠️ **It is gated on `staff`**, because the results block is: without that the link would scroll to an
element that does not exist and appear to do nothing.

---

# §2 — TASK 2: THE PERCENTAGE

```diff
-  <span className="ml-2 text-sm font-bold text-slate-400">{Math.abs(pct).toFixed(0)}%</span>
+  ({Math.abs(pct).toFixed(0)}% {isRealSaving(save) ? 'less' : 'more'})
```

🔴 **NOT "% off", and the reason is recorded at the site.** "Off" is retail-discount language implying
we are discounting **our own** price; this is a comparison against what they pay **elsewhere**. It also
does not invert — "58% off" in the losing case is nonsense, where "58% more" is exactly right.

✅ **"less" is the hero's own word** — the hero renders *"{n}% less in your first year"* — so the two
are the same claim at two sizes. The comment says **change one and change both.**

✅ **Still subordinate:** `text-sm` against the amount's `text-2xl`, `text-slate-400` against its
orange. Only the text inside the span changed; the classes did not.

## 2.a THE STALE QUOTATION, FIXED

`YearLine`'s comment quoted question 2 as *"Pro — £29 per truck per month…"*. **That wording no longer
exists.** It now records the current form — *"We suggest Pro" / "We suggest Max" above the price* —
and notes explicitly that **the claim was always true and only the quote had gone stale.**

⚠️ **The corrected quotation deliberately carries no price.** A number inside a comment is a second
copy that drifts; the whole point of the pricing refactor was that £29 lives in `PLAN_MONTHLY_PENCE`
and nowhere else.

---

# §3 — THE RENDERED YEAR ROWS

Produced by executing the page's own `gbp` / `isRealSaving` / `rendersAsZero`, types stripped by `tsc`.

```
  ══ POSITIVE ══
     Year one    Save £1,732  (69% less)      ORANGE
                 Current provider £2,520 → HatchGrab £788
     Year two    Save £1,660  (66% less)      ORANGE
                 Current provider £2,520 → HatchGrab £860

  ══ EXACT ZERO ══
     Year one    Extra £0     (0% more)       SLATE
                 Current provider £1,200 → HatchGrab £1,200

  ══ NEGATIVE ══
     Year one    Extra £348   (58% more)      SLATE
                 Current provider £600 → HatchGrab £948
```

✅ **The zero case says "(0% more)", not "(0% less)"** — `isRealSaving(0)` is false, so it takes the
same branch as a genuine loss. **That is correct and it matches the hero**, which renders *"0% more in
your first year"* in the same state. ⚠️ **It is also slightly odd prose** — "Extra £0 (0% more)" — and
was odd before this change too; the wording for a dead heat is a decision, not a fix, and is unchanged.

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **2 code lines out, 18 in** |
| The hero panel | full span to `{heroVerb}` | ✅ **byte-identical — not gone near** |
| The memo | `useMemo(` → deps array | ✅ **byte-identical** |
| The plan panel | full span | ✅ **byte-identical** |
| The fee-mode toggle | full span | ✅ **byte-identical** |
| The two-year line | full span | ✅ **byte-identical** |
| Cards 1–5 | 700–900-char forward window each | ✅ **all identical** |
| No grid / width token | token scan, cue block **and** `YearLine` | ✅ **NONE in either** |
| Year rows, three states | real functions, types stripped by `tsc` | ✅ **§3** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / carrier-aware selectors | ✅ **clean** |

⚠️ **The two changed code lines are exactly:** the percentage `<span>`'s contents, and
`<div className="mt-6 space-y-4">` → `<div id="cost-results" className="mt-6 scroll-mt-4 space-y-4">`.
**The `id` and `scroll-mt-4` are on the results WRAPPER, not on the hero card** — which is why the hero
span is still byte-identical.

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED, AND THIS CHANGE IS ALMOST ENTIRELY BEHAVIOURAL.** The link has never
   been clicked and the scroll has never happened.
2. 🔴 **YOUR SPECIFIC QUESTION — WHETHER IT LANDS SENSIBLY — IS THE MAIN UNKNOWN, AND `scroll-mt-4` IS
   A GUESS.** 16px of margin was chosen because it is the smallest step that visibly clears an edge;
   **it was not measured against a phone's URL bar, which is the thing that would eat it.** Mobile
   Safari's collapsing chrome makes this genuinely hard to reason about statically: the bar's height
   changes *during* the scroll. **If the hero's top edge ends up tucked under it, `scroll-mt-4` is the
   one value to raise**, and raising it needs no other change because the offset lives on the target.
3. 🔴 **`block: 'start'` PUTS THE WRAPPER'S TOP AT THE VIEWPORT TOP — which is the before/after panel,
   not the big figure.** That is deliberate (the panel is the context the figure needs) **but it means
   the headline number may sit below the fold at the moment the scroll ends on a short screen.** If
   that reads badly the fix is `block: 'center'` or a taller `scroll-mt`, and I would want to see it
   before choosing.
4. ⚠️ **The cue's own visibility is untested.** A grey underlined line between a card stack and a
   bordered results card **may read as part of card 5's footer** rather than as a link.
5. ⚠️ **"(69% less)" adds ~40px to the year row at `text-sm`.** The row already wraps
   (`flex-wrap`), so it should absorb it — **unverified at 375px.**
6. ⚠️ **Reduced motion is honoured but never exercised.** The `matchMedia` branch has not been run in
   any browser.
7. ⚠️ **Carried forward:** the hero panel's three-truck fit at ~7px against a ±12px error bar, the
   segmented toggle's lopsided wrap, the caption's two-line wrap, the plan panel never rendered, the
   `mt-8` two-year separator, and the pricing gate, which has still never fired.
