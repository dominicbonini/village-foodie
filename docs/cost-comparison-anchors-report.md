# Cost comparison — headline and saving anchors

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`.** The shared nav and footer (09:52), the
gate (09:51) and everything in `lib/` predate this edit (09:58) and were not reopened.

---

# §1 — TASK 1: THE HEADLINE

**Was:** `What do your online` / `orders actually cost?`
**Now:** `Compare your online` / `ordering costs`

✅ **Same structure** — two lines, `<br />` between, the second in `ORANGE`.

## 1.a The comment records all three wordings, so this does not cycle a fourth time

This headline has now changed twice in two days, and **a comment recording only the current reason would
invite a third rewrite from someone who had not seen the first two.** So the site now carries the whole
sequence and, more usefully, **the test that connects them:**

> 1. *"How much of your takings / are you handing over?"* — **combative.** Implies the reader has been
>    careless with their own money.
> 2. *"What do your online / orders actually cost?"* — **a question.** "Actually" still carries an
>    insinuation, and a question invites the reader to answer it themselves before the page has.
> 3. *"Compare your online / ordering costs"* — **a plain statement of what the page does.**
>
> 🔴 **THE PRINCIPLE BEHIND ALL THREE MOVES:** this page's job is to be **believed**, and the figure
> carries the argument. **A headline that poses a question or implies a verdict COMPETES with the
> number.** A statement of what the page does gets out of its way.
>
> ⚠️ **If you find yourself rewording this again, check first that the new version is not arguing. That
> is what the last two were doing.**

⚠️ **I dropped the character-balance note that the previous version carried.** It said 19 against 21;
the new pair is 19 against 14. **The two lines are no longer close to equal, and I am not claiming they
balance** — the second line is now deliberately the shorter, quieter half, which suits a statement in a
way it did not suit a question. **That is a judgement made without seeing it rendered.**

---

# §2 — TASK 2: THE SAVING ANCHORS

## 2.a What changed

| band | was | now |
|---|---|---|
| under £80 | *no anchor* | *no anchor* — unchanged |
| £80–250 | 🔴 "about a month's public liability cover" *(band was £80–200)* | "a year's public liability cover" |
| £250–600 | 🔴 "a couple of festival pitch fees" *(band was £200–500)* | "a weekend pitch at a food festival" |
| £600–1,200 | 🔴 "a season of pitch fees" *(band was £500–1,000)* | "a couple of festival pitches" |
| £1,200–2,500 | "a new fryer and griddle" *(band was £1,000–2,000)* | "a new fryer and griddle" |
| £2,500–5,000 | "a full refit of your serving counter" *(band was £2,000–4,000)* | "a full refit of your serving counter" |
| £5,000–12,000 | "a deposit on another van" *(band was £4,000–8,000)* | "a deposit on a second van" |
| £12,000+ | "another van on the road" *(band was £8,000+)* | "a second van on the road" |

**Every boundary moved, not only the three whose wording changed** — the bands were widened across the
board, so a saving that used to earn "a season of pitch fees" at £600 now earns the more modest "a couple
of festival pitches".

## 2.b 🔴 THE PROVENANCE IS IN A COMMENT ABOVE THE FUNCTION, AND IT IS EXPLICIT ABOUT WHAT WAS *NOT* CHECKED

Recorded at the site, in these terms:

- **PUBLIC LIABILITY:** roughly **£50–500 a year** for UK street food, **typically about £150** for a sole
  trader working events. 🔴 **The old band said "about a month's cover" for £80–200 — out by about 10x,
  and in the direction that makes our own saving look trivial.**
- **FESTIVAL PITCHES:** a standard 3-day pitch is **around £550**, a premium one **around £800**, day
  rates **from about £128**. 🔴 **The old bands called £200–500 "a couple of pitches" and £500–1,000 "a
  season" — both overstated what the money buys, the second badly.**
- **Checked August 2026.**

🔴 **AND THE HONEST HALF, WHICH IS THE PART THAT MATTERS MOST:** the comment states plainly that **the
equipment and van figures are ESTIMATES and have not been verified**, and instructs the next person not
to treat the table as uniformly sourced — *"if one of those is challenged, check it rather than defending
it."*

⚠️ **Without that line the checked bands would lend false authority to the unchecked ones**, which is
exactly how a table becomes "sourced" by association.

**Why any of this matters:** an operator knows what a pitch and a year's insurance cost far better than
we do. **A wrong anchor does not read as a rounding error — it reads as the whole page being invented**,
on a page whose only job is to be believed.

## 2.c ✅ THE SHAPE IS UNCHANGED

```
  function anchor(v: number): string | null     ← signature, unchanged
  const anch = good ? anchor(m.saveY1) : null   ← the single call site, unchanged
  if (v < 80) return null                       ← null-below-threshold, unchanged
```

**Bands and strings only**, as instructed. The comment says so too, so the shape is not tidied later.

---

# §3 — THE BOUNDARY EXERCISE

`anchor()` was **extracted verbatim from the page** and its types stripped by the TypeScript compiler
(not a regex — a regex ate a parameter on an earlier task and produced a confident wrong table).

```
   saving     anchor()
   ---------  ----------------------------------------
       79     null  (no anchor)
       80     "a year's public liability cover"
      249     "a year's public liability cover"
      250     "a weekend pitch at a food festival"
      599     "a weekend pitch at a food festival"
      600     "a couple of festival pitches"
     1199     "a couple of festival pitches"
     1200     "a new fryer and griddle"
     2499     "a new fryer and griddle"
     2500     "a full refit of your serving counter"
     4999     "a full refit of your serving counter"
     5000     "a deposit on a second van"
    11999     "a deposit on a second van"
    12000     "a second van on the road"
```

✅ **Every one of the fourteen probes matches your table exactly.**

## 3.a ✅ AND AN EXHAUSTIVE WALK, BECAUSE FOURTEEN PROBES CANNOT PROVE THE ABSENCE OF A GAP

Fourteen samples show the boundaries are right **where I looked**. To show there is no gap, overlap or
duplicated band **anywhere**, every integer from 0 to 13,000 was evaluated and the points at which the
returned string changes were collected:

```
   observed: [80,250,600,1200,2500,5000,12000]
   expected: [80,250,600,1200,2500,5000,12000]
   => exactly the 7 declared boundaries, no gap, no overlap, no duplicate band: true

   the 7 non-null bands are all distinct: true
   below the threshold anchor(0..79) is null throughout: true
```

⚠️ **The value changes at exactly seven points and nowhere else**, which is the property "no gap and no
overlap" actually means. **A band that silently duplicated its neighbour's string would have shown as a
missing change point; one that was unreachable would have shown the same way.**

---

# §4 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Boundaries | 14 probes on the real function, types stripped by `tsc` | ✅ **all match** |
| No gap / overlap / dead band | exhaustive walk 0–13,000 | ✅ **7 change points, exactly the declared ones** |
| Bands distinct | set comparison | ✅ **7 of 7** |
| Null below threshold | `anchor(0..79)` | ✅ **null throughout** |
| Shape unchanged | signature, call site, null branch | ✅ **all three identical** |
| Change confined | comment-stripped diff | ✅ **7 band lines + 2 headline lines** |
| Scope | mtimes | ✅ **only `CostComparison.tsx`** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §5 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **Neither the new headline nor any anchor
   has been seen on screen.**
2. 🔴 **THE HEADLINE'S TWO LINES ARE NOW UNEVEN — 19 characters against 14 — AND I DID NOT CHECK THAT
   AGAINST THE RENDERED FACE.** The previous version carried a balance note; I removed it rather than
   restate a claim I have not tested. ⚠️ **Character count is a poor proxy for width in a bold display
   face at `md:text-5xl`, and this is the change most likely to need a second look.**
3. ⚠️ **The equipment and van figures are unverified** (2.b) — stated in the code, repeated here so it
   is not lost between the two. **Three of the seven bands rest on estimates.**
4. ⚠️ **The insurance and pitch figures are as supplied in the brief.** I recorded them and the reasoning
   about the old bands being 10x out; **I did not independently source them**, and the comment dates them
   August 2026 so a later reader knows when to re-check.
5. ⚠️ **No anchor has ever been produced by a real calculation on this page** — the function has been
   exercised directly, but the page has never run end to end, so `anchor(m.saveY1)` has never been called
   with a figure the calculator produced.
6. ⚠️ **Everything else carries forward:** the `.hg-landing` chrome scoping unrendered, the bracket
   background uncompiled, the range focus ring, 375px behaviour, the new nav anchors unfollowed, and the
   gate, which has still never fired.
