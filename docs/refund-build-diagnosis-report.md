# The refund build — the map before the code

READ-ONLY DIAGNOSIS. 13 August 2026.

**No file was changed. No file was created except this one. No `next dev`, no `next build`, no commit, no deploy. No fix is proposed or applied.** Every fact below is **QUOTED** from source, from the installed SDK's `.d.ts`, or from a database read — or **INFERRED** and labelled as such.

---

## THE THREE ANSWERS THAT DECIDE THE SIZE

1. 🔴 **The premise in the brief is wrong in the direction that makes this smaller.** The paid popup is **not** in `app/dashboard/[token]/page.tsx` — it is already a block inside `components/dashboard/OrderCard.tsx`. Extraction is a contained component move, and **nothing moves out of the page**. Recommendation: **(a)**, with a caveat about the trigger.
2. 🔴 **`refunds.create` takes an idempotency key we generate** — confirmed from the installed types. A safe key exists, and it has **one real conflict**, caused by our own no-row-until-settlement rule for pending refunds.
3. 🔴 **The Reports finding is CONFIRMED and is worse than stated.** `get_report` reads `orders.total` and nothing else; `order_payments` is never touched. Unpaid orders count as revenue today, and no refund could ever appear.

⚠️ **Two factual corrections to the brief, stated up front:** `app/dashboard/[token]/page.tsx` is **4,482 lines**, not 2,750 (2,750 is the customer order page); and the completed list already receives the ledger rows it would need.

---

## 1. THE ENTRY POINT

### Both renderers, quoted

**ACTIVE list — `app/dashboard/[token]/page.tsx:3081-3092`.** Two `OrderCard` maps, each one line:

```tsx
            {pendingOrders.length>0&&(
              <div className="mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">New — action needed</p>
                <div className="grid ...">{pendingOrders.map(o=><OrderCard key={o.order_key} ... order={o} ... ledgerRows={payments[o.order_key]} heldAuthorisation={heldAuthorisations.has(o.order_key)} pendingPayment={paymentOverlay.get(o.order_key)} conflict={cardConflict(o)} .../>)}</div>
              </div>
            )}
            {confirmedOrders.length>0&&(
              ... {confirmedOrders.map(o=><OrderCard ... ledgerRows={payments[o.order_key]} .../>)} ...
            )}
```

**COMPLETED list — `page.tsx:3104-3159`.** Inline JSX, no component:

```tsx
                {showCompleted&&(
                <div className="space-y-2 mt-1">
                  {otherOrders.map(o=>{
                  const unrecorded=hasUnrecordedPayment(o as never,payments[o.order_key]??[],paymentFailures.has(o.order_key))
                  return (
                    <div key={o.order_key} className={`bg-white rounded-xl px-4 py-3 flex items-center justify-between ${unrecorded?'border-2 border-red-600':'border border-slate-200'}`}>
                      ...
                      <div className="shrink-0 ml-3 flex items-center gap-2">
                        {unrecorded&&(<button onClick={()=>doAction('mark_paid',o.order_key)} ...>Record payment</button>)}
                        {o.status==='collected'&&(<button onClick={()=>doAction('undo_collected',o.order_key)} ...>↩ Undo</button>)}
                        <span className="font-black text-slate-600 text-sm">£{Number(o.total).toFixed(2)}</span>
                      </div>
                    </div>
                  )})}
                </div>
                )}
```

**QUOTED — the row's population** (`page.tsx:2348`): `const otherOrders=eventOrders.filter(o=>['collected','cancelled','rejected'].includes(o.status))`. ⚠️ **Cancelled and rejected orders are in this list too**, which matters: a cancelled order that was paid is exactly a refund case.

🔴 **The completed row ALREADY has the ledger rows** — `payments[o.order_key]` is read on line 3116 for `hasUnrecordedPayment`. It has everything a balance needs and renders none of it.

### Where the popup actually lives

**QUOTED — `components/dashboard/OrderCard.tsx:522-568`**, `removePaymentModal`, 47 lines of JSX with two branches, plus its state at `:200` (`confirmRemovePayment`) and its trigger at `:490-498` / `:587-594`. **It is not in `page.tsx` at all.**

### Option (a) — extract the modal into a shared component

**What it touches:** a new `components/dashboard/PaymentActionsModal.tsx` (~60 lines, mostly moved verbatim); `OrderCard.tsx` loses the JSX block and gains an import plus a props call; `page.tsx` gains an import, one `useState`, and a tap target on the completed row.

**What it needs to receive**, all of which both call sites already have: the order row, the ledger rows (`payments[o.order_key]`), `onAction`, and the loading flag. The three derived values the modal reads — `balance` (`getOrderBalance(order, ledgerRows)`), `money`, and `hasReversibleInPersonPayment` (`ledgerRows.some(r => r.kind === 'charge' && r.channel !== 'online' && r.livemode === true)`) — are all pure functions of those inputs, so they move **with** the modal rather than being passed in.

**What could break:** the modal's card-vs-cash branch is load-bearing (it is what stops `undo_mark_paid` being offered on a card payment). Moving it moves the predicate too, so the risk is a mechanical one — a missed prop — which TypeScript catches. ⚠️ **`OrderCard` renders `{removePaymentModal}` inside its own card DOM at `:940`**; the modal is `fixed inset-0`, so it is position-independent and can be rendered from the page just as well. **INFERRED, from the class list, not from a render.**

**How much of `page.tsx` moves: NONE.** The extraction is entirely between `OrderCard.tsx` and a new file.

### Option (b) — a minimal control on the completed row

**What it touches:** `page.tsx` only — a "Refund" button in the existing `<div className="shrink-0 ml-3 flex items-center gap-2">` action cluster (which already holds two conditional buttons), plus a modal and its state. ~50-70 lines added to a 4,482-line file.

**What could break:** nothing existing. **The cost is a second refund UI** that can drift from the card's — the exact failure mode this codebase has documented repeatedly (`makeCartKey` in three copies, `toMins` in eight).

### 🔴 THE HONEST RECOMMENDATION

**(a) is contained and is the right shape** — because the premise that blocked it does not hold. The popup is already a component's private block, not page-level JSX, and the completed list already carries the data. **This is not an unrequested restructure: it is one 47-line block moving to its own file with two call sites.**

⚠️ **But (a) does not by itself put a control on the completed row.** The modal needs a trigger, and the completed row has no chip, no balance and no payment control — so **either option requires adding one element to that row.** The difference between (a) and (b) is whether the *modal* is shared or duplicated, not whether the *row* is touched. Both touch it.

---

## 2. IDEMPOTENCY

### QUOTED — the SDK accepts a key we generate

`node_modules/stripe/cjs/resources/Refunds.d.ts:28`:

```ts
    create(params?: RefundCreateParams, options?: RequestOptions): Promise<Response<Refund>>;
```

`node_modules/stripe/cjs/lib.d.ts:100-110`:

```ts
export interface RequestOptions {
    apiKey?: string;
    /**
     * See the [idempotency key docs](https://stripe.com/docs/api/idempotent_requests).
     */
    idempotencyKey?: string;
    stripeAccount?: string;
```

✅ **So the guard is at Stripe, before the refund exists**, which is exactly what the "the refund id does not exist until it answers" problem needs. It travels in the same options object as `stripeAccount`, which every direct-charge call already passes.

**Also QUOTED, and it removes a data problem:** `RefundCreateParams` carries `payment_intent?: string` (`:461`) as well as `charge?`, and `reason?: RefundCreateParams.Reason` where `type Reason = 'duplicate' | 'fraudulent' | 'requested_by_customer'`. **We hold the intent id and not the charge id** (see §5), so `payment_intent` is the field to use. ⚠️ **Stripe's three reasons are not the operator's seven** — the operator's reason belongs in `metadata` and in our audit row, not in `reason`.

### The safe key

**INFERRED, modelled on this codebase's own precedent.** `collectIdempotencyKey` is documented as a **state-transition key** — *"from this ledger position, settle this amount"* — after a constant-per-order key silently swallowed every charge after the first. The same shape works here:

```
op_refund:<order_key>:<refundedBeforeMinor>:<amountMinor>
```

- **Stable for a retry of the same intended refund:** a double-tap sends the identical key, the ledger has not moved, Stripe returns the *same* refund object rather than making a second one.
- **Different for a genuine second refund:** the first refund raises `refundedBeforeMinor`, so the next £2.00 refund keys differently even though the amount is identical.

### 🔴 THE CONFLICT, AND IT IS REAL

**QUOTED — `lib/payments/online.ts:120-131`:**

> *"getOrderBalance counts ONLY `state === 'succeeded'`, so a pending row would be inert… So the rule is: **NO LEDGER ROW UNTIL THE MONEY HAS ACTUALLY GONE BACK.**"*

**INFERRED consequence:** while a refund is **pending**, `refundedBeforeMinor` derived from our ledger **does not move**. A deliberate second refund of the same amount issued during that window produces the **same key** as a retry of the first, and Stripe returns the first refund instead of making a second. The operator would believe two refunds went out and one did.

**Two ways out, neither chosen here:**

| | How | Cost |
|---|---|---|
| **Derive the "already refunded" figure from Stripe, not from our ledger** | `stripe.refunds.list({ payment_intent })` and sum — **the webhook already does exactly this call** (`app/api/webhooks/stripe/route.ts:600`) | one extra Stripe round trip per refund, on a rare path; the figure then counts pending refunds, which is what the key needs |
| **Accept the collision** | keep the ledger-derived figure | a second identical refund during a pending window is swallowed. ⚠️ Pending is reachable (see §9), so this is not theoretical |

⚠️ **Not established:** whether Stripe's idempotency-key retention window (documented elsewhere as 24 hours) matters here. The installed types say nothing about it and no doc was fetched for this report.

---

## 3. REPORTING — THE FINDING IS CONFIRMED, AND IT IS WORSE

### QUOTED — what the server sends

`app/api/manage/route.ts`, `get_report`:

```ts
    let query = supabase
      .from('orders')
      .select('order_key, id, customer_name, customer_email, status, slot, total, discount_amt, created_at, items, deals, event_date, event_id')
      .eq('truck_id', truck.id)
      .not('status', 'in', '(cancelled,rejected)')
```

**One table. `order_payments` appears nowhere in the handler.**

### QUOTED — what the client computes

`app/manage/[token]/page.tsx:10559-10582`, inside `revenueBreakdown`:

```ts
    const revenueOrders = orders.filter((o: any) => !['cancelled', 'rejected'].includes(o.status))
    ...
    const total = revenueOrders.reduce((s: number, o: any) => s + (o.total || 0), 0)
    const base = total - dealRev - mods   // authoritative menu-items residual
```

### ✅ CONFIRMED, with three corrections that make it worse

1. **Unpaid orders count as revenue.** Any non-cancelled order contributes its `total` whether or not a penny was received. **A pay-at-hatch order nobody collected counts in full.**
2. **A refund could never appear**, whatever the refund UI does — `orders.total` does not move when money goes back, and the report never reads the column that does (`amount_paid`) nor the table that does (`order_payments`).
3. **A part-paid order counts in full**, and — since the edit-path fix — so does an order edited upward after a partial payment.

⚠️ **One nuance in the report's favour:** cancelled and rejected orders are excluded **twice** (server `.not('status','in',...)` and client `.filter`). So the *worst* case — refunding by cancelling — partly self-corrects, by removing the whole order rather than the refunded amount.

### What it would take to reflect money received and returned

**Three options, costed, none chosen:**

| Option | What it means | Cost |
|---|---|---|
| **(i) Add `amount_paid` to the select and sum that** | `orders.amount_paid` is `paidMinor` = charges − refunds, written by `recalcOrderPayment`, and is now correct on every path including edits | **Cheapest by far** — one column in one select, one line in one reducer. ⚠️ Gives NET only: no gross-versus-refunded split, and it is a derived cache, so a stale row is a wrong report |
| **(ii) Join `order_payments` for the period** | sum `kind='charge'` and `kind='refund'` separately over the report's order keys, honouring `isLiveRow` | One extra query keyed on the order keys already fetched. Gives **gross taken · refunded · net** as three real figures. ⚠️ `order_payments` has no `event_date`, so scoping must go through the orders it already has |
| **(iii) A payments report proper** | (ii) plus channel split (card vs cash), a refunds list with reasons, and CSV | Largest. **It is the honest end state**, and everything under it exists |

🔴 **Whichever is chosen, the ORDER-VALUE figure must stay.** "What we sold" and "what we were paid" are different questions and a truck needs both; replacing one with the other would trade this defect for its mirror image.

---

## 4. THE POPUP ON A PAID ORDER, AND WHAT IT WOULD TAKE TO HOST A REFUND

**QUOTED — `OrderCard.tsx:522-568`.** Opened by `setConfirmRemovePayment(true)` from either the PAID chip (`:490-498`) or the part-paid row (`:587-594`). One condition splits it:

```tsx
  const removePaymentModal = !confirmRemovePayment ? null : (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" ...>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        {hasReversibleInPersonPayment ? (
          <>
            <h3 ...>Remove payment?</h3>
            <p ...>This removes the <strong>{money(balance.paidMinor)}</strong> recorded against order <strong>#{order.id}</strong>. ...</p>
            <button ...>Cancel</button>
            <button onClick={() => { setConfirmRemovePayment(false); onAction('undo_mark_paid', order.order_key) }} ...>Remove payment</button>
          </>
        ) : (
          <>
            <h3 ...>Paid by card</h3>
            <p ...>Order <strong>#{order.id}</strong> was paid by card, so there is no payment record to remove here — the money is already on the customer's card.</p>
            <p ...>To give it back you need to <strong>refund it in Stripe</strong>, on your own Stripe dashboard. ...</p>
            <button ...>Got it</button>
          </>
        )}
```

**Every control and its condition:**

| Control | Renders when |
|---|---|
| "Cancel" + "Remove payment" (destructive, `undo_mark_paid`) | `hasReversibleInPersonPayment` — a `charge` row with `channel !== 'online'` and `livemode === true` |
| "Got it" (explanatory only, no action) | otherwise — i.e. a card payment |

**What would have to change to host a refund form:** only the **second** branch, which today has no action at all. It would gain an amount field defaulting to the full refundable figure, a required reason `<select>`, an optional note, and a submit calling a new action. The two quoted sentences change — *"refund it in Stripe, on your own Stripe dashboard"* is the sentence the manual already flags as the one thing to change when this is built. **The first branch is untouched: cash stays a record-removal, not a refund** (see §8).

⚠️ **The modal is `max-w-sm` and a flex column** — it holds a form without layout work. **INFERRED from the classes.**

---

## 5. WHAT EACH LIST ALREADY HAS

**QUOTED — `app/api/dashboard/route.ts`.** The ledger fetch is keyed on **both** lists:

```ts
    const visibleKeys = [...activeOrders, ...doneToday].map(o => o.order_key).filter(Boolean)
    if (visibleKeys.length) {
      const { data: payRows, error: payErr } = await supabase
        .from('order_payments')
        .select(LEDGER_ROW_COLUMNS)
        .in('order_key', visibleKeys)
        .or('livemode.eq.true,and(livemode.eq.false,channel.eq.online)')
```

and returns (`:756`):

```ts
    orders:  orders || [],
    payments,                                       // order_key → order_payments rows (V9.4) → getOrderBalance
    heldAuthorisations,
    paymentFailures: [...paymentFailures],
```

**QUOTED — the columns** (`lib/payments/ledger.ts:105`):

```ts
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode'
```

**So both lists already have, per order:** every charge and refund row, its **amount**, its **channel** (card vs in-person), its **state**, and its **`external_ref`** — which for a capture is the **PaymentIntent id** (`externalRef: args.paymentIntentId`, `online.ts:109`) and for a refund is the **refund id** (`externalRef: args.refundId`, `online.ts:164`).

**Derivable client-side with no new field:** captured = Σ `kind='charge' && channel='online'`; refunded so far = Σ `kind='refund'`; **maximum refundable = captured − refunded**; and the intent id to pass to Stripe.

🔴 **NO NEW FETCH AND NO NEW PAYLOAD FIELD IS NEEDED.** What is **not** there: `created_at`, the row `id`, and the **charge id** — and the charge id is not needed, because `RefundCreateParams` accepts `payment_intent`.

⚠️ **One gap worth naming:** the completed row currently renders `£{Number(o.total).toFixed(2)}` — **the order's price, not what was taken.** A refund control there needs the balance figure the row already has the data for and does not compute.

---

## 6. HOW A REFUND ROW IS WRITTEN TODAY

**QUOTED — `lib/payments/online.ts:140-170`:**

```ts
export async function recordOnlineCardRefund(supabase, args) {
  return recordPaymentEvent(supabase, {
    orderKey: args.orderKey,
    truckId: args.truckId,
    kind: 'refund',
    channel: 'online',
    amountMinor: args.amountMinor,
    state: 'succeeded',
    method: 'card',
    externalRef: args.refundId,
    idempotencyKey: onlineRefundIdempotencyKey(args.refundId),
    livemode: args.livemode,
    currency: args.currency,
    createdBy: 'stripe_webhook',
    note: args.paymentIntentId ? `Card refund (${args.paymentIntentId})` : 'Card refund',
  })
}
```

with the key (`:71`) `stripe_re:${refundId}`, and the invariants stated in its own header: **POSITIVE amount, `kind` carries the sign**; **the individual refund's amount, never `charge.amount_refunded`**, which is cumulative; **only `succeeded` refunds reach here**.

🔴 **THE CLEANEST ANSWER FOR AN OPERATOR-INITIATED REFUND IS THAT IT WRITES NOTHING.** It creates the refund at Stripe; `refund.created` / `charge.refunded` then write the row through this same function under `stripe_re:<id>`. **The two cannot disagree because there is only one writer.**

**INFERRED cost:** the operator sees nothing until the webhook lands (seconds, and it already races the redirect on captures). If that is unacceptable, the alternative is to call `recordOnlineCardRefund` directly with Stripe's returned `re_...` — **safe precisely because the key is the refund id**, so whichever of the two arrives second is a 23505 no-op. ⚠️ **Only when Stripe returns `succeeded`** — writing a row for a `pending` refund would break the rule quoted in §2.

---

## 7. THE SERVER-SIDE GUARDS

**QUOTED — who may press it.** The dashboard action route's only gate (`app/api/dashboard/action/route.ts:82-88`):

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

🔴 **This is a TRUCK-level gate, not a person-level one.** Anyone holding the dashboard token (and the PIN, if set) can fire any action. `resolveActorSafe` (`:217`) records **who** for the audit, but it **authorises nothing**. **INFERRED: a refund would be the most consequential action behind that gate**, and whether that is acceptable is a decision, not a bug — but it should be made deliberately.

**The guards a build needs, INFERRED from the existing money paths:**

1. **Amount ≤ captured − already refunded**, computed server-side from `readOrderBalance` / the ledger — never from a client-supplied figure, the same rule server-side pricing established.
2. **A second refund cannot exceed the remainder** — the same subtraction, which is why the "already refunded" figure must count **pending** refunds too (§2).
3. **Amount > 0 and an integer** — `recordPaymentEvent` throws otherwise.
4. **The order must belong to this truck** — `.eq('truck_id', truck.id)`, as every other action does.
5. ⚠️ **Stripe is the last line and refuses an over-refund itself.** **INFERRED, not verified against live Stripe in this pass.**

**If Stripe accepts and our write fails:** the money HAS gone back and our ledger does not know. 🔴 **This is already solved and needs nothing new** — `refund.created` / `charge.refunded` arrive within seconds and write the identical row under `stripe_re:<id>`. The webhook is the backstop, exactly as it is for a capture whose ledger write failed. **The one thing the route must not do is treat its own write failure as a failed refund** and offer a retry.

---

## 8. AN ORDER PAID IN CASH

**QUOTED — the popup already distinguishes them** by `hasReversibleInPersonPayment`, and **QUOTED from §37 of the manual:** *"A cash refund has no path into the ledger. No Stripe object exists to emit an event, and the correlation key can never match a `collect:` row."*

**INFERRED — what the control must do:** for a cash-paid order the refund form must **not** render. The correct action is the one already there — `undo_mark_paid`, which removes the record — plus the operator handing back cash, which no software can witness. ⚠️ **A part-card, part-cash order is the case that will be got wrong:** it has a reversible row **and** a card charge, so the modal must offer **both** limbs and cap the card refund at the card charge, not at `paidMinor`. **The existing predicate is a boolean and does not carry that distinction.**

---

## 9. A PENDING REFUND

**QUOTED — the SDK** (`Refunds.d.ts:131`): *"Status of the refund. This can be `pending`, `requires_action`, `succeeded`, `failed`, or `canceled`."* The `Refund` object also carries `failure_reason?` (`:95`) and `pending_reason?` (`:116`).

**QUOTED — why it is reachable here specifically** (`online.ts:122-125`): *"A Connect refund on a direct charge can come back `pending` when the connected account's balance is short — Stripe: 'we set the refund status to pending… Stripe automatically processes pending refunds in the order they were created'."*

✅ **So yes: an operator-initiated refund can return `pending` on the very first response**, and a food truck that has just started trading is exactly the account whose balance is short.

**What the operator should see, INFERRED:** *"Refund requested — it will show as refunded once the money has actually gone back"*, and **the order keeps reading PAID until then**, because no ledger row is written. The existing `refund_pending` audit row is the record. ⚠️ **The one thing the UI must not do is report "Refunded" on a `pending` response** — that is the same false-success class as the `mark_paid` toast, and here it would tell an operator a customer has been made whole when the money has not moved.

---

## 10. THE FIVE REFUND COPY SITES

**QUOTED. Four promise; one has already been corrected.**

| # | Site | Text | Gate |
|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts:356` | `<p>Your refund will be processed automatically within 3–5 working days.</p>` | `order.paid_at` |
| 2 | `lib/email.ts:590` (cancellation, HTML) | `<p>Your refund will be processed automatically within 3–5 working days.</p>` | `paymentStatus === 'paid'` |
| 3 | `lib/email.ts:607` (cancellation, text) | `Your refund will be processed within 3–5 working days.` (no *"automatically"*) | `paymentStatus === 'paid'` |
| 4 | `lib/email.ts:631` (event cancellation, HTML + text) | `Your refund will be processed automatically within 3–5 working days.` | `paymentStatus === 'paid'` |
| 5 | `app/order/[id]/manage/page.tsx:99` | *"If you paid by card, any refund is handled by {truck} directly — please contact them about it."* | — **already corrected, 10 August** |

⚠️ **Site 1 is gated on `paid_at`, which the capture path never sets** — so today it does not fire for card orders at all. **A separate defect, in the other direction.**

### Does a button make "automatically" true?

**No, and this is the clearest answer in the report.** Three reasons:

1. 🔴 **"Automatically" describes who acts, and after this build a HUMAN acts.** An operator must open the order, choose an amount, pick a reason and press a button. If they do not, nothing is refunded and the sentence has promised something no code will do. **The word is more wrong after the build than before it**, because before it nobody could have believed the software did it.
2. 🔴 **These four sentences are attached to CANCELLATION, not to the refund.** They fire when an order is cancelled — which does not issue a refund now and would not after this build. **They are promises made by the wrong event.**
3. **The timeframe is not ours either.** Site 5's own comment records why: *"'5-10 business days' is the card networks' settlement window, quoted as though it were our commitment. We control neither when the truck issues a refund nor how long the customer's bank takes to show it."* **That reasoning applies unchanged to "3–5 working days".**

**INFERRED — what would be true:** *"If you paid by card, {truck} will refund you — you will see it on your statement a few days after they do."* Site 5 already reads that way. **The honest fix is to make the other four match it, and it does not depend on the refund UI at all.**

---

## FLAGS

- **Nothing in the prompt arrived garbled** — the self-correction mid-sentence ("the 2,750-line order... sorry, of `app/dashboard/[token]/page.tsx`") read cleanly as a correction, and no instruction contradicted another.
- 🔴 **The brief's blocking premise does not hold.** The popup is a block inside `OrderCard`, not page-level JSX, and the completed list already has the ledger rows — so the extraction is contained and the recommendation is **(a)**, not (b). Both options still touch the completed row, because it has no trigger.
- 🔴 **One design decision cannot be deferred:** whether "already refunded" is read from **our ledger** (cheap, blind to pending) or from **Stripe** (`refunds.list`, one round trip, correct). It decides the idempotency key, the maximum-refundable figure, and whether a pending window can swallow a real second refund.
- ⚠️ **A refund is the most consequential action behind a truck-level token with an optional PIN.** Stated, not solved.

## NOT ESTABLISHED

- Whether Stripe rejects an over-refund with a typed error this codebase can distinguish from a network failure — inferred, not exercised.
- Stripe's idempotency-key retention window, and whether it matters for a retry hours later.
- Whether the modal renders correctly when mounted from `page.tsx` rather than from inside a card — inferred from `fixed inset-0`, not rendered.
- What a part-card, part-cash order should offer. The data supports both limbs; the design decision has not been made.
