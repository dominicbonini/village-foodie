# Two controls that lied, both fixed in one component

**Date:** 13 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. **No migration — none was needed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 BOTH FIXES LANDED IN ONE FILE, AND THAT IS THE FINDING ABOUT SURFACES

`components/dashboard/OrderCard.tsx` is the **only** persistent renderer of either control, and **the KDS renders the same component** (`kds/page.tsx:1330 <OrderCard …>`). One file, every view mode, both boards.

**Proved against real rows, before and after, with zero writes:**

```
(a) refund_due #19   BEFORE ["Mark paid"]   AFTER ["Collected"]
(a) refund_due #18   BEFORE ["Mark paid"]   AFTER ["Collected"]
(b) unpaid     #7    BEFORE ["Mark paid"]   AFTER ["Mark paid"]      <- unchanged
(c) card-paid  #14   chip tip BEFORE "Tap to remove this payment"  AFTER "Tap for how to refund this"
(d) cash-paid  #3    chip tip BEFORE "Tap to remove this payment"  AFTER "Tap to remove this payment"  <- unchanged
```

---

## FIX 1 — a settled order must not offer "Mark paid"

### The check that governed it — **QUOTED**, as it stood

```ts
  const isPaid = balance.status === 'paid' || balance.status === 'refunded' || balance.status === 'part_refunded'
  const isPartPaid = balance.status === 'part_paid'
```

### What it is now

```ts
  const SETTLED_STATUSES = ['paid', 'refunded', 'part_refunded', 'refund_due'] as const
  const isPaid = (SETTLED_STATUSES as readonly string[]).includes(balance.status)
  const isPartPaid = balance.status === 'part_paid'
```

### 🔴 THE FULL LIST, AND WHY EACH BELONGS

The test the list answers is **"would recording another payment be wrong?"**

| Status | In? | Why |
|---|---|---|
| `paid` | ✅ | Balance zero. The ordinary settled order |
| `refunded` | ✅ | Charged and fully given back. Closed — nothing to collect at the hatch |
| `part_refunded` | ✅ | Charged in full, some given back. The remainder is the truck's, not owed |
| 🔴 **`refund_due`** | ✅ **ADDED** | **MORE than the balance has been taken.** The worst member: `mark_paid` on order 18 produced a green *"marked paid"* toast, wrote nothing (`recordCollectionPayment`'s `balanceMinor <= 0` guard), and offered an Undo that would have deleted a real cash payment |
| `part_paid` | ❌ | Genuinely owes the remainder. The button reads `Mark £X.XX paid` and must stay |
| `unpaid` | ❌ | Owes the lot |
| ⚠️ `failed` | ❌ | **Unreachable and would be wrong anyway.** `getOrderBalance` never returns it — it exists on the column's CHECK only — and its meaning, *a payment attempt failed*, is "money IS owed" |

⚠️ **It is an ALLOW-list on purpose.** A status added to the CHECK in future keeps offering the button until someone decides otherwise — the safe direction, because **the cost of asking for money that is owed is one tap, and the cost of taking money that is not is a refund.**

### Every surface that renders this control — swept, not assumed

| Surface | Control | Verdict |
|---|---|---|
| 🔴 **`OrderCard` — `completionBtn`** | `Mark paid` / `Mark £X.XX paid` / `💷 Cash` + `💳 Card` / `Mark paid & collected` | ✅ **FIXED.** All labels branch off `effectivePaid`/`effectivePartPaid`, which derive from `isPaid`/`isPartPaid` — **one pair of values, so every mode and every split is covered by the one change** |
| **`OrderCard` — `completionBtnDisabled`** | the greyed placeholder behind the cooking gate | ✅ **FIXED by the same values.** Its own comment warns the two branches drift if only one is changed; they were changed together |
| **`OrderCard` — all three view modes** (solo / window / cook) | — | ✅ **No mode carries a second literal.** `grep -rn "'mark_paid'"` in the component returns only the two `onClick`s inside `completionBtn` |
| **KDS** | renders `<OrderCard>` | ✅ **FIXED by the same file.** Its own money surface is a footer label (`✓ paid` / `card held` / `£X due`) with no action |
| ⚠️ **Dashboard completed list** — the red repair button (`page.tsx:3140`) | `mark_paid` | ✅ **Already unreachable.** Gated on `hasUnrecordedPayment`, which requires `balanceMinor > 0`; a `refund_due` order is negative. **Checked, not assumed** |
| ⚠️ **The `paymentWarning` toasts** (`page.tsx:1777`, `kds:674`) | *"Record payment"* | ⚠️ **Left alone deliberately.** Transient, and only after a genuine write failure — a real outstanding balance. Not a persistent control |

---

## FIX 2 — undo must not claim it removed a card payment

### 🔴 THE TEST IS A ROW TEST, NOT AN ORDER TEST

```ts
  const hasReversibleInPersonPayment = (ledgerRows ?? []).some(
    r => r.kind === 'charge' && r.channel !== 'online' && r.livemode === true,
  )
```

**A mirror of `reverseCollectionPayment`'s own lookup, condition for condition** — it selects `.eq('kind','charge').neq('channel','online').eq('livemode', true)` and returns `reversal: 'none'` when that finds nothing. The dashboard already ships every one of those columns in `LEDGER_ROW_COLUMNS`, so the card answers the same question with no round trip and cannot disagree with the server.

⚠️ **Row, not order, and that distinction is load-bearing:** an order paid partly by card and partly in cash **has** a reversible row, and undo must keep working for it. Orders 18 and 19 are exactly that shape — and both correctly keep `"Tap to remove this payment"`.

### The decision: it still opens, and it tells the truth

**You asked whether it should simply not be offered. I chose to keep it, and here is the reasoning.**

Making the chip inert was the other option. **An operator who taps a PAID chip is asking a question, and a control that does nothing answers it with silence** — they tap again, then go looking for the setting they think they are missing. The held chip is inert because there is nothing to say beyond the chip's own word; **here there is: the money is real, it is on the customer's card, and getting it back is a different action.**

🔴 **What the operator now sees** — a modal with **no destructive button at all**:

> ### Paid by card
>
> Order **#14** was paid by card, so there is no payment record to remove here — the money is already on the customer's card.
>
> To give it back you need to **refund it in Stripe**, on your own Stripe dashboard. Removing the record here would not return anything.
>
> **[ Got it ]**

and the chip's tooltip changes with it: `Tap to remove this payment` → **`Tap for how to refund this`**.

⚠️ **IT NAMES STRIPE BECAUSE THE REFUND UI IS NOT BUILT.** When it is, that sentence is the only thing that changes — the branch itself stays. ⚠️ And per `docs/refund-ui-report.md` a platform **can** refund a direct charge, so this sentence is a stopgap, not a permanent statement of who may refund.

✅ **`undo_mark_paid` is not offered on this branch**, because it is a guaranteed no-op that would return *"Undone — payment removed"* and change nothing.

### What was NOT touched

✅ `reverseCollectionPayment`'s logic · ✅ `recordCollectionPayment` · ✅ `getOrderBalance` · ✅ the ledger · ✅ every guard (order 18's refusal is still correct and still refuses) · ✅ every other action's response shape · ✅ capture, promotion, the sweeps, the refund handlers · ✅ the offline outbox's replay semantics.

⚠️ **The route still returns `{ success: true }` for a `reversal: 'none'`.** That is the wider "the client reports the transport" pattern, which you have scoped to the manual rather than today. **This change removes the only way an operator can reach it in ordinary use**, but it does not close it.

---

# VERIFICATION

**Method: the REAL `OrderCard` rendered with `react-dom/server` against REAL rows, and rendered TWICE — once from HEAD, once from the working tree — so before and after are the same data through two components.**

## 🔴 WRITES DECLARED: NONE

```
WRITES PERFORMED: 0 (every query above is a SELECT)
```

All four states already existed in the database, so nothing was created and nothing needed cleaning up. ⚠️ **One in-memory substitution, declared:** `status` is forced to `'ready'` on the object passed to the component, because the completion button only renders at that stage. **No row was written; every other field is the real row.**

⚠️ **`account_is_test` is stamped exactly as `/api/dashboard` stamps it** (`operators.stripe_account_livemode === false` → `true`), or every sandbox card row would silently stop counting and the balances would be wrong.

```
connected account is test: true  (operators.stripe_account_livemode = false)
```

## (a) An order reading `refund_due` — no Mark paid control on any surface

```
=== (a) refund_due  #19  order_key=a06c2090 ===
  rows              : ["in_person_other/charge/650/live=true","online/charge/650/live=false/acct_test"]
  getOrderBalance   : {"paidMinor":1300,"balanceMinor":-650,"status":"refund_due"}
  BUTTON  before    : ["Mark paid"]
  BUTTON  after     : ["Collected"]

=== (a) refund_due  #18  order_key=3a621e2f ===
  getOrderBalance   : {"paidMinor":1200,"balanceMinor":-600,"status":"refund_due"}
  BUTTON  before    : ["Mark paid"]
  BUTTON  after     : ["Collected"]
```

🔴 **The exact order you tapped, #18: the button that produced the false toast is gone.** The card now offers `Collected`, a kitchen action that books no money. Same component, so the KDS is covered.

## (b) An unpaid order — unchanged

```
=== (b) unpaid      #7   order_key=93252309 ===
  rows              : []
  getOrderBalance   : {"paidMinor":0,"balanceMinor":2750,"status":"unpaid"}
  BUTTON  before    : ["Mark paid"]
  BUTTON  after     : ["Mark paid"]
```

✅ **Identical before and after.** The server path is untouched, so it still works exactly as today.

## (c) A card-paid order — undo tells the truth

```
=== (c) card-paid   #14  order_key=d2d5a74a ===
  rows              : ["online/charge/650/live=false/acct_test"]
  getOrderBalance   : {"paidMinor":650,"balanceMinor":0,"status":"paid"}
  hasReversibleInPersonPayment false
  CHIP TIP before   : "Tap to remove this payment"
  CHIP TIP after    : "Tap for how to refund this"
```

🔴 **`hasReversibleInPersonPayment: false`, so the modal takes the explanatory branch and no `undo_mark_paid` button renders.** The tooltip is rendered markup, so it is the branch itself being observed, not a claim about it.

## (d) A manually-paid order — no regression

```
=== (d) cash-paid   #3   order_key=a98e2d0c ===
  rows              : ["in_person_other/charge/600/live=true"]
  getOrderBalance   : {"paidMinor":600,"balanceMinor":0,"status":"paid"}
  hasReversibleInPersonPayment true
  BUTTON  before    : ["Collected"]   BUTTON  after : ["Collected"]
  CHIP TIP before   : "Tap to remove this payment"
  CHIP TIP after    : "Tap to remove this payment"
```

✅ **Byte-identical behaviour.** This is the case the control exists for and it is untouched — same tooltip, same modal, same `undo_mark_paid` button.

## Tooling
```
$ npx tsc --noEmit                              -> clean
$ npx eslint components/dashboard/OrderCard.tsx -> 6 problems before, 6 after (all pre-existing)
```

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `components/dashboard/OrderCard.tsx` | 1272 / **31** | 1387 / **31** | `£ § · × — • … → ↩ ⇒ ≤ ≥ ⏳ ─ ⚠ ✅ ✉ ✏ ✓ ✕ ✗ 🍕 🎁 💳 💷 📝 📱 🔔 🔥 🔴 ️` **identical** |

✅ **NO CHARACTER CLASS GAINED. One file changed; no other file was modified.**

---

# Standing

- 🔴 **Orders 18 and 19 are still over-paid by £6.00 and £6.50.** This change stops the product inviting you to make it worse; it does not give the money back. Both are sandbox rows.
- ⚠️ **`undo_mark_paid` still returns `{ success: true }` for a `reversal: 'none'`.** Now unreachable from the card in ordinary use, but reachable by an offline replay or a direct POST. Recorded for the manual, per your scoping.
- ⚠️ **The "Paid by card" modal names Stripe** because no refund UI exists. That sentence is the one thing to change when it does.
