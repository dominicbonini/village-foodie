# One-press completion records cash versus card machine

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. 🔴 NO MIGRATION IS NEEDED AND NONE WAS WRITTEN** — `order_payments.method` already exists, already carries `check (method is null or method in ('cash','card'))`, and `recordCollectionPayment` already accepts the parameter. Nothing about the schema changed.

**Four files changed:**

```
components/dashboard/OrderCard.tsx     the one-press branch splits when takesCash
app/api/dashboard/action/route.ts      the handler takes three names and passes the method
lib/native/orderGate.ts                the outbox learns the two names as collections
app/dashboard/[token]/page.tsx         six branches that asked "was this collected?" by string
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: the two-press flow, the walk-up panel and every existing action name are **unchanged**; no row was backfilled; the paid modal is **untouched**; the ledger's arithmetic, capture, refunds and the sweeps are **untouched**.

⚠️ **Your mid-turn clarification is built in exactly as stated:** *"only clicking cash will record as cash. the other take payment records as their own card payment."* 💷 records `method: 'cash'`, 💳 records `method: 'card'` **meaning the truck's own card machine** — both on a `channel: 'in_person_other'` row, because the money arrived at the hatch either way. **An online card payment is a different channel and never reaches this button.** That sentence is now in the code at both ends.

---

## 1. THE SPLIT

**`components/dashboard/OrderCard.tsx`, inside `completionBtn()`** — the branch that used to return one button:

```tsx
    if (completionPresses === 'one') {
      …
      if (takesCash) {
        return (
          <>
            <Btn label="💷 Cash & collected" colour="money" loading={isLoading('collected_cash')}
              onClick={() => onAction('collected_cash', order.order_key)} />
            <Btn label="💳 Card & collected" colour="money" loading={isLoading('collected_card')}
              onClick={() => onAction('collected_card', order.order_key)} />
          </>
        )
      }
      return <Btn label="Mark paid & collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
```

**It follows the existing shape ten lines below, not a new one:** same `💷` / `💳` icons, same `colour="money"` solid orange for both (colour encodes *kind* of action, never *which variant*), one tap either way, no modal, per-button `loading` keys. **The only difference is the label**, because this button also completes the order.

---

## 2. GATED ON `takesCash`

**With the setting off the branch returns the identical single button it always has** — same label, same `colour="dark"`, same `collected` action, same loading key.

**Rendered from the shipped component, all six configurations:**

```
one-press, takesCash TRUE                      -> ["💷 Cash & collected","💳 Card & collected"]
one-press, takesCash FALSE                     -> ["Mark paid & collected"]
one-press, takesCash TRUE, order ALREADY PAID  -> ["Collected"]
one-press, takesCash TRUE, HELD authorisation  -> ["Collected"]
TWO-press, takesCash TRUE (unchanged)          -> ["💷 Cash","💳 Card"]
TWO-press, takesCash FALSE (unchanged)         -> ["Mark paid"]
```

✅ **A truck that does not distinguish is never asked.** `takesCash` resolves as `event.takes_cash_override ?? truck.takes_cash ?? false`, so it stays off for every truck that has not opted in — which is every truck today (`test-truck` reads `takes_cash = false`).

---

## 3. THE TWO NAMES — AND A CORRECTION TO THE BRIEF

**`collected_cash` and `collected_card`.** Distinct names give per-button pending state (`actionLoading` keys on the action string, so one spinner cannot grey out both) and let an offline replay carry which was tapped.

🔴 **BUT THEY MUST NOT GO INTO `PAYMENT_ACTIONS`, AND THE BRIEF'S EXPECTATION THAT THEY WOULD IS THE ONE THING I HAVE NOT DONE.** The reason is quoted from the set's own header, and it applies to these two exactly as it applies to `collected`:

> *"⚠️ `collected` and `undo_collected` are NOT here: they change status too, so the STATUS overlay already moves the card for them. Adding them here would double-report the same op on two overlays."*

**These complete the order, so the status overlay moves the card.** Listing them as payment actions as well would put one queued op on two overlays — the defect that comment exists to prevent. **Measured:**

```
isPaymentAction:  collected=false  collected_cash=false  mark_paid_cash=true
```

**Faithful replay does not depend on that set.** The outbox stores the action string in the op body and replays it verbatim; what it *did* need was the status map, which is where these two now live:

```ts
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected', collected_cash: 'collected', collected_card: 'collected', cancel: 'cancelled', reject: 'rejected' }

export const COLLECT_ACTIONS = new Set(['collected', 'collected_cash', 'collected_card'])
export function isCollectAction(action: string): boolean { return COLLECT_ACTIONS.has(action) }
```

**and the `status_before_collected` rule**, so Undo still reverts one stage rather than to a hardcoded status:

```ts
  if (isCollectAction(action)) return { status: next, status_before_collected: order?.status ?? null }
```

**Measured, offline:**

```
offlineStatusPatch('collected',      {status:'ready'}) = {"status":"collected","status_before_collected":"ready"}
offlineStatusPatch('collected_cash', {status:'ready'}) = {"status":"collected","status_before_collected":"ready"}
offlineStatusPatch('collected_card', {status:'ready'}) = {"status":"collected","status_before_collected":"ready"}
```

⚠️ **And six client branches asked "was this a collection?" by string equality.** They now ask `isCollectAction(action)`, so the new names get the struck-prep clear, the Undo affordance, the payment-warning wording and the post-action refresh — **rather than silently taking the else branch**, which is the bug this would otherwise have shipped.

---

## 4. THE HANDLER

```ts
    if (action === 'collected' || action === 'collected_cash' || action === 'collected_card') {
      // 🔴 WHAT THE CUSTOMER PHYSICALLY HANDED OVER, AND NOTHING MORE. `channel` stays
      // 'in_person_other' for all three — the money arrived at the hatch, outside the platform, either
      // way — and 'card' here means THE TRUCK'S OWN CARD MACHINE, never an online payment. A method is a
      // label on a money event and no arithmetic reads it (20260730_takes_cash_and_payment_method.sql).
      // ⚠️ THE PLAIN NAME STAYS NULL. A one-press truck that has not opted into the cash/card split is
      // never asked, so there is no answer to record — and NULL means "not recorded", which is the truth.
      // Defaulting it to 'cash' would be a fabricated fact in the money ledger.
      const collectMethod: 'cash' | 'card' | null =
        action === 'collected_cash' ? 'cash' : action === 'collected_card' ? 'card' : null
```

and the one line that carries it to the writer that already accepted it:

```ts
          : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method: collectMethod })
```

⚠️ **Nothing else in the branch branches on the name.** The status write, the from-status capture, the held-authorisation check, the fail-open ledger write, the slot rebuild and the response are shared, **so the two new names cannot drift from the one that has been running since V9.4.**

---

## 5. IT STILL DOES BOTH THINGS, IN THE SAME ORDER, WITH THE SAME GUARDS

**Payment first, fulfilment second, fail-open** — unchanged, and unchanged deliberately: the ledger row is booked before the status write so a failure cannot pass unnoticed, but a failure does not refuse the collection, because *"the operator is at the hatch with cash already in hand"*.

| Guard | Still there? | Measured |
|---|---|---|
| **Held authorisation takes precedence** (`hasHeldAuthorisation` → book NO in-person row) | ✅ untouched, and it runs before the writer | (e): `[collected] … has a LIVE CARD HOLD — completing the order but booking NO in-person payment`, `rows=[]` |
| **The 12 August balance guard** (`recordCollectionPayment`'s `before.balanceMinor <= 0`) | ✅ untouched — it lives in the writer, not the handler | (d): a settled order takes `collected_cash` and **no second row appears** |
| **The card's own branch order** — `effectivePaid \|\| heldAuthorisation` tested BEFORE the setting | ✅ untouched | both render **"Collected"**, not the split |
| **Fail-open + `paymentWarning`** | ✅ untouched | shared code path |
| **`status_before_collected` for Undo** | ✅ extended to the new names | see §3 |

🔴 **The order of operations is byte-identical** — I added a `const` above the existing body and one argument to an existing call.

---

## VERIFICATION

Through the **real** `POST /api/dashboard/action`, against real rows, plus one real Stripe sandbox authorisation for (e).

### (a) takesCash true, one-press, CASH

```
HTTP 200 {"success":true,"status":"collected"}
order=collected/paid  rows=[{"kind":"charge","channel":"in_person_other","method":"cash","amount_minor":600}]
```

🔴 **Both things happened: the money is recorded as cash AND the order is `collected`.**

### (b) The same with CARD

```
HTTP 200 {"success":true,"status":"collected"}
order=collected/paid  rows=[{"kind":"charge","channel":"in_person_other","method":"card","amount_minor":700}]
```

### (c) takesCash false, one-press — unchanged

```
HTTP 200 {"success":true,"status":"collected"}
order=collected/paid  rows=[{"kind":"charge","channel":"in_person_other","method":null,"amount_minor":800}]
```

**`method: null`, the single button, the same action name.** NULL still means *not recorded*, and nothing guessed.

### (d) A settled order — the balance guard still refuses

```
already paid:        rows=[{"…","method":null,"amount_minor":900}]
then collected_cash: HTTP 200
after:               rows=[{"…","method":null,"amount_minor":900}]   <- NO second row
```

**The order completes; the money does not move twice.**

### (e) A held authorisation

```
[collected] order_key=7de97496… has a LIVE CARD HOLD — completing the order but booking NO in-person payment.
HTTP 200
order=collected/unpaid  rows=[]
```

**No in-person row against a held card**, and the card offers **"Collected"** rather than the split (rendered above).

### (f) The two-press flow — unchanged

```
mark_paid_cash -> HTTP 200
then collected -> HTTP 200
order=collected/paid  rows=[{"…","method":"cash","amount_minor":500}]
```

### EVERY WRITE, AND THE CLEANUP

| Write | Undone? |
|---|---|
| 6 synthetic `orders` rows (`OnePress Harness`), their `order_payments` rows, one `order_drafts` row, the audit rows | **yes** — `leftovers: 0` |
| 1 Stripe sandbox PaymentIntent (case e) | **cancelled** — `cancelled hold pi_3U3yuk2fB4PPCw2D1zaTOWOY` |
| Any existing row's `method` | 🔴 **never touched. No backfill.** |

**No emails were transmitted** (Brevo intercepted). **What needs a browser:** that the two buttons fit side by side at the 240px KDS column width — the labels are longer than `💷 Cash` / `💳 Card`, and `Btn` wraps rather than overflowing, but that is a layout claim I have not rendered at width.

---

## NON-ASCII CENSUS

| File | Before | After | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `components/dashboard/OrderCard.tsx` | 1545 | 1650 | 31 | 31 | unchanged (💷 and 💳 were already in it) |
| `app/api/dashboard/action/route.ts` | 3218 | 3290 | 15 | 15 | unchanged |
| `lib/native/orderGate.ts` | 208 | 214 | 8 | 8 | unchanged |
| `app/dashboard/[token]/page.tsx` | 2648 | 2650 | 53 | 53 | unchanged |

**No file gained a character class.**

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **One instruction was deliberately NOT followed, and this is the correction:** §3 asked me to confirm the outbox treats the new names as **distinct payment ops** the way it does the `mark_paid` pair. **It must not**, and now does not — `collected` and its two variants change status, so the status overlay already moves the card, and adding them to `PAYMENT_ACTIONS` would double-report one queued op on two overlays. **Faithful replay comes from the action string in the op body, not from that set.** Everything else in §3 is done: the names are distinct, the pending state is per button, and the offline status map and the `status_before_collected` rule both learned them.
- ⚠️ **Six client branches tested `action === 'collected'` by string** and would have silently excluded the new names from the struck-prep clear, the Undo offer and the payment-warning wording. They now go through one shared predicate.
- ⚠️ **This changes nothing for any truck until `takes_cash` is turned on.** Every truck today reads `false`, so every one-press completion still writes NULL — honestly.
