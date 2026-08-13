# The last hardcoded plan table — Admin now reads TRANSACTION_ROWS

Date: 13 August 2026
Status: BUILT. **One file changed** — [app/admin/page.tsx](app/admin/page.tsx). `tsc --noEmit` clean.
27 of 27 verification assertions pass. No non-ASCII character class gained.

No `next dev`, no `next build`, no commit, no deploy, no migration. `TRANSACTION_ROWS` values were not
touched. The landing page, Manage and every plan gate are untouched.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 1. WHAT ADMIN RENDERED, QUOTED — AND EVERY DIFFERENCE, BEFORE ANY CHANGE

**QUOTED**, `app/admin/page.tsx:708-721` at git HEAD:

```tsx
<tr className="border-t border-slate-100">
  <td className="px-4 py-2 text-slate-700">Walk-up orders</td>
  {PLAN_ORDER.map(p => (
    <td key={p} className="px-3 py-2 text-center text-slate-600 font-medium">0%</td>
  ))}
</tr>
<tr className="border-t border-slate-100">
  <td className="px-4 py-2 text-slate-700">Online orders</td>
  {PLAN_ORDER.map(p => (
    <td key={p} className="px-3 py-2 text-center text-slate-600 font-medium">
      {(p === 'starter' || p === 'trial' || p === 'tester') ? 'Pay at Hatch' : '0.99% + card fee'}
    </td>
  ))}
</tr>
```

with **QUOTED** `app/admin/page.tsx:160`:

```ts
const PLAN_ORDER: Plan[] = ['starter', 'trial', 'tester', 'demo', 'pro', 'max']
```

### What it actually put on screen

```
  Row                       STARTER         TRIAL           TESTER          DEMO            PRO             MAX
  Walk-up orders            0%              0%              0%              0%              0%              0%
  Online orders             Pay at Hatch    Pay at Hatch    Pay at Hatch    0.99% + card…   0.99% + card…   0.99% + card…
```

### 🔴 EVERY DIFFERENCE AGAINST `TRANSACTION_ROWS`, REPORTED BEFORE CHANGING ANYTHING

**Seven differences.** Four are wrong claims, three are structural.

| # | Difference | What Admin has been showing |
|---|---|---|
| **1** | 🔴 **`trial` → "Pay at Hatch"** | The **same false claim** Manage had — but here it was **written by hand**, not produced by a missing column. A trial truck carries `TRIAL_FEATURES = [...MAX_FEATURES]`; `canAccess('trial','online_payments')` is **true**. Admin has been telling staff that a trial truck cannot take online card payments. |
| **2** | 🔴 **`tester` → "Pay at Hatch"** | Same falsehood, same line. `tester: new Set(MAX_FEATURES)`; `canAccess('tester','online_payments')` is **true**. |
| **3** | 🔴 **`demo` → "0.99% + card fee"** | **`demo` is absent from that ternary's list**, so it fell through to the paid branch. The one prospect-**sandbox** plan — a plan nobody is ever billed for — was the only internal plan shown a commission. Nobody wrote this as a claim either; it is the shape of the condition, not a decision. |
| **4** | 🔴 **`pro`/`max` → "0.99% + card fee"** | **The included allowance was omitted entirely.** Admin has never displayed £1,500 or £2,000 anywhere in this table, so an internal reader checking a Pro truck's position saw the fee without the allowance that precedes it — the more favourable half of the offer, missing. |
| **5** | Two rows, not three | "Walk-up orders" + "Online orders", vs "Walk-up orders" / "Online orders included" / "Fee after that". |
| **6** | `0%` was a **literal**, not data | The walk-up row hardcoded the string `0%` into every cell; it read nothing at all. Its *values* happened to be right. |
| **7** | No footnote markers | Neither fee row carried a `<sup>`, although Admin renders the full `FOOTNOTES` block at the bottom of the same table. Footnotes 1 and 2 were on screen with nothing in the fee section pointing at them (they were referenced from feature rows further down). |

⚠️ **Differences 1-3 are the same failure mode you flagged**: a per-plan claim produced by the *shape of
a condition* rather than by anyone stating it. In Manage it was `p === 'trial' ? row.values.starter`; here
it is which plan names happen to appear in a ternary's left-hand list. Three of the six columns were
wrong, and no one had asserted any of them.

---

## 2. WHAT CHANGED, AND WHERE THE VALUES LIVE NOW

### The edit

The two hand-written `<tr>` blocks are replaced by a map over the shared constant:

```tsx
{TRANSACTION_ROWS.map(row => (
  <tr key={row.name} className="border-t border-slate-100">
    <td className="px-4 py-2 text-slate-700">
      {row.name}
      {row.footnote && <sup className="text-slate-400 ml-0.5">{row.footnote}</sup>}
    </td>
    {PLAN_ORDER.map(p => (
      <td key={p} className="px-3 py-2 text-center text-slate-600 font-medium">
        {row.cells[FEE_COLUMN_FOR[p]]}
      </td>
    ))}
  </tr>
))}
```

plus the import (`TRANSACTION_ROWS` added to the existing `@/lib/plan-features` line) and one new
mapping constant beside `PLAN_ORDER`.

### ⚠️ `FEE_COLUMN_FOR` — the one decision I made, declared

Admin shows **six** plans; `TRANSACTION_ROWS` carries the **four** a customer can be on. `tester` and
`demo` have no fee column, so they are **mapped**, not given values — the shared table's numbers are
untouched, as instructed.

```ts
const FEE_COLUMN_FOR: Record<Plan, 'trial' | 'starter' | 'pro' | 'max'> = {
  starter: 'starter',
  trial:   'trial',
  tester:  'trial',
  demo:    'trial',
  pro:     'pro',
  max:     'max',
}
```

**Why `trial` for both** — evidence, not preference:

- `lib/features.ts`: `TRIAL_FEATURES = [...MAX_FEATURES]`, `tester: new Set(MAX_FEATURES)`,
  `demo: new Set(TRIAL_FEATURES)` with the comment *"Mirrors TRIAL's feature profile"*. **Verified at
  runtime: all three sets are 22 features and identical.**
- All three are **non-paying** — trial and demo by definition, tester on a lifetime arrangement.
- Admin's own feature-row renderer already treats tester as trial's twin:
  `(p === 'trial' || p === 'tester') && isPayAtHatch ? true`.

⚠️ **It is still a mapping decision, not a fact read out of the code.** There is no fee logic anywhere to
check it against — no `application_fee_amount` is sent on any charge, so the allowances and the 0.99%
are commercial statements, not gated behaviour. If internal trucks should instead be shown the paid
position, change those two entries to `'max'`. One line, and it is stated in the code comment too.

### No value is duplicated anywhere

`TRANSACTION_ROWS` is now the sole definition, with **three renderers**: the landing page, Manage →
Billing, and Admin. See section 5 for the grep.

---

## 3. ITEM 3 — MASKING ON ADMIN. NO CONFLICT, AND NOTHING TO CHOOSE

**Does `NON_SECRET_PRICE` masking apply on this screen? No — and it never did.**

Verified: `app/admin/page.tsx` **does not import `@/lib/pricing`**, makes **no `px()` call**, and does
**not** use `usePriceMask`. Its plan header already renders `PLAN_PRICES[p]` raw — Admin shows `£29/mo`
and `£49/mo` in full while Manage shows "TBC" until pricing is published.

**Should it? It already does what you describe, and no change was needed.** The reason is that the mask
is not a property of the shared source:

- `TRANSACTION_ROWS` holds **plain strings**. It masks nothing.
- **Masking is each surface's own decision, applied at the point of render.** Manage wraps every cell in
  `px()` because an operator must not see unpublished pricing. The landing page does not, because it is
  the sales page. Admin does not, because it is internal.

So the premise of the concern — "the shared source masks them" — does not hold. Admin gets the real
figures, including the `£1,500` and `£2,000` it has **never shown before**, and it gets them precisely
because it does not mask.

**Nothing to choose, and no options to lay out.** The one thing worth noting: this is now the only
surface that displays the allowance amounts pre-launch. That is the correct behaviour for an internal
screen and is stated in the code comment so it does not look like an oversight later.

---

## 4. ITEM 4 — ADMIN'S VISUAL TREATMENT, KEPT

| | Kept as Admin's | From the shared source |
|---|---|---|
| Table element | `<table>/<tbody>/<tr>/<td>` — unchanged | — |
| Label cell | `px-4 py-2 text-slate-700` — unchanged | — |
| Value cell | `px-3 py-2 text-center text-slate-600 font-medium` — unchanged | — |
| Row separator | `border-t border-slate-100` — unchanged | — |
| Section header row | `bg-slate-50 … colSpan={PLAN_ORDER.length + 1}` — unchanged | — |
| Footnote marker | `<sup className="text-slate-400 ml-0.5">` — **copied from Admin's own feature rows**, not from Manage or landing | — |
| Column set and order | six plans, `PLAN_ORDER` — unchanged | — |
| Masking | none — unchanged | — |
| **Row structure** | — | 🔴 three rows |
| **Every cell value** | — | 🔴 the same constant |
| **Row names** | — | 🔴 "Online orders included" / "Fee after that" |
| **Footnote numbers** | — | 🔴 `1` and `2` |

Nothing from the landing stylesheet or from Manage's Tailwind was brought across. The `<sup>` styling is
Admin's own idiom, taken from twelve lines below in the same table.

---

## 5. ITEM 5 — GREP: NO HARDCODED COPY SURVIVES

### Search A — the fee value literals, everywhere

```
grep -rn "Pay at Hatch\|0\.99%\|£1,500\|£2,000" --include="*.ts" --include="*.tsx" app lib components \
  | grep -v node_modules
```

**Result: 19 hits, and not one of them is a fee-table cell.** Classified in full:

| Hit | What it is |
|---|---|
| `lib/plan-features.ts:99-101` | 🔴 **the single source** — the three rows themselves |
| `lib/plan-features.ts:186` | the FOOTNOTES text (part of the same shared source) |
| `app/admin/page.tsx:731, 734, 736` | **inside the JSX comment** documenting the removed ternary. Verified: `:728` opens `{/* … */}` and `:743` is the map. Not executable. |
| `app/manage/[token]/page.tsx:10105` | inside the comment documenting Manage's removed fallback |
| `app/landing/page.tsx:57, 60` | inside the comment documenting the removed `LANDING_FEE_ROWS` |
| `app/landing/page.tsx:50`, `app/admin/page.tsx:770`, `app/manage/[token]/page.tsx:10136` | `row.name === 'Online ordering — Pay at Hatch'` — a **feature-row name**, not a fee |
| `lib/pricing.ts:4, 13, 15, 31` | the non-secret set and its prose |
| `lib/features.ts:148` | `PLAN_META.trial.description` |
| `app/manage/[token]/page.tsx:756` | the trial reminder banner's prose |
| `lib/payments/online.ts:16`, `lib/payments/ledger.ts:693`, `app/api/dashboard/action/route.ts:512` | code comments about a future platform fee |

### Search B — every consumer of the shared constant

```
grep -rn "TRANSACTION_ROWS" --include="*.ts" --include="*.tsx" app lib components | grep -v node_modules
```

**Three renderers, one definition:**

```
app/landing/page.tsx:389            {TRANSACTION_ROWS.map(row => (
app/admin/page.tsx:743              {TRANSACTION_ROWS.map(row => (
app/manage/[token]/page.tsx:10090   {TRANSACTION_ROWS.map(row => (
lib/plan-features.ts:94             export const TRANSACTION_ROWS: {
```

### Search C — any other array of fee rows

```
grep -rn "Walk-up orders\|Online orders included\|Fee after that" --include="*.ts" --include="*.tsx" app lib components
```

Only `lib/plan-features.ts:99-101` (the source), `app/admin/page.tsx:729` (the comment), and
`app/landing/page.tsx:310` — a marketing bullet, `<li>Walk-up orders &amp; kitchen screen</li>`, which
is not a fee row.

### ⚠️ TWO PROSE MENTIONS OF THE FIGURES SURVIVE, BOTH OUT OF SCOPE

Not fee tables, but they restate the numbers and would drift if the source changed:

1. **`app/landing/page.tsx:293`** — a marketing paragraph: *"Pro is £29 a month with £1,500 of online
   orders included. Max is £49 with £2,000. Anything above that is 0.99%."* Every figure spelled out in
   prose. The brief forbids touching the landing page.
2. **`app/admin/page.tsx:1131`** — *"0.99% transaction fee still applies at standard rate"*, in a
   different region of the admin page. The brief forbids changing anything else on this page.

**Answer to item 5: no hardcoded copy of the fee ROWS survives anywhere.** Two prose restatements of the
same figures do, both outside this build's scope, and both are candidates for deriving from `CARD_FEES`
/ `TRANSACTION_ROWS` in their own change.

---

## 6. VERIFICATION

Run against the real modules via jiti. **Read-only: no database, no network, no writes.** Admin's BEFORE
behaviour is reconstructed from the git-HEAD expression, so the comparison is against what the screen
actually rendered, not against what I intended.

### Before and after

```
── ADMIN BEFORE ─────────────────────────────────────────────────────────────────────
  Row                       STARTER         TRIAL           TESTER          DEMO            PRO             MAX
  Walk-up orders            0%              0%              0%              0%              0%              0%
  Online orders             Pay at Hatch    Pay at Hatch    Pay at Hatch    0.99% + card fee  0.99% + card fee  0.99% + card fee

── ADMIN AFTER ──────────────────────────────────────────────────────────────────────
  Row                       STARTER         TRIAL           TESTER          DEMO            PRO             MAX
  Walk-up orders(1)         0%              0%              0%              0%              0%              0%
  Online orders included(2) —               Unlimited       Unlimited       Unlimited       £1,500          £2,000
  Fee after that(2)         Pay at Hatch    Free            Free            Free            0.99%           0.99%
```

### 🔴 EVERY VALUE THAT CHANGED, AND WHAT ADMIN USED TO SHOW

| Plan | Admin showed | Admin now shows | Verdict |
|---|---|---|---|
| **starter** | `Pay at Hatch` | `—` / `Pay at Hatch` | **Same claim**, split across the two rows. No change in meaning. |
| **trial** | `Pay at Hatch` | `Unlimited` / `Free` | 🔴 **CHANGED — the old value was false.** Trial carries Max's feature set; online payments are included. |
| **tester** | `Pay at Hatch` | `Unlimited` / `Free` | 🔴 **CHANGED — the old value was false**, for the same reason. |
| **demo** | `0.99% + card fee` | `Unlimited` / `Free` | 🔴 **CHANGED — the old value was false**, and by accident: `demo` was simply missing from the ternary's list. |
| **pro** | `0.99% + card fee` | `£1,500` / `0.99%` | 🔴 **CHANGED — the allowance was missing.** Admin has never displayed £1,500. The fee itself is unchanged. |
| **max** | `0.99% + card fee` | `£2,000` / `0.99%` | 🔴 **CHANGED — same.** Admin has never displayed £2,000. |
| **walk-up, all six** | `0%` | `0%` | Unchanged — verified per plan. |

**Five of six columns changed on the online row. Four of those five were showing something untrue.**

### Assertion output

```
  PASS  walk-up unchanged for starter / trial / tester / demo / pro / max   [0% -> 0%]

── ALL THREE SURFACES NOW AGREE ─────────────────────────────────────────────────────
  PASS  trial:   admin cell === landing/Manage cell, all three rows   [0% | Unlimited | Free]
  PASS  starter: admin cell === landing/Manage cell, all three rows   [0% | — | Pay at Hatch]
  PASS  pro:     admin cell === landing/Manage cell, all three rows   [0% | £1,500 | 0.99%]
  PASS  max:     admin cell === landing/Manage cell, all three rows   [0% | £2,000 | 0.99%]
  PASS  FEE_COLUMN_FOR is the identity for every customer-facing plan

── tester / demo SHARE trial's FEATURE SET (the basis for the mapping) ──────────────
  PASS  tester feature set === trial   [22 vs 22]
  PASS  demo feature set === trial   [22 vs 22]
  PASS  tester can take online payments (so "Pay at Hatch" was false)
  PASS  demo can take online payments (so "0.99% + card fee" was not a Pay-at-Hatch plan either)

── NO MASKING ON ADMIN ──────────────────────────────────────────────────────────────
  PASS  admin does not import lib/pricing
  PASS  admin makes no masking call
  PASS  admin renders TRANSACTION_ROWS

ALL PASSED
```

For the four customer-facing plans, `FEE_COLUMN_FOR` is the identity, so Admin's cell is **provably the
same string** the landing page and Billing render. The only per-surface difference remaining is Manage's
`px()` masking, which is deliberate.

### ⚠️ One false failure I caught in my own harness

`ok('admin does not call px( or maskPrice', !/\bpx\(/…)` **failed while the code was correct** — it was
matching the sentence in my new comment that explains *why* Billing masks and Admin does not. Narrowed
to the executable form `{px(`. Same self-documentation trap as the previous turn; stated rather than
quietly re-run.

### Typecheck

`npx tsc --noEmit` — clean. `FEE_COLUMN_FOR` is typed `Record<Plan, …>`, so adding a plan to `Plan`
without giving it a fee column is now a compile error rather than a silent fall-through — which is
exactly how `demo` came to be showing 0.99%.

---

## 7. NON-ASCII CENSUS

`app/admin/page.tsx` — the only modified file, compared against `git show HEAD:app/admin/page.tsx`:

**26 classes before, 26 after. GAINED: none.**

Counts moved only within the existing vocabulary: `—` 69 → 74, `─` 481 → 546, `⚠` 8 → 14,
`️`(U+FE0F) 7 → 13. Unchanged: `£`(4) `§`(2) `·`(15) `–`(1) `…`(12) `→`(7) `⇒`(1) `⚙`(1) `✅`(3) `✓`(5)
`✗`(1) `＋`(1) `🌍`(2) `🎟`(1) `💚`(2) `📋`(1) `🔐`(1) `🔒`(2) `🖥`(1) `🚚`(1) `🧪`(2) `🧹`(2).

⚠️ **`🔴` (U+1F534) does not appear in `app/admin/page.tsx` and was deliberately not introduced.** Every
comment added to that file uses `⚠️`, which is already in its vocabulary. The `🔴` markers in this report
are the report's own; the emphasis in the code reads `⚠️` throughout.

⚠️ `£` stayed at **4**. The allowance amounts Admin now displays arrive from `lib/plan-features.ts` at
runtime — no `£` was written into this file.

---

## 8. WHAT WAS NOT TOUCHED

- **`TRANSACTION_ROWS` values** — `lib/plan-features.ts` was not opened for editing. Verified by
  `git status`: **`app/admin/page.tsx` is the only modified file.**
- **The landing page and Manage** — unchanged.
- **Plan entitlements and gates** — `lib/features.ts` read only. `PLAN_FEATURES`, `canAccess`,
  `hasFeature`, `PLAN_META`: unchanged. No feature does anything different.
- **Everything else on the admin page** — the plan header row, the feature-section rows, the footnote
  block, `OVERRIDEABLE_FEATURES`, the truck list, the create-truck modal and every other region are
  unchanged. Inside the plan table, only the two fee `<tr>` blocks were replaced; `PLAN_ORDER` itself is
  untouched, and `FEE_COLUMN_FOR` was added beside it.
- **`lib/pricing.ts`** — not touched this turn. Admin still does not import it, by design.
