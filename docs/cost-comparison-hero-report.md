# Cost comparison — restructuring the results hero

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`**, and within it only the results hero.
The shared nav (09:52) and the gate (09:51) predate this edit (10:14); the five question cards and the
detail card are untouched — see the diff in §5.

---

# §1 — TASK 1: THE BEFORE/AFTER

```
   Right now you pay          £2,520 a year
   With HatchGrab             £1,084
   ─────────────────────────────────────────
```

Label left, amount right, `text-sm text-slate-500`, in a `max-w-xs` block centred within the otherwise
centred hero, followed by a hairline rule.

## 1.a ✅ THE FIELDS WERE STILL THERE — NOTHING WAS REINSTATED

You asked me to report rather than silently reinstate. **Nothing needed reinstating.** `m.theirsYear`
and `m.oursY1` are both still returned by the memo and are **exactly what the detail card's Year One
line already consumes**:

```
  hero reads    : {gbp(m.theirsYear)} a year   /   {gbp(m.oursY1)}
  YearLine gets : <YearLine label="Year one" theirs={m.theirsYear} ours={m.oursY1} … />
```

⚠️ **The fields removed in the CTA/layout task were `theirsMonth` and `oursMonth`**, whose only consumer
was the deleted effective-rate line. **The year-one figures were never among them.**

✅ **AND THEY ARE READ, NOT DERIVED.** A scan of the hero block for arithmetic — `* 12`, `* fleet`,
`theirsMonth`, `oursMonth` — returns **nothing**. ⚠️ **Recomputing them here with identical arithmetic
would still have been a second definition, and it would drift the first time the model changes.** The
comment at the site says so.

## 1.b ⚠️ ONE THING MOVED THAT YOU DID NOT NAME, AND I AM FLAGGING IT RATHER THAN BURYING IT

The old eyebrow carried the fleet count: `{fleet > 1 && ` · ${fleet} trucks`}`. **Task 2 replaces that
eyebrow, so the fleet note had nowhere to go.**

**Deleting it would have been a silent loss of the SCOPE of every figure in the card** — a one-truck
reader and a three-truck reader would see the same layout with no way to tell which they were looking
at. **It now sits as a small right-aligned line under the before/after pair**, inside the context block
where the scope of those figures belongs.

⚠️ **Task 1 said the two lines go "above everything else", and they do** — the note is below them, inside
the same block. **If you would rather it went somewhere else, it is one line.**

---

# §2 — TASK 2: THE VERB

**Was:** `text-xs font-black uppercase tracking-widest text-slate-400` — a small grey eyebrow.
**Now:** `text-lg font-semibold` in `INK`, with `mt-1` between it and the figure.

**Same size as the percentage line below it**, and tight enough that the verb and the number read as one
unit rather than as a caption above a number. The figure keeps its dynamic `fontSize` and its colour.

🔴 **The comment says "DO NOT SHRINK IT BACK — its legibility is the fix, not its styling"**, because
a future tidy-up that restores a small grey label restores the ambiguity this task exists to remove.

---

# §3 — TASK 3 AND TASK 4

✅ **The percentage line now reads `{n}% less in your first year`** (or `more`). The comment records
why the timeframe is load-bearing: **without it the figure can be read as monthly or as a lifetime
total, and both misreadings flatter us.**

✅ **Unchanged, as required:** the anchor sentence below the rule, both CTAs, and the cream trust
footer. ✅ **The duplication with the detail card's Year One line is left in place**, per your ⚠️ — the
hero covers year one, the card covers both years, and they are different presentations that will diverge
in layout.

---

# §4 — THE FOUR STATES, EXERCISED

The five functions were **extracted verbatim from the page** (types stripped by the TypeScript compiler)
and the hero's own expressions driven across four inputs.

```
  ══ TYPICAL POSITIVE — 1 truck ══            ══ LARGE FLEET — 3 trucks ══
     Right now you pay    £2,520 a year          Right now you pay    £25,200 a year
     With HatchGrab       £1,084                 With HatchGrab       £10,140
     fleet note : (none)                         fleet note : across 3 trucks
     verb       : "You save"                     verb       : "You save"
     figure     : £1,436  (ORANGE, 76px)         figure     : £15,060 (ORANGE, 76px)
     pct line   : "57% less in your first year"  pct line   : "60% less in your first year"
     anchor     : "That's a new fryer and        anchor     : "That's a second van on the
                   griddle."                                   road."

  ══ EXACT ZERO — no difference ══            ══ NEGATIVE — they are cheaper ══
     Right now you pay    £1,200 a year          Right now you pay    £600 a year
     With HatchGrab       £1,200                 With HatchGrab       £948
     verb       : "About the same"               verb       : "You'd pay extra"
     figure     : £0      (SLATE, 92px)          figure     : £348    (SLATE, 92px)
     pct line   : "0% more in your first year"   pct line   : "58% more in your first year"
     anchor     : (not rendered)                 anchor     : (not rendered)
```

## 4.a 🔴 "You save" HAS THREE STATES, NOT TWO — AND THE MIDDLE ONE IS WHY

```ts
const heroVerb = good ? 'You save' : rendersAsZero(m.saveY1) ? 'About the same' : "You'd pay extra"
```

**A boolean would have got the middle case wrong.** `good` is already `isRealSaving(saveY1)` — positive
**and** surviving the formatter — so a saving that rounds away to £0 is **not** a saving; but it is not
"extra" either. ✅ **"About the same" describes the arithmetic and stops.** No claim is invented for it.

✅ **Confirmed across all four: "You save" appears only when there is a real saving.** No stray verb
sits over a negative number, and the anchor sentence renders only in the two positive states — it is
gated on `good`, so that came for free.

⚠️ **ONE THING I WOULD LOOK AT ON SCREEN:** in the zero case the hero renders **"About the same" over a
92px £0**, and then "0% more in your first year". **Every part of that is true and none of it is a
claim** — but a very large £0 is a strange thing to devote the top of a card to, and it is reachable
only in a band about a penny wide. **Not changed; reported, because you would not otherwise see it.**

---

# §5 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Same source as the detail card | grep both call sites | ✅ **`m.theirsYear` / `m.oursY1`, identical fields** |
| Not recomputed | scan the hero block for arithmetic | ✅ **none — read only** |
| Removed fields not reinstated | which fields the earlier task dropped | ✅ **`theirsMonth`/`oursMonth`, neither used here** |
| Four states | real functions, types stripped by `tsc` | ✅ **table in §4** |
| Verb never over a non-saving | all four states | ✅ **"You save" only when `good`** |
| Change confined to the hero | comment-stripped diff | ✅ **6 code lines out, 18 in** (block comments stripped) — out: the four eyebrow lines, the figure's opening tag, the percentage tail. In: the before/after block, the verb, the two retagged lines |
| Question cards / detail card | same diff | ✅ **untouched** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **The restructured hero has never been
   seen**, and this change is more visual than any before it — it moves the card's whole reading order.
2. 🔴 **THE SUBORDINATION IS THE WHOLE MECHANISM AND IT IS UNTESTED.** The before/after lines must read
   as context and not compete with the figure. `text-sm text-slate-500` against a 76–92px figure **should**
   be safely subordinate — **but if they read as a second subject, the contrast effect this change exists
   to create is the thing that breaks**, and I cannot tell from the classes.
3. ⚠️ **The verb at `text-lg` against a 92px figure has not been seen either.** It is sized to match the
   percentage line by design; whether that is "large enough to read as part of the number" is exactly the
   judgement a browser settles.
4. ⚠️ **The hero is now considerably taller** — two lines, a rule, a verb, the figure, the percentage,
   the anchor, then two CTAs. **On a phone the figure may fall below the fold**, which would invert the
   intended reading order. **Untested at 375px, like everything else on this page.**
5. ⚠️ **The zero-state £0 at 92px** (4.a) — reachable, honest, and never looked at.
6. ⚠️ **Everything else carries forward:** the `.hg-landing` chrome scoping unrendered, the bracket
   background uncompiled, the range focus ring, 375px behaviour generally, the nav anchors unfollowed,
   and the gate, which has still never fired.
