# The four capture sites — is `time_adjust` ever the SOLE capture?

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no database read, no Stripe call, no environment variable touched.** `git status` is in
E4. **Nothing is proposed outside Part D**, and Part D lists prerequisites only — it implements
nothing.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** (quoted from the tree) or **INFERRED**.

---

# 🔴 THE ANSWERS, BEFORE THE EVIDENCE

**The task's headline question — is `time_adjust`'s capture ever the only capture, or always
redundant?**

> 🔴 **IT IS NEVER REDUNDANT. WHENEVER IT FIRES, IT IS THE SOLE CAPTURE.** The row renders only when
> `order.status === 'pending'`, and a pending order **cannot** have been captured by any other site:
> the two auto-accept sites are gated on `autoAccepted` (which writes `'confirmed'`, not `'pending'`),
> the operator-confirm site requires the Confirm tap, and the stranded sweep excludes `'pending'` by an
> explicit allow-list. **There is no sequence in which an earlier site has already captured.**

**But that is not the same question as "can the row be removed", and the two have different answers:**

> ✅ **REMOVING THE ROW LEAVES NO ORDER PERMANENTLY UNCAPTURED.** Once the row is gone the operator
> reaches for **Confirm** (captures inline) or **Edit** (writes `'modified'` — **which IS in the
> stranded sweep's allow-list**, so the sweep captures it). Doing nothing leaves the order `'pending'`
> with a live hold, which is the correct state for an unconfirmed order.

⚠️ **The cost is not zero, and it is not money — it is timing and noise.** A time change routed through
Edit converts an **inline** capture into a **backstop** capture up to **~25 minutes later** (10-minute
grace + a 15-minute cron), and the backstop is explicitly designed to treat what it finds as **a defect
report**, writing `capture_missing` and `capture_recovered` audit rows and a `console.error` reading
*"🔴 CONFIRMED ORDER HOLDING UNCAPTURED MONEY"*. **It would work by tripping the alarm built to detect
this exact bug.**

🔴 **And two downstream effects of `'modified'` vs `'confirmed'` are real, customer-facing, and already
live today** — see C3. One of them is an actual bug in a consumer, reported under D3 as required.

---

# PART A — ALL FOUR CAPTURE SITES

## A1. Every call to `captureOnConfirmation`, quoted

**READ** — `grep -rn "captureOnConfirmation(" app lib` returns **five call sites**, not four. The
manual and the code comments say "4 of 4" because the fifth is the **backstop sweep**, which the code
itself says "is not a confirmation at all".

### Site 1 — `trigger: 'auto_accept'` (pay-at-hatch auto-accept)

**READ** — [app/api/orders/submit/route.ts:1077-1081](app/api/orders/submit/route.ts#L1077-L1081):

```ts
    if (autoAccepted) {
      await captureOnConfirmation(supabase, {
        orderKey: order.order_key, truckId: resolvedTruckId, trigger: 'auto_accept',
      })
    }
```

**READ** — and its own header states the decisive fact for this whole report,
[submit/route.ts:1069-1071](app/api/orders/submit/route.ts#L1069-L1071):

```
    // 🔴 GATED ON `autoAccepted`, WHICH IS THE CONFIRMATION. An order that auto-accept declined is
    // `pending` and stays UNCAPTURED, exactly like any other pending order — it captures when a human
    // confirms it, at site 2 or 3.
```

### Site 2 — `trigger: 'confirm'` (the operator Confirm button)

**READ** — [app/api/dashboard/action/route.ts:244-259](app/api/dashboard/action/route.ts#L244-L259):

```ts
    if (action === 'confirm') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)

      // ── 🔴 CAPTURE SITE 2 of 4: THE OPERATOR CONFIRM — AND EVERY OFFLINE REPLAY OF IT. ──────────
      // ⚠️ THIS IS ALSO WHERE A CARD ORDER THAT LANDED `pending` CAPTURES. Its hold sat correctly held
      // from promotion until this tap; site 4 (promote-draft) deliberately did not take it.
      ...
      const captureResult = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'confirm' })
```

### Site 3 — `trigger: 'time_adjust'` (**the row under discussion**)

**READ** — [app/api/dashboard/action/route.ts:1919-1929](app/api/dashboard/action/route.ts#L1919-L1929):

```ts
      await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)

      // ── 🔴 CAPTURE SITE 3 of 4: QUICK-TIME-ADJUST, WHICH IS A CONFIRMATION IN DISGUISE. ─────────
      // The line above writes `status: 'confirmed'` UNCONDITIONALLY alongside the new slot, and the
      // control is offered on PENDING orders only — so pressing "+10m" confirms the order. A held
      // authorisation must capture here exactly as it does at the Confirm button, or a customer who was
      // "confirmed" by a time change keeps a hold that expires unclaimed.
      // ⚠️ The rolled-forward slot changes nothing about the money: the amount was fixed at
      // authorisation and capture takes that amount.
      // ⚠️ AWAITED AND CANNOT THROW. The order is already confirmed and re-slotted above.
      const adjustCapture = await captureOnConfirmation(supabase, { orderKey, truckId: truck.id, trigger: 'time_adjust' })
```

### Site 4 — `trigger: 'promote_auto_accept'` (card auto-accept, at draft promotion)

**READ** — [lib/payments/promote-draft.ts:382-391](lib/payments/promote-draft.ts#L382-L391):

```ts
    let captureNote = 'no authorisation'
    let captureResult: CaptureResult | undefined
    if (autoAccepted) {
      captureResult = await captureOnConfirmation(supabase, {
        orderKey: draft.order_key, truckId: draft.truck_id, trigger: 'promote_auto_accept',
      })
      captureNote = captureResult.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
```

### Site 5 — `trigger: 'stranded_sweep'` (**the backstop — not a confirmation**)

**READ** — [lib/payments/stranded-authorisations.ts:163-167](lib/payments/stranded-authorisations.ts#L163-L167):

```ts
    // ⚠️ THE SAME FUNCTION EVERY CONFIRMATION SITE CALLS, with a trigger that says this was a repair.
    // It cannot throw, and it writes `capture_failed` itself when it fails.
    const cap = await captureOnConfirmation(supabase, {
      orderKey: row.orderKey, truckId: row.truckId, trigger: 'stranded_sweep',
    })
```

**READ** — the `trigger` union, which is the authoritative list,
[lib/payments/capture.ts:125](lib/payments/capture.ts#L125):

```ts
    trigger: 'auto_accept' | 'promote_auto_accept' | 'confirm' | 'time_adjust' | 'stranded_sweep'
```

## A2 / A3. Entry point, precondition, status written, and repeatability

| Trigger | Entry point | User action | Status BEFORE | Status WRITTEN | Can fire twice for one order? |
|---|---|---|---|---|---|
| `auto_accept` | `submit/route.ts:1078` | customer places a **pay-at-hatch** order, truck auto-accepts | (none — being created) | `'confirmed'` inside `place_order_atomic` | **No** — one insert per order |
| `promote_auto_accept` | `promote-draft.ts:385` | customer's **card** payment authorises, truck auto-accepts | (none — draft promoted) | `'confirmed'`, written by promote-draft | **No** — promotion is idempotent per draft |
| `confirm` | `action/route.ts:259` | operator taps **Confirm** | `'pending'` | `'confirmed'` | ⚠️ **Yes in principle** — the offline outbox replays a queued confirm through this same action; guarded by `expected_from` and by capture idempotency |
| **`time_adjust`** | **`action/route.ts:1929`** | operator taps **+5m / +10m / +20m** | 🔴 **`'pending'` ONLY** — the row is gated on it | `'confirmed'` | 🔴 **NO — see B3. After the first tap the order is `'confirmed'` and the row stops rendering.** |
| `stranded_sweep` | `stranded-authorisations.ts:165` | **none** — cron, every 15 minutes | `'confirmed' \| 'modified' \| 'cooking' \| 'ready' \| 'collected'` | **none** — it writes no order status | **Yes, every run** — and that is safe by construction (idempotent at three layers) |

---

# PART B — 🔴 IS `time_adjust` EVER THE SOLE CAPTURE?

## B1. `captureOnConfirmation` — what it does when already captured

**It is idempotent, it short-circuits, and it cannot throw.** **READ** —
[lib/payments/capture.ts:105-119](lib/payments/capture.ts#L105-L119):

```ts
/**
 * Capture the authorisation behind a confirmed order, if there is one.
 *
 * 🔴 IT CANNOT THROW. Every failure is a result value. Confirmation must never fail because money did
 * not move — an order that reaches the kitchen and is not captured is recoverable; an order that never
 * reaches the kitchen because a capture errored is a customer standing at a hatch with no food.
 */
```

**The short-circuits, in the order they run — READ:**

1. **No authorisation at all** — `capture.ts:152`:
   ```ts
    if (!draft?.payment_intent_id) return { status: 'none' }
   ```
   🔴 The cheap no-op for every pay-at-hatch and walk-up order: one primary-key read, **no Stripe client
   is even constructed**.

2. **Hold already released** — `capture.ts:153-163`:
   ```ts
    if (draft.authorization_cancelled_at) {
      ...
      return { status: 'expired', paymentIntentId: draft.payment_intent_id, detail: 'authorisation already cancelled' }
    }
   ```

3. 🔴 **ALREADY CAPTURED — idempotency layer 1**, `capture.ts:166-177`:
   ```ts
    // ── 2a. HAS THIS INTENT ALREADY BEEN CAPTURED? Answered from OUR ledger, before touching Stripe. ─
    // 🔴 IDEMPOTENCY LAYER 1. A second confirmation of the same order — a time-adjust after a confirm,
    // an offline replay landing late — must not cost a Stripe round trip, let alone a second capture.
    const idempotencyKey = onlinePaymentIdempotencyKey(piId)
    const { data: existing } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) return { status: 'already', paymentIntentId: piId }
   ```

4. **Nothing owed** — `capture.ts:215-228`, the 12-August double-charge guard, returns
   `{ status: 'not_owed', reason: 'settled' }` and **leaves the hold exactly as it was**.

✅ **So a redundant call is free and safe: `'already'` on a ledger hit, `'none'` on a non-card order,
no Stripe call in either case.** ⚠️ **That cuts both ways for this task: because a duplicate call is
harmless, the presence of the `time_adjust` call proves nothing about whether it is needed.** The
question has to be answered from the *sequences*, which is B3.

## B2. The normal lifecycle of a CARD order

**READ**, traced through the code:

| Stage | What happens | Capture? |
|---|---|---|
| Customer pays | Card **authorised**, `order_drafts` row holds `payment_intent_id` and `total_minor` | **No — held, not taken** |
| Draft promoted | `promote-draft.ts` creates the order row and decides auto-accept | depends ↓ |
| **Auto-accept ON** | order written `'confirmed'` | ✅ **site 4, `promote_auto_accept`, inline** |
| **Auto-accept OFF** | order written `'pending'`, hold left live — `promote-draft.ts:389-390`: `captureNote = 'held, pending confirmation'` | ❌ **deliberately not captured** |
| Operator taps **Confirm** | `'pending'` → `'confirmed'` | ✅ **site 2, `confirm`, inline** |
| Operator taps **+5m/+10m/+20m** | `'pending'` → `'confirmed'` + new slot | ✅ **site 3, `time_adjust`, inline** |
| Operator taps **Edit** (any field, incl. the time) | `'pending'` → `'modified'` | 🔴 **NO CAPTURE — not found. `captureOnConfirmation` does not appear anywhere in the edit branch.** |
| Nothing for 10 min after an accepted status | cron sweep finds it | ⚠️ **site 5, `stranded_sweep`, deferred** |

**So the capture point for a non-auto-accept card order is the operator's ACCEPT, whichever control
performs it — and one control performs an accept without capturing.**

## B3. 🔴 Every sequence in which an operator taps +5m/+10m/+20m

**READ** — the row's render gate, [components/dashboard/OrderCard.tsx:1253](components/dashboard/OrderCard.tsx#L1253):

```tsx
          {order.status === 'pending' && order.slot && viewMode !== 'cook' && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Adjust time:</span>
              {[5, 10, 20].map(mins => (
                <button key={mins}
                  onClick={() => onAction(`adjust_slot_+${mins}`, order.order_key)}
```

🔴 **Three conditions, and the first is decisive: `order.status === 'pending'`.** Everything below
follows from it.

| # | Sequence | Had capture ALREADY happened? |
|---|---|---|
| 1 | **New unconfirmed card order** (auto-accept off) → operator taps +10m | 🔴 **NO.** Promotion deliberately did not capture (`'held, pending confirmation'`). **`time_adjust` is the sole capture.** |
| 2 | **New pay-at-hatch order** → taps +10m | ⚠️ **N/A — there is nothing to capture.** `capture.ts:152` returns `'none'` on one indexed read. |
| 3 | **Auto-accepted order** (card, auto-accept on) → operator wants +10m | ⛔ **UNREACHABLE.** The order is `'confirmed'`, so **the row does not render.** Capture already happened at site 4. |
| 4 | **Confirmed order** (operator already tapped Confirm) → wants +10m | ⛔ **UNREACHABLE, same reason.** Capture already happened at site 2. **The "time-adjust after a confirm" case named in `capture.ts:167` cannot be produced through this UI.** |
| 5 | **Order adjusted TWICE** (+5m then +10m) | ⛔ **THE SECOND TAP IS UNREACHABLE.** The first tap wrote `'confirmed'`, so the row stops rendering. **The row can be tapped at most once per order.** |
| 6 | **Order adjusted before any other action** (the common case) | 🔴 **NO prior capture.** Identical to sequence 1. |
| 7 | **Order edited first (→ `'modified'`), then wants +10m** | ⛔ **UNREACHABLE** — `'modified'` is not `'pending'`. ⚠️ **And that order was never captured inline either; it is waiting on the sweep.** |
| 8 | **Offline: a queued confirm replays late, after a +10m** | ✅ Capture already happened at the +10m; the replayed confirm hits **idempotency layer 1** and returns `'already'` at one indexed read. |

> 🔴 **THE HEADLINE ANSWER: `time_adjust`'s capture is NEVER redundant. In every sequence where it can
> actually fire (1, 2, 6), no other site has captured — because the only status that renders the row is
> the only status no other site captures.** The redundant cases (3, 4, 5, 7) are all **unreachable
> through the UI**, so the "is it always redundant?" limb of the question is false.

## B4. 🔴 Is there any sequence in which removing it leaves an order UNCAPTURED?

**The question splits, and the two halves have different answers. Both are stated.**

### If the CAPTURE CALL were removed but the ROW kept → **YES, temporarily**

The row would write `'confirmed'` with no capture. **READ**, the sweep's allow-list,
[supabase/migrations/20260816_find_stranded_authorisations_settled.sql:96](supabase/migrations/20260816_find_stranded_authorisations_settled.sql#L96):

```sql
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

`'confirmed'` is in it, so the sweep would recover the money — but **not before ~10-25 minutes**, and
every such order would raise a `capture_missing` audit row. **Not a money loss; a deferred capture and a
false defect signal.**

### If the ROW is removed entirely → **NO. Nothing is left permanently uncaptured.**

The operator's alternatives are exhaustively:

| What they do instead | Status written | Capture |
|---|---|---|
| Tap **Confirm** (then Edit for the time, or not at all) | `'confirmed'` | ✅ **inline, site 2** |
| Tap **Edit** and change the slot | `'modified'` | ⚠️ **none inline** — but `'modified'` **is** in the sweep allow-list above → **captured by site 5 within ~10-25 minutes** |
| Do nothing | stays `'pending'` | ✅ **correctly uncaptured** — `stranded-authorisations.ts:25-27`: *"a hold waiting on a human is never even returned"* |

🔴 **So: NO — there is no sequence in which removing the row leaves an order permanently uncaptured.**

⚠️ **Two qualifications, stated rather than buried:**

1. **The Edit route is covered by a BACKSTOP, not by a capture site.** **READ**,
   `stranded-authorisations.ts:171-172`, the sweep's own words about what a recovery means:
   ```ts
      // 🔴 A RECOVERY IS A DEFECT REPORT, NOT A SUCCESS STORY. It means the confirmation site that
      // should have captured did not, and this row is how that is counted later.
   ```
   **Routing every time change through Edit makes that alarm fire routinely**, which degrades it as a
   signal for the real defect it was built to catch (order 19, 12 August).
2. **The delay is real:** `STRANDED_GRACE_MINUTES = 10` (`stranded-authorisations.ts:62`) plus a
   `*/15 * * * *` cron (`vercel.json`) = **up to ~25 minutes** during which a confirmed order's money is
   not taken. ⚠️ **INFERRED risk, small but non-zero: if the hold is near Stripe's ~7-day expiry, or the
   operator marks the order paid at the hatch in that window, the sweep's `not_owed` guard fires and the
   hold is left for a human.**

## B5. Can the row be removed as a pure UI change?

✅ **Yes — with one honest correction to the word "pure".**

**No money is lost by removing it, no capture site needs to move first, and `lib/payments/` does not
need to be touched.** That is the substantive answer, and it is the one that unblocks Dominic.

⚠️ **But it is not a no-consequence change**, and the consequences are **not** in the payments code —
they are in what `'modified'` means to three consumers downstream (C3). **One of them is customer-facing
and is already wrong today.**

---

# PART C — WHAT ELSE THE ROW DOES

## C1. `moveSlotBooking`, and whether Edit still re-books capacity

**READ** — [lib/slot-bookings.ts:512-527](lib/slot-bookings.ts#L512-L527), the whole function:

```ts
export async function moveSlotBooking(
  supabase: SupabaseClient,
  truckId: string,
  eventId: string | null,
  fromSlot: string | null,
  toSlot: string | null,
  items: { name: string; quantity: number }[],
  itemCatMap: Record<string, string>
) {
  if (fromSlot && fromSlot !== toSlot) {
    await removeOrderFromProductionSlot(supabase, truckId, eventId, fromSlot, items, itemCatMap)
  }
  if (toSlot && fromSlot !== toSlot) {
    await addOrderToProductionSlot(supabase, truckId, eventId, toSlot, items, itemCatMap)
  }
}
```

**It is a two-line convenience wrapper around remove-then-add. Nothing else.**

**READ** — its only caller is the adjust branch,
[action/route.ts:1913](app/api/dashboard/action/route.ts#L1913). `grep -rn "moveSlotBooking"` returns
the definition, the import and that one call. **NOT FOUND: any other caller.**

✅ **Capacity re-booking DOES still happen when a time changes via Edit — it calls the same two
primitives directly.** **READ**, [action/route.ts:867-888](app/api/dashboard/action/route.ts#L867-L888):

```ts
      if (order.event_date && (items || slot !== undefined)) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        const oldLines = normaliseOrderLines(order.items || [], order.deals)
        const newDeals = editedDeals !== undefined ? editedDeals : order.deals
        const newLines = normaliseOrderLines(items || order.items || [], newDeals)
        const unbooked = await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot, oldLines, itemCatMap
        )
        const rebooked = await addOrderToProductionSlot(
          supabase, truck.id, order.event_id, newSlot, newLines, itemCatMap
        )
        const slotErrors = [unbooked.error, rebooked.error].filter(Boolean)
        if (slotErrors.length) {
          console.error('[edit] production slot re-booking failed (order WAS saved):', slotErrors.join(' | '))
          slotWarning = 'Order saved, but the kitchen capacity board could not be updated — check the slot before relying on it.'
        }
      }
```

✅ **Edit's version is STRICTER than the row's in two ways**, both **READ**:

- **Edit checks the errors and surfaces `slotWarning` to the operator.** The adjust branch discards
  `moveSlotBooking`'s outcome entirely (`await moveSlotBooking(...)` with no result binding) — the
  operator is never told capacity failed to move.
- Edit re-books against the **edited** item lines, so a deal change re-counts correctly.

⚠️ One behavioural difference in the other direction, also **READ**: `moveSlotBooking` no-ops when
`fromSlot === toSlot`; Edit calls remove+add unconditionally whenever `items || slot !== undefined`.
**INFERRED: net-neutral** — removing then re-adding the same lines to the same slot lands on the same
numbers.

## C2. `'confirmed'` vs `'modified'` — who consumes the difference?

**READ** — I searched every `.ts`/`.tsx` under `app`, `lib` and `components`. **In the overwhelming
majority of consumers the two statuses appear TOGETHER in the same allow-list and are indistinguishable:**

| Consumer | file:line | Treatment |
|---|---|---|
| Dashboard active-order set | `app/dashboard/[token]/page.tsx:834` | `['pending','confirmed','modified']` — **same** |
| Dashboard confirmed column | `app/dashboard/[token]/page.tsx:2540` | `['confirmed','modified','cooking','ready']` — **same** |
| Dashboard slot strips | `page.tsx:3042`, `page.tsx:3114` | `['pending','confirmed','modified']` — **same** |
| Dashboard API active set | `app/api/dashboard/route.ts:199` | `['pending','confirmed','modified','cooking','ready']` — **same** |
| Slot capacity / bookings | `lib/slot-capacity.ts:39`, `lib/slot-bookings.ts:226,474` | `['pending','confirmed','modified','cooking']` — **same** |
| Capacity breach | `lib/capacity-breach.ts:30` | same set — **same** |
| Buzzers | `lib/buzzer.ts:27,37` | same set, *"appears VERBATIM in five places"* — **same** |
| Customer slot availability | `app/api/slots/[truckId]/route.ts:108` | `['pending','confirmed','modified']` — **same** |
| Account deletion blocker | `app/api/account/request-deletion/route.ts:90` | same set — **same** |
| Native offline replay | `lib/native/orderGate.ts:22` | same set — **same** |
| **Stranded capture sweep** | `20260816_…sql:96` | `('confirmed','modified','cooking','ready','collected')` — ✅ **same, and this is what makes removal safe** |

🔴 **THREE consumers do NOT treat them the same.** These are the whole of C3.

## C3. 🔴 If every time change writes `'modified'` instead of `'confirmed'`

### C3-a — 🔴 THE CUSTOMER LOSES THE ABILITY TO CANCEL, AND IS TOLD A FALSEHOOD

**READ** — [app/order/[id]/manage/page.tsx:116-127](app/order/[id]/manage/page.tsx#L116-L127):

```tsx
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()

  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }
```

**`'modified'` is absent from the allow-list, and it falls through every `statusLabel` branch to the
final line.** So:

- **Time change via the ROW** → `'confirmed'` → ✅ the customer can still cancel.
- **Time change via EDIT** → `'modified'` → 🔴 **the Cancel button disappears and the page tells the
  customer *"Cancellations are not accepted for this order."*** — which is **false**: the truck's
  `allow_cancellation` is true and the cutoff has not passed.

⚠️ **This is LIVE TODAY for every edited order** — it is not created by removing the row. **But removing
the row routes every time change through Edit, so it converts an occasional case into the normal one.**

### C3-b — 🔴 THE ORDER STOPS RAISING "ORDER DUE" ALERTS ON THE DASHBOARD

**READ** — [app/dashboard/[token]/page.tsx:2332-2336](app/dashboard/[token]/page.tsx#L2332-L2336):

```tsx
    const scan=()=>{
      const seen=new Set<string>()
      for(const o of orders){
        if(o.status!=='pending'&&o.status!=='confirmed'){ prevUrgencyRef.current.delete(o.order_key); continue }
        seen.add(o.order_key)
```

**`'modified'` fails the test, so the order is skipped AND its remembered urgency is deleted.**

- **Row** → `'confirmed'` → ✅ the order stays in the scan and the operator still gets the due sound.
- **Edit** → `'modified'` → 🔴 **the order is dropped from the due-alert scan permanently. It will never
  chime again**, however close to its collection time it gets.

⚠️ **Also live today**, and reported as a defect under D3.

### C3-c — the KDS new-order sound is NOT affected

**READ** — [app/dashboard/[token]/kds/page.tsx:495-500](app/dashboard/[token]/kds/page.tsx#L495-L500):

```tsx
        const mode = soundConfigRef.current.new_orders
        const st = payload.new?.status
        const wanted = mode === 'all' ? (st === 'confirmed' || st === 'pending')
          : mode === 'needs_confirming' ? st === 'pending'
          : false
        if (soundEnabledRef.current && payload.eventType === 'INSERT' && wanted) {
```

`'modified'` is absent from the test **but the whole block is gated on `payload.eventType === 'INSERT'`**,
and a status change is an UPDATE. ✅ **Stated plainly: no effect either way.** Listed because a
`'confirmed'`-without-`'modified'` grep hit here looks alarming and is not.

## C4. Does the row do anything else?

**Four effects total, all READ from `action/route.ts:1901-1979`:**

1. **Slot arithmetic + `moveSlotBooking`** — `:1902-1918`. Result discarded, no error surfaced.
2. **`orders.update({ slot, status: 'confirmed' })`** — `:1919`. **Unconditional**; the SELECT at `:1904`
   does not even fetch `status`, so the handler cannot branch on it. **The only guard is `if (!ord?.slot)`.**
3. **The capture** — `:1929`.
4. **A customer email** — `:1932-1978`: `formatConfirmationEmail` with **`autoAccepted: true`**,
   `slotAdjustedFrom: ord.slot`, subject **`Your order #N has been updated`**, payment sentence resolved
   through `resolveEmailPaymentState(supabase, orderKey, adjustCapture)`.

**NOT FOUND, stated plainly:**
- **No audit row.** `logAction` does not appear anywhere in the branch (`1900-1980`). The only audit rows
  produced are the ones `captureOnConfirmation` writes internally on refusal/failure.
- **No push notification, no capacity projection, no buzzer assignment, no ledger write of its own.**

⚠️ **The email is the one non-money effect that Edit also produces but differently:** Edit builds its
own HTML inline (`action/route.ts:931-944`, subject `Order #N updated`) rather than going through
`formatConfirmationEmail`. **Both tell the customer the new collection time.**

---

# PART D — WHAT REMOVAL WOULD REQUIRE

## D1. Prerequisites

**Based only on what is above:**

| # | Prerequisite | Verdict |
|---|---|---|
| 1 | Move the capture to another site first | ❌ **NOT REQUIRED.** Confirm captures inline; Edit is covered by the sweep. |
| 2 | Preserve `moveSlotBooking` | ❌ **NOT REQUIRED.** Its only caller is this branch; Edit calls the same two primitives directly, with better error reporting. |
| 3 | Delete the `adjust_slot_+N` server branch | ⚠️ **OPTIONAL, and leaving it is safer.** The row is the only caller, but the handler is harmless and unreachable once the UI is gone. **Removing UI and server in one change is the larger blast radius.** |
| 4 | Keep the `'time_adjust'` trigger in the union | ✅ **YES — historical audit rows already carry it.** Removing the literal would make old `action_audit_log` rows unmappable. |
| 5 | 🔴 **Decide what an operator does instead** | 🔴 **THE REAL PREREQUISITE, AND IT IS A PRODUCT DECISION, NOT A CODE ONE.** Today the row is the only one-tap way to accept-and-reschedule. Afterwards it is Confirm (2 taps, no time change) or Edit (a modal, and it writes `'modified'`). |
| 6 | ⚠️ **Accept, or fix, the two `'modified'` consequences in C3** | ⚠️ **NOT a blocker, but it is the thing most likely to bite** — the customer-cancel lockout and the lost due alert. |

## D2. Does any prerequisite touch `lib/payments/`?

🔴 **NO. Stated explicitly and separately, as asked.**

**Removing the row requires no change to `lib/payments/` at all.** `captureOnConfirmation`,
`stranded-authorisations`, `promote-draft`, `order-drafts` and the ledger are all untouched by a UI
removal. The only `lib/payments/` **read** that matters to the decision is the sweep's allow-list
(which is SQL, in `supabase/migrations/`), and it already covers both statuses.

⚠️ **The one thing that WOULD be `lib/payments/` territory** — and it is a separate question Dominic
should scope himself, not a prerequisite — is whether the **Edit path should capture inline** instead of
relying on the sweep. **I am not proposing that.** It is named only so the boundary is visible.

## D3. ⚠️ Actual bugs found in the Edit path

**Reported as findings. No fixes proposed. Dominic scopes these.**

### BUG 1 — 🔴 An edited order is silently dropped from the "order due" alert scan

**READ**, `app/dashboard/[token]/page.tsx:2335` (quoted in C3-b). Any order that passes through Edit
becomes `'modified'` and is **excluded from the urgency scan, with its remembered urgency deleted**.
**The operator gets no due alert for that order for the rest of its life**, no matter how close to its
collection time it gets. ⚠️ **This is arguably a defect in the consumer rather than in Edit** — every
other dashboard surface lists `'modified'` alongside `'confirmed'`. **This one line does not.**

### BUG 2 — 🔴 An edited order tells the customer cancellations are not accepted

**READ**, `app/order/[id]/manage/page.tsx:116-127` (quoted in C3-a). `'modified'` is missing from
`canCancel`'s allow-list **and** from every `statusLabel` branch, so the customer sees **"Cancellations
are not accepted for this order."** on an order whose truck **does** accept cancellations and whose
cutoff has not passed. **Customer-facing, and factually wrong.**

### OBSERVATION 3 — ⚠️ Edit performs an ACCEPT without capturing, and the system logs that as a defect

**READ**: Edit is offered on `'pending'` orders — `components/dashboard/OrderCard.tsx:1273`,
`['pending', 'confirmed', 'modified'].includes(order.status)` — and writes `status: 'modified'`
(`action/route.ts:822`) with **no `captureOnConfirmation` call anywhere in the branch (NOT FOUND)**.
`'modified'` is an accepted status everywhere downstream, **including the stranded sweep's allow-list**.

**So editing a pending card order accepts it and leaves the money held**, until the sweep takes it
~10-25 minutes later and writes `capture_missing` + `capture_recovered` — audit rows whose own comments
call a recovery *"a defect report, not a success story"*.

⚠️ **I am NOT calling this a bug in Edit.** The money is always eventually taken, and Dominic has said
Edit works. **It is reported because removing the row makes this the primary path for a time change**,
and because it means the sweep's defect counter will start rising for a reason that is not a defect.

### NOT A BUG — the discarded `moveSlotBooking` result

For completeness: the **adjust** branch discards `moveSlotBooking`'s outcome while Edit checks its
errors and warns the operator. **Edit is the better-behaved of the two here.** Nothing to report against
Edit.

## D4. Blast radius on Pizzeria Gusto

| Dimension | Assessment |
|---|---|
| **Money** | ✅ **NONE.** No capture site is removed, no ledger write changes, no Stripe call changes. Every path an operator can take still captures — inline, or via the sweep within ~25 minutes. |
| **Data** | ✅ **NONE.** No migration, no column, no status value retired. Historical `'time_adjust'` audit rows keep their meaning. |
| **Capacity board** | ✅ **NONE.** `moveSlotBooking`'s only caller goes away with it; Edit re-books via the same primitives, with error reporting the row lacked. |
| **Customer email** | ⚠️ **CHANGES.** A time change now sends Edit's inline `Order #N updated` email instead of `formatConfirmationEmail`'s `has been updated`. **Both state the new collection time.** |
| **Operator workflow** | ⚠️ **REAL AND IMMEDIATE.** A one-tap accept-and-push-back becomes a modal. **This is the change Gusto will actually notice**, on a busy hatch, and it is the thing to weigh. |
| **Customer cancellation** | 🔴 **WORSENS IN FREQUENCY.** Every rescheduled order becomes `'modified'` and its customer is told cancellations are not accepted (BUG 2). **Live today; removal makes it routine.** |
| **Due alerts** | 🔴 **WORSENS IN FREQUENCY.** Every rescheduled order stops chiming (BUG 1). Same caveat. |
| **Reachability today** | ⚠️ **NOT MEASURED — no database was read, by instruction.** How often Gusto sees the row at all depends on their `auto_accept` setting: **with auto-accept ON, card orders land `'confirmed'` and the row never renders**, so removal would be invisible to them. **INFERRED, and worth confirming with one read before deciding.** |

> ✅ **THE ONE-LINE VERDICT FOR GUSTO: no money moves differently, and nothing is left uncaptured. The
> exposure is workflow and two pre-existing `'modified'` defects becoming routine.**

---

# PART E — INTEGRITY

## E1. Byte scan of every file opened — byte-level, never grep

All 16 files scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

| File | Bytes | Offending |
|---|---|---|
| `lib/payments/capture.ts` | 31,097 | 0 |
| `lib/payments/stranded-authorisations.ts` | 15,268 | 0 |
| `lib/payments/held-authorisation.ts` | 6,924 | 0 |
| `lib/payments/promote-draft.ts` | 33,099 | 0 |
| `lib/payments/email-payment-state.ts` | 17,340 | 0 |
| `lib/payments/release-hold.ts` | 9,750 | 0 |
| `app/api/dashboard/action/route.ts` | 170,970 | 0 |
| `app/api/orders/submit/route.ts` | 80,055 | 0 |
| `components/dashboard/OrderCard.tsx` | 87,613 | 0 |
| `lib/slot-bookings.ts` | 24,528 | 0 |
| `app/order/[id]/manage/page.tsx` | 9,262 | 0 |
| `app/dashboard/[token]/kds/page.tsx` | 91,554 | 0 |
| `app/dashboard/[token]/page.tsx` | 377,156 | 0 |
| `supabase/migrations/20260816_find_stranded_authorisations_settled.sql` | 7,985 | 0 |
| `vercel.json` | 977 | 0 |
| `docs/reference-manual.md` | 1,536,795 | 0 |

**TOTAL OFFENDING: 0.**

## E2. Byte scan of this report

Run as a **separate pass after writing**; result recorded below.

## E3. Carrier-aware variation-selector check on this report

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE, whose category is
`Ll`.

Per emoji-presentation base, **measured after writing, not predicted**:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 30 | 30 | **0** |
| U+1F534 LARGE RED CIRCLE | 38 | 0 | 38 |
| U+2705 WHITE HEAVY CHECK MARK | 22 | 0 | 22 |
| U+26D4 NO ENTRY | 5 | 0 | 5 |
| U+274C CROSS MARK | 3 | 0 | 3 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 26 | 0 | 26 |

**Sum of per-base paired = 30 = total U+FE0F count = 30** — every selector has a named carrier, no
orphan and no double-count, and **zero bare warning signs**. The other five bases take no selector:
four are emoji-presentation-by-default, and the last is a **box-drawing rule character** picked up by
the candidate scan because it is categorised as a symbol — **not an emoji at all, and reporting it as
an unpaired one would be precisely the false positive this method exists to prevent**.

## E4. `git status` — proof nothing changed

```
 M docs/capture-sites-report.md
 M docs/reference-manual.md
```

**Neither entry is a change to the product.** `docs/capture-sites-report.md` is **this document**, the
required deliverable. `docs/reference-manual.md` is the **V11.19 update from an earlier task**,
untouched here. **No source file, no route, no component, no migration, no config and nothing under
`lib/payments/` appears.** Nothing staged, branch still `main`.

---

# SUMMARY

| Question | Answer |
|---|---|
| Is `time_adjust`'s capture ever the SOLE capture? | 🔴 **ALWAYS.** It fires only on `'pending'`, the one status no other site captures. |
| Is it ever redundant? | ⛔ **NO — the redundant sequences are all UNREACHABLE**, because the row stops rendering the moment it writes `'confirmed'`. It can be tapped **at most once per order**. |
| Would removing the row leave an order uncaptured? | ✅ **NO.** Confirm captures inline; Edit writes `'modified'`, which **is** in the stranded sweep's allow-list. |
| Can the row be removed? | ✅ **YES — no capture site must move first, and `lib/payments/` needs no change.** |
| What is the catch? | ⚠️ **Timing and noise, not money:** Edit's capture is deferred up to ~25 minutes and lands via a backstop that logs it as a defect. **Plus two live `'modified'` defects that removal makes routine** — the customer is told cancellations are not accepted (BUG 2), and the order stops raising due alerts (BUG 1). |
