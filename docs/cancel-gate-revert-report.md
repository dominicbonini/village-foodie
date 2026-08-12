# Reverting the paid-order cancellation gate

**Date:** 11 August 2026
**Result: REVERTED. One file, byte-identical to HEAD. No migration needed, and none written.**
**No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE RESULT

**`app/order/[id]/manage/page.tsx` no longer appears in `git status`** — it is byte-identical to HEAD, which is the state it was in before the gate.

**Across all 446 orders: 445 unchanged, 1 restored (false → true), 0 lost.** That one is `d2d5a74a`, and it is the same order the gate took the right away from.

---

## 1. The dependency grep, run BEFORE removing anything

**Source: QUOTED.** Repo-wide, across `app/`, `lib/` and `components/`:

```
$ grep -rn "isPaidOrPartPaid" app lib components
app/order/[id]/manage/page.tsx:127:  const isPaidOrPartPaid = order.payment_status === 'paid' || order.payment_status === 'part_paid' || order.payment_status === 'refund_due'
app/order/[id]/manage/page.tsx:132:    !isPaidOrPartPaid &&
app/order/[id]/manage/page.tsx:140:    if (isPaidOrPartPaid)
```

✅ **THREE HITS, ALL IN ONE FILE: the declaration and its two uses.** The audit's claim that nothing else depends on it is confirmed by search rather than inherited — no other file, no API, no type, no test.

### 🔴 AND A SECOND CHECK THAT MADE THE REVERT EXACT

**Before touching anything I diffed the whole file against HEAD, to establish that the gate was the ONLY uncommitted change in it:**

```diff
@@ -113,13 +113,32 @@ export default function ManageOrderPage() {
+  // ── 🔴 A PAID ORDER CANNOT BE CANCELLED HERE, AND THE REASON IS ARCHITECTURAL ────────────────────
+  … 10 lines of comment …
+  const isPaidOrPartPaid = order.payment_status === 'paid' || order.payment_status === 'part_paid' || order.payment_status === 'refund_due'
+
   const canCancel =
     order.allow_cancellation &&
     ['pending', 'confirmed'].includes(order.status) &&
+    !isPaidOrPartPaid &&
     !isPastCutoff()
 
+  // ⚠️ THE PAID CASE IS TESTED FIRST AND NAMES THE TRUCK, because "contact them" is only useful if the
+  … 2 lines of comment …
   const statusLabel = () => {
     if (order.status === 'cancelled') return 'This order has already been cancelled.'
+    if (isPaidOrPartPaid)
+      return `This order has been paid. To cancel it or ask for a refund, please contact ${order.truck_name || 'the truck'} directly.`
     if (order.status === 'ready' || order.status === 'collected')
       return 'This order can no longer be cancelled.'
     if (isPastCutoff()) return 'The cancellation window has passed.'
```

🔴 **THAT IS THE ENTIRE DIFF. Nothing else in this file had changed since HEAD** — the confirmation work that shipped alongside touched **other** files, not this one.

✅ **So the revert was `git checkout HEAD -- app/order/[id]/manage/page.tsx`** — **byte-exact rather than a hand-transcription.** Retyping three edits risks drift; restoring a file whose only difference is those three edits cannot.

**Proof it worked:**
```
$ git diff app/order/[id]/manage/page.tsx
(empty — byte-identical to HEAD)
```

---

## 2. `canCancel`, restored

**Source: QUOTED**, `app/order/[id]/manage/page.tsx:109-127` as it now stands:

```tsx
  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    const slotTime = new Date(`${order.event_date}T${order.slot}`)
    const cutoff = new Date(slotTime.getTime() - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()
```

✅ **Three terms, and not one of them is about payment:**

| Term | Source |
|---|---|
| `order.allow_cancellation` | `trucks.allow_customer_cancellation` — **the truck's own setting** |
| `['pending','confirmed'].includes(order.status)` | `orders.status` |
| `!isPastCutoff()` | `orders.slot`, `orders.event_date`, `trucks.cancellation_cutoff_mins` — **the window the truck configures** |

---

## 3. The copy, restored

```tsx
  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }
```

🔴 **The sentence *"This order has been paid. To cancel it or ask for a refund, please contact {truck} directly."* is GONE.** A customer sees exactly the four sentences they saw before the gate.

⚠️ **The post-cancel refund copy at `:98-101` is UNTOUCHED** — it was not part of the gate and is one of the six contradictory sentences the brief set aside as separate work.

---

## VERIFICATION — actual values

Read-only script; every query a `select`; the restored `canCancel` and `isPastCutoff` copied **verbatim** from the file and printed at the top of the run. **A fixed clock (`2026-08-11T12:00:00Z`) so cutoff answers are reproducible.** **Script deleted.**

### (a) 🔴 `d2d5a74a` — the order the gate took the right away from

```
  order_key                = d2d5a74a-6275-4f4e-930e-8d0058c0ab33
  truck                    = Test Kitchen (test-truck)
  status                   = confirmed
  payment_status           = paid
  slot / event_date        = 17:00 / 2026-08-13
  allow_cancellation       = true
  cancellation_cutoff_mins = 30
  isPastCutoff()           = false   (clock 2026-08-11T12:00:00.000Z)

  canCancel WITH THE GATE  = false   <- what shipped
  canCancel REVERTED       = true    <- now
```

✅ **TRUE AGAIN.** A paid customer with a 17:00 slot on 13 August, two days out and well inside a 30-minute window, can cancel — **subject only to the cutoff, which is exactly the condition the truck configured.**

⚠️ **My first attempt at this case returned NOT FOUND** — I used `.like('order_key', 'd2d5a74a%')` and `order_key` is a `uuid` column, so the pattern match did not apply. Re-run by fetching and filtering client-side. **Reported because a "not found" that is really a query bug would have looked like a passing test if I had left it.**

### (b) Unpaid orders — unchanged

```
  93252309   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  57f8db7c   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  f467f70b   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  cc168a34   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  d45cdcb3   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  8fc69134   status=confirmed payment_status=unpaid  allow=true  cutoff=30  pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  --> identical=6  differing=0   ✅ unpaid behaviour is untouched
```

✅ **Identical before and after, as it must be** — the gate never applied to an unpaid order.

⚠️ **These six happen to be past their cutoff, so they read `false` on both sides.** The population delta below is the stronger statement, and **11 of the 12 currently-cancellable orders are unpaid** — those keep their button.

### (c) Past the cutoff — the window still blocks

```
  orders in pending/confirmed that are past their cutoff: 155
  93252309   … pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  57f8db7c   … pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  f467f70b   … pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  cc168a34   … pastCutoff=true  | WITH GATE=false | REVERTED=false | The cancellation window has passed.
  --> ✅ every past-cutoff order is still BLOCKED
```

✅ **All 155 remain blocked, with the same copy.** The window itself is intact — this revert removed a payment term, not the feature.

### (d) Cancelled orders — still blocked

```
  dac56597   status=cancelled … | WITH GATE=false | REVERTED=false | This order has already been cancelled.
  ef04df6e   status=cancelled … | WITH GATE=false | REVERTED=false | This order has already been cancelled.
  fea037d5   status=cancelled … | WITH GATE=false | REVERTED=false | This order has already been cancelled.
  0ca5bcdc   status=cancelled … | WITH GATE=false | REVERTED=false | This order has already been cancelled.
  --> ✅ every cancelled order is still BLOCKED (status gate)
```

✅ **Blocked by the `['pending','confirmed']` status term**, which the gate never touched.

### The population delta — every order

```
  orders evaluated : 446
  unchanged        : 445
  ✅ RESTORED (false -> true) : 1
  🔴 LOST (true -> false)     : 0   <-- must be 0; a revert cannot take a right away
```

🔴 **ZERO LOST.** No order that could be cancelled under the gate is blocked now. **Exactly one is restored, and it is `d2d5a74a`** — the same single order the build report measured the gate as changing. **The revert is precisely as wide as the gate was.**

**And the currently-cancellable population, for context:**

```
  orders currently cancellable across the whole database: 12
  of those, PAID: 1   UNPAID: 11
```

---

## The grep the brief asked for

**Source: QUOTED.** In `app/order/[id]/manage/page.tsx` after the revert:

| Term | Hits | Where |
|---|---|---|
| `isPaidOrPartPaid` | **0** | 🔴 **gone** |
| `paid_at` | **0** | never present |
| `amount_paid` | **0** | never present |
| `order_payments` | **0** | never present |
| `getOrderBalance` | **0** | never present |
| `isLiveRow` | **0** | never present |
| `ledger` | **0** | never present |
| `payment_status` | **3** | ⚠️ **see below** |

**The three surviving `payment_status` hits, quoted:**

```
16:  payment_status: string | null
162:            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
163:              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
```

✅ **One type field and one DISPLAY line — the "Paid by card" / "Pay at the truck" label.** 🔴 **None of the three is inside `canCancel`, `isPastCutoff` or `statusLabel`.**

⚠️ **All three predate the gate** — they were added on 10 August with the payment line, not with the cancellation block, and the brief's do-not-touch list keeps them. **`canCancel` and every helper it calls are free of payment terms, which is the state the file was in before the gate.**

✅ **`npx tsc --noEmit -p tsconfig.json` → clean.**

---

## NON-ASCII CENSUS

| | Before (with the gate) | After (reverted) | Δ |
|---|---|---|---|
| **DISTINCT** | **10** | **10** | ✅ **0 — no class gained, none lost** |
| **TOTAL** | 94 | 63 | **−31** |

**Per character:**

| Char | | With gate | Reverted | Δ |
|---|---|---|---|---|
| `£` U+00A3 | | 2 | 2 | 0 |
| `·` U+00B7 | | 1 | 1 | 0 |
| `×` U+00D7 | | 1 | 1 | 0 |
| `—` U+2014 | | 8 | 6 | −2 |
| `─` U+2500 | | 65 | 43 | −22 |
| `⚠` U+26A0 | | 5 | 2 | −3 |
| `✓` U+2713 | | 1 | 1 | 0 |
| `🔴` U+1F534 | | 5 | 4 | −1 |
| `😕` U+1F615 | | 1 | 1 | 0 |
| U+FE0F | | 5 | 2 | −3 |

✅ **Every reduction is a character the gate's comment block introduced, and every class still has at least one occurrence** — nothing was lost from the file's vocabulary. ✅ **The `⚠`/U+FE0F pairing stays exact (−3/−3).**

⚠️ **The brief said no class may be gained OR lost, and the count going DOWN is the expected shape of a revert** — 31 characters removed, all of them from the comment block that argued for the gate.

**Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake.

---

## WHAT WAS NOT TOUCHED — verified

`git status --porcelain` after the revert. **`app/order/[id]/manage/page.tsx` is absent from it entirely** — the file is back to HEAD:

```
 M app/api/orders/[id]/route.ts          ← the confirmation work, untouched
 M app/api/orders/submit/route.ts        ← the confirmation work, untouched
 M app/api/stripe/checkout/route.ts      ← the confirmation work, untouched
 M app/trucks/[slug]/order/page.tsx      ← the confirmation work, untouched
?? supabase/migrations/20260811_orders_confirmation_slot_fields.sql
```

| Instruction | Result |
|---|---|
| Nothing else in that file | ✅ **Byte-identical to HEAD** — `git diff` returns nothing |
| The confirmation work stays | ✅ **All four of its files are unchanged by this revert** |
| `/api/orders/cancel` or any other route | ✅ **No diff** |
| Email copy — the six contradictory sentences | ✅ **`lib/email.ts` has no diff.** All six left alone |
| No refund logic, no `refund_due` handling, no new state | ✅ **The revert only REMOVES; it adds nothing** |
| A migration | ✅ **None needed, none written.** This is code only — no column was added or read by the gate |

---

## One thing worth noting, not acting on

⚠️ **`d2d5a74a` is now cancellable and paid, and nothing issues a refund** — that is precisely the gap the refund work exists to close, and the brief says so. **This revert restores the customer's right to cancel; it does not pretend the money follows.** Recorded so the state is not a surprise: **one live order can now be cancelled by its customer while £6.50 sits in Test Kitchen's Stripe account**, and the operator-authorised refund is the piece that answers it.
