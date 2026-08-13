# A part-paid order after an edit: three fixes

**Date:** 13 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration — none was needed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 FIX 3 WAS THE RESOLVER, AND IT IS THE SAME CLASS AS THE DOUBLE-CHARGE

**Measured on order 59 before any change:**

```
balance                 : {"paidMinor":650,"balanceMinor":650,"status":"part_paid"}
readEmailPaymentState   : "captured"          <- 🔴 the resolver
readOrderBalance        : part_paid, £6.50 outstanding
```

**Every check in the resolver was about the INTENT, not the ORDER.** `readEmailPaymentState` asks *"is there a `stripe_pi:` row for this intent"*; `emailPaymentStateFromCapture` asks *"did the capture succeed"*. **Both are still yes after an edit doubles the total**, and neither can see that the order now wants more money than was ever taken.

⚠️ **That is the capture-guard bug, in words, to the customer.** That one asked *"has this intent been captured?"* when it needed *"does this order still owe money?"* and double-charged two customers; this one says *"Paid by card"* to a customer who owes half. **`getOrderBalance` is the answer in both cases.** Fixed at the resolver, not in the edit email.

**After:**
```
resolveEmailPaymentState -> "part_paid"
short : "£6.50 paid, £6.50 still to pay"
```

| Fix | Where | Result |
|---|---|---|
| 1 | `OrderCard.tsx` | `£6.50 / £6.50 due` → **`£6.50 paid, £6.50 due`** |
| 2 | `OrderCard.tsx` | Off the header row, onto its own full-width line above the items |
| 3 | `email-payment-state.ts` + `email.ts` + the edit site | A fifth state, `part_paid`, with figures |

---

## FIX 1 — the string

**Was**, and it parses as a fraction:
```tsx
: effectivePartPaid ? <span className="… whitespace-nowrap">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
```

**Is now** — the exact string, lifted from the rendered markup:

```html
<button title="Tap for how to refund this" class="w-full mb-2 rounded-md bg-amber-100 text-amber-800 px-2 py-1 text-xs font-black text-center">£6.50 paid, £6.50 due</button>
```

# 🔴 `£6.50 paid, £6.50 due`

⚠️ **On this order the two amounts are equal**, which is the worst possible case for a reader of a fraction — *six-fifty out of six-fifty* reads as settled. Naming each number removes the ambiguity entirely.

---

## FIX 2 — it now fits, in every mode

**The header branch returns `null`** and a new `partPaidRow` renders inside the existing `px-4 pb-3 pt-2` block, immediately above the items:

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
    <button
      onClick={() => setConfirmRemovePayment(true)}
      title={hasReversibleInPersonPayment ? 'Tap to remove this payment' : 'Tap for how to refund this'}
      className="w-full mb-2 rounded-md bg-amber-100 text-amber-800 px-2 py-1 text-xs font-black text-center">
      {money(balance.paidMinor)} paid, {money(balance.balanceMinor)} due
    </button>
  )
```

🔴 **`w-full`, no `whitespace-nowrap`, no `flex-shrink-0`.** The previous chip had all three inverted — unshrinkable, non-wrapping, competing on the busiest row. **A full-width block cannot exceed the card; at a narrow viewport it wraps to a second line instead of pushing anything wider.**

### 🔴 ALL THREE VIEW MODES, MEASURED

```
[solo  ] before: "£6.50 / £6.50 due"  after: "£6.50 paid, £6.50 due"  in header? before=true after=false  nowrap after=false
[window] before: "£6.50 / £6.50 due"  after: "£6.50 paid, £6.50 due"  in header? before=true after=false  nowrap after=false
[cook  ] before: null                 after: null                     in header? before=false after=false
```

| Mode | What it looks like | Note |
|---|---|---|
| **solo** (dashboard) | Full-width amber line under the header, directly above the item list | The mode you saw |
| **window** (KDS grid, ~240px) | 🔴 **The mode that could not accommodate it before.** Its header is already two rows carrying `#order`/`£total` and `name`/`time`/`late`; the chip was on row 1 with the price. Now it is a full-width line below, which at 240px wraps rather than overflows | |
| 🔴 **cook** | ⚠️ **DELIBERATELY ABSENT.** Cook shows no prices at all (`showPrices = viewMode !== 'cook'`) and its header carries no payment chip today. **Adding a money line would put money on the one screen deliberately without it** — so it is absent there rather than overflowing there, and that is a decision, not an omission | |
| **narrow viewport** | Wraps to two lines inside the card | ⚠️ **INFERRED from the class list**, not pixel-measured: no `nowrap`, no `flex-shrink-0`, block-level `w-full`. The rendered markup confirms `nowrap after=false` |

✅ **The header row is untouched.** The time label, order number, buzzer chip, price, name and PAID/CARD HELD/REFUNDED chips are all exactly where they were — `in header? after=false` is the whole change, and the new row sits inside a block that already existed, so **nothing above it moves and the "in 6h" line's spacing is unchanged.**

✅ **It keeps the tap target**, so the correction path is unchanged — same modal, same card-vs-cash branch.

---

## FIX 3 — the email

### The fix, at the resolver

```ts
  let state: EmailPaymentState | null = capture ? emailPaymentStateFromCapture(capture) : null
  if (!state) state = await readEmailPaymentState(supabase, orderKey)
  …
  if (state !== 'captured') return state
  try {
    const balance = await readOrderBalance(supabase, orderKey)
    if (balance.balanceMinor > 0) return 'part_paid'
    return 'captured'
  } catch (err) {
    …
    return 'unknown'
  }
```

### 🔴 WHY ONLY THE `captured` BRANCH IS RE-EXAMINED

**It is the only state that ASSERTS SETTLEMENT.** `'hatch'` already says money is owed; `'unknown'` already says do not pay again; `'held'` is left alone deliberately (see the limit below). ⚠️ **One extra pair of reads, on the settled path only** — emails are rare, a wrong one is not.

⚠️ **A balance we cannot read returns `'unknown'`, not `'captured'`.** *"Paid by card"* is the one sentence that cannot be walked back. `'unknown'` says neither and asks them not to pay twice — imperfect for someone who genuinely owes the remainder, and the safer of the two.

### The fifth state's sentence

**HTML** (amber, matching the card's line):
```html
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
  <p style="…color:#92400e">Part paid &mdash; £6.50 still to pay</p>
  <p style="…color:#b45309">£6.50 of this order is paid. The remaining £6.50 is due when you collect.</p>
</div>
```
**Plain text:** `Part paid: £6.50 received, £6.50 still to pay when you collect.`
**`short`** (what the edit email's footer uses): `£6.50 paid, £6.50 still to pay`
**`readySuffix`:** ` £6.50 still to pay.`

⚠️ **The figures come from `getOrderBalance` via the caller, never from the formatter** — `paymentNote(state, truckName, amounts?)`. **A caller with no cheap balance gets the same sentence without figures** (*"Part paid. Some of this order is still to pay when you collect."*) — vaguer, never wrong. The edit site supplies them because it is the one that got this wrong, and a customer reading *"New total £13.00"* needs both numbers.

### 🔴 THE OTHER FOUR CALLERS ARE UNCHANGED — PROVED BY EQUALITY

```
held      html IDENTICAL  text IDENTICAL  short IDENTICAL  readySuffix IDENTICAL
hatch     html IDENTICAL  text IDENTICAL  short IDENTICAL  readySuffix IDENTICAL
captured  html IDENTICAL  text IDENTICAL  short IDENTICAL  readySuffix IDENTICAL
unknown   html IDENTICAL  text IDENTICAL  short IDENTICAL  readySuffix IDENTICAL
```

**Every existing sentence is byte-identical to HEAD**, and none of the four other call sites was edited — they pass no `amounts`, so they are unaffected by the new parameter.

### ⚠️ ONE STATED LIMIT, NOT FIXED

**A `held` order edited UPWARD has the same shape**: the hold covers only part of the new total, so *"nothing to pay at the truck"* becomes wrong for it too. **Fixing it needs a different sentence** — a hold that is too small, rather than money already taken — and it is not the case order 59 reported. **Recorded in the resolver, not built.**

⚠️ **And a stale cache, noted in passing:** order 59's `orders.payment_status` still reads `'paid'` with `amount_paid: 6.50` against a `total: 13.00`. The edit did not re-run `recalcOrderPayment`. **The resolver is unaffected — it reads the ledger, not the column** — but the column is wrong. **Out of scope by instruction** (*do not change how an edit recalculates the total*); flagged.

---

# VERIFICATION

**Method: the REAL `OrderCard` rendered with `react-dom/server` in all three view modes, and the REAL `paymentNote` / `resolveEmailPaymentState`, each run against HEAD and the working tree — same data, two versions.**

## 🔴 WRITES DECLARED: NONE

```
WRITES PERFORMED: 0 (every query above is a SELECT)
```

Order 59 and every comparison order already existed. ⚠️ **One in-memory substitution, declared:** `status` forced to `'ready'` on the object passed to the component, because the card renders its completion row only at that stage. **No row was written.** ⚠️ `account_is_test` is stamped exactly as `/api/dashboard` stamps it, or every sandbox card row would silently stop counting.

## (a) Order 59 — the chip

```
ledger  : ["online/650"]   total_minor=1300
balance : {"paidMinor":650,"balanceMinor":650,"status":"part_paid"}
[solo  ] before "£6.50 / £6.50 due"  ->  after "£6.50 paid, £6.50 due"   header: true -> false
[window] before "£6.50 / £6.50 due"  ->  after "£6.50 paid, £6.50 due"   header: true -> false
[cook  ] before null                 ->  after null
```

## (b) The edit email for order 59

```
🔴 resolveEmailPaymentState  BEFORE "captured"   AFTER "part_paid"
EDIT EMAIL short  BEFORE : "Paid by card"
EDIT EMAIL short  AFTER  : "£6.50 paid, £6.50 still to pay"
BOX HTML : …Part paid &mdash; £6.50 still to pay… £6.50 of this order is paid. The remaining £6.50 is due when you collect.
BOX TEXT : "Part paid: £6.50 received, £6.50 still to pay when you collect."
```

🔴 **The customer is told what was paid and what is outstanding, in both halves of the email.**

## (c) A fully paid order — unchanged

```
======== (c) captured #60 ========
balance : {"paidMinor":2100,"balanceMinor":0,"status":"paid"}
resolveEmailPaymentState  BEFORE "captured"   AFTER "captured"
EDIT EMAIL short  BEFORE : "Paid by card"     AFTER : "Paid by card"
BOX TEXT : "Paid by card. Your payment has gone through — nothing to pay at the truck."
```

✅ **A genuinely settled card order still resolves `captured`** — the new balance check confirms it rather than changing it. No chip renders in any mode.

⚠️ **A second fixture, order #14, resolves `hatch` before and after** — it has no `order_drafts` row, so the resolver never reaches the balance check. Unchanged either way, and worth noting that a card order whose draft has been purged reads `hatch`.

## (d) An unpaid order — unchanged

```
balance : {"paidMinor":0,"balanceMinor":2750,"status":"unpaid"}
resolveEmailPaymentState  BEFORE "hatch"  AFTER "hatch"
EDIT EMAIL short  BEFORE : "Pay at the truck on collection"   AFTER : "Pay at the truck on collection"
[solo/window/cook] no part-paid row in any mode
```

## (e) A card-held order — unchanged

Shown above: `held` renders byte-identical HTML, text, `short` and `readySuffix` to HEAD. **The `'held'` branch of the resolver returns before the new balance check ever runs.**

## Tooling
```
$ npx tsc --noEmit  -> clean
$ npx eslint <the four files>  -> 26 problems before, 26 after (all pre-existing)
```
⚠️ One new warning was introduced and removed during the build (an unused `duePart`); the count is back to baseline.

---

# 🔴 NON-ASCII CENSUS

**One violation was introduced and caught by the census, then corrected:** `lib/email.ts` has never carried `🔴`, `⚠️` or `⇒`, and my first draft of the part-paid comment used all three — it went 16 → 20 distinct. Rewritten in that file's own vocabulary. `email-payment-state.ts` likewise gained `£` and was rewritten to `650p`/`1300p`.

| File | Before | After | Distinct set |
|---|---|---|---|
| `components/dashboard/OrderCard.tsx` | 1387 / **31** | 1508 / **31** | **identical** |
| `lib/email.ts` | 91 / **16** | 94 / **16** | `£ · × – — … → ↳ ⏰ ✓ 🎁 🎉 📍 📝 📞 🔔` **identical** |
| `lib/payments/email-payment-state.ts` | 224 / **5** | 390 / **5** | `— ─ ⚠ 🔴 ️` **identical** |
| `app/api/dashboard/action/route.ts` | 2826 / **16** | 2860 / **16** | **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS. Four files changed; no other file was modified; no migration.**

---

# Standing

- ⚠️ **A `held` order edited upward still reads "nothing to pay at the truck".** Same class, different sentence, recorded in the resolver.
- ⚠️ **Order 59's `orders.payment_status` is stale at `'paid'`** for a £13.00 order with £6.50 recorded. The edit path does not recalc; out of scope by instruction.
- ⚠️ **Cook mode shows no part-paid state at all**, by design. If a cook screen ever needs money, that is a separate decision about what cook mode is for.
