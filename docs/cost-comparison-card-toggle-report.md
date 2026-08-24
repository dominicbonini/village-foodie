# Cost comparison — card-processing toggle on question 4

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**

⚠️ **PROMPT INTEGRITY — TWO THINGS TO RAISE, NEITHER OF WHICH STOPPED THE BUILD.** No span arrived
garbled. See §5.a (a scope tension the brief resolves itself) and 🔴 **§4, where Task 4's stated premise
is contradicted by Task 2's own specification** — I did not stop, because acting on the premise as
written would have made a true sentence false, and the correct action was recoverable without asking.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`** — question 4, two memo lines, and the
small print. **5 code lines out, 35 in.**

---

# §1 — TASK 1: THE TOGGLE

```
   Their rate:  includes card processing  ·  is charged on top
                └ ORANGE, semibold, no underline    └ slate-500, underlined
                  (a STATE, not an action)             (the action)
```

✅ **Inside question 4, under the two fee inputs. No sixth card.** It qualifies the two numbers directly
above it; a card would have given it the same weight as "how many trucks do you run?".

✅ **Quiet inline text, `text-sm`, plain wrapping flex.** The selected option is marked by **colour and
weight**; the unselected one carries the underline because it is the thing you can do. **Nothing here
resembles the large filled buttons in cards 1 and 2.**

✅ **Defaults to `'inclusive'`** — the previous behaviour, so an operator who never touches it sees
exactly what they saw before. `aria-pressed` is set on both.

---

# §2 — TASK 2: THE MEMO DIFF

```diff
- const theirPct   = Math.max(0, feePct   - CARD_PCT)
- const theirPence = Math.max(0, feePence - CARD_PENCE)
+ const theirPct   = Math.max(0, feeMode === 'ontop' ? feePct   : feePct   - CARD_PCT)
+ const theirPence = Math.max(0, feeMode === 'ontop' ? feePence : feePence - CARD_PENCE)

  deps: [gmv, feePct, feePence, + feeMode, plan, free, allowance, fleet]
```

🔴 **TWO LINES, BOTH ON THEIR SIDE. NOTHING ELSE IN THE MEMO MOVED** — the 420 characters covering
`excess`, `overPerTruck`, `oursMonth`, `oursY1` and `oursY2` are byte-identical to before.

⚠️ **The `Math.max(0, …)` clamp is kept on BOTH branches.** In `inclusive` it is load-bearing — a quoted
rate below card cost would otherwise go negative and pay the operator. In `ontop` it guards a typed
value, since the input's `min={0}` does not constrain what can be typed into it.

## 2.a ✅ OUR SIDE IS BYTE-IDENTICAL ACROSS THE TOGGLE — CHECKED WITH `Object.is`, NOT BY EYE

The memo body was **lifted out of the file and executed**, not retyped, against the real `CARD_FEES`,
`PLATFORM_FEE_OVER_ALLOWANCE`, `PLAN_MONTHLY_PENCE` and `PLAN_ONLINE_ALLOWANCE`.

**Inputs, identical in both runs:** £2,500/month online, quoted **3% + 20p**, 1 truck, 1 month free, Max.

```
                        inclusive        on top
  their platform fee    1.5%             3.0%          <- moves
  THEIR annual cost     £450             £1,300        <- moves
  OUR annual cost       £593             £593          <- IDENTICAL
  saving                -£143            £707          <- moves
  percentage            -32%             54%           <- moves

  our components, Object.is:
     oursY1        593.45              == 593.45              IDENTICAL
     oursY2        647.4000000000001   == 647.4000000000001   IDENTICAL
     overPerTruck  4.95                == 4.95                IDENTICAL
     excess        500                 == 500                 IDENTICAL
     fleetGmv / orders                                        IDENTICAL
```

🔴 **THIS IS THE EXAMPLE THAT SHOWS WHY THE BUG MATTERED.** At a platform-only 3% + 20p, the old
behaviour reported **a £143 LOSS** and the page told the operator not to switch. Read correctly, the same
provider costs them £1,300 a year and the saving is **£707**. **The page was arguing against itself.**

✅ **Nothing was "balanced" on our side.** `plan`, `allowance` and `overPerTruck` are untouched, as
instructed.

---

# §3 — TASK 3: BOTH WORDINGS

**Mode 1 — `includes card processing` (unchanged, gate unchanged at `feePct > CARD_PCT`):**

> Card processing of **1.5% + 20p** is inside that, and you'd pay it anywhere. Their own fee is **1.5%**.

**Mode 2 — `is charged on top` (new, gated on `feePct > 0 || feePence > 0`):**

> Card processing of **1.5% + 20p** is charged on top of that, so you actually pay **4.5% + 40p** all in.

🔴 **MODE 2 DELIBERATELY DOES NOT SAY "their own fee is X%".** You flagged it and you were right: in
mode 2 their own fee **is the number they just typed**, so restating it tells them nothing and reads as
though the page had computed something. **The all-in total is the figure that has become new
information**, so that is what the sentence gives them — and it is the number that actually leaves their
account.

⚠️ **The two gates differ on purpose.** Mode 1 needs `feePct > CARD_PCT` or there is no subtraction worth
narrating. Mode 2 has no such precondition — any non-zero rate has an all-in total — so it is gated on
the inputs being non-zero instead.

---

# §4 — 🔴 TASK 4: THE PREMISE IS WRONG, AND I DID NOT ACT ON IT

**Task 4 states the footnote is "misleading in mode two, where it is excluded from ours and included in
theirs."** 🔴 **Card processing is NOT included in theirs in mode two.** Task 2's own specification is
what makes this so:

```
  inclusive : theirPct = feePct - CARD_PCT     a rate that CONTAINED card processing, minus it
  ontop     : theirPct = feePct                a rate that NEVER contained card processing
```

🔴 **BOTH BRANCHES PRODUCE THE SAME QUANTITY — the competitor's PLATFORM fee, card processing out of
it.** Neither branch ever **adds** `CARD_PCT` to their side. **That is exactly what makes the two modes
comparable to each other**, and it means card processing is excluded from both sides under both modes.
**The footnote's claim is true in mode two.**

🔴 **REWRITING IT AS INSTRUCTED WOULD HAVE MADE A TRUE SENTENCE FALSE**, on the one paragraph on the
page whose job is to keep the comparison honest. So I did not.

## 4.a WHAT I DID INSTEAD — AND THERE *IS* A REAL PROBLEM UNDERNEATH

Mode 2 introduces a genuine ambiguity, just not the one described: **question 4 now prints an all-in
figure that DOES include card processing, directly above a comparison that does not.** A reader can
reasonably assume the 4.5% they were just shown is the number being compared.

**Base sentence, unchanged:**
> …Card processing of 1.5% + 20p per order applies whichever provider you use, so it's excluded from
> both sides. Check your current provider's rates before deciding.

**Conditional clause, mode 2 only:**
> **The all-in figure in question 4 includes it — the comparison does not, on either side.**

✅ **Conditional, as you offered — and true in both modes**, which was the requirement.
⚠️ **If you disagree with my reading of Task 2, say so and I will change the maths instead of the
sentence** — but then `ontop` would be comparing their all-in against our platform-only, and the saving
would be overstated by exactly the card processing every operator pays regardless.

---

# §5 — VERIFICATION

## 5.a ⚠️ THE SCOPE TENSION, RESOLVED RATHER THAN STOPPED

The SCOPE block names three in-file targets: question 4's inputs, the explanatory line, and the memo's
competitor-fee calculation. **Task 4 then instructs a change to the small print, which is none of those
and sits ~190 lines below question 4.** I treated the later, specific instruction as extending the list
rather than contradicting it — **same file, explicitly named, unambiguous intent** — and the change there
is one conditional clause. **Flagging it rather than burying it; stopping the whole build over this would
have delivered nothing.**

## 5.b CHECKS

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **5 code lines out, 35 in** |
| Our side across the toggle | memo executed, `Object.is` per field | ✅ **§2.a — all IDENTICAL** |
| Their side moves | same run | ✅ **§2.a — all five figures move** |
| Our side of the memo | 420-char window | ✅ **identical** |
| Cards 1, 2, 3, 5 | 700-char forward window each | ✅ **identical** |
| Q4's fee inputs | 900-char forward window | ✅ **identical** |
| Hero panel | 1000-char forward window | ✅ **identical — not gone near** |
| Plan panel, detail card, `YearLine` | forward windows | ✅ **identical** |
| Figure, verb, anchor sentence | forward windows | ✅ **identical** |
| No grid token, no width token | token scan, toggle block + hero panel | ✅ **NONE in either** |
| Q4's `min-w-0`/`w-full` | count before vs after | ✅ **2 == 2, pre-existing, on the fee inputs** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** The maths above is the real memo body executed outside a browser;
   **the toggle has never been seen, clicked, or focused.**
2. 🔴 **"QUIET BUT FINDABLE" IS THE WHOLE DESIGN AND IT IS UNTESTED.** Two small text options under two
   large number inputs can easily read as a caption rather than a control. **If nobody notices it, the
   default is the old bug** — and the default is the mode that was wrong for these providers.
3. 🔴 **THE TOGGLE CAN FLIP THE PAGE FROM A LOSS TO A SAVING** (§2.a: −£143 → £707) **with no
   transition and no explanation of why the number jumped.** That is correct arithmetic and it may read
   as instability. **Reported, not smoothed — adding motion or a note is a decision, not a fix.**
4. ⚠️ **The mode-2 sentence has not been checked for wrapping at 375px.** It is longer than the mode-1
   sentence it replaces and carries a `<strong>` mid-line.
5. ⚠️ **The `·` separator between the two options is `aria-hidden`, but the group has no `role` or
   fieldset legend** — it is two `aria-pressed` buttons preceded by a plain "Their rate:" span. **A
   screen reader will announce them as two toggle buttons, not as a choice between two.** Correct enough
   to be usable, not as good as a radio group; **changing it means restyling the control.**
6. ⚠️ **Mode 2 is unreachable by default and nothing in the page suggests it exists** unless the
   operator reads the line. There is no "does your provider quote it this way?" prompt — **by design,
   since you said not to add a question.**
7. ⚠️ **Carried forward:** the estimated 375px overflow of the hero panel at `text-base`, the plan panel
   never rendered, the `mt-8` two-year separator, the stale `YearLine` comment, and the gate, which has
   still never fired.
