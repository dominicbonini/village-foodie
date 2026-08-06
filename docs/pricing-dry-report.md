# FOOTNOTES[1] shortened — 72 → 59 words

**Date:** 6 August 2026. **One file changed: `lib/plan-features.ts`.** Nothing else touched. No `cap sync` / `next dev` / `next build`. No garbled spans in the brief.

---

# THE CHANGE

**Before — 72 words**
> Walk-up orders: HatchGrab charges 0% on every plan, **however you take the money**. Use your own card terminal **(Zettle, Square, etc.)** and only your provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — **still 0% from us, plus** Stripe's own charge, currently around 1.4% + 10p on UK and EEA cards, plus 10p per authorisation if you tap on a phone or tablet without a dedicated reader.

**After — 59 words**
> Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — Stripe's own charge, currently around **1.4% + 10p** on UK and EEA cards, plus **10p** per authorisation if you tap on a phone or tablet without a dedicated reader.

✅ **Verified byte-for-byte against the text in the brief** (with `${CARD_FEE_IN_PERSON_LABEL}` and `${TAP_TO_PAY_SURCHARGE_LABEL}` resolved): **exact match**. Not paraphrased.

**−13 words (−18%).** The footnote has now gone **128 → 72 → 59** across three passes.

## Source form — placeholders retained
```ts
text: `Walk-up orders: HatchGrab charges 0% on every plan. Use your own card terminal and only your `
  + `provider's standard fees apply. Card payments through HatchGrab via Stripe are coming soon — `
  + `Stripe's own charge, currently around ${CARD_FEE_IN_PERSON_LABEL} on UK and EEA cards, plus `
  + `${TAP_TO_PAY_SURCHARGE_LABEL} per authorisation if you tap on a phone or tablet without a `
  + `dedicated reader.`,
```

## What was cut, recorded in the comment above it
```
⚠️ ALSO CUT, AND NOT TO BE RESTORED (72 words -> 59):
  • "however you take the money" — the next two sentences enumerate exactly that.
  • "(Zettle, Square, etc.)" — examples of a thing every operator already owns.
  • "still 0% from us" — the opening sentence already says 0% on every plan, and repeating it
    invites the reader to go looking for the catch.
🔴 "without a dedicated reader" IS NOT CUTTABLE. Removing it makes the tap surcharge read as though
it ALWAYS applies, overstating the cost for every truck that owns a reader. That is a false claim,
not a long one. This has now been re-established twice; do not revisit it.
```

🔴 **"without a dedicated reader" is retained** — confirmed programmatically. The constraint from the previous task stands and is now recorded twice over, so a future pass does not have to rediscover it.

---

# VERIFY

## Word counts
| | Before | After |
|---|---:|---:|
| `FOOTNOTES[1]` | 72 | **59** |
| `FOOTNOTES[2]` | 26 | **26** — untouched |
| Landing pricing section (FN1 + lede + asterisk) | 154 | **141** |

## 🔴 The four claims — still exactly once each, all in footnote 1
Checked by executing the compiled module against every rendered site (`FOOTNOTES[1]`, `FOOTNOTES[2]`, the landing table override, the lede, the asterisk):

| Claim | Occurrences | Where |
|---|---:|---|
| **EEA qualifier** (*"on UK and EEA cards"*) | ✅ **1** | **FOOTNOTES[1]** |
| **Tap surcharge** (*"…per authorisation…"*) | ✅ **1** | **FOOTNOTES[1]** |
| **In-person rate `1.4% + 10p`** | ✅ **1** | **FOOTNOTES[1]** |
| **"coming soon"** | ✅ **1** | **FOOTNOTES[1]** |

```
✅ ALL FOUR: exactly once, all in footnote 1
```

## Banned phrases — still absent from the rendered footnote
| | |
|---|---|
| *"more for cards issued elsewhere"* | ✅ absent |
| *"Stripe's fees are Stripe's, not ours"* | ✅ absent |
| *"your actual rate is confirmed by Stripe"* | ✅ absent |
| *"Cash is always free"* | ✅ absent |

## `findPlanParityViolations()` — RUN, not asserted
```
findPlanParityViolations() -> 0 violations   ✅ ZERO
```
Compiled and executed against the real module.

## No literal reintroduced
`grep` for `1.4% + 10p` / `1.5% + 20p` returns **one hit — the doc comment on `feeLabel` describing its own output**. Both figures in the footnote resolve from `CARD_FEES`.

⚠️ **A grep that looks wrong and is not:** *"however you take the money"*, *"(Zettle, Square, etc.)"* and *"still 0% from us"* each still return **1** hit — at lines **170-172**, **inside the comment listing what was cut**. The rendered `text:` template contains none of them; confirmed by reading the block and by the byte-for-byte match above.

## Build
```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline (`HEAD`) | Now | |
|---|---|---|---|
| `lib/plan-features.ts` | clean | **clean** | ✅ |

Baseline taken from `HEAD` via stash and compared rule by rule — clean before and after, so no rule could have drifted. `git diff --stat HEAD` confirms **`lib/plan-features.ts` is the only file this task changed.**

⚠️ **One number I corrected before it became a recorded inaccuracy:** I first wrote *"72 words -> 60"* in the comment from an estimate. The measured result is **59**, and the comment now says 59. Small, but a wrong figure inside a file that exists to be the single source of the figures is exactly the kind of thing that gets quoted later.

### Constraints honoured
Footnote 2, the lede, the asterisk and the table override are **untouched** · no fee literal reintroduced · no banned clause restored · *"without a dedicated reader"* retained · nothing outside `lib/plan-features.ts` modified.
