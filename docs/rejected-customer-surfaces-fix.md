# Rejected orders on the customer surfaces — the fix

**All four changes are in: (a) the Payment row, (b) the ladder, (c) the Status colour, (d) the `?confirm=`
guard.** No route was widened, `order_drafts` was not read, no resolver was imported, `rejection_reason`
was not added. **Everything came from `status` and `payment_status`, both already on the page.**

⚠️ **ONE DELIBERATE NARROWING OF (a)'s CONDITION, AND IT IS THE ONE THING TO CHECK BEFORE YOU ACCEPT
THIS.** The brief said *"unless `payment_status === 'paid'`"*. **I gated the new sentence on
`payment_status === 'unpaid'` instead.** Both agree everywhere except one case, and in that case the
brief's literal rule prints something false. **Full reasoning and the one-line revert in §A.**

**All six established facts were re-read and are TRUE.** None had changed; nothing to stop for.

---

# PHASE 1 · READ-ONLY, EACH FILE ON ITS OWN

## 1 · The manage page — `app/order/[id]/manage/page.tsx`

**`canCancel` and `statusLabel`, before the change. READ:**

```tsx
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed', 'modified'].includes(order.status) &&
    !isPastCutoff()

  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    if (!order.allow_cancellation) return 'Cancellations are not accepted for this order.'
    // Any remaining status (rejected, or one added later) is genuinely past cancelling. …
    return 'This order can no longer be cancelled.'
  }
```

**The Payment row and the Status row, before the change. READ:**

```tsx
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-500">Payment</span>
            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <span className={`font-medium capitalize ${
              order.status === 'cancelled' ? 'text-red-500' :
              order.status === 'ready' ? 'text-green-500' :
              'text-slate-900'
            }`}>
              {order.status}
            </span>
          </div>
```

## 2 · The receipt — `app/trucks/[slug]/order/page.tsx`

**The status guard, before the change. READ:**

```tsx
        // ⚠️ A CANCELLED ORDER IS NOT A CONFIRMATION. Rendering "Order confirmed!" over a cancelled row
        // would be actively wrong, so it is refused here with copy that says what happened rather than
        // pretending the order is missing.
        if (d?.status === 'cancelled') {
          setConfirmError('This order has been cancelled.')
          setConfirmLoading(false)
          return
        }
```

**The `autoAccepted` derivation and the headline it drives. READ:**

```tsx
        autoAccepted={confirmOrder.status === 'confirmed'}
```
```tsx
  <h2 className="text-2xl font-black text-slate-900 mb-1">{autoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
  <p className="text-slate-500 mb-3 text-sm">
    {autoAccepted
      ? <>Thanks! We&apos;ve received your order and it&apos;ll be ready soon.</>
      : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
    }
  </p>
```

`'rejected' !== 'confirmed'` → the second branch. **Confirmed by reading this file, not inferred from the
other one.**

## 3 · What the two pages share

✅ **Only `/api/orders/[id]`. No component, no helper, no constant.**

**Established from the import lists.** The manage page imports **two things, both framework**:

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
```

The receipt imports ~30 modules — `@/lib/payments/sold-out-copy`, `@/components/dashboard/DealsModal`,
`@/lib/basket-utils` and so on. ⚠️ **The intersection with the manage page's list is empty**, and the
receipt's `OrderConfirmation` is a **local function in its own file**, not an import.

⚠️ **They call the route differently:** the receipt sends `?truck=<slug>` and the manage page sends no
query at all. **Two sentences that must match now match by hand, not by construction** — see §D.

## 4 · Every status that reaches the Payment row

🔴 **ALL OF THEM. The Payment row is unconditional. READ** — it sits in the always-rendered "Order
details" block, with no `&&` and no ternary above it; the only things that can pre-empt it are the
`loading`, `error`, local-`cancelled` and `!order` early returns, none of which is a status.

**So: `pending`, `confirmed`, `modified`, `cooking`, `ready`, `collected`, `cancelled`, `rejected` — the
complete set this codebase writes — all render it.**

✅ **Which is why the condition is stated POSITIVELY**, as asked, rather than as a list of exceptions:

```tsx
  const isTerminalUnfulfilled = order.status === 'rejected' || order.status === 'cancelled'
```

**What is TRUE of exactly those two and of no other status: the order will never be served.** Every other
status is an order still on its way to a customer who really does still pay at the truck.

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| A change needs data the page does not have | ❌ **Not tripped.** All four use `status` and `payment_status` only |
| The Payment row changes for `cooking`, `ready`, `collected`, `pending`, `confirmed` or `modified` | ❌ **Not tripped — proven by execution**, §Phase 4 |
| Instructions contradict | ⚠️ **One tension, not a contradiction — resolved by NARROWING, and flagged.** §A |
| Garbled span | ❌ None |

**No established fact was false, so there was nothing to stop for on that count.**

---

# PHASE 3 · THE CHANGES

## A · The Payment row 🔴 and the one deviation

```tsx
              {order.payment_status === 'paid'
                ? 'Paid by card'
                : isTerminalUnfulfilled && order.payment_status === 'unpaid'
                  ? 'You have not been charged for this order.'
                  : 'Pay at the truck'}
```

✅ **`'paid'` is tested FIRST and its branch is byte-identical.** Money that moved is never denied. ✅ **The
colour expression is untouched** — `paid` green, everything else slate.

### 🔴 WHY `=== 'unpaid'` AND NOT `!== 'paid'`

**They differ on exactly one thing: a CANCELLED ORDER THAT WAS CHARGED AND THEN REFUNDED.**
`getOrderBalance` gives that row `payment_status = 'refunded'` — charges minus refunds is zero, and a
refund row exists. Under the brief's literal rule it is "not paid", so it would print:

> **"You have not been charged for this order."**

⚠️ **To somebody whose card really was charged, and who watched the money leave and come back.** The brief
asked for *"a statement that is true for every such order"*, and that is the one order it is not true of.
**`'unpaid'` is the only value that means nothing ever moved**, which is the only ground this sentence can
stand on without the draft data this page deliberately does not fetch.

**The reachable values, and where each lands:**

| `payment_status` | Rejected / cancelled order renders |
|---|---|
| `'paid'` | **"Paid by card"** — unchanged, brief's explicit exception |
| `'unpaid'` | **"You have not been charged for this order."** — the new line |
| `'refunded'`, `'refund_due'`, `'part_paid'` | ⚠️ **"Pay at the truck"** — today's line, unchanged |

⚠️ **THAT LAST ROW IS STILL WRONG AND I AM NOT HIDING IT.** *"Pay at the truck"* is no better for a
refunded cancelled order than it was before. **But the true sentence for it is copy nobody has written**,
and the last brief was explicit that wording is your decision — so it is reported rather than invented.
**It cannot affect a REJECTED order in practice:** reject is offered only on `pending` orders
(`components/dashboard/OrderCard.tsx`, `if (order.status === 'pending')` — READ), and no capture site
fires before confirmation, so a rejected row has no charge to refund. **It is a cancelled-order case
only.**

🔴 **IF YOU WANT THE LITERAL RULE INSTEAD, IT IS ONE EDIT:** delete `&& order.payment_status === 'unpaid'`.
That extends the new sentence to the three values in the last row.

## B · The ladder

```tsx
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    …
    if (order.status === 'rejected') return 'This order was not accepted by the truck.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
```

**One short sentence. No refund, no timeframe, no promise** — the discipline the cancelled screen's own
comment already settled on (*"WE ARE NEVER MERCHANT OF RECORD… NO TIMEFRAME"*). The money is answered one
row above, by the Payment line.

⚠️ **PLACED ABOVE `isPastCutoff()` AND THE POLICY BRANCH, DELIBERATELY.** Being refused outranks both: the
cancellation window is irrelevant to an order nobody is going to make. **Below the `cancelled` test**, so
that branch is unreachable-from and unchanged.

✅ **`cooking` still falls through to *"This order can no longer be cancelled."*** — it is not named in the
new branch and nothing above it was touched. **Proven by execution below.**

## C · The Status row colour

```tsx
              order.status === 'cancelled' || order.status === 'rejected' ? 'text-red-500' :
              order.status === 'ready' ? 'text-green-500' :
              'text-slate-900'
```

**It joins the existing red rather than getting a colour of its own** — the convention already reads red
as terminal and green as good news. ✅ **`ready`'s green and the slate default are untouched.**

## D · The receipt guard

```tsx
        if (d?.status === 'rejected') {
          setConfirmError('This order was not accepted by the truck.')
          setConfirmLoading(false)
          return
        }
```

**Same mechanism, same shape, immediately after the `'cancelled'` guard: one status test,
`setConfirmError`, `setConfirmLoading(false)`, `return`.** It renders through the **existing** 😕 branch
with its "← Back to truck page" link. ✅ **No new component. The `'cancelled'` guard, the 404 retry loop,
`autoAccepted` and everything else on that page are untouched** — the file's whole diff is these five
lines.

⚠️ **The sentence is deliberately the same as the manage page's**, so a customer who sees both is not told
two different things. **It is two separate string literals in two files that share no code** (§3) — if one
is reworded, the other must be reworded by hand.

---

# PHASE 4 · VERIFICATION, BY EXECUTION

**Method.** A harness **extracts the real expressions out of the file text** — `statusLabel`,
`isTerminalUnfulfilled`, the Payment ternary and the colour ternary — strips comments, and evaluates them
against a stub `order`. **Nothing is retyped**, so the harness cannot drift from the source. It does the
same to the pre-change copy and compares the two **as bytes**, over all 8 statuses × 3 `payment_status`
values.

⚠️ **`tsc --noEmit` passes and I am NOT offering it as verification.** `next dev` / `next build` were not
run. **Neither page was rendered** — every visual claim is READ-FROM-SOURCE and unobserved.

## 🔴 The headline: 20 of 24 combinations are byte-identical

```
IDENTICAL combinations: 20/24
CHANGED: 4

  cancelled/unpaid   payment:  "Pay at the truck" -> "You have not been charged for this order."
  rejected/unpaid    payment:  "Pay at the truck" -> "You have not been charged for this order."
                     colour:   "text-slate-900"   -> "text-red-500"
                     sentence: "This order can no longer be cancelled." -> "This order was not accepted by the truck."
  rejected/paid      colour:   "text-slate-900"   -> "text-red-500"
                     sentence: "This order can no longer be cancelled." -> "This order was not accepted by the truck."
  rejected/refunded  colour:   "text-slate-900"   -> "text-red-500"
                     sentence: "This order can no longer be cancelled." -> "This order was not accepted by the truck."
```

✅ **Every changed row is `rejected`, or `cancelled` with nothing ever paid. Nothing else moved.**

## The five scenarios asked for

### 1 · A rejected customer opens the manage page

**Executed output, `rejected` / `unpaid`:**

| | Value |
|---|---|
| Payment row | **"You have not been charged for this order."** |
| Status row | **`Rejected`** (raw column, `capitalize`) |
| Status colour | **`text-red-500`** — terminal, as `cancelled` reads |
| Sentence | **"This order was not accepted by the truck."** |
| Cancel button | **not shown** — `canCancel` false, as before |

### 2 · A `cooking` customer — unchanged, proven

**Executed, all three payment values:**

```
cooking    unpaid    | payment: Pay at the truck   | colour: text-slate-900 | sentence: This order can no longer be cancelled.
cooking    paid      | payment: Paid by card       | colour: text-slate-900 | sentence: This order can no longer be cancelled.
cooking    refunded  | payment: Pay at the truck   | colour: text-slate-900 | sentence: This order can no longer be cancelled.
```

✅ **All three appear in the 20 identical combinations.** The sentence is the fall-through it always was,
and the Payment row is untouched — `isTerminalUnfulfilled` is false for `cooking`.

### 3 · A `paid` order that is then rejected — does it still say "Paid by card"?

✅ **YES. Executed:** `rejected / paid` → `payment: Paid by card`, and that field is **identical to
pre-change**. Only the colour and the sentence changed for it. **The `'paid'` test is first and nothing
can reach past it.**

⚠️ **NOT REACHABLE IN PRACTICE, and tested anyway.** Reject is offered only on `pending` orders and no
capture fires before confirmation, so `rejected / paid` should not exist. **It is covered because "should
not exist" is not "cannot exist", and this is the one branch that must never deny a real charge.**

### 4 · A rejected order hits `?confirm=`

**READ-FROM-SOURCE — this page's logic was not extracted for execution** (it is inside a `fetch`
callback in a 4,000-line client component, and running it would mean stubbing the network):

The new guard matches `d.status === 'rejected'`, sets `confirmError`, and returns **before**
`setConfirmOrder`. `confirmError` is truthy, so the existing branch `if (confirmError || !confirmOrder)`
renders the 😕 card:

> 😕
> **This order was not accepted by the truck.**
> ← Back to truck page

✅ **`<OrderConfirmation>` is never constructed**, so *"Order received!"*, *"{truck} will confirm your
order shortly."* and its *"Pay at the truck"* line cannot render for a rejected order.

### 5 · `pending` and `confirmed` — nothing changed

**Executed, all six combinations:**

```
pending    unpaid/paid/refunded   → Cancel button, colour text-slate-900, payment unchanged
confirmed  unpaid/paid/refunded   → Cancel button, colour text-slate-900, payment unchanged
```

✅ **All six are in the 20 byte-identical combinations**, together with `modified`, `ready` and
`collected`.

## Changed executable lines, per file

| File | Before | After | − | + |
|---|---|---|---|---|
| `app/order/[id]/manage/page.tsx` | 178 | 184 | 2 | 8 |
| `app/trucks/[slug]/order/page.tsx` | 2555 | 2560 | 0 | 5 |

**The manage page's whole diff:**

```
+const isTerminalUnfulfilled = order.status === 'rejected' || order.status === 'cancelled'
+if (order.status === 'rejected') return 'This order was not accepted by the truck.'
-{order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
+{order.payment_status === 'paid'
+  ? 'Paid by card'
+  : isTerminalUnfulfilled && order.payment_status === 'unpaid'
+    ? 'You have not been charged for this order.'
+    : 'Pay at the truck'}
-order.status === 'cancelled' ? 'text-red-500' :
+order.status === 'cancelled' || order.status === 'rejected' ? 'text-red-500' :
```

**The receipt's whole diff:**

```
+if (d?.status === 'rejected') {
+  setConfirmError('This order was not accepted by the truck.')
+  setConfirmLoading(false)
+  return
+}
```

⚠️ **Nothing else is in either diff** — not the cancel button's gating, not `/api/orders/cancel`, not the
local `cancelled` success screen, not the operator side, no email, no payment code.

## Marking

| Claim | Status |
|---|---|
| The 24-combination table and the 20/24 identity | ✅ **EXECUTED** — expressions extracted from the file, byte-compared against the pre-change copy |
| Scenarios 1, 2, 3, 5 | ✅ **EXECUTED** |
| Scenario 4, the `?confirm=` render | ⚠️ **READ-FROM-SOURCE.** The guard was not executed |
| The two pages share only the route | ✅ **READ** — both import lists |
| Every status reaches the Payment row | ✅ **READ** — the row is unconditional |
| Reject is offered on `pending` only | ✅ **READ** — `OrderCard`. ⚠️ Not re-checked for every KDS view |
| A rejected row's `payment_status` is `'unpaid'` | ⚠️ **INFERRED** from `getOrderBalance`. **CANNOT DETERMINE** against a real row — Stripe has never been live. `select id, status, payment_status from orders where status = 'rejected';` settles it |
| **How either page LOOKS** | ⚠️ **UNOBSERVED.** Neither was rendered, at any width or status |

**Surfaces, kept apart:** §1 and §A–§C are `app/order/[id]/manage/page.tsx`. §2 and §D are
`app/trucks/[slug]/order/page.tsx`, read on its own. **No fact from one was used to justify a change in
the other**, and §3 records that they share no code — which is precisely why the matching sentence is two
literals and not one constant.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the two source files
and this report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
