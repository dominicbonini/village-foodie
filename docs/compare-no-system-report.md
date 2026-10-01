# /compare: a path for trucks with no system, and a cost reframed per trading day

**1 October 2026 · built on `ea0bf9c` · `app/compare/CostComparison.tsx`**
**Not deployed. It is ready.**

No price literal was added, no pricing module changed, and `app/compare/page.tsx` and
`app/landing/layout.tsx` are untouched — `git diff` on both is empty.

---

## 🔴 0 · READ THIS FIRST — ONE SPAN OF THE BRIEF DESCRIBES A STATE THAT NO LONGER EXISTS

The brief's KEEP UNCHANGED list opens with:

> The server/client split and **BOTH gates** (landing admin gate + "renders only when pricing is
> published OR viewer is admin"). Any copied gate redirects to /contact, never to /.

🧪 **Neither of those two gates exists.** Both were removed on **3 September 2026** and survive only as
commented-out lines:

| Gate | Where the brief expects it | What is actually there |
|---|---|---|
| `if (!PRICING_PUBLISHED && !(await verifyAdmin())) redirect('/contact')` | `app/compare/page.tsx` | **removed**; present as a comment at `:94`, under a heading that reads *"THE PRICING-FLAG GATE WAS REMOVED HERE — 3 SEPTEMBER 2026. THE PAGE IS PUBLIC."* |
| `if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) redirect('/contact')` | `app/landing/layout.tsx` | **removed**; present as a comment at `:43` |

The **only live gate** on `/compare` is a brand check — `if (!(await onHatchGrab())) notFound()` — which
is a different mechanism (it answers "does this page exist on this host", not "may this viewer see
prices") and it uses **`notFound()`, not a redirect** to anywhere.

**I did not stop over this, and here is the reasoning.** The instruction is a constraint, not a task, and
it is satisfiable by **inaction**: every item 1–6 is inside the client component, so I touched neither
file and both are byte-identical to `HEAD` either way. Stopping would have delivered nothing in exchange
for a correction I can make in a paragraph.

🔴 **BUT IT IS WORTH YOUR ATTENTION, because the consequence is live.** If you believed `/compare` was
gated, it is not: **it shows the real, unmasked £29/£49 price list to anyone on a HatchGrab host**, by
deliberate decision three weeks ago (the landing now links to it publicly, and *"a gated page behind a
public link is a broken promise"*). That may be exactly what you want. If it is not, restoring a gate is
a one-line change to `page.tsx` — and it is a commercial decision, so I have not made it.

### Two smaller mismatches, flagged rather than guessed at

- **The brief names the formatter `b(x, 2)` and the zero test `g()`.** This file's are **`gbp(x, 2)`**
  and **`rendersAsZero()`**. I read those as the same two functions under different names and used the
  real ones; nothing in the file is called `b` or `g`.
- **Item 6's heading reads "HATCHGROB".** Taken as HatchGrab.

Nothing else arrived garbled, and no instruction contradicted another.

---

## 1 · The first question

> **1 · Do you take online orders now?**  ·  `Yes, with another system` | `No, not yet`

🔴 **No default, and `null` is not "yes".** The page assumed a current provider, so a truck with no
online ordering was asked *"What do you pay per order now?"*, had no answer, and was shown a saving
against the **4.5% we prefilled for them**. That is the page inventing the comparison it then wins — the
one thing a page whose only job is to be believed cannot do.

Three states, not two, for the same reason `planOverride` has three: a boolean cannot tell "has not
answered" from "answered no", and those two render **different pages**.

**The buttons are the STAFF question's buttons, class for class** — `px-4 py-4 text-base font-bold`.

> 🔴 **CORRECTED AFTER REVIEW (operator spotted it).** They shipped as `px-3 py-3 text-sm font-black`,
> and `font-black` is **900** against the **700** every other WORDED option on this page uses — so the
> two read as a heavier class of control than "One" / "Two or more" directly beneath them. 🧪 Measured
> computed weight, both engines: all four worded options now **700 / 16px / 16px padding**; the numeric
> buttons (trucks, trading days) keep **900**, because a single digit at 700 looks unset beside them.
> **The rule is: worded options match the staff buttons, digits match the truck buttons.**
>
> ⚠️ **AND MATCHING THE SIZE FORCED A SECOND, MEASURED CHANGE.** At `text-base` in a shared row these are
> 143px wide at 375px and *"Yes, with another system"* wrapped to **three lines** — a 108px-tall button
> against the 60px one below it. They now stack below 640px (`flex-col sm:flex-row`, the CTA pair's own
> pattern in this same file): 🧪 **293×60px, one line each, in both engines at 375px**, the same height as
> the staff buttons. 🧪 Case (d) re-checked afterwards and the saving card is **still byte-identical**.
Every card below is `disabled` (the existing 0.45 opacity) until it is answered, and the results block
and its scroll link are gated on it as well as on `staff`.

**Numbering is computed, not written.** One `STEP` object; `n={STEP.x}` at each call site. The No path
hides question 5 entirely, so hard-coded numbers would read 1, 2, 3, 4, 6, 7 — a gap that looks like a
missing question. `Card`'s `n` prop became a `number` to carry it.

🧪 Measured, both paths, as number→title pairs: **No path 1-2-3-4-5-6**, **Yes path 1-2-3-4-5-6-7**.

---

## 2 · Trading days

> **How many days a week do you trade?** · seven buttons, default **4** · *"Events, markets, pitches —
> any day the van's out."*

Seven buttons rather than a slider or a select: seven is few enough to show, and one tap beats dragging
for a value an operator knows exactly. Its **position differs by path** so that on both it is the last
thing asked before the offer — after the fee question on Yes (step 6), after the orders question on No
(step 5). Months free stays last on both.

---

## 3 · The "No, not yet" path's questions

- **"What do you pay per order now?" is hidden entirely**, with its toggle and both sentences — not
  disabled. A greyed-out card still reads as a question they have failed to answer, and leaving the
  toggle behind would put a competitor's fee model on a page just told there is no competitor.
  ⚠️ **The state is not reset**: switching back to "Yes" restores what was typed.
- **The orders question is reworded**, slider, range, step and "~N orders" untouched:
  *"How much do you think you'd take online, per month, per truck?"* /
  *"A rough guess is fine — pre-orders and queue-skippers, not cash or card at the window."*
- **The intro**, both paths: *"Takes about a minute. Already using a system? We'll compare it. Not yet?
  We'll show you exactly what it costs."* 🔴 It used to promise *"what a year on HatchGrab would save
  you"* — a claim the page cannot keep for a truck with nothing to save against, and could not keep on
  the Yes path either when we come out dearer.
- **The scroll link** reads *"See what it costs ↓"* on No, *"See your saving ↓"* on Yes.

---

## 4 · The shared figures

```
oursMonthlyPerTruck = plan monthly + max(0, monthly orders − allowance) × platform fee %
perTradingDay       = monthlyAmount × 12 / 52 / days
```

🔴 **`× 12 ÷ 52`, NEVER `÷ 4`.** A month is not four weeks. `monthly / 4 / days` understates every
per-day figure by about **8.3%** (52/48) — an error **in our favour**, on the one number this page asks
an operator to judge us by. The monthly amount becomes a weekly amount against the real number of weeks
in a year, and only then is divided by the days the van is out. A broken variant puts `÷ 4` back and is
caught.

**Money to the penny, except under £1.** `money()` delegates to the existing `gbp(x, 2)` for everything
and returns whole pence below a pound, so "80p" rather than "£0.80". Rounded on the pence, not truncated
— truncation would render £0.999 as "99p" directly under a line reading "£1.00".

**The coffee line** shows only when the headline per-trading-day figure is under the threshold, and
**renders nothing in its place** above it. One named constant:

```ts
// 🔴 UK high-street coffee is ~£3.50+; keep the claim true.
const COFFEE_MAX_PER_DAY = 3.0
```

A weaker substitute ("less than a pint") would be a second claim to defend; an empty slot says nothing
untrue.

**Free months**: *"And your first month is on us."* / *"…first N months are on us."* / nothing at zero.

**Multiple vans**: headline figures are **per van**, the sub-line says "per van", and the breakdown adds
*"Across N vans: £X a month"*.

🔴 **The hero font size is now one shared rule.** It was two inline lines computing `heroDigits` for the
saving figure; three figures need it now, so it is `heroSizeFor(renderedString)` — sized from the string
on screen, because "80p" (3 chars) and "£1,234.56" (9) are a layout question, not a magnitude one.

`theirsMonth` and `oursMonth` are **returned from the memo again**. The note that stood there said they
were deliberately not returned because the deleted effective-rate line was their only reader — correct
at the time. The per-day framings read them now, so they are returned **with readers**.

---

## 5 · The "No, not yet" result

> Online ordering, pre-orders and your kitchen screen for
> # £2.24
> **a trading day**
> Based on 4 days a week · £38.90 a month
> ───
> **Less than a coffee.**
> And your first month is on us.

Then **"Your month, broken down"**: the plan line, the over-allowance line (or *"Online orders inside the
£1,500 included — £0.00"*), a rule, the bold orange total, the months-free line, the fleet line, and a
grey `#F8FAFC` inset for card processing.

🔴 **NEVER A PER-ORDER FIGURE OF OURS ON THIS PATH.** We charge a plan plus a percentage over an
allowance; dividing that by an order count would invent a per-order rate **we do not charge**, on the one
path where the operator has no per-order number of their own to check it against. 🧪 Asserted by counting:
exactly **one** "per order" appears in the results, and it is the card-processing line — the payment
provider's own fee, which item 5 requires and labels as theirs.

🔴 **And no saving language at all** — no "You save", no percentage, no anchor, no year-one/year-two
schedule. Asserted as an absence.

⚠️ **The card-processing inset is not added to our total**, sits below the rule so it cannot be read as
part of it, is derived from `CARD_FEES` only, and keeps the `~` hedge `lib/plan-features.ts` requires on
those rates. Its second sentence is the reason for showing it at all: an operator comparing us against
*nothing* needs to know the fee is not new money.

**Small print on this path** drops every clause that names a comparison it does not make and keeps the
two that are still true.

---

## 6 · The "Yes" path when HatchGrab costs more

> Everything HatchGrab does, for
> # 80p
> **more a trading day**
> Based on 4 days a week · £13.90 a month more than now

The grey box keeps its shape and switches to **monthly** figures; the divider, coffee line and free-months
line follow; the **"% more" line and the "You'd pay extra" label are gone**; and the year-one/year-two
card is replaced by **"Your month on HatchGrab"** — plan, over-allowance, bold total, then a slate line
naming the provider's own monthly fee.

🔴 **Why the year schedule had to go rather than stay underneath.** `YearLine` renders *"Extra £168 (19%
more)"* **twice**, in a larger size, immediately below the card that just stopped saying it. Reframing the
hero and leaving that would have moved the claim, not changed it. The comparison is still on the page —
as two totals a reader can subtract, rather than as a verdict we have drawn for them.

🔴 **The provider's fee is printed at the rate the comparison actually used** (`m.theirPct` — the platform
rate with card processing out of it), not the 4.5% typed into the box. Printing the typed figure would
name a rate the arithmetic above it does not use.

⚠️ **Slate, not orange.** Orange is for a figure in the operator's favour; orange here would be the page
cheering a cost. **"About the same" keeps today's behaviour**, and `heroVerb`'s third arm is kept —
deleting it would leave a ternary whose fallback silently labelled a dearer result "About the same".

---

## 7 · Verification — every check executed, with its numbers

### (a) No path · 1 van · One person · £2,500 · 4 days · 1 month free

| Expected | Measured |
|---|---|
| £2.24 a trading day | **£2.24** ✅ |
| £38.90 a month | **Based on 4 days a week · £38.90 a month** ✅ |
| breakdown £29.00 + £9.90 | **Pro plan £29.00** · **0.99% on the £1,000 above the £1,500 included £9.90** · **HatchGrab each month £38.90** ✅ |
| card processing ~£70.83 | **~£70.83** ✅ |
| coffee line shown | **"Less than a coffee."** ✅ |
| first month on us | **"And your first month is on us."** ✅ |

### (b) No path · £12,000 · 2 days

**£132.95 a month → £15.34 a trading day. Coffee line ABSENT** ✅, and nothing rendered in its place.

### (c) Yes path · 2.5% + 20p inclusive · £2,500 · 4 days

**"80p more a trading day"** ✅ · **"£13.90 a month more than now"** ✅ · grey box **£25.00 a month**
against **£38.90 a month** ✅ · no "% more" line, no "You'd pay extra" ✅ · *"Your current provider's own
fee (1%) — £25.00 a month"* ✅.

### (d) Yes path · 4.5% + 20p inclusive · £2,500 — the byte-identical case

🔴 **Snapshotted before my first edit and after my last.** The saving-card region (36 lines, from
`See your saving ↓` to the end) **diffs empty**:

```
$ diff d-card-before.txt d-card-after.txt
✅ CASE (d): SAVING CARD DIFF EMPTY — byte-identical
```

£900 a year · £428 in year one · **You save £472 · 52% less** · *"That's a weekend pitch at a food
festival."* · `Upload my menu and save £472 →` · Year one Save £472 (52% less) · Year two Save £433 (48%
less).

⚠️ **The WHOLE-PAGE diff is not empty, and must not be** — items 1–3 deliberately change the intro, add
two questions and renumber the cards. The brief's case (d) is about the **saving card**, and that is what
was diffed; the page-level differences are exactly those four changes and nothing else.

### (e) 3 vans, both paths

| | Measured |
|---|---|
| No path | headline **£2.24** (per van) · *"£38.90 a month per van"* · **Across 3 vans £116.70 a month** · card processing **~£212.50** (fleet) |
| Yes-dearer | headline **80p** (per van) · *"£13.90 a month more than now per van"* · **Across 3 vans £116.70 a month** |

### (f) Every integer day 1–7 × every slider step 0–12,000

**175 points walked (7 × 25). Exactly five transitions, one per day 3–7; days 1 and 2 never qualify at
any order value.**

| days | £0 | £12,000 | coffee line |
|---|---|---|---|
| 1 | £6.69/day | £30.68/day | **absent at every step** |
| 2 | £3.35/day | £15.34/day | **absent at every step** |
| 3 | £2.23/day | £10.23/day | shown → **disappears between £2,500 (£2.9923) and £3,000 (£3.3731)** |
| 4 | £1.67/day | £7.67/day | shown → **disappears between £3,500 (£2.8154) and £4,000 (£3.1010)** |
| 5 | £1.34/day | £6.14/day | shown → **disappears between £5,000 (£2.9377) and £5,500 (£3.1662)** |
| 6 | £1.12/day | £5.11/day | shown → **disappears between £6,000 (£2.8288) and £6,500 (£3.0192)** |
| 7 | £0.96/day | £4.38/day | shown → **disappears between £7,500 (£2.9143) and £8,000 (£3.0775)** |

**Every transition straddles £3.00 exactly** — below on one side, at-or-above on the other. 🧪 And the
sweep's restated arithmetic was **checked against real renders at each boundary**, so a restatement that
had drifted from the component would fail rather than quietly agree with itself: days=3 £2,500 → £2.99
shown / £3,000 → £3.37 absent; days=7 £7,500 → £2.91 shown / £8,000 → £3.08 absent; days=2 £0 → £3.35
absent.

### Layout — 375px and 1440px, Chromium and WebKit

The component's **real SSR markup with the real built Tailwind bundle** (`.next/static/chunks/
9d6dd8a34c20c108.css`), 6 states × 2 widths × 2 engines = **24 measurements, 0 failures**.

| state | hero | 375px | 1440px |
|---|---|---|---|
| No path, 1 van | `£2.24` 92px | 1 line, doc 375/375 | 1 line, doc 1440/1440 |
| No path, 3 vans | `£2.24` 92px | 1 line | 1 line |
| No path, 9 vans, 1 day, £12,000 | `£30.68` **76px** | 1 line | 1 line |
| Yes, saving | `£472` 92px | 1 line | 1 line |
| Yes, dearer | `80p` 92px | 1 line | 1 line |
| nothing answered | *(no result card)* | — | — |

**No horizontal scroll** (`documentElement.scrollWidth === clientWidth` at both widths in both engines)
and **no element wider than the viewport** in any state. The 76px row is `heroSizeFor` doing its job.

> ⚠️ **MY FIRST VERSION OF THE WRAPPING CHECK COULD NOT FAIL, AND I FOUND THAT BY FIXING IT.** It read
> `hero.getClientRects().length === 1` — but a **block** element returns ONE rect for its whole box
> however many lines it wraps to, so it reported "1 line" for a three-line paragraph. It is a **Range
> over the text node** now, which returns one rect per line box. The corrected check immediately failed
> on the nothing-answered state, where my "largest `<p>`" finder was picking the 16px intro paragraph —
> prose that is *meant* to wrap. The headline is now identified as the 60/76/92px inline figure, and the
> one-line rule governs only that.

### The rest

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully**, 96 static pages |
| `node scripts/compare-no-system.cjs` | **42 passed**, 5 broken variants all caught |
| `node scripts/run-harnesses.cjs` | **76 run · 76 passed · 0 failed** |
| `--dry-run` screen | all 76 pass |
| goldens | `batch-rolling-golden.json` `8bdae817748ad334…`, `batch-reservation-golden-on.json` `e3f0a88099fd797c…` — **unchanged** |
| eslint, `CostComparison.tsx` | **1 warning, identical to HEAD** (`PLAN_ONLINE_ALLOWANCE` unused — pre-existing). **No new warnings** |
| `app/compare/page.tsx`, `app/landing/layout.tsx` | **`git diff` empty on both** |
| new price literals | **none** — every `29`/`49`/`1500`/`0.99`/`1.5`/`20` in the diff is inside a comment |

**No live truck data was involved; this page touches none. Not deployed.**

---

## 8 · The harness, and why there is one

**`scripts/compare-no-system.cjs`, registered in `scripts/harnesses.json`** (75 → 76) — 42 checks, 5
broken variants.

🔴 **The brief asked for executed checks in a report, not for a harness. I added one anyway, and the
reason is one task old.** Earlier in this same session the scraper's `assertNoInventedVillages` shipped
with a 12-case proof that lived in a report and was **re-run by nothing** — three weeks later it stopped
the daily scrape, and the standing lesson recorded with the fix says in as many words that *a proof that
lives in a report is not a proof*. Writing another report-only proof immediately afterwards would
contradict a finding this repo has just written down.

| Variant | What it breaks |
|---|---|
| **V1** | the per-day divisor goes back to `monthly ÷ 4 ÷ days` |
| **V2** | the coffee line loses its threshold and always shows |
| **V3** | the No path shows a per-order figure of ours |
| **V4** | amounts under £1 render as `£0.80` instead of `80p` |
| **V5** | the dearer path goes back to "% more in your first year" |

Case (d) is pinned as the **literal text** of the saving card, so any edit to it — a word, a figure, an
order — fails. The browser measurement is gated behind `HG_RENDER=1`, the pattern
`outreach-templates-layout.cjs` already uses, because it needs a build and local browsers and the sweep
must not depend on either.

> ⚠️ **THE SCREEN REFUSED THIS HARNESS AND I DID NOT WORK AROUND IT.** `run-harnesses.cjs` screens every
> listed file for the payment provider's name as a whole word and **refuses the entire run** if it finds
> one — *"the screen is a property of the FILE, not of anyone's intent"*. My card-processing assertions
> quoted the rendered sentence, brand and all. Splitting the string to slip past it would have defeated a
> guard on purpose; the assertions test the rate, the amount and the "same as a card machine" clause
> instead, which is what the requirement is actually about.

> ⚠️ **TWO DRAFTS OF THE NUMBERING CHECK WERE WRONG, IN TWO DIFFERENT WAYS**, and both are written into
> the file: the first banned `"7"` anywhere on the No path and failed on correct output, because the
> trading-days question renders buttons 1…7; the second matched "a digit, then a line ending in `?`" and
> **missed card 4**, whose Yes-path title *"Online orders per month, per truck"* is not a question — so
> it reported a gap in the exact property it existed to check. It is a list of number→title pairs now.

---

## 9 · Two wording observations, not changed

- The dearer sub-line with a fleet reads **"£13.90 a month more than now per van"**. That is item 6's
  wording plus item 4's "+ per van" appended literally, and it reads a little oddly. Changing it means
  choosing different words than the brief specifies, so I have not.
- The grey before/after box says **"across 3 trucks"** while the new lines say **"Across 3 vans"**. The
  "trucks" wording is pre-existing and sits inside the card case (d) requires byte-identical, so
  harmonising the vocabulary would have broken that check. **Worth a decision; not mine to take here.**
