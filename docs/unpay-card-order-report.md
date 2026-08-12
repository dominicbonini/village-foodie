# Un-paying a card-paid order — the map

**Date:** 13 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE, AND IT CORRECTS THE PREMISE

The brief says reversing the ledger row "moves no money: Stripe still holds the customer's payment while our board says unpaid."

⚠️ **THE SECOND HALF DOES NOT HAPPEN TODAY. `reverseCollectionPayment` ALREADY REFUSES AN ONLINE ROW**, by a filter written for a different reason:

```ts
    .eq('kind', 'charge')
    .neq('channel', 'online')
```

**So an online charge is never selected, nothing is deleted, `reversal: 'none'` is returned, and `payment_status` stays `paid`.** The board does **not** flip to unpaid.

🔴 **WHAT ACTUALLY HAPPENS IS DIFFERENT AND, IN ONE RESPECT, WORSE: THE OPERATOR IS TOLD IT WORKED.** The modal renders, the button says "Remove payment", the server returns `{ success: true }`, and the toast reads **"Undone — payment removed"**. Nothing was removed. The chip stays PAID. There is no error, no log line, and nothing anywhere tells the operator their action did nothing. §5.

⚠️ **AND THERE IS A SECOND FILTER THAT REACHES THE SAME PLACE BY ACCIDENT:** `.eq('livemode', true)` on the same query. Every online payment this build can take is `livemode: false` (sandbox), so a Stripe row is excluded **twice over** — once on purpose, once as a side effect. The `channel` filter is the one that would still hold in live mode.

---

## 1. The popup — file, lines, and every control

**Source: QUOTED.** `components/dashboard/OrderCard.tsx:427-462`, `removePaymentModal`.

```tsx
  const removePaymentModal = !confirmRemovePayment ? null : (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && setConfirmRemovePayment(false)}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Remove payment?</h3>
          <p className="text-sm text-slate-500 mt-2">
            This removes the <strong className="text-slate-700">{money(balance.paidMinor)}</strong> recorded
            against order <strong className="text-slate-700">#{order.id}</strong>. The order stays where it is;
            only the payment record is removed.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRemovePayment(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm">Cancel</button>
          <button
            onClick={() => { setConfirmRemovePayment(false); onAction('undo_mark_paid', order.order_key) }}
            disabled={isLoading('undo_mark_paid')}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
            {isLoading('undo_mark_paid') ? '…' : 'Remove payment'}
          </button>
        </div>
      </div>
    </div>
  )
```

### Every control it renders, and its condition

| Control | Condition |
|---|---|
| The whole modal | `confirmRemovePayment === true` — set **only** by tapping the paid chip |
| Backdrop click-to-dismiss | always, when open |
| Title "Remove payment?" | always |
| Body naming `{money(balance.paidMinor)}` and `#{order.id}` | always |
| **Cancel** | always |
| 🔴 **Remove payment** (red) | always. `disabled` only while `actionLoading === 'undo_mark_paid-{order_key}'`; label becomes `…` |

🔴 **THERE IS NO BRANCH IN THIS MODAL. NOT ONE.** No condition anywhere in its 36 lines depends on how, when, or by what channel the money arrived.

### Its only entry point

**QUOTED, `:412-426`:**

```tsx
  const paidChipStatic = hidePayments ? null
    : effectivePaid ? <span className="…bg-green-100 text-green-700…">PAID</span>
    : effectivePartPaid ? <span className="…bg-amber-100 text-amber-700…">{money(balance.paidMinor)} / {money(balance.balanceMinor)} due</span>
    : null
  …
  const paidChip = paidChipStatic === null ? null : (
    <button onClick={() => setConfirmRemovePayment(true)} title="Tap to remove this payment" className="flex-shrink-0">
      {paidChipStatic}
    </button>
  )
```

⚠️ **The chip is the modal's ONLY entry point, and the file says so** (`:395-396`: *"The chip IS the modal's only entry point … so the two share one switch by construction"*). `hidePayments` — a per-device preference — is the only thing that suppresses either.

⚠️ **A part-paid chip opens the same modal**, unchanged. §7.

---

## 2. The un-pay path, end to end

**Source: QUOTED.**

| # | Where | What |
|---|---|---|
| 1 | `OrderCard.tsx:453` | `onAction('undo_mark_paid', order.order_key)` |
| 2 | `page.tsx` `doAction` | POSTs `/api/dashboard/action` through the offline gate |
| 3 | `action/route.ts:1933-1952` | the handler |
| 4 | `ledger.ts:641-726` | `reverseCollectionPayment` |
| 5 | `ledger.ts:453-471` | `recalcOrderPayment` — the only writer of `orders.payment_status` |

**The handler, `action/route.ts:1933-1952`:**

```ts
    if (action === 'undo_mark_paid') {
      try {
        await reverseCollectionPayment(supabase, {
          orderKey, truckId: truck.id, createdBy: actor.actorId,
          beforeDelete: async (deletedRow) => {
            await logActionOrThrow(supabase, { action: 'undo_mark_paid', … beforeState: { ledger_row: deletedRow }, … })
          },
        })
      } catch (err) { … return NextResponse.json({ error: … }, { status: 500 }) }
      return NextResponse.json({ success: true })
    }
```

🔴 **NOTE WHAT IS NOT THERE: the handler does not inspect the return value.** `reverseCollectionPayment` returns `{ reversal: 'deleted' | 'refunded' | 'none' }` and the route **discards it**, returning `{ success: true }` for all three.

### 🔴 THE LOOKUP, WHICH IS WHERE AN ONLINE ROW IS LOST

**`ledger.ts:669-687`:**

```ts
  const { data: rows, error } = await supabase
    .from('order_payments')
    .select('id, kind, channel, amount_minor, currency, state, external_ref, note, idempotency_key, created_at, created_by, livemode')
    .eq('order_key', opts.orderKey)
    .eq('kind', 'charge')
    .neq('channel', 'online')
    .eq('livemode', true)
    .order('created_at', { ascending: false })
```

⚠️ **`.neq('channel', 'online')` is documented as intentional** (`:665`): *"`channel != 'online'` preserves the original intent — only an in-person charge is a candidate for the delete-vs-compensate rule below."*

### What it writes, in each of its three outcomes

| Outcome | Condition | Writes |
|---|---|---|
| **`'none'`** | 🔴 **no matching row — WHICH IS EVERY ONLINE-ONLY ORDER** | 🔴 **NOTHING to `order_payments`.** `recalcOrderPayment` only |
| `'deleted'` | `external_ref == null && state === 'succeeded' && channel !== 'online'` | audit row (**first**, and a throw aborts), then `DELETE FROM order_payments WHERE id = row.id`, then recalc |
| `'refunded'` | a matching row **with** an `external_ref` | a compensating `kind: 'refund'` row via `recordPaymentEvent`, then recalc. ⚠️ Unreachable for an online charge: the `channel`/`livemode` filters exclude it before this branch |

### What `payment_status` becomes

**`ledger.ts:457-460` — the only write:**

```ts
  const { error } = await supabase
    .from('orders')
    .update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
    .eq('order_key', orderKey)
```

🔴 **It is `getOrderBalance`'s verdict over whatever rows survive, never a literal.** So for a card-paid order where nothing was deleted, `balance.status` recomputes to **`'paid'`** — the value it already held. **The write happens; the value does not change.**

---

## 3. Does the popup know HOW the order was paid?

**Source: QUOTED. NO. And the audit's claim is CONFIRMED, with one correction.**

`channel` **does** reach the browser — `ledger.ts:105`:

```ts
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'
```

`/api/dashboard/route.ts:294` selects exactly that list into `payments[order_key]`, which `page.tsx:3075` passes to `<OrderCard ledgerRows={payments[o.order_key]}>`.

### But nothing in the card, the chip or the modal reads it

`OrderCard.tsx` uses `ledgerRows` **once**, at `:211`:

```ts
  const balance = getOrderBalance(order as any, ledgerRows ?? [])
```

And `getOrderBalance` (`:206-231`) reads `isLiveRow`, `state`, `kind` and `amount_minor` — **never `channel`**. Its output is three numbers-and-a-status: `{ paidMinor, balanceMinor, status }`. **`channel` is discarded at the resolver.**

### ⚠️ ONE CORRECTION TO "ZERO FUNCTIONAL READS"

A repo-wide grep for `.channel` in browser code finds **exactly one non-Supabase-realtime read** — `app/manage/[token]/page.tsx:11143`:

```tsx
                        <span className="font-medium text-slate-500 truncate">{r.channel || ''}</span>
```

🔴 **AND IT IS NOT THIS `channel` AT ALL.** `:11112` defines it:

```tsx
                const channel = o.customer_email ? 'Online' : 'Walk-up'
```

**That is an order-level guess from the presence of a customer email, on the reports page, with no relation to `order_payments.channel`.** So: **the audit was right — `order_payments.channel` has zero functional reads anywhere in the browser**, and the one identifier that looks like a counter-example is a different variable on a different surface.

### What the dashboard actually receives per order

**QUOTED**, `/api/dashboard/route.ts:288-304` and `:744`:

```ts
      const { data: payRows, error: payErr } = await supabase
        .from('order_payments')
        .select(LEDGER_ROW_COLUMNS)
        .in('order_key', visibleKeys)
        .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
…
    payments,                                       // order_key → order_payments rows (V9.4) → getOrderBalance
```

Per order, an array of rows shaped:

```
{ order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode, account_is_test? }
```

⚠️ **`account_is_test` is stamped on by this route, not selected** — see `ledger.ts:83-89`.

---

## 4. What would be needed to branch on channel

**Source: QUOTED for the shape; INFERRED for the conclusion.**

✅ **EVERYTHING NEEDED IS ALREADY IN THE BROWSER. NO NEW FETCH. NO PAYLOAD CHANGE. NOT ONE COLUMN.**

`OrderCard` already receives the full ledger row array as `ledgerRows`, and `channel` is on every row. The branch needs only two facts, both derivable from data in hand:

| Fact | Derivable from |
|---|---|
| Was any of this paid online? | `ledgerRows.some(r => r.kind === 'charge' && r.channel === 'online')` |
| Was any of it paid in person? | the same test against `'in_person_other'` |

**The shape already present, QUOTED — `OrderCard.tsx:98`, `:170`, `:211`:**

```ts
  ledgerRows,
…
  ledgerRows?: LedgerRow[]
…
  const balance = getOrderBalance(order as any, ledgerRows ?? [])
```

**and `LedgerRow`'s `channel` (`ledger.ts:70`):**

```ts
  channel: PaymentChannel
```

⚠️ **THE ONE STRUCTURAL POINT.** `getOrderBalance` is the documented **chokepoint** (`:194-199`: *"OrderCard, the dashboard's confirmedPaid, mapOrderToTicket … ALL derive paid-ness by calling it, and nothing derives paid-ness any other way"*). Its return type carries no channel information. So a branch either reads `ledgerRows` directly alongside the resolver, or the resolver's return widens. **Which of those is right is a design question and is out of scope here.**

⚠️ **`hidePayments` devices receive the rows but render no chip**, so no modal — that gate is unaffected either way.

---

## 5. What happens today when an operator un-pays a card-paid order

**Source: QUOTED for each step; the sequence is INFERRED from them.**

| Stage | What actually happens |
|---|---|
| The tap | Chip → modal → **Remove payment**. **No warning, no difference from a cash order** |
| Optimistic UI | `lib/native/orderGate.ts:114` sets the overlay to `'pending_unpaid'`; `OrderCard.tsx:223` folds it into `effectivePaid` ⇒ **the chip disappears immediately** |
| The lookup | `.neq('channel','online')` **and** `.eq('livemode', true)` both exclude the Stripe row ⇒ `rows` is empty |
| The branch | `ledger.ts:691-694` — `if (!row) return { reversal: 'none', balance: await recalcOrderPayment(…) }` |
| **The ledger** | 🔴 **UNCHANGED.** The online charge row is still there, `state: 'succeeded'`, full amount |
| **The audit log** | 🔴 **NOTHING.** `beforeDelete` is called only on the delete path — `:652`: *"Not called on the 'refunded' or 'none' paths — nothing is destroyed there."* **So there is no record that an operator tried** |
| **`payment_status`** | 🔴 **STAYS `'paid'`.** `recalcOrderPayment` recomputes over unchanged rows and writes the same value back |
| **`amount_paid`** | unchanged |
| The route's reply | `{ success: true }` — the `reversal` value is discarded |
| **The toast** | 🔴 **`'Undone — payment removed'`** (`page.tsx:1773`) |
| **The board, after the next poll** | The overlay clears, `getOrderBalance` returns `'paid'`, **the PAID chip comes back** |
| **Stripe** | 🔴 **Holds the payment. Nothing was called. There is no Stripe call anywhere on this path** |

### 🔴 SO THE FAILURE IS NOT "THE BOARD SAYS UNPAID WHILE STRIPE HOLDS THE MONEY"

It is: **the operator is shown a control that presents itself as working, told in plain words that it worked, watches the chip vanish, and then sees it return.** No error is raised, nothing is logged, and the only way to discover the truth is to notice the chip came back.

⚠️ **THE MISLEADING TOAST IS THE STRONGER DEFECT OF THE TWO**, because the money outcome is already safe by accident.

### Could anything restore it to paid afterwards?

**The question is inverted here — it never left `paid`.** But for completeness, if the filters were ever widened and the row *were* deleted:

- ✅ **`recordCollectionPayment`** (`ledger.ts:565-590`) would re-book it — but as **`channel: 'in_person_other'`, `livemode: true`**, i.e. **as cash**. The Stripe payment would be silently re-recorded as an over-the-counter one.
- 🔴 **Nothing re-reads Stripe.** No reconciliation job exists. The webhook only writes on `payment_intent.succeeded`, and Stripe does not re-deliver a three-day-old event on demand.

---

## 6. `'refunded'` and `'refund_due'` — every occurrence

**Source: QUOTED.** Exhaustive grep across `app/`, `lib/`, `components/`.

### Written

| Where | How |
|---|---|
| 🔴 `ledger.ts:221` | `if (paidMinor === 0 && hasRefundRow) status = 'refunded'` |
| 🔴 `ledger.ts:226-227` | `else if (paidMinor < 0) status = 'refund_due'` / `else if (balanceMinor < 0) status = 'refund_due'` |
| `ledger.ts:459` | `recalcOrderPayment` — persists whichever of those `getOrderBalance` returned. **The only writer** |
| `ledger.ts:45-47` | the same rules restated as SQL, in a comment |

🔴 **NEITHER VALUE IS EVER SET AS A LITERAL ANYWHERE.** Both are derived, once, from ledger rows.

### Read

| Where | How | Is it a *refunded* branch? |
|---|---|---|
| `OrderCard.tsx:212` | `const isPaid = balance.status === 'paid' \|\| balance.status === 'refunded'` | ❌ **No — it merges them.** A refunded order renders exactly like a paid one |
| `page.tsx:314` | `confirmedPaid: … b.status==='paid'\|\|b.status==='refunded'` | ❌ same merge |
| `kds/page.tsx:1383` | `const settled = bal.status === 'paid' \|\| bal.status === 'refunded'` | ❌ same merge |
| ⚠️ `ticket.ts:362-365` | `if (paymentStatus === 'paid') … else if 'part_paid' … else if 'unpaid' … else lines.push(padBetween('PAYMENT', order.paymentStatus.replace('_',' ').toUpperCase(), width))` | ✅ **The ONLY surface that renders either word** — via a generic fallback, printing `REFUNDED` / `REFUND DUE` |
| `supabase.ts:52`, `ledger.ts:65`, `ticket.ts:103` | type unions | — |

### 🔴 SO: NOTHING ON THE SCREEN CAN SHOW A REFUNDED STATE TODAY

**Three of the four readers deliberately treat `'refunded'` as `'paid'`.** The only place either word is rendered is the **printed kitchen ticket**, through a fallback branch that was written to catch unexpected values.

### What would have to be true for the popup to show one

**Source: INFERRED.**

1. **A refund row must exist** — `kind: 'refund'`, `state: 'succeeded'`, passing `isLiveRow`. Today the only writer of one is `reverseCollectionPayment`'s compensating path, which **cannot be reached for an online charge** (§2).
2. **`OrderCard` must stop merging.** `:212` collapses `refunded` into `isPaid`, so a refunded order currently shows the green PAID chip and opens the remove-payment modal.
3. **The chip must gain a third state** — it has exactly two (`effectivePaid`, `effectivePartPaid`).
4. ⚠️ **And `'refund_due'` is rendered by nothing at all**, on any screen. A partial refund lands there and is invisible.

---

## 7. Part cash, part card — is it possible?

**Source: QUOTED. YES, AND NOTHING PREVENTS IT.**

`order_payments` has no uniqueness on `(order_key, channel)` and both writers key off `order_key` alone:

- `recordCollectionPayment` (`:583`) → `channel: 'in_person_other'`, `livemode: true`, amount = **the outstanding balance**
- `recordOnlineCardPayment` (`online.ts:79`) → `channel: 'online'`, amount = Stripe's `amount_received`

**The order in which it is reachable, QUOTED (`ledger.ts:572-577`):**

```ts
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }
```

⚠️ **A fully-online-paid order cannot then be marked paid in person** — the balance is zero and it short-circuits. But **a PARTIALLY paid online order can**: the header says *"Charges only the outstanding balance, so it composes with any earlier part-payment: an order already £10 paid against a £15 total books £5 here, not £15."*

**So the reachable mixed order is: online part-payment, then the operator takes the rest at the hatch.** Both rows sit on one order.

### What the popup shows for one

**Source: QUOTED.** Exactly the same modal. `effectivePartPaid` renders the amber chip (`:414`), tapping it opens `removePaymentModal`, and the body reads *"This removes the **{money(balance.paidMinor)}** recorded against order **#N**"* — 🔴 **`balance.paidMinor` is the COMBINED total of both rows.**

**But `reverseCollectionPayment` would delete only the newest `channel != 'online'` charge** — the cash part. **So the modal names £15 and removes £5.**

### 🔴 THIS DECIDES THE QUESTION: THE BRANCH CANNOT BE PER-ORDER

An order is not "a card order" or "a cash order" — it is a set of ledger rows that may be both. A per-order branch would have to pick one answer for an order that has two, and the modal's own copy is already wrong for that case. ⚠️ **Whether the right shape is per-row, or per-order with a mixed state, is a design question and out of scope here.**

⚠️ **Not established:** whether a mixed-channel order exists in the live data. `order_payments` currently holds **no `channel: 'online'` rows at all** — the online writer has never fired in production.

---

## 8. What an operator sees today for an online-paid order, at every surface

**Source: QUOTED. THE ANSWER AT ALL FOUR IS: NOTHING THAT DISTINGUISHES IT.**

### The board card

```tsx
    : effectivePaid ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PAID</span>
```

A green **PAID** pill. ⚠️ **Byte-identical to a cash-paid order**, and tappable in both cases.

**And the primary button (`:507`):**
```tsx
      {effectivePaid ? 'Collected' : completionPresses === 'one' ? 'Mark paid & collected' : effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```
Reads **"Collected"** — correct, and again identical to cash.

### This popup

> **Remove payment?**
> This removes the **£23.00** recorded against order **#7**. The order stays where it is; only the payment record is removed.
> [ Cancel ] [ **Remove payment** ]

🔴 **"only the payment record is removed" is the truest sentence on the screen and the operator has no way to know it matters more here.**

### The KDS

```tsx
                    {hidePayments ? null : settled
                      ? <span className="text-green-600">✓ paid</span>
                      : <span className="text-amber-600">£{(bal.balanceMinor / 100).toFixed(2)} due</span>}
```

**"✓ paid"** in green. No channel, no distinction.

### The printed ticket

```ts
    if (order.paymentStatus === 'paid') lines.push({ text: padBetween('PAYMENT', 'PAID', width), bold: true })
```

**`PAYMENT                    PAID`**, bold. ⚠️ Suppressed entirely when `showPaidStep` is false (`:358-359`) — *"Not 'unpaid' — a truck without the paid step has no such state."*

### 🔴 THE SUMMARY

**Four surfaces. Four assertions that money was received. Zero mention of how.** An operator cannot tell a Stripe payment from a fiver in the tin at any point in the product — including at the exact moment they are being asked whether to remove one.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the modal verbatim with line range; every control and condition read off it |
| 2 | **QUOTED** — the handler, the lookup, all three outcomes, the `payment_status` write. The "handler discards `reversal`" observation is **QUOTED** (it is visible in the code) |
| 3 | **QUOTED** — `LEDGER_ROW_COLUMNS`, the dashboard select, the single `ledgerRows` use, and the manage-page variable that is not this field. Confirms the audit |
| 4 | **QUOTED** — the props and types already in the browser. "No new fetch" is **INFERRED** from them |
| 5 | **QUOTED** at every step; the end-to-end sequence is **INFERRED** by composing them |
| 6 | **QUOTED** — every write and read of both values. The four prerequisites are **INFERRED** |
| 7 | **QUOTED** — the two writers, the balance guard, the modal's copy. "The branch cannot be per-order" is **INFERRED** |
| 8 | **QUOTED** — all four surfaces verbatim |

## Not established

- **Whether any mixed-channel order exists in live data.** `order_payments` holds no `channel: 'online'` rows at all today — the online writer has never fired in production, so every finding about card-paid orders describes what *would* happen, not what has.
- **Whether `.neq('channel','online')` was written to protect this case or fell out of the delete-vs-compensate rule.** The comment at `:665` says it "preserves the original intent", which does not say which intent came first.
- **Whether the right branch is per-row or per-order-with-a-mixed-state.** §7 rules out the simple per-order form; it does not decide the replacement.
- **What the refund flow will need from this popup.** It does not exist yet, and nothing here anticipates it.
- **Whether `'refund_due'` should be visible anywhere.** Today it is rendered by nothing but the printed ticket's fallback branch.
