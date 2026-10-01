# Trading days off the "Yes" path, a weekly figure, one word of vocabulary — and the deploy

**1 October 2026 · follows [the no-system build](compare-no-system-report.md), which is unchanged**

Three sanctioned changes and nothing else. `app/compare/page.tsx` and `app/landing/layout.tsx` are still
untouched (`git diff` empty on both) — and for the record, as instructed: **the pricing/admin gates were
deliberately removed on 3 September 2026, the page is public by decision, and I have not restored them.**

No span of the brief arrived garbled and no instruction contradicted another. One of its premises turned
out not to apply, which §4 below sets out in full rather than quietly working around.

---

## 1 · The trading-days question leaves the "Yes" path

**Hidden entirely on Yes, present on No exactly as built** — same position, same default of 4, same helper
text. ⚠️ **Hidden, not disabled**, the same treatment the fee question gets on the other path: a greyed-out
card reads as a question the operator has failed to answer. ⚠️ **`days` is not reset**, matching the fee
question's behaviour, so switching back to "No" restores what was chosen rather than returning it to 4.

🔴 **Why it had to go rather than stay harmlessly:** the Yes result is framed **per week** now, so nothing
on that path divides by days. The answer would have been collected and never used — a tap that changes
nothing on screen.

**Numbering, both paths 1–6, computed as before:**

| | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| **Yes** | online orders now? | trucks | people | orders/month | **pay per order** | months free |
| **No** | online orders now? | trucks | people | *would* take online | **trading days** | months free |

🧪 Asserted as number→title pairs on both paths, **and from both sides**: the days card is absent on Yes
and present on No. A check that only counted to six would pass with the card still rendered under a
duplicate number.

---

## 2 · The "costs more" result is per week

> Everything HatchGrab does, for
> # £3.21
> **more a week**
> £13.90 a month more than now

```
perWeek = (oursMonthly − theirsMonthly) × 12 / 52
```

⚠️ **It is `perTradingDay` with the days step left out** — × 12 ÷ 52 and stop. Same calendar reasoning:
`monthly / 4` would understate the weekly figure by ~8.3%, in our favour. Amounts under £1 still render as
whole pence through the same `money()` rule.

**Sub-line** carries no "Based on N days" clause — there is no N on this path. With more than one van the
per-van wording moves **into** the phrase rather than being appended: *"£13.90 more per van a month than
now"*, which fixes the awkward *"…more than now per van"* reading flagged in §9 of the previous report.

🔴 **The coffee threshold is unchanged and `COFFEE_MAX_PER_DAY` is deliberately not renamed.** It is the
price of a coffee, not a statement about which period the figure covers. On this path the headline is
**weekly**, so the line appears only when the whole weekly difference is under £3.00 — a stricter test than
the No path's, and the claim stays true at either. 🧪 At £3.21 it is correctly **absent**.

Everything else on this result is as built: monthly grey box, free-months line, "Your month on HatchGrab"
card, slate not orange, no % line, and **"About the same" untouched**.

---

## 3 · The No path's multi-van sub-line

Unchanged. 🧪 *"Based on 4 days a week · £38.90 a month per van"*.

---

## 4 · 🔴 The vocabulary fix — and why there was no pinned line to update

`across {fleet} trucks` → **`across {fleet} vans`** in the grey before/after box, the one place in the
results still saying "trucks" against "Across N vans" in both breakdown cards.

**Component, before → after:**

```diff
- <p className="mt-2 text-right text-xs text-slate-400">across {fleet} trucks</p>
+ <p className="mt-2 text-right text-xs text-slate-400">across {fleet} vans</p>
```

### The brief expected this to change case (d)'s pinned literal. It does not, and here is the evidence

> *"This IS a change to the saving card that case (d) pins. I approve exactly this one string change:
> update the pinned literal in scripts/compare-no-system.cjs for it only…"*

🔴 **That line never renders in case (d), because case (d) is a SINGLE VAN.** The fleet note is guarded by
`{fleet > 1 && (…)}`. So:

- the pinned `D_EXPECTED` literal **did not contain the string**, before or after — there was nothing in it
  to update, and I changed **no character** of it;
- 🧪 **case (d)'s diff against the pre-edit baseline is still EMPTY**, all 36 lines;
- 🧪 and the whole of case (d)'s rendered text contains **zero** occurrences of `across`.

```
$ diff d-card-before.txt d-card-after.txt
✅ EMPTY — no other difference
$ grep -c 'across' case-d-after.txt
0
```

**Item 4 said any other difference in the case (d) diff is a failure. There is no difference at all**, so
there is nothing to stop over — but the instruction rested on a premise about where that string renders,
so it is corrected here rather than silently satisfied.

### What I did instead, so the new wording is actually protected

The string was pinned **nowhere** in the harness — it only appears above one van, and every existing check
ran at one. Two checks now pin it at three vans, on **both** cards that share the box:

```js
t('🔴 (e) the grey box says "across 3 vans", never "trucks"', …)
t('🔴 (e) …and so does the SAVING card at 3 vans', …)
```

The second matters: the dearer card and the saving card render the same box, so pinning only the dearer
path would have missed a revert on the one card case (d) exists to protect. **V7** reverts the string and
is caught.

---

## 5 · The harness

**49 checks (was 42), 7 broken variants, all caught.**

| Variant | What it breaks |
|---|---|
| **V1** | *the No path's* per-day divisor goes back to `÷ 4` — re-scoped, since that is the only per-day figure left |
| V2 | the coffee line loses its threshold |
| V3 | the No path shows a per-order figure of ours |
| V4 | amounts under £1 render as `£0.80` |
| V5 | the dearer path goes back to "% more in your first year" |
| **V6** | the days question is shown on the Yes path |
| **V7** | the grey box goes back to "across N trucks" |

Check (c) is rewritten to the weekly framing, with the coffee line's absence asserted. A new check covers
a sub-£1 weekly difference.

> ⚠️ **THE SUB-£1 FIXTURE FAILED FIRST, AND WHAT IT TAUGHT IS WORTH THE LINE.** My first attempt set
> £1,500 at 2.42% and expected pence; it rendered a **saving**. `dearer` is decided on **year one**, not on
> the monthly difference — and with one month free, year one is £319 against their £342, so the page was
> right and the fixture was wrong. It is £1,500 at 3.4% **with months-free at 0** now: theirs £28.50
> against our £29.00 → **50p a month → 12p a week**, and the `FREE(0)` patch carries a comment saying why
> it is load-bearing.

---

## 6 · Verification

### The checks, re-run with numbers

| Case | Expected | Measured |
|---|---|---|
| **(a)** No, 1 van, £2,500, 4 days | unchanged | **£2.24 a trading day** · *"Based on 4 days a week · £38.90 a month"* · coffee shown · first month on us ✅ |
| **(b)** No, £12,000, 2 days | coffee absent | **£132.95 a month → £15.34/day**, coffee **absent** ✅ |
| **(c)** Yes, 2.5% + 20p incl., £2,500 | £3.21, more a week | **£3.21** · **"more a week"** · *"£13.90 a month more than now"* · grey box **£25.00 a month** vs **£38.90 a month** · no "% more" · no "You'd pay extra" · **coffee absent** (3.21 ≥ 3.00) · nothing says "a trading day" ✅ |
| **(d)** Yes, 4.5% + 20p incl., £2,500 | saving card unchanged | **diff EMPTY, 36 lines** ✅ |
| **(e)** 3 vans, both paths | per-van + fleet | No: **£2.24**, *"£38.90 a month per van"*, *"Across 3 vans £116.70 a month"*, card ~£212.50 · Yes-dearer: **£3.21 more a week**, *"£13.90 more per van a month than now"*, **"across 3 vans"** ✅ |

### Layout — 3-van states on both paths, 375px and 1440px, Chromium and WebKit

**8 states × 2 widths × 2 engines = 32 measurements, 0 failures.** No horizontal scroll
(`scrollWidth === clientWidth`), no element wider than the viewport, headline on one line everywhere.

| state | hero | sub-line at 375 | sub-line at 1440 |
|---|---|---|---|
| No, 3 vans | `£2.24` 92px, 1 line | *"…£38.90 a month per van"* **2 lines** | 1 line |
| No, 9 vans, 1 day, £12,000 | `£30.68` 76px, 1 line | *"…£132.95 a month per van"* **2 lines** | 1 line |
| Yes-saving, 3 vans | `£1,416` **76px**, 1 line | — | — |
| Yes-dearer, 3 vans | `£3.21` 92px, 1 line | *"£13.90 more per van a month than now"* **1 line** | 1 line |

⚠️ **The two-line sub-lines are clean wrapping inside the card, not overflow** — the figure and its unit
stay together and nothing crosses the viewport edge. The 76px rows are `heroSizeFor` doing its job.

### The rest

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully**, 96 static pages |
| `node scripts/compare-no-system.cjs` | **49 passed**, 7 variants all caught |
| `node scripts/run-harnesses.cjs` | **76 run · 76 passed · 0 failed** |
| goldens | `8bdae817748ad334…`, `e3f0a88099fd797c…` — **unchanged** |
| eslint, `CostComparison.tsx` | **1 warning, identical to HEAD** (`PLAN_ONLINE_ALLOWANCE` unused — pre-existing) |
| `app/compare/page.tsx`, `app/landing/layout.tsx` | **`git diff` empty on both** |

> ⚠️ **ONE SELF-INFLICTED BUILD BREAK, RECORDED BECAUSE THE FILE ALREADY WARNED ME.** I put the vocabulary
> comment directly after `{fleet > 1 && (`, which makes it an **expression, not a child**, and tsc failed
> with *"Expected corresponding JSX closing tag"*. The staff question's own comment, a few hundred lines
> above in this same file, says exactly that in capitals. The comment sits above the guard now and says so.

---

## 7 · Deploy

See the commit and the production check in the chat reply — this section is written before the push and the
numbers above are all local.
