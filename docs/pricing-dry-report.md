# Walk-up card payments — copy, and the fee figures single-sourced

**Date:** 6 August 2026. Supersedes the previous pricing report.
**Two files changed:** `lib/plan-features.ts`, `app/landing/page.tsx`. No migration, no SQL. `next dev` / `next build` not run. `NEXT_PUBLIC_PRICING_PUBLISHED` not touched.
No garbled spans in the brief.

---

## A. THE FEE FIGURES ARE NOW DEFINED ONCE — structured, not strings

**[lib/plan-features.ts:37-70](lib/plan-features.ts#L37)**

```ts
export const CARD_FEES = {
  /** Online payments, standard UK-issued cards. */
  online: { pct: 1.5, pence: 20 },
  /** In-person payments, UK/EEA-issued cards. ⚠️ Cards issued outside the UK/EEA cost MORE. */
  inPerson: { pct: 1.4, pence: 10 },
  /** ADDITIONAL per-authorisation charge for contactless on a phone or tablet with no reader. */
  tapToPaySurchargePence: 10,
} as const

/** "1.4% + 10p" — the ONLY place a card fee becomes a string. */
export function feeLabel(fee: { pct: number; pence: number }): string {
  return `${fee.pct}% + ${fee.pence}p`
}

export const CARD_FEE_ONLINE_LABEL     = feeLabel(CARD_FEES.online)      // "1.5% + 20p"
export const CARD_FEE_IN_PERSON_LABEL  = feeLabel(CARD_FEES.inPerson)    // "1.4% + 10p"
export const TAP_TO_PAY_SURCHARGE_LABEL = `${CARD_FEES.tapToPaySurchargePence}p`  // "10p"
```

🔴 **Structured, with percentage and pence separate, exactly as instructed — and the file says why at the definition:** the £1,500/£2,000 allowances exist only inside display strings, which is why `lib/payments` cannot read a number and cannot apply an allowance. **When Stripe Connect and Terminal are built, the payments code needs `pct` and `pence` as numbers, and they are there.**

### Every literal converted — verified by grep

**Four occurrences, in two wordings, as the audit recorded. All four now derive.**

| # | Site | Was | Now |
|---|---|---|---|
| 1 | [plan-features.ts:129](lib/plan-features.ts#L129) `FOOTNOTES` #2 | `~1.5% + 20p` | `~${CARD_FEE_ONLINE_LABEL}` |
| 2 | [landing:66](app/landing/page.tsx#L66) `FOOTNOTE_TEXT_OVERRIDES['2']` | `currently 1.5% + 20p` | `currently ${CARD_FEE_ONLINE_LABEL}` |
| 3 | [landing:272](app/landing/page.tsx#L272) the lede | `currently 1.5% + 20p` | `currently {CARD_FEE_ONLINE_LABEL}` |
| 4 | [landing:336](app/landing/page.tsx#L336) pricing asterisk | `currently 1.5% + 20p` | `currently {CARD_FEE_ONLINE_LABEL}` |

```
$ grep -rn "1\.5% + 20p\|1\.4% + 10p" app components lib
lib/plan-features.ts:45:  // ...never by writing "1.4% + 10p" again.
lib/plan-features.ts:63:  /** "1.4% + 10p" — the ONLY place a card fee becomes a string. */
```

✅ **The only two survivors are comments documenting the helper.** **One definition, no literal restating it.**

⚠️ **The landing page's separate copies were converted, not left** — `FOOTNOTE_TEXT_OVERRIDES`, the lede and the asterisk all now read the shared symbol. **The override mechanism still exists** (the landing keeps its own *wording*), but the **figures** can no longer diverge.

✅ **0.99% and the £1,500/£2,000 allowances untouched, as instructed.** Proven rather than asserted — occurrence counts against `HEAD` are **identical**: `plan-features.ts` 7 → 7, `landing/page.tsx` 4 → 4. The two diff lines containing `0.99%` are footnote 2 being rewritten around it; the figure itself survives in place.

---

## B. THE WALK-UP ROW

### 🔴 The 0% claim is UNCHANGED and still true

```
$ grep -A4 "name: 'Walk-up orders'" lib/plan-features.ts
    name: 'Walk-up orders',
    footnote: '1',
    values: { starter: '0%', pro: '0%', max: '0%' },
```

**Not edited.** The landing's `LANDING_FEE_ROWS` walk-up row (`0%` on all four columns) is likewise untouched. **The commercial decision makes that claim more true, not less** — 0% now covers both routes.

### What changed: footnote 1 covers BOTH ways to take a walk-up card payment

**[lib/plan-features.ts:145-158](lib/plan-features.ts#L145)** now says, in one paragraph:

1. **0% platform fee however you take the money, on every plan.**
2. **Your own terminal** (Zettle, Square, etc.) — *"only your provider's own fees apply — that is between you and them."*
3. **Through HatchGrab via Stripe** — *"coming soon; when it is available there will still be no HatchGrab platform fee, and only Stripe's card processing fee will apply"*, at **~1.4% + 10p on UK and EEA-issued cards, more for cards issued elsewhere**, plus **an additional 10p per authorisation** for tapping on a phone or tablet without a dedicated reader.
4. **"Stripe's fees are Stripe's, not ours, and your actual rate is confirmed by Stripe when you set up with them."**
5. **"Cash is always free."**

🔴 **The 10p surcharge is stated as an ADDITIONAL charge in its own clause, never folded into the headline** — the code comment at the definition says why: folding it in would understate the cost for exactly the trucks most likely to tap on a phone.

### Both figures on the landing page

The landing renders the **shared** `FOOTNOTES` at [:399](app/landing/page.tsx#L399), so footnote 1 (in-person) appears there; footnote 2 (online) appears via the landing's own override. **Both are on the page.** The in-person figure is additionally stated in the **lede** [:272](app/landing/page.tsx#L272) and the **pricing asterisk** [:336](app/landing/page.tsx#L336).

---

## C. HEDGING — the existing convention, matched not invented

**Found and reused, both forms:**

| Convention | Where it already lived | Where it now applies |
|---|---|---|
| **`~`** | `plan-features.ts` footnote 2 | shared footnotes 1 and 2 (`~${…}`, "around") |
| **`currently`** | landing's `FOOTNOTE_TEXT_OVERRIDES`, lede, asterisk | all three landing sites, unchanged wording |

**Each site keeps the hedge it already used.** No new phrasing was introduced.

**Every required claim is present:**

- ✅ **UK/EEA restriction** — *"on UK and EEA-issued cards, more for cards issued elsewhere"*, at all three in-person sites.
- ✅ **Stripe's fees are Stripe's** — *"Stripe's fees are Stripe's, not ours"* in footnotes 1 and 2, the landing footnote-2 override and the asterisk.
- ✅ **Confirmed at Stripe onboarding** — *"your actual rate is confirmed by Stripe when you set up with them."*
- ✅ **Nothing stated as guaranteed, fixed, or ours to set.** No rendered string says "is", "will be" without a hedge, or implies HatchGrab sets the rate. The provenance note at the definition records that the figures are from **secondary sources, not stripe.com**, and that **the hedging is load-bearing rather than decorative**.

---

## D. NOT ADVERTISED AS AVAILABLE

🔴 **Stripe Connect and Terminal are both unbuilt, and the copy says so.** Every mention of the Stripe walk-up route uses **"coming soon"** and the future tense — *"is coming soon; when it is available there **will** still be no HatchGrab platform fee, and only Stripe's card processing fee **will** apply"*.

**"Coming soon" is the existing convention** — `FeatureValue = boolean | 'coming_soon'`, rendered as a muted-italic "Coming soon" badge (e.g. `admin:745`). ⚠️ **That enum applies to `FEATURE_SECTIONS` rows, not to `TRANSACTION_ROWS`**, whose values are plain strings; and adding a row would be restructuring the compare table, which was forbidden. **So the convention is carried in the footnote's words instead** — same vocabulary, applied where the mechanism allows.

⚠️ **FLAGGED, NOT FIXED — a pre-existing over-claim I did not touch:** `FEATURE_SECTIONS` carries **`Online payments (Stripe Connect)` as `pro: true, max: true`**, i.e. a plain ✓, when Stripe Connect is unbuilt. **That is the same class of error as the kitchen-printing claim the manual records.** It was not in scope and changing a feature-matrix value would have moved a commercial claim without being asked. **Worth its own decision.**

---

## E. VERIFICATION

### `findPlanParityViolations()` — RUN, not assumed

```
$ npx tsx -e "import { findPlanParityViolations } from './lib/plan-features'; …"
parity violations: 0 (PASS)
```

### Both surfaces render the same figures from the same source — how I proved it

**Not by reading the strings. By executing the module and checking membership:**

```
--- the single source ---
{"online":{"pct":1.5,"pence":20},"inPerson":{"pct":1.4,"pence":10},"tapToPaySurchargePence":10}
online   label: 1.5% + 20p
inPerson label: 1.4% + 10p
tapToPay label: 10p

--- footnote 1 contains in-person figure?            true
--- footnote 1 contains tap-to-pay surcharge?        true
--- footnote 2 contains online figure?               true
```

Then the import graph, which is what makes divergence impossible rather than merely absent:

- **Billing** — `app/manage/[token]/page.tsx:18` imports `TRANSACTION_ROWS, FOOTNOTES` from `@/lib/plan-features`; renders them at `:9817` and `:9880`.
- **Landing** — `app/landing/page.tsx:19` imports `CARD_FEE_ONLINE_LABEL, CARD_FEE_IN_PERSON_LABEL, TAP_TO_PAY_SURCHARGE_LABEL` from the same module; renders shared `FOOTNOTES` at `:399` plus the three derived sites.

**Both read the same exported symbols from the same file, and `grep` confirms no literal remains anywhere.** A figure change in `CARD_FEES` now moves every surface at once.

### 🔴 GUSTO

**Billing renders `TRANSACTION_ROWS` and `FOOTNOTES`, and Gusto is on that path.**

| | Today | The day pricing publishes |
|---|---|---|
| **Walk-up row** | `0%` — ⚠️ **`0%` is on `maskPrice`'s NON_SECRET list, so it shows as `0%` today, not TBC** | `0%` — **unchanged** |
| **Online-orders row** | **`TBC`** — masked | `£1,500 free, then 0.99% + card fee` |
| **Footnote 1** (walk-up) | ⚠️ **VISIBLE NOW — footnotes are not masked by `maskPrice`.** The Billing footnote block substitutes replacement text **only for footnote 2** ([manage:9882](app/manage/[token]/page.tsx#L9882)); footnote 1 renders in full | unchanged |
| **Footnote 2** (online) | **replaced** with *"Platform and card processing fees are TBC…"* | the real text, with `~1.5% + 20p` |

🔴 **So the new walk-up wording IS visible to Gusto today**, as soon as this deploys — footnote 1 has never been masked. ⚠️ **That is a deliberate consequence of the commercial decision, not an oversight:** the 0% claim it explains is already on their screen, and it is now explained more fully rather than differently. **But it is a live-operator-visible copy change, and you should know that before it ships rather than after.**

**Also on Gusto's Billing tab today:** `hide_pricing = true`, so every masked price reads TBC regardless of the global flag. The walk-up `0%` and footnote 1 are unaffected by that — neither goes through `maskPrice`.

### Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `lib/plan-features.ts` | clean (0) | **clean (0)** | ✅ |
| `app/landing/page.tsx` | **clean (0)** | **clean (0)** | ✅ |
| `app/manage/[token]/page.tsx` | 370 (293, 77) | **370 (293, 77)** | ✅ untouched |
| `app/admin/page.tsx` | 10 (8, 2) | **10 (8, 2)** | ✅ untouched |

⚠️ **The landing page briefly went to 5 errors** — `react/no-unescaped-entities` on the apostrophes in `provider's` and `Stripe's`, which sit in **JSX text nodes** rather than template literals. Escaped to `&apos;` and back to a clean baseline. **Caught by the baseline check, not by review** — and worth noting that the identical apostrophes inside `FOOTNOTE_TEXT_OVERRIDES` are fine, because that is a template literal, not JSX.

### Scope — confirmed untouched

Plan prices · the £1,500/£2,000 allowances · the 0.99% platform fee (occurrence counts identical to `HEAD`) · the compare table's structure and columns · `lib/commerce-policy.ts` and the purchase-CTA gates · `hide_pricing` and `PricingPolicy` · keep-awake · the native shell · `NEXT_PUBLIC_PRICING_PUBLISHED`.

### Not determined

- **The fee figures themselves.** Verified from **secondary sources, not stripe.com** — recorded as such at the definition, and every rendered string is hedged accordingly. **If these are ever confirmed against Stripe's own published rates, update the provenance note as well as the numbers.**
- **Nothing was rendered.** `tsc`, lint and an executed parity check prove it compiles and that the strings derive; they prove nothing about how the paragraphs read on a page. **The lede at [:272](app/landing/page.tsx#L272) is now a long sentence** and is worth reading on a phone before launch.
