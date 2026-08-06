# Pricing and walk-up copy — CUT BACK (build)

**Date:** 6 August 2026. **Two files changed:** `lib/plan-features.ts` · `app/landing/page.tsx`. Nothing else touched. No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

🔴 **417 → 194 words across the five sites — a 53% cut. Four of the five targets met.** The fifth, footnote 1, is over by 17 words and **that is reported, not hidden** — the arithmetic is in §"The one target missed".

**The rule held:** the EEA qualifier, the tap surcharge, the in-person rate and "coming soon" now each appear **EXACTLY ONCE**, all in footnote 1.

---

# WORD COUNTS — every site, three versions

| Site | `31247ce` | `32921c6` | **NOW** | Target | |
|---|---:|---:|---:|---:|---|
| Pricing lede (landing) | 46 | 120 | **52** | 55 | ✅ **MET** |
| `FOOTNOTES[1]` (plan-features) | 20 | 128 | **72** | 55 | ⚠️ **OVER by 17** |
| `FOOTNOTES[2]` (plan-features) | 25 | 46 | **26** | 27 | ✅ **MET** |
| `FOOTNOTE_TEXT_OVERRIDES['2']` | 18 | 42 | **22** | 22 | ✅ **MET exactly** |
| Pricing asterisk (`price-foot`) | 18 | 81 | **22** | 22 | ✅ **MET exactly** |
| **TOTAL** | **127** | **417** | **194** | — | **−223 (−53%)** |

## Landing pricing section — the figure asked for

On the **same basis as the previous report** (footnote 1 + lede + asterisk, the three blocks that render in that section):

| | Words |
|---|---:|
| Before `32921c6` | 84 |
| After `32921c6` | 🔴 **329** |
| **NOW** | ✅ **146** |

⚠️ **Still 62 words above the original 84, and all of it is footnote 1** (20 → 72). That is the deliberate trade: the detail moved *into* footnote 1 from three other places rather than being deleted. Including the table's footnote-2 override, the section reads **102 → 371 → 168**.

---

# THE FIVE SITES — final text

### 1. Pricing lede — `app/landing/page.tsx:277` · **52 words**
> Pro is £29 a month with £1,500 of online orders included. Max is £49 with £2,000. Anything above that is 0.99%. Standard card processing fees apply to all online orders (currently **1.5% + 20p** on standard UK cards), including those within your allowance. **Walk-ups carry no HatchGrab platform fee on any plan.**

Restored verbatim from `31247ce` apart from the two sanctioned changes. **No in-person figure, no EEA qualifier, no tap surcharge, no "coming soon", no "Cash is always free".**

### 2. `FOOTNOTES[1]` — `lib/plan-features.ts:159` · **72 words** — the one place detail lives
> Walk-up orders: HatchGrab charges 0% on every plan, however you take the money. Use your own card terminal (Zettle, Square, etc.) and only your provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — still 0% from us, plus Stripe's own charge, currently around **1.4% + 10p** on UK and EEA cards, plus **10p** per authorisation if you tap on a phone or tablet without a dedicated reader.

**Cut entirely, as instructed:** *"Stripe's fees are Stripe's, not ours"* · *"your actual rate is confirmed by Stripe when you set up with them"* · *"more for cards issued elsewhere"* · *"Cash is always free"*.

### 3. `FOOTNOTES[2]` — `lib/plan-features.ts:180` · **26 words**
> Online payments powered by Stripe Connect. Subject to 0.99% HatchGrab platform fee plus Stripe card processing fees (~**1.5% + 20p** per transaction on standard UK cards).

### 4. `FOOTNOTE_TEXT_OVERRIDES['2']` — `app/landing/page.tsx:67` · **22 words**
> Standard card processing fees apply to all online orders (currently **1.5% + 20p** on standard UK cards), including those within your allowance.

### 5. Pricing asterisk — `app/landing/page.tsx:343` · **22 words**
> \*Standard card processing fees apply to all online orders (currently **1.5% + 20p** on standard UK cards), including those within your allowance.

🔴 **The entire walk-up paragraph was REMOVED, not shortened.** The second `price-foot` paragraph (*"Cancel by doing nothing…"*) is **untouched**.

---

# ⚠️ THE ONE TARGET MISSED — footnote 1, 72 against 55

**I did not hit it, and I am not going to claim otherwise. Here is the arithmetic, measured rather than estimated.** The four facts the brief said to KEEP cost, on their own:

| Required fact | Words |
|---|---:|
| 0% on every plan, however you take the money | 13 |
| Own terminal ⇒ only your provider's fees | 15 |
| Stripe route coming soon, still 0% from us, plus Stripe's own charge at 1.4% + 10p on UK and EEA cards | 28 |
| The 10p tap surcharge, **and that it applies only without a dedicated reader** | 16 |
| **FLOOR** | **72** |

**55 is not reachable while keeping all four.** I cut 128 → 76 → **72** by removing "Taking walk-up" (the footnote is already about walk-ups), "an additional" → "plus", and "card" from "dedicated card reader".

🔴 **The only remaining way under 55 is to drop "without a dedicated reader" — which would make the 10p read as always applying**, overstating the cost for every truck that owns a reader. **A shorter footnote is not worth an untrue one.** The reasoning is recorded in the file so it is not re-litigated.

---

# 🔴 CLAIM UNIQUENESS — the check the whole task was for

| Claim | Occurrences | Where |
|---|---:|---|
| **EEA qualifier** (*"on UK and EEA cards"*) | 🔴 **1** | **FOOTNOTES[1] only** |
| **Tap surcharge** (*"10p per authorisation…"*) | 🔴 **1** | **FOOTNOTES[1] only** |
| **In-person rate `1.4% + 10p`** | 🔴 **1** | **FOOTNOTES[1] only** |
| **"coming soon"** | 🔴 **1** | **FOOTNOTES[1] only** |
| *"more for cards issued elsewhere"* | **0** | removed |
| *"Stripe's fees are Stripe's, not ours"* | **0** | removed |
| *"your actual rate is confirmed by Stripe"* | **0** | removed |
| *"Cash is always free"* | **0** | removed |
| Walk-up = no HatchGrab platform fee | 2 | FN1 + lede — **by instruction** |
| Online rate `1.5% + 20p` | 4 | FN2, override, lede, asterisk |

✅ **STATED EXPLICITLY, AS ASKED: the EEA qualifier, the tap surcharge, the in-person rate and "coming soon" each appear EXACTLY ONCE, and all four are in footnote 1.**

⚠️ **The online rate still appears 4×** — and that is **restored to the `31247ce` baseline, not a regression**: it appeared in exactly those same four places before the rewrite. Reducing it was outside this brief (every one of the four is a verbatim restore). **Flagging it rather than acting on it.**

---

# VERIFY

## `findPlanParityViolations()` — RUN, not asserted
```
findPlanParityViolations() -> 0 violations
  ✅ ZERO
CARD_FEES: {"online":{"pct":1.5,"pence":20},"inPerson":{"pct":1.4,"pence":10},"tapToPaySurchargePence":10}
labels: 1.5% + 20p | 1.4% + 10p | 10p
```
Compiled and executed against the real module.

## No literal reintroduced
`grep` for `1.5% + 20p`, `1.4% + 10p`, `10p per authorisation` across both files returns **one hit — a doc comment on `feeLabel` describing its own output**. **Zero rendered literals.** Every figure resolves from `CARD_FEES`.

⚠️ **Two imports became unused** on the landing page once the walk-up detail left it — `CARD_FEE_IN_PERSON_LABEL` and `TAP_TO_PAY_SURCHARGE_LABEL`. **Removed**, or they would have broken the lint baseline with `no-unused-vars`.

## 🔴 GUSTO — `hide_pricing = true`

**Verified in the render path, not assumed.** `app/manage/[token]/page.tsx:9893`:

```tsx
{pricesVisible || f.number !== '2' ? f.text : 'Online payments are powered by Stripe Connect. Platform and card processing fees are TBC and will be confirmed at launch.'}
```

**Only footnote 2 is masked.** So on their Billing tab today they see:

| | What Gusto sees |
|---|---|
| Plan prices, allowances | **TBC** (masked) |
| **Footnote 2** | The **TBC** replacement sentence |
| 🔴 **Footnote 1** | **THE FULL 72-WORD TEXT, UNMASKED — including `1.4% + 10p` and the `10p` tap surcharge** |

✅ **This build makes that materially better**: the text they see unmasked drops from **128 words to 72**, and the four removed claims are gone from it.

⚠️ **But the finding stands and is worth your attention: real card figures render to a truck whose pricing is deliberately suppressed.** The masking gate covers footnote 2 only. **Out of scope here — not changed, and flagged.**

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline (`HEAD` = 32921c6) | Now | |
|---|---|---|---|
| `lib/plan-features.ts` | clean | **clean** | ✅ |
| `app/landing/page.tsx` | clean | **clean** | ✅ |

Baselines taken from `HEAD` via stash and compared **rule by rule** — both clean before and after, so no rule could have drifted.

### Untouched, as required
No price, allowance or the 0.99% platform fee changed. `PLAN_ALLOWANCES`, `TRANSACTION_ROWS`, `LANDING_FEE_ROWS`, `DETAIL_OVERRIDES` and the second `price-foot` paragraph are all unmodified. Stripe walk-ups remain marked **"coming soon" in footnote 1 only**.
