# One source for the plan comparison table, and the Manage rendering fixed

Date: 13 August 2026
Status: BUILT. **Four files changed.** `tsc --noEmit` clean. 24 of 24 verification assertions pass.
No file gained a non-ASCII character class.

No `next dev`, no `next build`, no commit, no deploy, no migration. No plan's entitlements, gates or
feature behaviour were changed. The landing page renders byte-identical values to before.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE ROOT CAUSE — YOU CALLED IT, AND IT IS WORSE THAN A RENDERING BUG

**They shared a component: no. They shared a data source: partly, and not for the fees.**

Both pages import from `lib/plan-features.ts` and both render `FEATURE_SECTIONS`, `PLAN_PRICES`,
`PLAN_DESCRIPTIONS` and `FOOTNOTES` from it. The landing page's own header comment claims the win:

> **QUOTED**, `app/landing/page.tsx:4-7`
> ```
> // SINGLE SOURCE: the pricing cards + the full comparison table render from lib/plan-features.ts
> // (FEATURE_SECTIONS + detail + PLAN_ALLOWANCES + PLAN_PRICES + PLAN_DESCRIPTIONS + TRANSACTION_ROWS +
> // FOOTNOTES) — the SAME source Admin and Manage → Billing render from. This route is a THIRD RENDERER, not a
> // copy.
> ```

**That claim was false for the fee rows, and the file said so fifty lines further down:**

> **QUOTED**, `app/landing/page.tsx:55-57` (before this change)
> ```
> // Landing-only Fees rows — RENDER-ONLY. The shared TRANSACTION_ROWS (lib/plan-features.ts) is NOT modified;
> // Manage → Billing / Admin keep their own version. One short fact per cell so each fits one line on mobile.
> ```

### The two copies, quoted side by side

**Landing** — `LANDING_FEE_ROWS`, three rows, four columns including `trial`:

```ts
const LANDING_FEE_ROWS: { name: string; footnote?: string; cells: Record<TablePlan, string> }[] = [
  { name: 'Walk-up orders',        footnote: '1', cells: { trial: '0%',        starter: '0%',           pro: '0%',     max: '0%'     } },
  { name: 'Online orders included', footnote: '2', cells: { trial: 'Unlimited', starter: '—',            pro: '£1,500', max: '£2,000' } },
  { name: 'Fee after that',        footnote: '2', cells: { trial: 'Free',      starter: 'Pay at Hatch', pro: '0.99%',  max: '0.99%'  } },
]
```

**Shared, rendered by Manage** — `TRANSACTION_ROWS` in `lib/plan-features.ts`, **two** rows, **no trial
column**:

```ts
export const TRANSACTION_ROWS: {
  name: string
  footnote?: string
  values: Record<'starter' | 'pro' | 'max', string>
}[] = [
  { name: 'Walk-up orders', footnote: '1', values: { starter: '0%', pro: '0%', max: '0%' } },
  {
    name: 'Online orders',
    footnote: '2',
    values: {
      starter: 'Pay at Hatch',
      pro: '£1,500 free, then 0.99% + card fee',
      max: '£2,000 free, then 0.99% + card fee',
    },
  },
]
```

**And Manage's renderer**, `app/manage/[token]/page.tsx:10083` (before):

```tsx
{px(p === 'trial' ? row.values.starter : row.values[p as 'starter' | 'pro' | 'max'])}
```

### 🔴 So yes — the fee values were duplicated, and that IS the defect

Every difference you listed is downstream of it:

| Your item | Downstream of the duplication? |
|---|---|
| 1. Two rows vs three | **Yes.** The shared constant only ever had two rows. |
| 2. Trial says "Pay at Hatch" vs "Unlimited"/"Free" | **Yes, and this is the serious one.** The shared constant had no trial column, so `p === 'trial' ? row.values.starter` **rendered Starter's cell in the Trial column**. Nobody ever wrote the claim "a trial truck is Pay at Hatch" — it fell out of a missing column. |
| 3. Prices overlap | No — independent CSS defect in Manage's header. |
| 4. Trial rule misaligned | No — independent CSS defect in Manage's header. |

Items 1 and 2 could not have been fixed by editing Manage's markup. They needed the second copy to stop
existing, which is what was done.

---

## 1. THE FIX — ONE CONSTANT, TWO RENDERERS

`TRANSACTION_ROWS` in `lib/plan-features.ts` **is now the landing page's three rows verbatim**, with a
real `trial` column, keyed `cells` (was `values`):

```ts
export const TRANSACTION_ROWS: {
  name: string
  footnote?: string
  cells: Record<'trial' | 'starter' | 'pro' | 'max', string>
}[] = [
  { name: 'Walk-up orders',         footnote: '1', cells: { trial: '0%',        starter: '0%',           pro: '0%',     max: '0%'     } },
  { name: 'Online orders included', footnote: '2', cells: { trial: 'Unlimited', starter: '—',            pro: '£1,500', max: '£2,000' } },
  { name: 'Fee after that',         footnote: '2', cells: { trial: 'Free',      starter: 'Pay at Hatch', pro: '0.99%',  max: '0.99%'  } },
]
```

- `LANDING_FEE_ROWS` is **deleted**. The landing page imports `TRANSACTION_ROWS` and maps it.
- Manage already imported `TRANSACTION_ROWS`; its cell now reads `px(row.cells[p])`.
- The old two-row shape is **replaced, not left beside the new one** — so there is no dead third copy.

**Extraction was contained**, so the stronger outcome was reachable: the data is shared *and* the row
structure is identical. The rendering is deliberately not shared, per your item 5 — see section 4.

⚠️ `app/admin/page.tsx:709-718` has its own hardcoded walk-up / online-fee cells. It is **outside the
brief** (which names the landing page and Manage → Billing) and was not touched. It is now the only
remaining copy of these values in the codebase, and it is the obvious next candidate.

---

## 2. 🔴 ITEM 2 — WHICH CLAIM IS TRUE. ESTABLISHED, SO I DID NOT STOP

**The landing page is correct: a trial truck gets unlimited online orders, free, with Stripe's own card
fees still applying. "Pay at Hatch" was false.**

Three independent pieces of evidence, all quoted:

**(a) `lib/features.ts:60` — a trial IS Max:**
```ts
const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```
Verified at runtime: `getPlanFeatures('trial')` and `getPlanFeatures('max')` are both 22 features and
identical. `canAccess('trial', 'online_payments', {}, null)` → **true**;
`canAccess('starter', 'online_payments', {}, null)` → **false**. A trial truck can take online card
payments; a Starter truck cannot. So rendering Starter's cell for Trial was not merely imprecise — it
asserted the opposite of the gate.

**(b) `lib/features.ts:148` — the plan's own description:**
```ts
trial: { name: 'Trial', price: 'Free trial', description: 'All features included — Max tier + Pay at Hatch ordering' }
```

**(c) 🔴 Manage's own trial banner, `app/manage/[token]/page.tsx:756-765` — this settles the fee, not
just the feature:**
```
Full Max features + Pay at Hatch ordering — completely free*
You won't be charged anything until your trial ends on <date>.
*Standard card processing fees apply on online orders
```

"Completely free", "won't be charged anything", "standard card processing fees apply on online orders" —
that is **exactly** `trial: 'Unlimited'` / `trial: 'Free'` under footnote 2 ("Standard card processing
fees apply to all online orders"). The Billing tab was contradicting a banner on the same page.

**No stop required.** Both surfaces now say Unlimited / Free.

⚠️ Worth stating plainly: **no platform commission is implemented anywhere today.** `lib/payments`
sends no `application_fee_amount` on any charge, so the 0.99% and the allowances are forward-looking
commercial statements rather than gated behaviour. What the code *does* establish, decisively, is the
feature access — which is what made "Pay at Hatch" checkable and false.

---

## 3. ITEMS 3 AND 4 — THE TWO MANAGE LAYOUT DEFECTS

### Item 3 — "£29/mo£49/mo" ran together

**Cause, with the arithmetic.** The header column is `w-14` = **56px** and the price was `text-base` =
**16px** bold. `£29/mo` at 16px in this face measures about **56.5px** — wider than its own column, and
with no space character in it there is nothing to wrap on, so it overflowed into the neighbouring
column. `£49/mo` did the same, and the two ran together.

**Fix:** `text-base` → `text-[13px]`, plus `whitespace-nowrap`. At 13px the string is about 46px, leaving
roughly 5px clear each side. `sm:text-xl` is untouched.

```tsx
<p className={`text-[13px] sm:text-xl font-bold mt-1 whitespace-nowrap ${…}`}>
```

### Item 4 — the rule under "Free trial" sat off the others' line

**Cause.** The `border-b-2` sits at the bottom of each column's content, and the columns were kept level
by **two variables cancelling each other**, as the old comment admitted:

> **QUOTED** (before):
> ```
> // Non-trial: the real "per truck / month". Trial: a SINGLE invisible line (NOT the 2-line
> // "per truck / month") so the trial column's height matches the others at BOTH widths — on
> // mobile the trial price "Free trial" wraps to 2 lines, which offsets the others' 2-line subtitle
> ```

`"Free trial"` wrapped to 2 lines while `£29/mo` stayed on 1, so the trial subtitle was cut to 1
invisible line to compensate. That balances only if both strings wrap exactly as predicted, at every
width, under every font metric — and once `whitespace-nowrap` and `text-[13px]` changed the price's
wrapping, it would not have balanced at all.

**Fix — both variables removed rather than balanced:**

1. The trial price is now **`'Free'`**, one line in every column. This is the landing table's own choice
   (`PLAN_PRICE_LABEL`, whose comment reads *"Trial column shows just 'Free' (not 'Free trial' + a sub)
   — keeps the sticky header compact"*), so it is a **value** brought into line, not a styling copy.
2. The invisible placeholder is now **the same string** as the real subtitle:
   ```tsx
   {p === 'trial'
     ? <span className="invisible" aria-hidden="true">per truck / month</span>
     : <span>per truck / month</span>}
   ```
   It wraps identically by construction, at any width, under any font. The four columns cannot disagree
   in height.

⚠️ The trial end date is unaffected — it is shown by the reminder banner and the "won't be charged
until" line, not by this column header.

---

## 4. ITEM 5 — WHAT I KEPT AND WHAT I ADAPTED

The two tables are built on entirely different systems. Landing uses a scoped stylesheet
(`app/landing/landing.css`, everything under `.hg-landing`) with semantic classes and a CSS variable for
the column width:

```css
.hg-landing .cmp2 { --cmp-col: 3.6rem; … }
@media(min-width:620px){ .hg-landing .cmp2 { --cmp-col: 6rem; } }
.hg-landing .cmp2-col, .hg-landing .cmp2-cell { width: var(--cmp-col); flex: none; text-align: center; padding-inline: .1rem; }
.hg-landing .th-price { font-family: var(--display); font-weight: 800; color: var(--orange); font-size: .78rem; … white-space: nowrap; }
```

Manage uses inline Tailwind, `w-14 sm:w-28`, the app's slate/orange palette, and a `sticky top-0`
header inside the app shell's scroll container.

| | Kept as Manage's | Adapted from landing |
|---|---|---|
| **Structure** | — | 🔴 **three rows, four columns** — taken wholesale |
| **Values** | — | 🔴 **every cell string** — taken wholesale, now literally the same constant |
| **Row names** | — | "Walk-up orders" / "Online orders included" / "Fee after that" |
| **Trial price label** | — | `'Free'` rather than `'Free trial'` |
| Column widths | `w-14 sm:w-28` — unchanged | not `--cmp-col: 3.6rem` |
| Fonts and sizes | Tailwind scale, `text-[13px] sm:text-xl` | not `.78rem`/`var(--display)` |
| Colours | slate-400/600/900, orange-500/600, current-plan highlight | not `var(--orange)`/`var(--head)` |
| Borders and spacing | `border-t border-slate-100`, `py-2.5`, `mt-3` | not `2px solid var(--head)` |
| Sticky behaviour | `sticky top-0 z-30 bg-white` in the app shell | not `top: var(--nav-h)` |
| Footnote markup | `<sup className="text-slate-500 text-[10px]">` | not `.f-note` |
| Price masking (`px()`) | 🔴 Manage-only, kept — landing has no mask | — |

**The one thing shared beyond data is a diagnosis, not a value:** a price must fit its column and must
not wrap. Landing solves it at `.78rem` in `3.6rem`; Manage now solves it at `13px` in `56px`. Different
numbers, same rule.

---

## 5. ⚠️ THE FOURTH FILE — `lib/pricing.ts`, DECLARED

I changed one line outside the three obvious files:

```ts
const NON_SECRET_PRICE = new Set(['Free', 'Free trial', 'Lifetime', '0%', 'Pay at Hatch', 'Unlimited', '—'])
```

**Why it was necessary.** Manage passes every fee cell through `px()`, the per-truck price mask. The mask
is exact-string membership, so the two **new** structural values arriving from the landing rows —
`'Unlimited'` and `'—'` — would have rendered as **"TBC"** on Billing while the landing page showed them
plainly. Change 1 would have introduced a fresh divergence between the two tables at the very moment it
removed one.

**Why it is the right place.** The set's own comment states the test:

> **QUOTED**, `lib/pricing.ts:22-24`
> ```
> //  Non-sensitive values (Free / Free trial / Lifetime / 0% / Pay at Hatch) are exempt from both, exactly
> //  as before — they carry no commercial information and blanking them to "TBC" would read as broken.
> ```

An em dash meaning "not applicable" rendered as "TBC" is precisely "reads as broken". Neither addition is
a price: one says a trial's online orders are uncapped, the other says a plan has no allowance at all.

**What was deliberately NOT added, and is still masked:** `£1,500`, `£2,000`, `0.99%`. Verified — see
section 6. **No commercial information is revealed that was not already public.** Manage's trial banner
already tells every trial operator "completely free" unconditionally.

**Revert** is removing two strings from that set, at the cost of "TBC" appearing where "—" and
"Unlimited" belong.

---

## 6. VERIFICATION

Run against the real modules via jiti. **Read-only: no database, no network, no writes of any kind.**
**24 of 24 assertions pass.**

### The tables side by side at 390px

#### Manage → Billing, BEFORE (trial truck, prices published)

```
                     TRIAL         STARTER       PRO           MAX
                     Free          Free          £29/mo£49/mo          ← 3. prices overlap
                     trial                       per truck /   per truck /
                     ‾‾‾‾‾‾        (invisible)   month         month
                       ↑ rule sits a line low                          ← 4. misaligned
  ── Transaction fees ──────────────────────────────────────────────
  Walk-up orders¹    0%            0%            0%            0%
  Online orders²     Pay at        Pay at        £1,500        £2,000   ← 1. two rows, and
                     Hatch         Hatch         free,         free,       the fee cell wraps
                       ↑ 2. FALSE                then          then        to four lines
                                                 0.99% +       0.99% +
                                                 card fee      card fee
```

#### Landing page, BEFORE **and AFTER** (unchanged)

```
                     TRIAL         STARTER       PRO           MAX
                     Free          Free          £29/mo        £49/mo
                                   free forever  per truck /   per truck /
                                                 month         month
  ── Fees ──────────────────────────────────────────────────────────
  Walk-up orders¹    0%            0%            0%            0%
  Online orders      Unlimited     —             £1,500        £2,000
    included²
  Fee after that²    Free          Pay at Hatch  0.99%         0.99%
```

#### Manage → Billing, AFTER (trial truck, prices published)

```
                     TRIAL         STARTER       PRO           MAX
                     Free          Free          £29/mo        £49/mo    ← 3. fixed
                     (invisible    per truck /   per truck /   per truck /
                      same string) month         month         month
  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  ‾‾‾‾‾‾‾‾‾‾‾‾  ‾‾‾‾‾‾‾‾‾‾‾‾  ‾‾‾‾‾‾‾‾‾‾‾‾  ← 4. rules level
  ── Transaction fees ──────────────────────────────────────────────
  Walk-up orders¹    0%            0%            0%            0%
  Online orders      Unlimited     —             £1,500        £2,000    ← 1. three rows
    included²                                                              2. TRUE
  Fee after that²    Free          Pay at Hatch  0.99%         0.99%
```

**Every fee cell now matches the landing page exactly, because both read the same object.**

### Assertion output

```
── 1. LANDING PAGE IS UNCHANGED (byte-for-byte) ──────────────────────────────────
  PASS  same row count   [3]
  PASS  row 1 identical: "Walk-up orders"
  PASS  row 2 identical: "Online orders included"
  PASS  row 3 identical: "Fee after that"

── 2. BOTH SURFACES READ THE SAME OBJECT ─────────────────────────────────────────
  PASS  landing renders TRANSACTION_ROWS
  PASS  manage renders TRANSACTION_ROWS
  PASS  landing no longer defines LANDING_FEE_ROWS
  PASS  manage no longer borrows the starter column for trial (executable code)
  PASS  manage reads px(row.cells[p])
  PASS  no second fee-value literal anywhere in either page

── 3. TRIAL IS MAX-TIER, SO "Pay at Hatch" WAS FALSE ─────────────────────────────
  PASS  trial feature set === max feature set   [trial=22 max=22]
  PASS  trial can take online payments
  PASS  starter CANNOT take online payments
  PASS  trial cell no longer says "Pay at Hatch"   [Free]

── 4. THE PRE-LAUNCH MASK ────────────────────────────────────────────────────────
  PRICING_PUBLISHED = false
  Walk-up orders           trial=0%         starter=0%             pro=0%    max=0%
  Online orders included   trial=Unlimited  starter=—              pro=TBC   max=TBC
  Fee after that           trial=Free       starter=Pay at Hatch   pro=TBC   max=TBC
  PASS  "—" is not masked to TBC
  PASS  "Unlimited" is not masked to TBC
  PASS  "0.99%" IS still masked when unpublished   [TBC]
  PASS  "£1,500" IS still masked when unpublished   [TBC]
  PASS  hide_pricing truck still masks £1,500   [TBC]

── 5. THE PARITY GUARD STILL PASSES ──────────────────────────────────────────────
  PASS  findPlanParityViolations() clean   [[]]

ALL PASSED
```

Row 1's assertion compares the new shared constant against the landing page's **pre-change**
`LANDING_FEE_ROWS`, transcribed from git HEAD — so "landing is unchanged" is proved against what it
actually rendered yesterday, not against what I intended.

### 🔴 Two false results I caught in my own harness, stated because they mattered

1. An assertion `!/row\.values\.starter/` on the Manage source **failed while the code was correct** — it
   was matching the *comment* that quotes the old expression for the next reader. Narrowed to the exact
   old executable expression.
2. The narrowed version then also failed, because a second clause `!/\{px\(p === 'trial'/` was catching
   the **new, legitimate** `px(p === 'trial' ? 'Free' : PLAN_PRICES[p])` in the price header. Dropped.

Both were assertion bugs, not code bugs, and both would have read as real failures.

### Typecheck

`npx tsc --noEmit` — clean. The `values` → `cells` rename means any missed consumer would have failed to
compile; none did, confirming `TRANSACTION_ROWS` had exactly one renderer before this change.

---

## 7. NON-ASCII CENSUS

Character **classes** per file, before → after, computed against `git show HEAD:<file>`:

| File | Classes before | Classes after | Gained |
|---|---|---|---|
| `lib/pricing.ts` | 6 | 6 | **none** |
| `lib/plan-features.ts` | 12 | 12 | **none** |
| `app/landing/page.tsx` | 19 | 19 | **none** |
| `app/manage/[token]/page.tsx` | 176 | 176 | **none** |

### 🔴 One violation I introduced and corrected

My first version of the `lib/pricing.ts` comment named the two allowance amounts as `£1,500` and
`£2,000`. **`lib/pricing.ts` contained no `£` at all** — its vocabulary is `— ⇒ ─ ⚠️ 🔴` — so that added
U+00A3 as a new class to that file. Caught by the census, rewritten as "The two allowance amounts and the
0.99% rate", and re-verified: 6 classes before, 6 after.

Counts within existing classes moved as expected: `app/landing/page.tsx` **lost** two `£` (13 → 11) when
the duplicate literal was deleted; `lib/plan-features.ts` kept 11 `£` and gained `—`(38→44), `─`(113→129),
`⚠️`(8→11), `🔴`(4→6).

---

## 7b. MOBILE vs DESKTOP — SHOULD THE CONTENTS BE THE SAME? YES, AND THEY NOW ARE

**The contents are identical at every width. Only the presentation changes.**

Verified by grep across both render regions and the landing stylesheet: **there is no width-based
content branching anywhere in either table** — no `hidden sm:block`, no `sm:inline`, no `display: none`
in any `.cmp2` rule. Both tables map the same array and emit the same cells at 390px as at 1400px.

| | Same at every width? |
|---|---|
| Which rows appear (all three) | **Yes** |
| Which columns appear | **Yes** (see the one exception below) |
| Every cell's text | **Yes** — one constant, no responsive variants |
| Row names and footnote markers | **Yes** |
| Column width (`w-14` → `sm:w-28`) | No — presentation |
| Price size (`text-[13px]` → `sm:text-xl`) | No — presentation |
| Cell size (`text-xs` → `sm:text-sm`) | No — presentation |

**The one thing that varies, and it is not a width rule:** Manage's Trial column appears only when
`showTrialColumn` is true — i.e. the truck is actually on a trial. That is a **plan** condition, not a
viewport condition; a trial truck sees four columns on a phone and on a desktop, and a paid truck sees
three on both. The landing page always shows all four, because it is selling to someone who has no plan
yet.

This is worth stating because it was **not** true before. The old two-row shape meant a phone user on
Billing saw a fee cell that wrapped to four lines while the same cell on a wide screen sat on one — the
same string, but so differently shaped that it read as different information. Three short cells fit one
line at both widths, which was the landing page's stated reason for splitting them ("One short fact per
cell so each fits one line on mobile") and is now Billing's too.

---

## 8. WHAT WAS NOT TOUCHED

- **The landing page's appearance** — values byte-identical, markup identical apart from the identifier
  at the map site and the import. Its stylesheet was not opened.
- **Plan entitlements and gates** — `lib/features.ts` was **read only**. `PLAN_FEATURES`, `canAccess`,
  `hasFeature`, `TRIAL_FEATURES`, `PLAN_META`: unchanged.
- **Everything else on the Billing tab** — the feature sections, footnotes, upgrade modal, trial reminder
  banner, current-plan highlighting and the per-van add-on are unchanged. Only the fee rows and the
  price header inside `matrixContent` were edited.
- **`app/admin/page.tsx`** — has its own hardcoded fee cells at `:709-718`. Out of scope; now the last
  remaining copy of these values, and the obvious follow-up.
- **`FEATURE_SECTIONS`, `PLAN_ALLOWANCES`, `FOOTNOTES`, `CARD_FEES`** — untouched.
- **`findPlanParityViolations`** — untouched, and still returns clean.
