# Cost comparison — promoting the plan recommendation

**Date:** 24 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` not run by me.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`** — question 2's recommendation, plus the
state the override needs. **Nothing in `lib/` was touched.** The hero panel, the figure, the two-year
line, `YearLine` and cards 1, 3, 4 and 5 are all byte-identical (§5).

---

# §1 — TASK 1: PARALLEL WORDING

✅ `"Pro covers it."` is gone. **Both variants now read the same way** — and because Task 2 splits the
sentence into an eyebrow and a name, `"We suggest"` is rendered **once, as a label**, with the plan name
below it. The two cases differ only in the name, which is the parallelism you asked for made structural
rather than repeated in prose.

---

# §2 — TASK 2: THE PANEL

```
   ┌─────────────────────────────────────────────────────────┐  #F8FAFC, rounded-xl, px-5 py-4
   │  WE SUGGEST                          <- xs, uppercase   │  full width inside the card
   │  Max                                 <- text-2xl black  │
   │  £49 per truck per month, with £2,000 of online orders   │  <- text-sm body
   │  included on each. Everyone gets their own login.        │
   │  Use Pro instead                     <- text button      │
   └─────────────────────────────────────────────────────────┘
```

✅ **Fill, rounding and padding are the hero context panel's exactly** — `#F8FAFC`, `rounded-xl`,
`px-5 py-4` — so the two read as the same kind of object.

🔴 **NO GRID TEMPLATE AND NO WIDTH CLASS.** A scan of the block for `grid*` and for
`w-` / `max-w-` / `min-w-` / `inline-block` tokens returns **NONE of either**. It is plain block flow with
one text button. **The pattern that collapsed twice in this file is not present.**

✅ **Full width, deliberately, and by doing nothing.** Unlike the hero panel there is no centring wrapper
and no width — a block in a left-aligned card is already full width, and **adding a width would be the
exact mistake that broke the hero twice.**

---

# §3 — TASK 3: THE OVERRIDE

## 3.a THE STATE, AND WHY IT IS NULLABLE

```ts
const [planOverride, setPlanOverride] = useState<'pro' | 'max' | null>(null)

const suggestedKey: 'pro' | 'max' = staff === 2 ? 'max' : 'pro'
const activeKey = planOverride ?? suggestedKey
const isMax = activeKey === 'max'
const tier = isMax ? PLANS.max : PLANS.pro          // ← unchanged below this line
```

🔴 **THREE STATES, NOT TWO: not chosen / chose Pro / chose Max.** A boolean could not tell *"they have
not chosen"* from *"they chose the plan we suggest"* — and **the eyebrow says something different in each
case**, so collapsing it would have made the panel claim a decision the operator never made.

## 3.b ✅ THE CHOSEN PLAN DRIVES EVERY DOWNSTREAM FIGURE — PROVEN, NOT ASSERTED

I did not eyeball this. A scan of the memo body shows it references **exactly two plan-dependent values**:

```
  memo references plan       1×      memo references tier         0×
  memo references allowance  1×      memo references isMax        0×
  deps: [gmv, feePct, feePence, plan, free, allowance, fleet]
```

🔴 **`plan` and `allowance` are the ONLY plan-derived inputs to the whole calculation, and both are in
the deps array.** Both are computed from `tier`, which is computed from `activeKey`. So the override
reaches every figure on the page — the memo, the hero, both year lines, the overage maths — **without a
single further edit**, and React recomputes because the deps genuinely change (§4 shows `plan` moving
29 ↔ 49 and `allowance` 1500 ↔ 2000).

## 3.c 🔴 THE RESET — EXERCISED, NOT DESCRIBED

`onClick={() => { setStaff(o.v); setPlanOverride(null) }}` on **both** answer buttons.

```
  start                      staff=2 override=pro  -> active Pro, plan=29
  press "Two or more" AGAIN  staff=2 override=null -> active Max, plan=49   OVERRIDE CLEARED
  start                      staff=1 override=max  -> active Max, plan=49
  press "Two or more"        staff=2 override=null -> active Max, plan=49   OVERRIDE CLEARED
```

⚠️ **IT RESETS ON EVERY PRESS, INCLUDING PRESSING THE ANSWER ALREADY SELECTED.** That is deliberate:
pressing an answer is the operator asserting the answer, and the suggestion must be current with it.
Without this, someone who switched to Pro and then changed their answer would be shown **"Your choice:
Pro" with every figure computed on Pro — a stale decision presented as a current one**, taken from an
answer they had just replaced.

## 3.d ✅ A THIRD RESET PATH I ADDED AND AM FLAGGING

Switching **back** to the suggested plan **clears** the override rather than setting it:

```ts
const other = isMax ? 'pro' : 'max'
setPlanOverride(other === suggestedKey ? null : other)

  staff=2, override=pro, press "Use Max instead"  ->  override=null, eyebrow "We suggest"
```

⚠️ **You did not ask for this.** Without it, returning to our own suggestion would leave the eyebrow
reading **"Your choice"** — technically true but it stops the panel ever saying "We suggest" again, which
is the label doing the work. **One line; say if you would rather it stayed "Your choice".**

## 3.e THE AFFORDANCE

✅ **A text button, not a second pair of large buttons** — `text-sm font-semibold`, orange, underlined,
reading **"Use Pro instead"** / **"Use Max instead"** (name from `PLANS.pro.name` / `PLANS.max.name`, not
a literal). Two large buttons here would compete with the answers directly above and turn one question
into two. ⚠️ The underline is correct **here** — unlike the two-year line, this one genuinely is an
affordance.

## 3.f 🔴 THE MISLEADING-OVERRIDE NOTE — WORDING AS CHOSEN

> **Pro does not include separate logins — everyone shares one account.**

Shown when `staff === 2 && !isMax`, i.e. **only** when someone answered "Two or more" and is running the
figures on Pro. `text-sm text-slate-500`, sitting under the price line.

🔴 **DELIBERATELY NOT A WARNING BOX** — no border, no icon, no colour, no amber. The operator made this
choice on purpose and does not need to be alarmed out of it; **they need to not be surprised later.** I
added "everyone shares one account" to the end because "does not include separate logins" alone states
the absence without saying what they get instead.

---

# §4 — EVERY STATE, EXERCISED

## 4.a THE FOUR SUGGESTION VARIANTS, RESOLVED THROUGH THE CONSTANTS

```
  1 truck  · One     WE SUGGEST / Pro
                     £29 per truck per month, with £1,500 of online orders included.
  1 truck  · Two+    WE SUGGEST / Max
                     £49 per truck per month, with £2,000 of online orders included.
                     Everyone gets their own login.
  3 trucks · One     WE SUGGEST / Pro
                     £29 per truck per month, with £1,500 of online orders included on each.
  3 trucks · Two+    WE SUGGEST / Max
                     £49 per truck per month, with £2,000 of online orders included on each.
                     Everyone gets their own login.
```

🔴 **NO LITERAL CREPT IN.** A grep for `£29`, `£49`, `£1,500`, `£2,000`, `£1500`, `£2000` finds **four
hits in the file and all four are inside comments** (one of them the warning telling the next person not
to hardcode these). **The table above was produced by reading `PLAN_MONTHLY_PENCE` and
`PLAN_ONLINE_ALLOWANCE` out of `lib/` and running the page's own `gbp`** — not by copying your brief.

## 4.b EVERY OVERRIDE STATE

```
  SUGGESTED PRO    eyebrow "We suggest"   Pro   plan=29  allowance=1500   button "Use Max instead"
  SWITCHED TO MAX  eyebrow "Your choice"  Max   plan=49  allowance=2000   button "Use Pro instead"
  SUGGESTED MAX    eyebrow "We suggest"   Max   plan=49  allowance=2000   button "Use Pro instead"
  SWITCHED TO PRO  eyebrow "Your choice"  Pro   plan=29  allowance=1500   button "Use Max instead"
                   + NOTE: Pro does not include separate logins — everyone shares one account.
```

✅ **`plan` and `allowance` change in every switch** — and by §3.b those are the only plan-derived
inputs the calculation has, so every downstream figure moves with them.
✅ **The note appears in exactly one of the four states**, the only one where it is true.
✅ **"Everyone gets their own login" tracks the ACTIVE plan, not the answer** — so a one-person operator
who switches up to Max is told they get it, which is correct.

---

# §5 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| Change confined | comment-stripped diff | ✅ **9 code lines out, 29 in** |
| Hero panel | 900-char forward window | ✅ **identical** |
| Figure, two-year line, `YearLine` | forward windows | ✅ **identical** |
| Cards 1, 3, 4, 5 | 600-char forward window each | ✅ **identical** |
| No grid template in the new panel | token scan | ✅ **NONE** |
| No width class in the new panel | token scan for `w-`/`max-w-`/`min-w-`/`inline-block` | ✅ **NONE** |
| Only `plan`/`allowance` are plan-derived memo inputs | memo body + deps scan | ✅ **§3.b** |
| Four variants, no literals | resolved from `lib/` constants | ✅ **§4.a** |
| Four override states | state machine transcribed 1:1 | ✅ **§4.b** |
| Reset | exercised as button presses | ✅ **§3.c** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **clean** |

⚠️ **TWO BUILD BREAKS ALONG THE WAY, BOTH MINE, BOTH CAUGHT BY THE PARSE:** a JSX comment placed directly
after `.map(o => (` — **expression position, not child position** — and then a comment whose own text
contained a nested comment terminator, which closed it early. **Both are recorded in the file so the
first one is not repeated.**

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** Everything above is the real derivation and the real strings, run
   outside a browser. **The panel has never been seen.**
2. 🔴 **THIS IS A NEW `#F8FAFC` PANEL IN A CARD THAT ALREADY HAS A WHITE FILL AND A BORDER**, sitting
   directly under two large orange-or-white answer buttons. **Whether a tinted block reads as "the
   result" there, or just as more furniture, is exactly what a browser settles** — and it is the entire
   point of the change.
3. ⚠️ **The `text-2xl` plan name has not been weighed against the card's own title.** If the name
   out-shouts the question above it, the card has two headings.
4. ⚠️ **The Max line is now four lines of text in one paragraph at 375px** — price, allowance, "on each",
   and the login clause. **Unmeasured, and it is the longest string in the card.**
5. ⚠️ **The text button has no hover or pressed styling beyond the inherited underline.** It has a focus
   ring; it has not been checked that it reads as pressable at rest.
6. ⚠️ **`suggestedKey` duplicates what `isMax` used to say** in one line of the file. It is used twice
   and I judged the name worth it — **but it is a second thing that must stay in step with question 2.**
7. ⚠️ **Carried forward:** the stale `YearLine` comment quoting question 2's old wording (still out of
   scope), the `mt-8` two-year separator, the zero-state £0 at 92px, 375px generally, and the gate,
   which has still never fired.
